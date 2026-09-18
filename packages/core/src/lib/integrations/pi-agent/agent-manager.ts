/**
 * Agent Manager
 *
 * Manages OriginOSAgent instances for each session
 * Provides caching, lifecycle management, and cleanup
 */

import { OriginOSAgent, createOriginOSAgent } from './core/agent';
import type { AgentEvent, AgentTool } from '@originos/pi-agent-adapter';
import { getAgentToolsForScope } from './tools/index';
import { createRuntimeModel } from './server-config';
import { setToolContext, removeToolContext, getToolContextManager, type ToolExecutionContext } from './tools/context';
import { bindToolsToSession } from './tools/bind-session';
import { detectCorrections } from './cognitive/pattern/correction-detector';
import { getChannelMessageSource } from './channel-message-source';
import type { RuntimeLLMConfig } from './llm-config';
import type { AgentSession } from '../../../types/agent';
import type { MemoryOwnershipContext, ObservationContext } from '../../shared/cognitive/cognition-types';
import {
  AgentTaskRuntimeCoordinator,
  type AgentTaskRuntimeSnapshotV1,
  type AgentTaskRuntimePersistenceV1,
} from './task-runtime';
import { loadFrozenSessionContext } from './session-prompt-context';

type CognitiveSessionEndManager = {
  on_session_end: (messages: unknown[]) => Promise<void>;
};

export type AgentMemoryOwnership = Omit<MemoryOwnershipContext, 'workingDirectory' | 'sessionId'>;

export interface InProcessAgentOptions {
  systemPrompt?: string;
  sessionContext?: string;
  agentType?: string;
  agentBaseDir?: string;
  outputDir?: string;
  isWindowBound?: boolean;
  llmConfig?: RuntimeLLMConfig;
  memoryOwnership?: AgentMemoryOwnership;
  observationContext?: ObservationContext;
}

/**
 * Agent session entry
 */
interface AgentEntry {
  agent: OriginOSAgent;
  cognitiveManager?: CognitiveSessionEndManager;
  baseSystemPrompt?: string;
  sessionId: string;
  projectId: string;
  createdAt: number;
  lastAccessedAt: number;
  isWindowBound: boolean;
}

/**
 * Agent Manager configuration
 */
export interface AgentManagerDependencies {
  initializeTools(): void;
  integrateMemory(agent: OriginOSAgent, sessionId: string, options: InProcessAgentOptions & { agentBaseDir: string }): Promise<{
    cognitiveManager: import('./cognitive/manager').CognitiveManager;
    memoryProvider: { system_prompt_block(): Promise<string> };
  }>;
}

export interface AgentManagerConfig {
  /**
   * Maximum number of idle agents to keep in memory
   */
  maxIdleAgents?: number;

  /**
   * Idle timeout in milliseconds before cleanup
   */
  idleTimeoutMs?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

export interface RestoredAgentRuntime {
  sessionId: string;
  historyMessageCount: number;
}

export interface AgentTaskRuntimeBindingOptions {
  persist(state: AgentTaskRuntimePersistenceV1): void | Promise<void>;
  onState?(snapshot: AgentTaskRuntimeSnapshotV1): void;
  onAssistantMessage?(content: string): void;
  hasPendingUserMessage?(): boolean;
  hasBudgetRemaining?(): boolean;
}

/**
 * 将工具列表绑定到指定 session：每次工具执行前刷新 defaultContext，
 * 避免多 session 并发时 defaultContext 被最后一个 session 覆盖导致文件写到错误目录。
 *
 * 实现已迁移至 ./tools/bind-session.ts，作为 AgentManager 与 PersistentAgent 的共享工具。
 */

function filterDisallowedToolsForAgentType(
  tools: ReturnType<typeof getAgentToolsForScope>,
  agentType?: string
): ReturnType<typeof getAgentToolsForScope> {
  if (agentType === "worker" || agentType === "skill") {
    return tools.filter((tool) => tool.name !== "ask_user_question");
  }
  return tools;
}

/**
 * Global Agent Manager
 * Manages OriginOSAgent instances per session
 */
export class AgentManager {
  private agents = new Map<string, AgentEntry>();
  private runtimeRestorePromises = new Map<string, Promise<RestoredAgentRuntime>>();
  private taskRuntimes = new Map<string, AgentTaskRuntimeCoordinator>();
  private config: Required<AgentManagerConfig>;

