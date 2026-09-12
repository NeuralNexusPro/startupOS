import { AgentManager } from '../../integrations/pi-agent/agent-manager';
import { initializeBuiltInTools } from './tools';
import { integrateAgentMemory } from './cognitive/in-process';

/**
 * Global singleton instance — 挂载到 globalThis 避免 Next.js HMR 实例隔离。
 * AgentManager 持有 CollaborationAgentBridge 的引用，HMR 后必须复用已有 entry。
 */
declare global {
  // eslint-disable-next-line no-var
  var __globalAgentManager: AgentManager | undefined;
}

function getGlobalAgentManager(): AgentManager {
  if (!globalThis.__globalAgentManager) {
    globalThis.__globalAgentManager = new AgentManager({
      maxIdleAgents: 50,
      idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
      debug: process.env['NODE_ENV'] === 'development',
    }, { initializeTools: initializeBuiltInTools, integrateMemory: integrateAgentMemory });
  }
  return globalThis.__globalAgentManager;
}

export const agentManager = getGlobalAgentManager();
