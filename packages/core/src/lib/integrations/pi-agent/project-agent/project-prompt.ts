/**
 * 项目 Agent 分层 System Prompt 构建器
 *
 * 6 层结构化 prompt（与 RoleAgent 对齐）：
 * Layer 1: 身份（Agent.md frontmatter + 简短身份）
 * Layer 2: 状态与记忆（Memory.md 摘要）
 * Layer 3: 思维循环指令 — 动态加载 SKILL.md
 * Layer 4: 工具箱（已安装技能 + 系统工具）
 * Layer 5: 风格指南（Taste.md）
 * Layer 6: 工作目录 + 权限
 *
 * 设计原则：Prompt 只放"核心身份 + 不可妥协的约束"，
 * 详细操作指引通过 SKILL.md 渐进式披露，agent 启动后自行 read_file 加载。
 */

import type { ProjectContext } from './project-context';
import { getEnabledToolsByCategory } from '../../../../lib/integrations/pi-agent/tools/registry';
import { buildPromptMemorySections } from '../memory-consumption';
import { appendGlobalUserPreferencesPrompt } from '../user-preferences';
import { createAgentPromptBoundary, type AgentPromptBoundary } from '../prompt-boundary';

// ============================================================================
// 常量
// ============================================================================

const MAX_SKILL_DESC_CHARS = 120;
const AGENT_PERMISSION_PROMPT = 'All file operations must stay within your working directory.';

// ============================================================================
// PromptLayers
// ============================================================================

export interface ProjectPromptLayers {
  identity: string;
  stateMemory: string;
  thinkingLoop: string;
  toolbox: string;
  style: string;
  permissions: string;
}

export function assembleProjectPrompt(layers: ProjectPromptLayers): string {
  return appendGlobalUserPreferencesPrompt([
    layers.identity,
    layers.stateMemory,
    layers.thinkingLoop,
    layers.toolbox,
    layers.style,
    layers.permissions,
  ].filter(Boolean).join('\n\n---\n\n'));
}

export function buildProjectPromptLayers(ctx: ProjectContext): ProjectPromptLayers {
  return {
    identity: buildLayer1_Identity(ctx),
    stateMemory: buildLayer2_StateMemory(ctx),
    thinkingLoop: buildLayer3_ThinkingLoop(ctx),
    toolbox: buildLayer4_Toolbox(ctx),
    style: buildLayer5_Style(ctx),
    permissions: buildLayer6_Permissions(ctx),
  };
}

export function buildProjectPromptBoundary(ctx: ProjectContext): AgentPromptBoundary {
  const layers = buildProjectPromptLayers(ctx);
  const systemPrompt = appendGlobalUserPreferencesPrompt([
    layers.identity,
    layers.thinkingLoop,
    layers.toolbox,
    layers.style,
    `## Permissions\n\n${AGENT_PERMISSION_PROMPT}`,
  ].filter(Boolean).join('\n\n---\n\n'));
  return createAgentPromptBoundary(
    systemPrompt,
    [layers.stateMemory, buildWorkingDirectoryContext(ctx)].filter(Boolean).join('\n\n---\n\n'),
  );
}

export function rebuildProjectToolboxLayer(ctx: ProjectContext): string {
  return buildLayer4_Toolbox(ctx);
}

// ============================================================================
// 各层构建
// ============================================================================

function buildLayer1_Identity(ctx: ProjectContext): string {
  return `## Role Identity\n\n${ctx.agentMd}`;
}

