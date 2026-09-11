/**
 * RoleAgent Launcher（Story R.6 重构）
 *
 * 启动流程（data/agents/{id}/）：
 * 1. 读取 Agent.md → systemPrompt
 * 2. 加载 RoleContext（5 个 .md 文件 + 已安装技能）
 * 3. 成功加载时用 6 层 prompt 替换旧流程
 * 4. 失败时降级到 buildAgentSystemPrompt（向后兼容）
 * 5. 初始化 StateMachine
 * 6. 注册 turn_end 钩子（状态机检查）
 * 7. 创建会话 + 注册 Agent
 */

import path from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { Launcher, type LaunchContext, type LaunchResult, buildAgentSystemPrompt } from './base';
import { agentManager } from '../../../../lib/integrations/pi-agent/agent-manager';
import { type AgentEvent } from '@originos/pi-agent-adapter';
import { loadRoleContext, parseToolMdTools, type RoleContext } from '../../../../lib/integrations/pi-agent/role-agent/role-context';
import { scanInstalledSkills } from '../../../../lib/integrations/pi-agent/role-agent/skill-resolver';
import { parseStateMachine, checkTransition, applyTransition, type StateMachine } from '../../../../lib/integrations/pi-agent/role-agent/state-machine';
import { buildPromptLayers, rebuildToolboxLayer, assemblePrompt, type PromptLayers } from '../../../../lib/integrations/pi-agent/role-agent/system-prompt';
import { ObservationPolicyResolver } from '../../../../modules/memory-core';

import { getAgentsDataDir, getDataRoot } from '../../../paths';

const AGENTS_DIR = getAgentsDataDir();

// ============================================================================
// 角色会话状态（每个 RoleAgent 实例持有）
// ============================================================================

interface RoleAgentSessionState {
  roleContext: RoleContext;
  stateMachine: StateMachine;
  lastToolMdHash: string;
  lastSkillsHash: string;
  promptLayers: PromptLayers;
}

/** 计算字符串 hash */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// 每个 sessionId 对应一个 RoleAgent 状态
const roleSessions = new Map<string, RoleAgentSessionState>();

// ============================================================================
// turn_end 处理（全局事件拦截器）
// ============================================================================

/**
 * 在 agentManager 中注册全局 turn_end 拦截器。
 * 对 role-agent 类型执行状态机检查 + 记忆追踪。
 */
function setupGlobalRoleAgentHook(): void {
  const gh = globalThis as Record<string, unknown>;
  if (gh['__roleAgentHookInstalled']) {
    console.log('[RoleAgent][hook] Already installed, skipping');
    return;
  }
  gh['__roleAgentHookInstalled'] = true;
  console.log('[RoleAgent][hook] Installing global role-agent hook');

  const originalSubscribeToAgent = agentManager.subscribeToAgent.bind(agentManager);

  agentManager.subscribeToAgent = (
    sessionId: string,
    listener: (event: AgentEvent) => void,
  ): (() => void) | null => {
    console.log(`[RoleAgent][hook] subscribeToAgent called for session ${sessionId}`);
    const originalCleanup = originalSubscribeToAgent(sessionId, listener);
    if (!originalCleanup) return null;

    // 额外注册 role-agent turn_start 和 turn_end hooks
    const startCleanup = setupRoleAgentTurnStartHook(sessionId);
    const endCleanup = setupRoleAgentTurnHook(sessionId);

    return () => {
      originalCleanup();
      startCleanup?.();
      endCleanup?.();
    };
  };
}

/**
 * 为特定 session 设置 turn_start hook。
 * 检查 Tool.md 是否变更，有则刷新 system prompt。
 */
function setupRoleAgentTurnStartHook(sessionId: string): (() => void) | null {
  return agentManager.subscribeToAgent(sessionId, (event: AgentEvent) => {
    if (event.type !== 'turn_start') return;

    console.log(`[RoleAgent][turn_start] Checking Tool.md refresh for session ${sessionId}`);
    const state = roleSessions.get(sessionId);
    if (!state) {
      console.log(`[RoleAgent][turn_start] No role session state found for ${sessionId}`);
      return;
    }
    console.log(`[RoleAgent][turn_start] Found role session state, agentBaseDir=${state.roleContext.agentBaseDir}, lastToolMdHash=${state.lastToolMdHash.slice(0, 8)}...`);

    refreshToolMdIfNeeded(sessionId, state);
  });
}