  constructor(config?: AgentManagerConfig, private readonly dependencies?: AgentManagerDependencies) {
    this.config = {
      maxIdleAgents: config?.maxIdleAgents ?? 50,
      idleTimeoutMs: config?.idleTimeoutMs ?? 30 * 60 * 1000, // 30 minutes
      debug: config?.debug ?? false,
    };

    // Start cleanup interval
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 60 * 1000); // Cleanup every minute
    }
  }

  /**
   * Get or create an agent for a session
   */
  async getOrCreateAgent(
    sessionId: string,
    projectId: string,
    options?: InProcessAgentOptions
  ): Promise<OriginOSAgent> {
    const startAt = Date.now();
    const entry = this.agents.get(sessionId);

    if (entry) {
      // Update last accessed time
      entry.lastAccessedAt = Date.now();

      // Update systemPrompt if provided and different
      if (options?.systemPrompt && options.systemPrompt !== entry.baseSystemPrompt && entry.agent.isInitialized()) {
        entry.agent.setSystemPrompt(options.systemPrompt);
        entry.baseSystemPrompt = options.systemPrompt;
      }
      if (options?.sessionContext !== undefined && entry.agent.isInitialized()) {
        entry.agent.setSessionContext(options.sessionContext);
      }

      // Apply llmConfig if provided (launcher may have created agent without it)
      if (options?.llmConfig && entry.agent.isInitialized()) {
        const lc = options.llmConfig;
        try {
          const updatedModel = createRuntimeModel(lc);
          console.log(`[AgentManager] Applying llmConfig, model: ${updatedModel.id}`);
          entry.agent.setModel(updatedModel);
        } catch (e) {
          console.warn('[AgentManager] Failed to apply llmConfig:', e);
        }
      }

      // Always refresh tool context — working directory may change between calls
      const context: ToolExecutionContext = {
        sessionId,
        workingDirectory: options?.agentBaseDir,
      };
      setToolContext(sessionId, context);
      getToolContextManager().setDefaultContext(context);

      console.log(`[AgentManager] Reusing existing agent for session: ${sessionId} in ${Date.now() - startAt}ms`);

      return entry.agent;
    }

    // Create new agent
    console.log(`[AgentManager] Creating new agent for session: ${sessionId}`, {
      projectId,
      agentType: options?.agentType,
      hasSystemPrompt: !!options?.systemPrompt,
      hasBaseDir: !!options?.agentBaseDir,
    });

    // Ensure built-in tools are registered
    const toolsInitAt = Date.now();
    if (!this.dependencies) throw new Error('Agent business dependencies are required');
    this.dependencies.initializeTools();
    console.log(`[AgentManager] Built-in tools ready in ${Date.now() - toolsInitAt}ms`);

    // Set tool execution context so file tools resolve to the correct directory
    const context: ToolExecutionContext = {
      sessionId,
      workingDirectory: options?.agentBaseDir,
    };
    setToolContext(sessionId, context);
    getToolContextManager().setDefaultContext(context);

    let agent: OriginOSAgent;

    console.log(`[AgentManager] Creating OriginOSAgent for session ${sessionId}`);
    const createAt = Date.now();
    agent = await this.createInProcessAgent(sessionId, projectId, options);
    console.log(`[AgentManager] createInProcessAgent completed in ${Date.now() - createAt}ms`);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`[AgentManager] Agent created for session ${sessionId} [initialized: ${agent.isInitialized()}] in ${Date.now() - startAt}ms`);

    this.agents.set(sessionId, {
      agent,
      cognitiveManager: this.getCognitiveManager(agent),
      baseSystemPrompt: options?.systemPrompt,
      sessionId,
      projectId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      isWindowBound: options?.isWindowBound ?? false,
    });

    return agent;
  }

  /**
   * 通过公开 OriginOSAgent API 将持久化 Session 重新绑定到运行时。
   * 调用完成后，下一条 prompt 会看到完整历史，但不会包含尚未提交的新用户消息。
   */
  async restoreAgentRuntime(session: AgentSession): Promise<RestoredAgentRuntime> {
    const pendingRestore = this.runtimeRestorePromises.get(session.sessionId);
    if (pendingRestore) {
      return pendingRestore;
    }

    const restore = this.restoreAgentRuntimeOnce(session);
    this.runtimeRestorePromises.set(session.sessionId, restore);
    try {
      return await restore;
    } finally {
      if (this.runtimeRestorePromises.get(session.sessionId) === restore) {
        this.runtimeRestorePromises.delete(session.sessionId);
      }
    }
  }

  private async restoreAgentRuntimeOnce(session: AgentSession): Promise<RestoredAgentRuntime> {
    const hadRuntime = this.hasAgent(session.sessionId);
    const sessionContext = await loadFrozenSessionContext({
      agentType: session.agentType,
      workingDirectory: session.projectContext.currentPath,
    });
    const agent = await this.getOrCreateAgent(
      session.sessionId,
      session.projectContext.projectId,
      {
        systemPrompt: session.systemPrompt || undefined,
        sessionContext,
        agentType: session.agentType,
        agentBaseDir: session.projectContext.currentPath,
        outputDir: session.projectContext.outputDir,
        llmConfig: session.llmConfig,
      },
    );

    if (hadRuntime) {
      return {
        sessionId: session.sessionId,
        historyMessageCount: session.messages.length,
      };
    }

    await agent.waitForIdle();
    const historyMessageCount = agent.replacePersistedMessages(session.messages);

    return {
      sessionId: session.sessionId,
      historyMessageCount,
    };
  }

  /**
   * 获取已有运行时；进程重启或缓存回收后则先从持久化 Session 恢复。
   */
  async getOrRestoreAgentRuntime(session: AgentSession): Promise<OriginOSAgent> {
    const pendingRestore = this.runtimeRestorePromises.get(session.sessionId);
    if (pendingRestore) {
      await pendingRestore;
    }

    if (!this.hasAgent(session.sessionId)) {
      await this.restoreAgentRuntime(session);
      const restoredAgent = this.getAgent(session.sessionId);
      if (!restoredAgent) {
        throw new Error(`Agent runtime restore failed for session ${session.sessionId}`);
      }
      return restoredAgent;
    }

    const sessionContext = await loadFrozenSessionContext({
      agentType: session.agentType,
      workingDirectory: session.projectContext.currentPath,
    });
    return this.getOrCreateAgent(
      session.sessionId,
      session.projectContext.projectId,
      {
        systemPrompt: session.systemPrompt || undefined,
        sessionContext,
        agentType: session.agentType,
        agentBaseDir: session.projectContext.currentPath,
        outputDir: session.projectContext.outputDir,
        llmConfig: session.llmConfig,
      },
    );
  }

  async getOrCreateTaskRuntime(
    session: AgentSession,
    options: AgentTaskRuntimeBindingOptions,
  ): Promise<AgentTaskRuntimeCoordinator> {
    const existing = this.taskRuntimes.get(session.sessionId);
    if (existing) {
      return existing;
    }

    const agent = await this.getOrRestoreAgentRuntime(session);
    const runtime = new AgentTaskRuntimeCoordinator({
      sessionId: session.sessionId,
      agent,
      initialState: session.taskRuntime,
      ...options,
    });
    await runtime.initialize();
    this.taskRuntimes.set(session.sessionId, runtime);
    return runtime;
  }

  getTaskRuntime(sessionId: string): AgentTaskRuntimeCoordinator | null {
    return this.taskRuntimes.get(sessionId) ?? null;
  }

  /**
   * 创建 in-process OriginOSAgent（原有逻辑）
   */
  private async createInProcessAgent(
    sessionId: string,
    projectId: string,
    options?: InProcessAgentOptions
  ): Promise<OriginOSAgent> {
    const t0 = Date.now();
    const agent = createOriginOSAgent({
      sessionId,
      systemPrompt: options?.systemPrompt,
      sessionContext: options?.sessionContext,
      variables: {
        projectId,
        projectName: options?.agentType || 'Agent Session',
      },
      llmConfig: options?.llmConfig,
      agentType: options?.agentType,
    });

    // Register built-in tools on the agent, filtered by agent type scopes
    const scopeTools = getAgentToolsForScope(options?.agentType);
    const tools = bindToolsToSession(
      filterDisallowedToolsForAgentType(scopeTools, options?.agentType),
      sessionId
    );
    agent.setTools(tools as AgentTool<any>[]);
    console.log(`[AgentManager] OriginOSAgent + ${tools.length} tools prepared in ${Date.now() - t0}ms`);

    // 接入 Memory Core（三层记忆 + CognitiveManager + 记忆工具）
    const hasLegacyCognitiveOwner = Boolean(options?.agentBaseDir && options.agentType !== 'skill');
    const hasExplicitCognitiveOwner = Boolean(options?.memoryOwnership);
    if (hasLegacyCognitiveOwner || hasExplicitCognitiveOwner) {
      if (!options?.agentBaseDir) throw new Error('Cognitive integration requires agentBaseDir');
      if (options.memoryOwnership && !options.observationContext) throw new Error('Explicit memory ownership requires observationContext');
      if (!this.dependencies?.integrateMemory) throw new Error('Agent business memory integration is required');
      const { cognitiveManager, memoryProvider } = await this.dependencies.integrateMemory(agent, sessionId, { ...options, agentBaseDir: options.agentBaseDir });
      this.injectMemoryIntoSessionContext(agent, memoryProvider);
      this.subscribeInProcessCognitive(agent, cognitiveManager, sessionId);
      this.setCognitiveManager(agent, cognitiveManager);
    }

    return agent;
  }

  /** 将 Memory 快照追加到冻结会话上下文。 */
  private injectMemoryIntoSessionContext(
    agent: OriginOSAgent,
    memoryProvider: { system_prompt_block: () => Promise<string> }
  ): void {
    memoryProvider.system_prompt_block()
      .then(block => {
        if (block) {
          agent.appendSessionContext(`# Core Memory\n\n${block}`);
        }
      })
      .catch(err => console.warn('[AgentManager] Failed to inject memory into prompt:', err));
  }

  /**
   * 订阅 in-process agent 的 turn_end 事件，同步到 CognitiveManager
   */
  private subscribeInProcessCognitive(
    agent: OriginOSAgent,
    cognitiveManager: { on_turn_end: (data: any) => Promise<void> },
    sessionId: string
  ): void {
    let turnCounter = 0;
    let lastUserMessage = '';
    let lastAssistantMessage = '';
    let lastSource = undefined as ReturnType<typeof getChannelMessageSource>;

    const extractText = (content: unknown): string => {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .filter((b: any) => b.type === 'text' && b.text)
          .map((b: any) => b.text)
          .join(' ');
      }
      return '';
    };

    const extractToolCalls = (event: any) =>
      (event.toolResults ?? []).map((tr: any) => ({
        name: tr.toolName ?? 'unknown',
        params: {},
        result: extractText(tr.content),
        success: !tr.isError,
      }));

    agent.subscribe((event: any) => {
      if (event.type === 'message_end') {
        const role = event.message?.role;
        const text = extractText(event.message?.content) || '';
        if (role === 'user' && text) {
          lastUserMessage = text;
          lastSource = getChannelMessageSource();
        }
        if (role === 'assistant' && text) {
          lastAssistantMessage = text;
        }
      }

      if (event.type === 'turn_end') {
        const assistantMsg = lastAssistantMessage || extractText((event.message as any)?.content) || '';
        const userMsg = lastUserMessage;
        const corrections: unknown[] = detectCorrections(userMsg);
        const now = Date.now();
        const source = getChannelMessageSource() ?? lastSource ?? { sessionId, observedAt: new Date(now).toISOString() };
        const observedAt = source.observedAt ? Date.parse(source.observedAt) : Number.NaN;
        cognitiveManager.on_turn_end({
          turnNumber: ++turnCounter,
          userMessage: userMsg,
          assistantMessage: assistantMsg,
          assistantThinking: '',
          toolCalls: extractToolCalls(event),
          outcome: {
            resolved: true,
            toolChainLength: event.toolResults?.length ?? 0,
            userCorrections: corrections.length || undefined,
          },
          timestamp: Number.isFinite(observedAt) ? observedAt : now,
          source,
        }).catch(err => console.error('[AgentManager] Cognitive sync_turn error:', err));
        lastUserMessage = '';
        lastAssistantMessage = '';
        lastSource = undefined;
      }
    });
  }

  /**
   * Get an existing agent without creating one
   */
  getAgent(sessionId: string): OriginOSAgent | null {
    const entry = this.agents.get(sessionId);
    if (entry) {
      entry.lastAccessedAt = Date.now();
      return entry.agent;
    }
    return null;
  }

  /**
   * Check if an agent exists for a session
   */
  hasAgent(sessionId: string): boolean {
    return this.agents.has(sessionId);
  }

  /**
   * Subscribe to agent events for a session
   */
  subscribeToAgent(
    sessionId: string,
    listener: (event: AgentEvent) => void
  ): (() => void) | null {
    const entry = this.agents.get(sessionId);
    if (!entry) {
      return null;
    }

    return entry.agent.subscribe(listener);
  }

  /**
   * Remove an agent for a session
   */
  removeAgent(sessionId: string): boolean {
    const entry = this.agents.get(sessionId);
    const taskRuntime = this.taskRuntimes.get(sessionId);
    taskRuntime?.destroy();
    this.taskRuntimes.delete(sessionId);
    if (!entry) {
      return Boolean(taskRuntime);
    }

    if (this.config.debug) {
      console.log(`[AgentManager] Removing agent for session: ${sessionId}`);
    }

    entry.agent.destroy();
    removeToolContext(sessionId);
    this.agents.delete(sessionId);
    return true;
  }

  /**
   * Finalize cognitive providers before removing an agent.
   *
   * Closing a window is the practical session boundary for in-process
   * role/project/skill agents. PatternProvider renders Patterns.md from
   * archival memory in on_session_end, so destruction must flush that hook
   * before the agent state is cleared.
   */
	async finalizeAndRemoveAgent(sessionId: string): Promise<boolean> {
    const entry = this.agents.get(sessionId);
    if (!entry) {
      return false;
	}

    await this.flushCognitiveSessionEnd(entry);
    return this.removeAgent(sessionId);
  }

	/**
	 * Flush and destroy every in-process session during application shutdown.
	 * This is intentionally separate from per-window cleanup so Electron can
	 * await cognitive persistence before terminating the main process.
	 */
	async shutdown(): Promise<void> {
		const sessionIds = Array.from(this.agents.keys());
		await Promise.all(sessionIds.map(async (sessionId) => {
			try {
				await this.finalizeAndRemoveAgent(sessionId);
			} catch (error) {
				console.error(`[AgentManager] Shutdown failed for session ${sessionId}:`, error);
			}
		}));
		for (const taskRuntime of this.taskRuntimes.values()) {
			taskRuntime.destroy();
		}
		this.taskRuntimes.clear();
	}

  private setCognitiveManager(agent: OriginOSAgent, cognitiveManager: CognitiveSessionEndManager): void {
    (agent as unknown as { __originosCognitiveManager?: CognitiveSessionEndManager }).__originosCognitiveManager = cognitiveManager;
  }

  private getCognitiveManager(agent: OriginOSAgent): CognitiveSessionEndManager | undefined {
    return (agent as unknown as { __originosCognitiveManager?: CognitiveSessionEndManager }).__originosCognitiveManager;
  }

  private async flushCognitiveSessionEnd(entry: AgentEntry): Promise<void> {
    const cognitiveManager = entry.cognitiveManager ?? this.getCognitiveManager(entry.agent);
    if (!cognitiveManager) {
      return;
    }

    try {
      const state = await entry.agent.getSessionState();
      await cognitiveManager.on_session_end(state.messages ?? []);
    } catch (error) {
      console.error(`[AgentManager] Cognitive session_end error for ${entry.sessionId}:`, error);
    }
  }

  /**
   * Abort an agent's current operation
   */
  abortAgent(sessionId: string): boolean {
    const entry = this.agents.get(sessionId);
    if (!entry) {
      return false;
    }

    entry.agent.abort();
    return true;
  }

  /**
   * Cleanup idle agents that exceed timeout
   */
  cleanup(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    // Sort by last accessed time
    const entries = Array.from(this.agents.entries())
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    // Remove idle agents that exceed timeout (skip window-bound agents)
    for (const [sessionId, entry] of entries) {
      if (entry.isWindowBound) continue;
      const idleTime = now - entry.lastAccessedAt;

      if (idleTime > this.config.idleTimeoutMs) {
        toRemove.push(sessionId);
      }
    }

    // Remove excess agents if over limit (skip window-bound agents)
    const nonWindowBoundEntries = entries.filter(([_, e]) => !e.isWindowBound);
    if (nonWindowBoundEntries.length > this.config.maxIdleAgents) {
      const excess = nonWindowBoundEntries.length - this.config.maxIdleAgents;
      for (let i = 0; i < excess; i++) {
        const entry = nonWindowBoundEntries[i];
        if (!entry) break;
        const sessionId = entry[0];
        if (!toRemove.includes(sessionId)) {
          toRemove.push(sessionId);
        }
      }
    }

    // Perform cleanup
    for (const sessionId of toRemove) {
      this.removeAgent(sessionId);
    }

    if (this.config.debug && toRemove.length > 0) {
      console.log(`[AgentManager] Cleaned up ${toRemove.length} idle agents`);
    }
  }

  /**
   * Get statistics about active agents
   */
  getStats(): {
    totalAgents: number;
    sessions: Array<{
      sessionId: string;
      projectId: string;
      createdAt: number;
      lastAccessedAt: number;
      isWindowBound: boolean;
    }>;
  } {
    return {
      totalAgents: this.agents.size,
      sessions: Array.from(this.agents.values()).map(entry => ({
        sessionId: entry.sessionId,
        projectId: entry.projectId,
        createdAt: entry.createdAt,
        lastAccessedAt: entry.lastAccessedAt,
        isWindowBound: entry.isWindowBound,
      })),
    };
  }

  /**
   * Destroy all agents
   */
  destroyAll(): void {
    for (const [sessionId] of this.agents) {
      this.removeAgent(sessionId);
    }
  }
}
