/**
 * Agent (Assistant) Launcher
 *
 * 启动流程（data/agents/{id}/）：
 * 1. 读取 Agent.md → systemPrompt
 * 2. 读取 Tool.md → 过滤/注册工具
 * 3. 读取 Memory.md / Knowledge.md / Patterns.md → 注入长期稳定记忆快照
 * 4. 创建会话（projectId = entryId, agentType = 'assistant'）
 * 5. 返回 LaunchResult
 */

import path from 'path';
import { Launcher, type LaunchContext, type LaunchResult, buildAgentSystemPrompt } from './base';
import { getAgentsDataDir, getDataRoot } from '../../../paths';
import { ObservationPolicyResolver } from '../../../../modules/memory-core';

const AGENTS_DIR = getAgentsDataDir();

export class AgentLauncher extends Launcher {
  readonly entryType = 'agent' as const;

  async launch(ctx: LaunchContext): Promise<LaunchResult> {
    try {
      const agentBaseDir = path.join(AGENTS_DIR, ctx.entryId);

      // 1. 读取入口内容
      const content = await this.loadEntryContent(ctx.entryId);
      const agentMd = content['Agent.md'] || '';

      // 2. 构建系统提示词（注入权限授权）
      const systemPrompt = buildAgentSystemPrompt(agentMd, {
        memory: content['Memory.md'],
        knowledge: content['Knowledge.md'],
        patterns: content['Patterns.md'],
        baseDir: agentBaseDir,
      });

      // 3. 创建/恢复会话
      const { sessionId } = await this.createOrRestoreSession({
        projectId: ctx.entryId,
        projectName: ctx.entryId,
        systemPrompt,
        agentType: 'assistant',
        agentBaseDir,
        sessionId: ctx.restoreSessionId || ctx.sessionId,
      });
      const observationContext = new ObservationPolicyResolver().resolve({
        entryType: 'role-agent',
        sessionId,
        agentId: ctx.entryId,
      });

      // 4. 注册 Agent 到 AgentManager
      const tools = await this.registerAgent(sessionId, ctx.entryId, {
        systemPrompt,
        agentType: 'assistant',
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
        agentType: 'assistant',
        baseDir: agentBaseDir,
        tools,
      };
    } catch (error) {
      return {
        success: false,
        sessionId: '',
        systemPrompt: '',
        agentType: 'assistant',
        baseDir: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async loadEntryContent(id: string): Promise<Record<string, string>> {
    const agentBaseDir = path.join(AGENTS_DIR, id);
    const result: Record<string, string> = {};

    for (const file of ['Agent.md', 'Tool.md', 'Memory.md', 'Knowledge.md', 'Patterns.md']) {
      const content = this.readMdFile(agentBaseDir, file);
      if (content !== null) {
        result[file] = content;
      }
    }

    return result;
  }
}