/**
 * 检查 Tool.md 或 .skills/ 是否变更，有则只更新对应层并重新拼接 system prompt。
 */
function refreshToolMdIfNeeded(sessionId: string, state: RoleAgentSessionState): void {
  const agentBaseDir = state.roleContext.agentBaseDir;
  const toolMdPath = path.join(agentBaseDir, 'Tool.md');

  try {
    const newToolMdContent = existsSync(toolMdPath) ? readFileSync(toolMdPath, 'utf-8') : '';
    const newToolMdHash = hashContent(newToolMdContent);

    const newSkills = scanInstalledSkills(agentBaseDir);
    const newSkillsHash = hashContent(newSkills.map(s => s.code).sort().join(','));

    const toolMdChanged = newToolMdHash !== state.lastToolMdHash;
    const skillsChanged = newSkillsHash !== state.lastSkillsHash;

    if (!toolMdChanged && !skillsChanged) return;

    console.log(`[RoleAgent][refresh] Changes — toolMd=${toolMdChanged}, skills=${skillsChanged}`);

    // 更新上下文中变化的部分
    if (toolMdChanged && newToolMdContent) {
      state.roleContext.toolMd = newToolMdContent;
      const { allowedTools } = parseToolMdTools(newToolMdContent);
      state.roleContext.allowedTools = allowedTools;
    }
    if (skillsChanged) {
      state.roleContext.installedSkills = newSkills;
    }

    // 只重建 toolbox 层
    state.promptLayers.toolbox = rebuildToolboxLayer(state.roleContext);

    const newPrompt = assemblePrompt(state.promptLayers);
    const agent = agentManager.getAgent(sessionId);
    if (agent) {
      agent.setSystemPrompt(newPrompt);
      console.log(`[RoleAgent][refresh] Toolbox layer updated, skills=${newSkills.length}`);
    }

    state.lastToolMdHash = newToolMdHash;
    state.lastSkillsHash = newSkillsHash;
  } catch (err) {
    console.error('[RoleAgent] refresh failed:', err);
  }
}

/**
 * 为特定 session 设置 role-agent turn_end hook。
 * 仅对 role-agent 类型生效；记忆记录由统一 MemoryProvider 负责。
 */
function setupRoleAgentTurnHook(sessionId: string): (() => void) | null {
  return agentManager.subscribeToAgent(sessionId, (event: AgentEvent) => {
    if (event.type !== 'turn_end') return;

    const state = roleSessions.get(sessionId);
    if (!state) return;

    const turnEnd = event as unknown as { message: unknown; toolResults: unknown[] };

    // 1. 状态机检查
    const messages = [turnEnd.message] as Parameters<typeof checkTransition>[1];
    const transition = checkTransition(state.stateMachine, messages);
    if (transition) {
      applyTransition(state.stateMachine, transition.to);
      state.roleContext.currentPhase = transition.to;
      console.log(`[RoleAgent] 状态转换: ${transition.from} → ${transition.to}`);
      updateRoleMdPhase(state.roleContext.agentBaseDir, transition.to);
    }

  });
}

/** 状态转换时更新 Role.md 的 currentPhase */
function updateRoleMdPhase(agentDir: string, newPhase: string): void {
  const roleMdPath = path.join(agentDir, 'Role.md');
  if (!existsSync(roleMdPath)) return;

  try {
    let content = readFileSync(roleMdPath, 'utf-8');

    // 尝试更新 frontmatter 中的 currentPhase
    const fmMatch = content.match(/^(---\n)([\s\S]*?)\n(---)/m);
    if (fmMatch?.[2]) {
      const frontmatter = fmMatch[2];
      if (/^currentPhase:/m.test(frontmatter)) {
        content = content.replace(
          /^(currentPhase:).*$/m,
          `currentPhase: ${newPhase}`,
        );
      } else {
        // 插入 currentPhase 到 frontmatter
        content = content.replace(
          /^(---\n)/m,
          `---\ncurrentPhase: ${newPhase}\n`,
        );
      }
    } else {
      // 没有 frontmatter，在最前面添加
      content = `---\ncurrentPhase: ${newPhase}\n---\n\n${content}`;
    }

    writeFileSync(roleMdPath, content, 'utf-8');
  } catch (err) {
    console.error('[RoleAgent] Failed to update Role.md phase:', err);
  }
}

