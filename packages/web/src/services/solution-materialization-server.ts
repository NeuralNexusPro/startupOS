import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  SolutionMaterializationError,
  SolutionMaterializationTaskService,
  type SolutionMaterializationStep,
  type SolutionMaterializationTask,
} from '@originos/core/lib/features/project';
import { findBundledSkillDir } from '@originos/core/lib/integrations/pi-agent/core/skills';
import { getDataRoot } from '@originos/core/lib/paths';

import type { SolutionVersionRef } from '@originos/core/lib/features/solution';

type JsonRecord = Record<string, unknown>;

export interface StartSolutionMaterializationOptions extends SolutionVersionRef {
  readonly retryFailed?: boolean;
}

export interface SolutionMaterializationStartResult {
  readonly task: SolutionMaterializationTask;
  readonly recovered: boolean;
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function headingList(items: readonly string[], empty: string): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : `- ${empty}`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function triggerDescription(value: string): string {
  switch (value) {
    case 'scheduled':
      return '按定时任务周期执行。';
    case 'event':
      return '当本体操作触发此事件时执行。';
    default:
      return '用户通过自然语言对话触发。';
  }
}

function renderOntologyObjects(value: unknown): string {
  const objects = record(value);
  const entries = Object.entries(objects);
  if (entries.length === 0) {
    return '- 未声明额外对象操作；以 canonical contract 为准。';
  }
  return entries
    .map(([name, operations]) => `- **${name}**：${list(operations).join('、') || '读取'}`)
    .join('\n');
}

export function renderSolutionAgentFiles(specification: JsonRecord, skillSpecifications: readonly JsonRecord[]): Record<string, string> {
  const id = text(specification['id'], 'agent');
  const name = text(specification['name'], id);
  const description = text(specification['description'], `${name} 按已确认方案执行工作。`);
  const domain = text(specification['domain'], '项目业务');
  const type = text(specification['type'], 'agent');
  const derivedFrom = list(specification['derivedFrom']);
  const collaborations = Array.isArray(specification['collaborations'])
    ? specification['collaborations'].map(record)
    : [];
  const ownedSkills = skillSpecifications.filter((skill) => text(skill['agentId']) === id);
  const skillLines = ownedSkills.length > 0
    ? ownedSkills.map((skill) => {
      const code = text(skill['code'], text(skill['id']));
      return `- \`${text(skill['name'], code)}\`：\`skills/${code}/SKILL.md\` — ${text(skill['description'], '按确认方案执行')}`;
    }).join('\n')
    : '- 当前方案未分配技能。';
  const collaborationLines = collaborations.length > 0
    ? collaborations.map((item) => `- ${text(item['type'], '协作')} → ${text(item['target'], '未指定')}：${text(item['description'], '按方案传递结果')}`).join('\n')
    : '- 无额外 Agent 协作。';
  const baseFrontmatter = `---\nagentId: ${yamlString(id)}\nagentType: ${yamlString(type === 'role-agent' ? 'role' : 'assistant')}\nversion: 1.0.0\nname: ${yamlString(name)}\ndomain: ${yamlString(domain)}\n---`;
  const agent = `${baseFrontmatter}\n\n# ${name}\n\n## 身份\n\n${description}\n\n## 职责\n\n${headingList(derivedFrom, '按照已确认的方案契约完成分配的工作。')}\n\n## 工作边界\n\n- 只执行 canonical contract 允许的本体操作与权限。\n- 输入不足时明确报告缺口，不猜测事实。\n- 输出必须能追溯到当前项目及方案版本。\n\n## 协作关系\n\n${collaborationLines}\n`;
  const tool = `---\ntoolsVersion: 1.0.0\nallowedTools: [read_file, write_file, edit_file, list_files, get_concept_schema, query_instances, get_instance, create_instance, update_instance, get_current_time]\n---\n\n# 工具与技能配置\n\n## 本体工具\n\n- \`get_concept_schema\`：读取对象字段定义。\n- \`query_instances\` / \`get_instance\`：查询事实实例。\n- \`create_instance\` / \`update_instance\`：按 canonical contract 写入事实。\n\n## 已安装技能\n\n${skillLines}\n`;
  const memory = `# ${name} 记忆\n\n## 稳定约束\n\n- 方案来源：\`solutions/\` 下已确认的 canonical 三文件。\n- 运行时只记录经验证的事实、决策与用户反馈。\n`;
  const taste = `# ${name} 风格\n\n- 使用清晰、直接的业务语言。\n- 先给结果，再给必要依据。\n- 不暴露内部思维过程。\n`;
  if (type === 'role-agent') {
    return {
      'Agent.md': agent,
      'Role.md': `# ${name} 角色状态\n\n## 默认阶段\n\n按已确认方案接收任务、验证输入、执行并交付结果。\n\n## 状态转换\n\n待处理 → 执行中 → 待验收 → 完成；失败时保留原因并等待恢复。\n`,
      'Memory.md': memory,
      'Taste.md': taste,
      'Tool.md': tool,
    };
  }
  return {
    'Agent.md': agent,
    'Data.md': `# ${name} 数据模型\n\n## 本体对象\n\n${renderOntologyObjects(specification['ontologyObjects'])}\n\n## Canonical contract\n\n\`\`\`json\n${JSON.stringify(specification['contract'] ?? {}, null, 2)}\n\`\`\`\n`,
    'Process.md': `# ${name} 处理流程\n\n## 接收\n\n验证输入事实、版本和权限。\n\n## 执行\n\n按已安装 Skill 与 canonical contract 完成处理。\n\n## 输出\n\n返回可验证的结果；失败时保留明确原因。\n\n## 协作\n\n${collaborationLines}\n`,
    'Memory.md': memory,
    'Taste.md': taste,
    'Tool.md': tool,
  };
}

export function renderSolutionSkill(specification: JsonRecord): string {
  const id = text(specification['id'], 'skill');
  const code = text(specification['code'], id);
  const name = text(specification['name'], code);
  const description = text(specification['description'], `${name} 按已确认方案执行。`);
  const outline = record(specification['skillFileOutline']);
  const steps = list(outline['steps']);
  const dependsOn = list(specification['dependsOn']);
  const contract = record(specification['contract']);
  const inputs = Array.isArray(contract['inputs']) ? contract['inputs'] : [];
  const outputs = Array.isArray(contract['outputs']) ? contract['outputs'] : [];
  const actions = Array.isArray(contract['actions']) ? contract['actions'] : [];
  const tools = new Set<string>();
  steps.forEach((step) => {
    for (const match of step.matchAll(/\b(get_concept_schema|list_concepts|query_instances|get_instance|create_instance|update_instance)\b/g)) {
      if (match[1]) {
        tools.add(match[1]);
      }
    }
  });
  if (tools.size === 0 && (inputs.length > 0 || outputs.length > 0 || actions.length > 0)) {
    tools.add('get_concept_schema');
    tools.add('query_instances');
  }
  const stepLines = [
    ...dependsOn.map((dependency) => `等待 \`${dependency}\` 完成后执行。`),
    ...steps,
  ];
  const toolLines = [...tools].map((toolName) => `- \`${toolName}\`：参数必须使用 canonical contract 中的 ontologyId、ontologyVersion、conceptId 与 factTypeId。`);
  const ontology = record(contract['ontology']);
  return `---\nname: ${yamlString(name)}\ncode: ${yamlString(code)}\ndescription: ${yamlString(description)}\nversion: 1.0.0\ntype: project\nauthor: OriginOS Solution Materializer\ntags: [project, ontology]\ncontract: ${JSON.stringify(contract)}\n---\n\n# ${name}\n\n${description}\n\n## 触发场景\n\n${text(outline['triggerScenario'], triggerDescription(text(specification['triggerType'], 'conversation')))}\n\n${triggerDescription(text(specification['triggerType'], 'conversation'))}\n\n## 执行步骤\n\n${stepLines.length > 0 ? stepLines.map((step, index) => `${index + 1}. ${step}`).join('\n') : '1. 验证输入并按 canonical contract 执行。'}\n\n## 本体数据操作\n\n${toolLines.length > 0 ? toolLines.join('\n') : '- 本 Skill 不执行本体数据写入。'}\n\n- ontologyId: \`${text(ontology['ontologyId'], '以运行时 contract 为准')}\`\n- ontologyVersion: \`${text(ontology['ontologyVersion'], '以运行时 contract 为准')}\`\n- 完整工具协议见 [references/ontology-tools.md](references/ontology-tools.md)。\n\n## 业务对象\n\n${renderOntologyObjects(specification['ontologyObjects'])}\n\n## 输入格式\n\n${text(outline['inputFormat'], inputs.length > 0 ? '使用 canonical contract 声明的输入事实。' : '无前置事实输入。')}\n\n## 输出格式\n\n${text(outline['outputFormat'], outputs.length > 0 ? '产生 canonical contract 声明的输出事实。' : '返回执行结果，不新增事实。')}\n\n## 注意事项\n\n- canonical contract 是执行授权的唯一依据。\n- 不修改本体 ID、版本、对象、事实类型或权限。\n- 输入不足、权限不足或规则无法确定时停止并返回结构化原因。\n`;
}

export class SolutionMaterializationBackgroundRunner {
  private readonly tasks: SolutionMaterializationTaskService;
  private readonly active = new Map<string, Promise<void>>();