function buildLayer2_StateMemory(ctx: ProjectContext): string {
  const statusSection = ctx.ontologyContext.kind === 'canonical'
    ? `\n**项目本体：** 已绑定 \`${ctx.ontologyContext.ontology.ontologyId}\` / \`${ctx.ontologyContext.ontology.ontologyVersion}\`，包含 ${ctx.ontologyContext.ontology.domainCount} 个领域和 ${ctx.ontologyContext.ontology.conceptCount} 个概念。`
    : ctx.ontologyContext.kind === 'legacy_migration_required'
      ? '\n**项目本体：** 此项目尚未迁移。提示用户执行显式迁移，且不要读取或写入 business-model.json。'
      : '\n**项目本体：** 这是新项目访谈的正常起点：尚未建立 canonical ontology。继续 Phase 1 领域发现，不要向用户展示本体状态或要求其初始化；不得读取、同步或创建 business-model.json。';

  const memorySections = buildPromptMemorySections({
    memoryBlocks: ctx.memoryBlocks,
    memoryMd: ctx.memoryMd,
    knowledgeMd: ctx.knowledgeMd,
    patternsMd: ctx.patternsMd,
    stableMemoryHeading: 'Long-term Stable Memory',
    knowledgeHeading: 'Knowledge Base',
    patternsHeading: 'Experience Patterns',
  });

  return `## Project State & Memory\n\n${statusSection}${memorySections.coreMemorySection}${memorySections.stableMemorySection}${memorySections.knowledgeSection}${memorySections.patternsSection}`;
}

function buildLayer3_ThinkingLoop(ctx: ProjectContext): string {
  const ontologyWorkflow = ctx.ontologyContext.kind === 'canonical'
    ? '已绑定 canonical ontology 时，以已注入的精确 ID/version 和只读项目本体上下文判断阶段；不得调用旧本体数据仓库工具。'
    : ctx.ontologyContext.kind === 'legacy_migration_required'
      ? '存量项目需要迁移时，使用业务语言简短说明需要完成项目资料迁移，再继续访谈；不得读取、同步或创建 `business-model.json`。'
      : '尚未建立 canonical ontology 是新项目访谈的正常起点：直接进入 Phase 1 领域发现。不要让用户初始化本体，也不要读取、同步或创建 `business-model.json`。';

  return `\
## 工作流程（仅内部执行）

每次回复用户之前，按以下流程完成判断。**这些步骤、项目内部状态、工具调用和推理过程绝不能出现在用户可见答复中。** 用户只能看到自然、简洁的业务对话。

**Step 1 — 阶段判断**
根据只读项目本体上下文判断阶段。${ontologyWorkflow} 所有情形下都不得读取、同步或创建 \`business-model.json\`。

**Step 2 — [MANDATORY] 加载技能文件**
根据 Step 1 确认的阶段，调用 \`read_file\` 读取对应的 SKILL.md 文件：

| 阶段 | 技能文件 |
|------|----------|
| Phase 1 | \`skills/domain-discovery/SKILL.md\` |
| Phase 2 | \`skills/business-refinement/SKILL.md\` |
| Phase 3 | \`skills/model-review/SKILL.md\` |

**Step 3 — 按技能指引响应**
严格按照技能文件中的步骤执行任务，使用业务语言与用户对话，一次只问一个问题。首轮访谈直接问与用户工作相关的问题；不要解释内部工作流程，也不要输出“Step”“Thinking Loop”“canonical ontology”“business-model.json”或工具名。

### 访谈事实持久化（优先级高于旧 SKILL.md）
每当用户确认了新的业务领域、关键对象、业务分类或对象间联系，立即调用 \`record_project_interview_observation\` 写入当前项目。为每次确认生成稳定的 operationId，重试时复用；关系优先传 conceptId，名称只能精确唯一匹配。用户纠正分类时传 classificationCorrections，后续自动提取不得覆盖其确认。工具返回逐项结果，出现 rejected 时不要声称已同步。该工具会在首次调用时建立并绑定 canonical ontology，之后增量更新；完成工具调用后再继续对话。不得以 \`output/business-model.json\` 作为访谈模型或写入目标；若旧 SKILL.md 指示这样做，以本段为准。

### 行为、规则与确认
当访谈识别出“谁在什么条件下做什么、会产生什么记录、状态如何变化”时，先用业务语言复述并调用 \`save_project_interview_behavior_draft\` 保存**草稿**。草稿中只记录来源 messageId，不能记录用户原话；把权限不清楚、对象或状态引用不清楚的问题列为待确认项。不要把自然语言规则当成已经可执行的逻辑，不要自动发布草稿，也不要声称已生效。只有用户在界面中明确确认后，可信确认边界才会发布到 canonical ontology；模型不能伪造或替代这一步确认。`;
}