// 安装全局 hook
setupGlobalRoleAgentHook();

// ============================================================================
// RoleAgentLauncher
// ============================================================================

export class RoleAgentLauncher extends Launcher {
  readonly entryType = 'role-agent' as const;

  async launch(ctx: LaunchContext): Promise<LaunchResult> {
    try {
      const agentBaseDir = path.join(AGENTS_DIR, ctx.entryId);

      // 1. 读取入口内容（向后兼容）
      const content = await this.loadEntryContent(ctx.entryId);
      const agentMd = content['Agent.md'] || '';

      // 2. 尝试加载 RoleContext（新流程）
      const roleContext = await loadRoleContext(agentBaseDir);

      let systemPrompt: string;

      if (roleContext) {
        // 成功加载 → 使用 6 层 system prompt
        const stateMachine = parseStateMachine(roleContext.roleMd);

        // 更新角色上下文的当前阶段
        roleContext.currentPhase = stateMachine.currentPhase;

        // 记录 Tool.md 初始 hash
        const toolMdPath = path.join(agentBaseDir, 'Tool.md');
        const initialToolMd = existsSync(toolMdPath) ? readFileSync(toolMdPath, 'utf-8') : '';
        const initialToolMdHash = hashContent(initialToolMd);
        const initialSkillsHash = hashContent(roleContext.installedSkills.map(s => s.code).sort().join(','));
        const promptLayers = buildPromptLayers(roleContext, stateMachine);
        systemPrompt = assemblePrompt(promptLayers);

        // 存储会话状态
        roleSessions.set(ctx.entryId, {
          roleContext,
          stateMachine,
          lastToolMdHash: initialToolMdHash,
          lastSkillsHash: initialSkillsHash,
          promptLayers,
        });

        console.log(`[RoleAgent] Loaded role context for ${ctx.entryId}, phase=${stateMachine.currentPhase}, skills=${roleContext.installedSkills.length}, toolMdHash=${initialToolMdHash.slice(0, 8)}..., sessionId to be created`);
      } else {
        // 降级到旧流程
        systemPrompt = buildAgentSystemPrompt(agentMd, {
          role: content['Role.md'],
          memory: content['Memory.md'],
          taste: content['Taste.md'],
          baseDir: agentBaseDir,
        });
        console.log(`[RoleAgent] RoleContext not found, using legacy prompt for ${ctx.entryId}`);
      }

      // 3. 创建/恢复会话
      const { sessionId } = await this.createOrRestoreSession({
        projectId: ctx.entryId,
        projectName: ctx.entryId,
        systemPrompt,
        agentType: 'role-agent',
        agentBaseDir,
        sessionId: ctx.restoreSessionId || ctx.sessionId,
      });
      const observationContext = new ObservationPolicyResolver().resolve({
        entryType: 'role-agent',
        sessionId,
        agentId: ctx.entryId,
      });

      // 4. 注册 Agent 到 AgentManager
      await this.registerAgent(sessionId, ctx.entryId, {
        systemPrompt,
        agentType: 'role-agent',
        agentBaseDir,
        isWindowBound: ctx.isWindowBound,
        memoryOwnership: {
          ownerScope: 'agent',
          ownerId: ctx.entryId,
          userId: ctx.userId ?? 'default',
          dataRoot: getDataRoot(),
          ownerDirectory: agentBaseDir,
        },
        observationContext,
      });

      return {
        success: true,
        sessionId,
        systemPrompt,
        agentType: 'role-agent',
        baseDir: agentBaseDir,
        tools: [],
      };
    } catch (error) {
      return {
        success: false,
        sessionId: '',
        systemPrompt: '',
        agentType: 'role-agent',
        baseDir: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadEntryContent(id: string): Promise<Record<string, string>> {
    const agentBaseDir = path.join(AGENTS_DIR, id);
    const result: Record<string, string> = {};

    for (const file of ['Agent.md', 'Role.md', 'Tool.md', 'Memory.md', 'Taste.md']) {
      const content = this.readMdFile(agentBaseDir, file);
      if (content !== null) {
        result[file] = content;
      }
    }

    return result;
  }
}