  constructor(private readonly dataRoot = getDataRoot()) {
    this.tasks = new SolutionMaterializationTaskService(dataRoot);
  }

  async start(options: StartSolutionMaterializationOptions): Promise<SolutionMaterializationStartResult> {
    const reference = this.reference(options);
    let result = await this.tasks.startTask(reference);
    if (result.task.status !== 'completed') {
      result = {
        ...result,
        task: await this.tasks.recoverTask({
          ...reference,
          expectedRevision: result.task.revision,
          retryFailed: options.retryFailed === true,
        }),
      };
    }
    if (result.task.status !== 'failed' && result.task.status !== 'completed') {
      this.schedule(reference);
    }
    return result;
  }

  get(reference: SolutionVersionRef): Promise<SolutionMaterializationTask | null> {
    return this.tasks.getTask(reference);
  }

  private schedule(reference: SolutionVersionRef): void {
    const key = `${reference.projectId}:${reference.solutionId}:${reference.solutionVersion}`;
    if (this.active.has(key)) {
      return;
    }
    const scheduled = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 0);
      timer.unref?.();
    });
    const running = scheduled
      .then(() => this.run(reference))
      .catch((error: unknown) => {
        console.error('[solution-materialization] background runner stopped', error);
      })
      .finally(() => this.active.delete(key));
    this.active.set(key, running);
  }

  private async run(reference: SolutionVersionRef): Promise<void> {
    const workerId = `web-${process.pid}-${randomUUID()}`;
    while (true) {
      const current = await this.tasks.getTask(reference);
      if (!current || current.status === 'completed' || current.status === 'failed') {
        return;
      }
      let claimed: Awaited<ReturnType<SolutionMaterializationTaskService['claimNextStep']>>;
      try {
        claimed = await this.tasks.claimNextStep({
          ...reference,
          workerId,
          expectedRevision: current.revision,
        });
      } catch (error) {
        if (error instanceof SolutionMaterializationError && error.code === 'REVISION_CONFLICT') {
          continue;
        }
        if (error instanceof SolutionMaterializationError && error.code === 'NO_READY_STEP') {
          return;
        }
        throw error;
      }
      try {
        await this.execute(reference, claimed.step);
        await this.tasks.completeStep({
          ...reference,
          stepId: claimed.step.id,
          claimToken: claimed.step.claim?.token ?? '',
          expectedRevision: claimed.task.revision,
        });
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        try {
          await this.tasks.failStep({
            ...reference,
            stepId: claimed.step.id,
            claimToken: claimed.step.claim?.token ?? '',
            expectedRevision: claimed.task.revision,
            error: message,
          });
        } catch (persistError) {
          console.error('[solution-materialization] failed to persist step error', persistError);
        }
        return;
      }
    }
  }

  private async execute(reference: SolutionVersionRef, step: SolutionMaterializationStep): Promise<void> {
    if (step.kind === 'validation') {
      return;
    }
    const specification = await this.tasks.getStepSpecification(reference, step.id);
    if (!specification) {
      throw new Error(`Missing specification for ${step.id}`);
    }
    if (step.kind === 'agent') {
      const skills = await this.readSkillSpecifications(reference);
      await this.writeFiles(reference, `agents/${step.subjectId}`, renderSolutionAgentFiles(specification, skills));
      return;
    }
    const owner = step.ownerAgentId;
    if (!owner) {
      throw new Error(`Skill ${step.subjectId} has no owner Agent`);
    }
    const code = text(specification['code'], text(specification['id']));
    const base = `agents/${owner}/skills/${code}`;
    const referenceContent = await this.readOntologyToolsReference(reference);
    await this.writeFiles(reference, base, {
      'SKILL.md': renderSolutionSkill(specification),
      'references/ontology-tools.md': referenceContent,
    });
  }

  private async readSkillSpecifications(reference: SolutionVersionRef): Promise<JsonRecord[]> {
    const file = path.join(this.projectRoot(reference), 'solutions', reference.solutionVersion, 'skills.json');
    const source = record(JSON.parse(await fs.readFile(file, 'utf8')) as unknown);
    return Array.isArray(source['skills']) ? source['skills'].map(record) : [];
  }

  private async readOntologyToolsReference(reference: SolutionVersionRef): Promise<string> {
    const projectFile = path.join(
      this.projectRoot(reference),
      'skills',
      'project-skill-creator',
      'references',
      'ontology-tools.md'
    );
    try {
      return await fs.readFile(projectFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const bundledCreatorDirectory = findBundledSkillDir('project-skill-creator');
    if (bundledCreatorDirectory) {
      const bundledFile = path.join(bundledCreatorDirectory, 'references', 'ontology-tools.md');
      try {
        return await fs.readFile(bundledFile, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    throw new Error('project-skill-creator/references/ontology-tools.md is unavailable in both project and bundled templates');
  }

  private async writeFiles(reference: SolutionVersionRef, base: string, files: Readonly<Record<string, string>>): Promise<void> {
    for (const [relative, content] of Object.entries(files)) {
      const target = path.resolve(this.projectRoot(reference), base, relative);
      const root = `${path.resolve(this.projectRoot(reference))}${path.sep}`;
      if (!target.startsWith(root)) {
        throw new Error(`Materialization path escapes project root: ${target}`);
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${digest(content).slice(0, 12)}.tmp`;
      await fs.writeFile(temporary, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
      await fs.rename(temporary, target);
    }
  }

  private projectRoot(reference: SolutionVersionRef): string {
    return path.join(this.dataRoot, 'projects', reference.projectId);
  }

  private reference(options: StartSolutionMaterializationOptions): SolutionVersionRef {
    return {
      projectId: options.projectId,
      solutionId: options.solutionId,
      solutionVersion: options.solutionVersion,
    };
  }
}

let singleton: SolutionMaterializationBackgroundRunner | undefined;

export function getSolutionMaterializationBackgroundRunner(): SolutionMaterializationBackgroundRunner {
  singleton ??= new SolutionMaterializationBackgroundRunner();
  return singleton;
}