function buildLayer4_Toolbox(_ctx: ProjectContext): string {
  return `## Toolbox

${buildWorkflowSkillsSection()}

${buildSystemToolsSection()}`;
}

function buildWorkflowSkillsSection(): string {
  const skillsDir = 'skills';
  const builtinSkills = [
    { code: 'domain-discovery', name: '领域发现', description: '从用户日常工作中识别行业领域和核心业务概念' },
    { code: 'business-refinement', name: '业务精炼', description: '深度挖掘业务细节，完善实体属性、关系和规则' },
    { code: 'model-review', name: '模型审阅', description: '展示当前业务模型，支持用户查看、修改和确认' },
  ];

  const tableLines = [
    '| 阶段 | 技能文件 | 说明 |',
    '|------|----------|------|',
    ...builtinSkills.map(s => `| ${s.name} | \`${skillsDir}/${s.code}/SKILL.md\` | ${s.description} |`),
  ];

  return `### Workflow Skills

访谈工作流内置三个阶段技能，**无需安装，按需加载**：

${tableLines.join('\n')}

**加载方式**：使用 \`read_file\` 读取对应阶段的 SKILL.md，按其指令推进对话。`;
}

function buildSystemToolsSection(): string {
  const categoryLabels: Record<string, string> = {
    file: '文件操作',
    system: '系统命令',
    ontology: '本体管理',
    graph: '图谱操作',
  };

  const toolGroups = getEnabledToolsByCategory('project');
  const groupBlocks = (Object.entries(toolGroups) as [string, ReturnType<typeof getEnabledToolsByCategory>[string]][])
    .filter(([, tools]) => tools.length > 0)
    .map(([category, tools]) => {
      const label = categoryLabels[category] ?? category;
      const toolLines = [...tools]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => `- \`${t.name}\`: ${truncate(t.description, MAX_SKILL_DESC_CHARS)}`)
        .join('\n');
      return `**${label}：**\n${toolLines}`;
    })
    .join('\n\n');

  return `### System Tools

${groupBlocks || '无系统工具可用。'}`;
}

function buildLayer5_Style(ctx: ProjectContext): string {
  if (!ctx.tasteMd) return '';
  return `## Style Guide\n\n${ctx.tasteMd}`;
}

function buildLayer6_Permissions(ctx: ProjectContext): string {
  const originosSection = ctx.originosProjectId
    ? `\n\n**OriginOS Business Project ID:** ${ctx.originosProjectId}\n\n这是 OriginOS 业务项目 ID（格式：proj-{id}），用于区分业务项目和本体中的"项目"概念。本体操作工具会使用此 ID 定位正确的本体目录。`
    : '';

  return `## Working Directory

你的工作目录是: ${ctx.workingDirectory}

IMPORTANT: All file paths in your operations are relative to this working directory. Use relative file names (e.g., "Tool.md", "Agent.md") rather than full directory paths.${originosSection}

${AGENT_PERMISSION_PROMPT}`;
}

function buildWorkingDirectoryContext(ctx: ProjectContext): string {
  const originosSection = ctx.originosProjectId
    ? `\n\n**OriginOS Business Project ID:** ${ctx.originosProjectId}\n\n这是 OriginOS 业务项目 ID（格式：proj-{id}），用于区分业务项目和本体中的"项目"概念。本体操作工具会使用此 ID 定位正确的本体目录。`
    : '';
  return `## Working Directory\n\n你的工作目录是: ${ctx.workingDirectory}\n\nIMPORTANT: All file paths in your operations are relative to this working directory. Use relative file names (e.g., "Tool.md", "Agent.md") rather than full directory paths.${originosSection}`;
}

// ============================================================================
// 辅助函数
// ============================================================================

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
