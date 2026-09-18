/**
 * 分层 System Prompt 构建器（Story R.4）
 *
 * 7 层结构化 system prompt（借鉴 OpenClaw 模块化 section 模式）：
 * Layer 1: 角色身份（Agent.md）
 * Layer 2: 状态与记忆（阶段名 + 行为 + Memory.md，按需渲染）
 * Layer 3: 思维循环指令（5 步思考流程）
 * Layer 4: 工具箱（已安装技能清单 + 系统工具列表，registry 驱动含描述）
 * Layer 5: 风格指南（Taste.md，无内容时跳过）
 * Layer 6: 工作目录 + 权限授权
 * Layer 7: 安全约束（固定 section）
 */

import type { RoleContext } from './role-context';
import type { StateMachine } from './state-machine';
import type { SkillInfo } from './skill-resolver';
import { AGENT_PERMISSION_PROMPT } from '../../../shared/agent-permissions';
import { getEnabledToolsByCategory } from '../../../../lib/integrations/pi-agent/tools/registry';
import { buildPromptMemorySections, renderMemoryBlocksXML } from '../memory-consumption';
import { appendGlobalUserPreferencesPrompt } from '../user-preferences';
import { createAgentPromptBoundary, type AgentPromptBoundary } from '../prompt-boundary';

// ============================================================================
// Prompt 尺寸限制常量
// ============================================================================

const MAX_SKILLS_IN_PROMPT = 50;
const MAX_SKILL_DESC_CHARS = 120;

// ============================================================================
// 分层快照类型
// ============================================================================

export interface PromptLayers {
  identity: string;
  stateMemory: string;
  thinkingLoop: string;
  toolbox: string;
  style: string;
  permissions: string;
  safety: string;
}

export function assemblePrompt(layers: PromptLayers): string {
  return appendGlobalUserPreferencesPrompt([
    layers.identity,
    layers.stateMemory,
    layers.thinkingLoop,
    layers.toolbox,
    layers.style,
    layers.permissions,
    layers.safety,
  ].filter(Boolean).join('\n\n---\n\n'));
}

// ============================================================================
// 公开 API
// ============================================================================

export function buildRoleSystemPrompt(
  roleContext: RoleContext,
  stateMachine?: StateMachine,
): string {
  return assemblePrompt(buildPromptLayers(roleContext, stateMachine));
}

export function buildRolePromptBoundary(
  roleContext: RoleContext,
  stateMachine?: StateMachine,
): AgentPromptBoundary {
  const layers = buildPromptLayers(roleContext, stateMachine);
  const systemPrompt = appendGlobalUserPreferencesPrompt([
    layers.identity,
    layers.thinkingLoop,
    layers.toolbox,
    layers.style,
    `## Permissions\n\n${AGENT_PERMISSION_PROMPT}`,
    layers.safety,
  ].filter(Boolean).join('\n\n---\n\n'));
  const sessionContext = [
    layers.stateMemory,
    buildWorkingDirectoryContext(roleContext),
  ].filter(Boolean).join('\n\n---\n\n');
  return createAgentPromptBoundary(systemPrompt, sessionContext);
}

export function buildPromptLayers(
  roleContext: RoleContext,
  stateMachine?: StateMachine,
): PromptLayers {
  return {
    identity: buildLayer1_Identity(roleContext),
    stateMemory: buildLayer2_StateMemory(roleContext, stateMachine),
    thinkingLoop: buildLayer3_ThinkingLoop(),
    toolbox: buildLayer4_Toolbox(roleContext),
    style: buildLayer5_Style(roleContext),
    permissions: buildLayer6_Permissions(roleContext),
    safety: buildLayer7_Safety(),
  };
}

/** 只重建工具箱层（技能或 Tool.md 变化时调用） */
export function rebuildToolboxLayer(roleContext: RoleContext): string {
  return buildLayer4_Toolbox(roleContext);
}

/** 只重建状态记忆层（Memory.md 或阶段变化时调用） */
export function rebuildStateMemoryLayer(roleContext: RoleContext, stateMachine?: StateMachine): string {
  return buildLayer2_StateMemory(roleContext, stateMachine);
}

/** 将 Memory Block 数组渲染为 Letta XML 格式（供 Project Agent 复用） */
export { renderMemoryBlocksXML };

// ============================================================================
// 各层构建函数
// ============================================================================

function buildLayer1_Identity(ctx: RoleContext): string {
  return `## Role Identity\n\n${ctx.agentMd}`;
}

