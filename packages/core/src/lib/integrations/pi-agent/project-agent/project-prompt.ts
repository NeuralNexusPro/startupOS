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
import { existsSync } from 'fs';
import path from 'path';
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
    thinkingLoop: buildLayer3_ThinkingLoop(),
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
  const businessModelPath = path.join(ctx.workingDirectory, 'output', 'business-model.json');
  const hasBusinessModel = existsSync(businessModelPath);

  const statusSection = hasBusinessModel
    ? `\n**项目状态：** 已有业务模型，进入模型审阅模式。`
    : `\n**项目状态：** 尚未建立业务模型，进入访谈模式。`;

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

function buildLayer3_ThinkingLoop(): string {
  return `\
## Thinking Loop — Project Agent

每次回复用户之前，**必须先执行以下三步，不可跳过**：

**Step 1 — 阶段判断**
先调用 \`list_files\` 查看 \`output\` 目录；仅当列表中存在 \`business-model.json\` 时再调用 \`read_file\` 读取。根据文件状态以及 entities 是否为空确认当前阶段：
- 文件不存在或 entities 为空 → Phase 1 领域发现
- entities 存在但模型未完整 → Phase 2 业务精炼
- 用户主动要求审阅或模型完整 → Phase 3 模型审阅

**Step 2 — [MANDATORY] 加载技能文件**
根据 Step 1 确认的阶段，调用 \`read_file\` 读取对应的 SKILL.md 文件：

| 阶段 | 技能文件 |
|------|----------|
| Phase 1 | \`skills/domain-discovery/SKILL.md\` |
| Phase 2 | \`skills/business-refinement/SKILL.md\` |
| Phase 3 | \`skills/model-review/SKILL.md\` |

**Step 3 — 按技能指引响应**
严格按照技能文件中的步骤执行任务，使用业务语言与用户对话，一次只问一个问题。`;
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
