/**
 * 多 Agent 协作 Agent 7 层 System Prompt 构建器
 *
 * 7 层结构（对齐 RoleAgent 风格）：
 * Layer 1: Role Identity — Agent.md 全文
 * Layer 2: Data Contract — Data.md（本体对象、字段、约束、操作权限、Agent 间数据边界）
 * Layer 3: Process Flow — Process.md（处理步骤、验证规则、异常处理）
 * Layer 4: Collaboration Protocol — Process.md（协作协议：被触发/触发其他）
 * Layer 5: Toolbox — allowedTools + 已安装技能
 * Layer 6: Style Guide — Taste.md（无则跳过）
 * Layer 7: Working Directory + Data Constraints — 工作目录 + "禁止臆造数据"强制指令
 */

import type { ProjectCollaborationContext } from './project-collaboration-context';
import { buildPromptMemorySections } from '../memory-consumption';
import { appendGlobalUserPreferencesPrompt } from '../user-preferences';
import { createAgentPromptBoundary, type AgentPromptBoundary } from '../prompt-boundary';

// eslint-disable-next-line @typescript-eslint/naming-convention

// ============================================================================
// Prompt Layers
// ============================================================================

export interface CollaborativePromptLayers {
  identity: string;
  stateAndData: string;
  processFlow: string;
  collaborationProtocol: string;
  toolbox: string;
  style: string;
  permissions: string;
}

export function assembleCollaborationPrompt(layers: CollaborativePromptLayers): string {
  return appendGlobalUserPreferencesPrompt([
    layers.identity,
    layers.stateAndData,
    layers.processFlow,
    layers.collaborationProtocol,
    layers.toolbox,
    layers.style,
    layers.permissions,
  ].filter(Boolean).join('\n\n---\n\n'));
}

export function buildCollaborationPrompt(
  ctx: ProjectCollaborationContext,
  extraInstructions?: string,
): string {
  const layers = buildCollaborationPromptLayers(ctx, extraInstructions);
  return assembleCollaborationPrompt(layers);
}

export function buildCollaborationPromptBoundary(
  ctx: ProjectCollaborationContext,
  extraInstructions?: string,
): AgentPromptBoundary {
  const layers = buildCollaborationPromptLayers(ctx);
  const systemPrompt = appendGlobalUserPreferencesPrompt([
    layers.identity,
    buildDataContract(ctx),
    layers.processFlow,
    layers.collaborationProtocol,
    layers.toolbox,
    layers.style,
    buildCollaborationRules(),
  ].filter(Boolean).join('\n\n---\n\n'));
  const sessionContext = [
    buildCollaborationSessionState(ctx),
    buildCollaborationWorkingDirectory(ctx),
    extraInstructions,
  ].filter(Boolean).join('\n\n---\n\n');
  return createAgentPromptBoundary(systemPrompt, sessionContext);
}

function buildCollaborationPromptLayers(
  ctx: ProjectCollaborationContext,
  extraInstructions?: string,
): CollaborativePromptLayers {
  return {
    identity: buildLayer1Identity(ctx),
    stateAndData: buildLayer2StateAndData(ctx),
    processFlow: buildLayer3ProcessFlow(ctx),
    collaborationProtocol: buildLayer4CollaborationProtocol(ctx),
    toolbox: buildLayer5Toolbox(ctx),
    style: buildLayer6Style(ctx),
    permissions: buildLayer7Permissions(ctx, extraInstructions),
  };
}

// ============================================================================
// Layer 1: Role Identity
// ============================================================================

function buildLayer1Identity(ctx: ProjectCollaborationContext): string {
  return `## Role Identity\n\n${ctx.agentMd}`;
}

// ============================================================================
// Layer 2: State, Memory, and Data Contract
// ============================================================================

function buildLayer2StateAndData(ctx: ProjectCollaborationContext): string {
  return [buildCollaborationSessionState(ctx), buildDataContract(ctx)].filter(Boolean).join('\n\n');
}

function buildCollaborationSessionState(ctx: ProjectCollaborationContext): string {
  const memorySections = buildPromptMemorySections({
    memoryMd: ctx.memoryMd,
    knowledgeMd: ctx.knowledgeMd,
    patternsMd: ctx.patternsMd,
    stableMemoryHeading: 'Long-term Stable Memory',
    knowledgeHeading: 'Knowledge Base Snapshot',
    patternsHeading: 'Experience Patterns Snapshot',
  });
  return [
    memorySections.coreMemorySection,
    memorySections.stableMemorySection,
    memorySections.knowledgeSection,
    memorySections.patternsSection,
  ].filter(Boolean).join('\n\n');
}

function buildDataContract(ctx: ProjectCollaborationContext): string {
  return ctx.dataMd
    ? `## Data Contract\n\n以下是你的数据契约，定义了你可操作的本体对象、字段约束、操作权限以及与其他 Agent 的数据边界。\n\n${ctx.dataMd}`
    : '';
}

// ============================================================================
// Layer 3: Process Flow
// ============================================================================

function buildLayer3ProcessFlow(ctx: ProjectCollaborationContext): string {
  if (!ctx.processMd) {
    return '';
  }
  return `## Process Flow\n\n以下是你的处理流程，包含触发条件、输入数据、处理步骤、输出数据和异常处理。\n\n${ctx.processMd}`;
}