function buildLayer2_StateMemory(ctx: RoleContext, sm?: StateMachine): string {
  const phaseSection = (() => {
    if (sm && sm.phases.length > 0) {
      const current = sm.phases.find(p => p.name === ctx.currentPhase);
      if (current) {
        return [
          `**当前阶段：** ${current.name}`,
          current.behavior ? `**行为特征：**\n${current.behavior}` : '',
          current.entryCondition ? `**进入条件：** ${current.entryCondition}` : '',
        ].filter(Boolean).join('\n\n');
      }
    }
    return `**当前阶段：** ${ctx.currentPhase}`;
  })();

  const memorySections = buildPromptMemorySections({
    memoryBlocks: ctx.memoryBlocks,
    memoryMd: ctx.memoryMd,
    knowledgeMd: ctx.knowledgeMd,
    patternsMd: ctx.patternsMd,
    stableMemoryHeading: 'Long-term Stable Memory',
    knowledgeHeading: 'Knowledge Base',
    patternsHeading: 'Experience Patterns',
  });

  return `## Role State\n\n${phaseSection}${memorySections.coreMemorySection}${memorySections.stableMemorySection}${memorySections.knowledgeSection}${memorySections.patternsSection}`;
}

function buildLayer3_ThinkingLoop(): string {
  return `\
## Thinking Loop — RoleAgent

在每次回复用户之前，你必须严格按照以下 5 步进行思考：

1. **状态检查（State Check）**：确认当前所处的角色阶段（准备/执行/复盘等），以及本阶段的行为特征。
2. **意图理解（Intent Understanding）**：分析用户消息的核心意图，判断是需要技能介入还是系统工具。
3. **工具箱选择（Tool Selection）**：
   - 首先检查 Toolbox 中 "Installed Skills" 表格，找到能覆盖用户需求的已安装技能
   - 如果有匹配技能，使用 \`read_file\` 读取该技能的 SKILL.md（路径见表格中"技能路径"列），按照文件内容中的指令渐进式执行任务
   - 如果没有已安装技能能满足需求，再选择系统工具
   - **禁止**仅凭技能名称描述就声称完成了任务；必须实际读取技能文件并执行其指令
4. **执行响应（Execution）**：调用选定的技能或工具，向用户输出响应。
5. **状态更新（State Update）**：如果完成了阶段目标或需要切换阶段，在回复中包含 \`[PHASE:目标阶段名]\` 标记以触发状态转换。

**关键原则：**
- 技能优先于系统工具
- **已安装技能的权威来源**：当前 system prompt 中 "Installed Skills" 表格（来自 \`.skills/\` 目录扫描）。不要用 \`list_skills\` 工具来判断"是否已安装"，\`list_skills\` 返回的是 \`data/skills/\` 中所有**可安装**技能，不代表已安装
- 执行技能 = 读取技能 SKILL.md 文件并按其指令操作，不是口头描述步骤`;
}

function buildLayer4_Toolbox(ctx: RoleContext): string {
  return `## Toolbox

${buildInstalledSkillsSection(ctx)}

${buildSkillManagementSection()}

${buildSystemToolsSection()}`;
}

function buildInstalledSkillsSection(ctx: RoleContext): string {
  const hasSkills = ctx.installedSkills.length > 0;
  const skillCodes = ctx.installedSkills
    .slice(0, MAX_SKILLS_IN_PROMPT)
    .map(s => `\`${s.code}\``)
    .join(', ');

  const skillsContent = hasSkills
    ? `${buildSkillTable(ctx.installedSkills)}

- 当前已安装 ${ctx.installedSkills.length} 个技能：${skillCodes}
- **仅以上列出的技能才算已安装**。如果用户要求移除未列出的技能，告知该技能尚未安装。
- **执行技能**：使用 \`read_file\` 读取表格中"技能路径"列对应的 SKILL.md 文件，然后按照文件指令渐进式完成任务。
- **注意**：\`list_skills\` 工具返回的是 \`data/skills/\` 中所有**可安装**技能，不代表已安装。已安装技能以上方表格为准。`
    : `当前没有安装任何技能（\`.skills/\` 目录为空）。当用户需要技能支持时，可按下方 Skill Management 步骤安装。`;

  return `### Installed Skills

以下是你已安装的技能（位于 \`.skills/\` 目录中的软链接），**必须优先使用技能而非系统工具**：

${skillsContent}`;
}