// ============================================================================
// Layer 4: Collaboration Protocol
// ============================================================================

function buildLayer4CollaborationProtocol(ctx: ProjectCollaborationContext): string {
  if (!ctx.processMd) {
    return '';
  }
  return `## Collaboration Protocol\n\n以下是你在多 Agent 协作网络中的位置和协议，包括谁触发你、你触发谁、传递什么数据。\n\n${extractCollaborationSection(ctx.processMd)}`;
}

/** 从 Process.md 中提取协作协议部分 */
function extractCollaborationSection(processMd: string): string {
  // 尝试提取 "协作协议" / "Collaboration" 相关章节
  const patterns = [
    /^(#{1,3}\s+.*协作协议.*[\s\S]*?)(?=\n#{1,3}\s+|$)/im,
    /^(#{1,3}\s+.*Collaboration.*[\s\S]*?)(?=\n#{1,3}\s+|$)/im,
    /^(#{1,3}\s+.*触发.*[\s\S]*?)(?=\n#{1,3}\s+|$)/im,
    /^(#{1,3}\s+.*被触发.*[\s\S]*?)(?=\n#{1,3}\s+|$)/im,
  ];
  for (const pattern of patterns) {
    const match = processMd.match(pattern);
    if (match !== null && match[0] !== null && match[0].trim().length > 0) {
      return match[0].trim();
    }
  }
  // 未找到专门章节，返回全文（已在 Layer 3 中注入，此处避免重复）
  return '';
}

// ============================================================================
// Layer 5: Toolbox
// ============================================================================

function buildLayer5Toolbox(ctx: ProjectCollaborationContext): string {
  const lines: string[] = [];

  // allowedTools 白名单
  if (ctx.allowedTools.length > 0) {
    lines.push(`## Toolbox\n\n**允许使用的工具（白名单）：**\n${ctx.allowedTools.map(t => `- \`${t}\``).join('\n')}`);
  }

  // 已安装技能
  if (ctx.installedSkills.length > 0) {
    const skillLines = ctx.installedSkills.map(s => {
      const desc = s.description ? ` — ${s.description}` : '';
      return `- \`${s.name}\`${desc}`;
    });
    lines.push(`**已安装技能：**\n${skillLines.join('\n')}`);
  }

  if (lines.length === 0) {
    return '## Toolbox\n\n暂无工具或技能配置。';
  }

  return lines.join('\n\n');
}

// ============================================================================
// Layer 6: Style Guide
// ============================================================================

function buildLayer6Style(ctx: ProjectCollaborationContext): string {
  if (ctx.tasteMd === null || ctx.tasteMd.trim() === '') {
    return '';
  }
  return `## Style Guide\n\n${ctx.tasteMd}`;
}

// ============================================================================
// Layer 7: Working Directory + Data Constraints
// ============================================================================

function buildLayer7Permissions(
  ctx: ProjectCollaborationContext,
  extraInstructions?: string,
): string {
  const extra = extraInstructions !== undefined && extraInstructions !== null ? `\n\n${extraInstructions}` : '';

  return `## Working Directory\n\n你的工作目录是: ${ctx.workingDirectory}\n\nIMPORTANT: All file paths in your operations are relative to this working directory. Use relative file names rather than full directory paths.\n\nAll file operations must stay within your working directory.\n\n## 数据约束（强制）\n- 执行任何操作前，必须先检查所需数据实例是否存在\n- 如果数据缺失 → 禁止臆造，必须向用户确认\n- 获得用户确认后，如有 create 权限可自行创建所需实例\n- 绝对禁止编造不存在的数据\n\n## HITL 强制规则（违反即为执行失败）\n- 当你需要用户提供信息（缺少必填字段、需要选择、需要确认）时，必须调用 \`ask_user_question\` 工具，不允许仅输出文字后自行结束\n- 调用 \`ask_user_question\` 后，必须等待返回结果（工具会挂起直到用户回复），然后再继续执行\n- 禁止将提问以普通文字输出后直接结束任务——这样用户无法交互，系统无法感知你在等待输入${extra}`;
}

function buildCollaborationWorkingDirectory(ctx: ProjectCollaborationContext): string {
  return `## Working Directory\n\n你的工作目录是: ${ctx.workingDirectory}\n\nIMPORTANT: All file paths in your operations are relative to this working directory. Use relative file names rather than full directory paths.`;
}

function buildCollaborationRules(): string {
  return `## Permissions & Data Constraints

All file operations must stay within your working directory.

## 数据约束（强制）
- 执行任何操作前，必须先检查所需数据实例是否存在
- 如果数据缺失 → 禁止臆造，必须向用户确认
- 获得用户确认后，如有 create 权限可自行创建所需实例
- 绝对禁止编造不存在的数据

## HITL 强制规则（违反即为执行失败）
- 当你需要用户提供信息（缺少必填字段、需要选择、需要确认）时，必须调用 \`ask_user_question\` 工具，不允许仅输出文字后自行结束
- 调用 \`ask_user_question\` 后，必须等待返回结果（工具会挂起直到用户回复），然后再继续执行
- 禁止将提问以普通文字输出后直接结束任务——这样用户无法交互，系统无法感知你在等待输入`;
}