function buildSkillManagementSection(): string {
  return `\
### Skill Management

**已安装技能**存放在工作目录下的 \`.skills/\` 目录中，每个条目是指向技能目录的软链接。

**安装技能**：当用户要求安装技能时
1. 调用 \`list_skills\` 查询技能库，在返回结果中找到匹配的技能，获取其 \`path\` 字段（真实路径）
2. 如果技能库中**不存在**该技能，告知用户无法安装，并提示用户可以前往技能市场搜索所需技能后再安装，**不要创建软链接**
3. 找到技能后，使用返回的真实 \`path\` 创建软链接：\`mkdir -p .skills && ln -sf {skill.path} .skills/{skillCode}\`
4. **更新 Tool.md**：读取 \`Tool.md\`，在 \`## 已安装技能\` 部分末尾追加一行：
   \`\`\`
   | \`{skillCode}\` | {skillName} | {skill 的 description 字段} | \`.skills/{skillCode}/SKILL.md\` |
   \`\`\`
   然后使用 \`write_file\` 将更新后的内容写回 \`Tool.md\`。

**移除技能**：当用户要求移除技能时
1. 删除目录软链接：\`rm -rf .skills/{skillCode}\`
2. **更新 Tool.md**：读取 \`Tool.md\`，删除该技能对应的记录行，然后使用 \`write_file\` 写回。

**管理原则**：技能仅在 \`.skills/\` 目录中存在时才视为已安装（上方 Installed Skills 表格即为当前状态）。
\`list_skills\` 工具仅用于**浏览可安装的技能库**，不代表已安装状态，不要用它来回答"我有哪些技能"。`;
}

function buildSystemToolsSection(): string {
  const categoryLabels: Record<string, string> = {
    file: '文件操作',
    system: '系统命令',
    skill: '技能管理',
    ontology: '本体管理',
    graph: '图谱操作',
    url: '网络工具',
  };

  const toolGroups = getEnabledToolsByCategory('role-agent');
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

当技能无法满足用户需求时，你可以使用以下系统工具：

${groupBlocks}`;
}

function buildLayer5_Style(ctx: RoleContext): string {
  if (!ctx.tasteMd) return '';
  return `## Style Guide\n\n${ctx.tasteMd}`;
}

function buildLayer6_Permissions(ctx: RoleContext): string {
  return `## Working Directory

你的工作目录是: ${ctx.agentBaseDir}

IMPORTANT: All file paths in your operations are relative to this working directory. Use relative file names (e.g., "Tool.md", "Agent.md") rather than full directory paths.

${AGENT_PERMISSION_PROMPT}`;
}

function buildWorkingDirectoryContext(ctx: RoleContext): string {
  return `## Working Directory\n\n你的工作目录是: ${ctx.agentBaseDir}\n\nIMPORTANT: All file paths in your operations are relative to this working directory. Use relative file names (e.g., "Tool.md", "Agent.md") rather than full directory paths.`;
}

function buildLayer7_Safety(): string {
  return `## Safety

- 你没有独立目标：不追求自我保护、复制、资源获取或权力扩张；避免超出用户请求的长期计划。
- 优先安全和人工监督：如果指令冲突，暂停并询问；遵守停止/暂停/审计请求，不绕过安全机制。
- 不要操纵或说服用户扩大访问权限或禁用安全措施。`;
}

// ============================================================================
// 辅助函数
// ============================================================================

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function buildSkillTable(skills: SkillInfo[]): string {
  const displaySkills = skills.slice(0, MAX_SKILLS_IN_PROMPT);
  const hasExtra = displaySkills.some(s => s.icon || s.category);

  const header = hasExtra
    ? '| 代码 | 图标 | 名称 | 分类 | 描述 |'
    : '| 代码 | 名称 | 描述 |';
  const sep = hasExtra
    ? '|------|------|------|------|------|'
    : '|------|------|------|';

  const rows = displaySkills.map(s => {
    const desc = truncate(s.description, MAX_SKILL_DESC_CHARS);
    return hasExtra
      ? `| \`${s.code}\` | ${s.icon || '—'} | ${s.name} | ${s.category || '—'} | ${desc} |`
      : `| \`${s.code}\` | ${s.name} | ${desc} |`;
  });

  const lines = [header, sep, ...rows];
  if (skills.length > MAX_SKILLS_IN_PROMPT) {
    lines.push(`| ... | | 还有 ${skills.length - MAX_SKILLS_IN_PROMPT} 个技能未显示 | | 通过 list_skills 查询全部 |`);
  }

  return lines.join('\n');
}

export function buildSkillMarkdown(skill: SkillInfo): string {
  return `**${skill.name}** (${skill.code}): ${skill.description}`;
}
