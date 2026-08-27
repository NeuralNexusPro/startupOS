/**
 * Agent Manager
 *
 * Manages OriginOSAgent instances for each session
 * Provides caching, lifecycle management, and cleanup
 */

import { OriginOSAgent, createOriginOSAgent } from './core/agent';
import type { AgentEvent, AgentTool } from '@originos/pi-agent-adapter';
import { initializeBuiltInTools, getAgentToolsForScope } from './tools/index';
import { createRuntimeModel } from './server-config';
import { setToolContext, removeToolContext, getToolContextManager, type ToolExecutionContext } from './tools/context';
import { bindToolsToSession } from './tools/bind-session';
import { detectCorrections } from './cognitive/pattern/correction-detector';
import type { RuntimeLLMConfig } from './llm-config';
import type { AgentSession } from '../../../types/agent';
import {
  AgentTaskRuntimeCoordinator,
  type AgentTaskRuntimeSnapshotV1,
  type AgentTaskRuntimePersistenceV1,
} from './task-runtime';

type CognitiveSessionEndManager = {
  on_session_end: (messages: unknown[]) => Promise<void>;
};

/**
 * Agent session entry
 */
interface AgentEntry {
  agent: OriginOSAgent;
  cognitiveManager?: CognitiveSessionEndManager;
  sessionId: string;
  projectId: string;
  createdAt: number;
  lastAccessedAt: number;
  isWindowBound: boolean;
}

/**
 * Agent Manager configuration
 */
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

  constructor(config?: AgentManagerConfig) {
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
    options?: {
      systemPrompt?: string;
      agentType?: string;
      agentBaseDir?: string;
      outputDir?: string;
      isWindowBound?: boolean;
      llmConfig?: RuntimeLLMConfig;
    }
  ): Promise<OriginOSAgent> {
    const startAt = Date.now();
    const entry = this.agents.get(sessionId);

    if (entry) {
      // Update last accessed time
      entry.lastAccessedAt = Date.now();

      // Update systemPrompt if provided and different
      if (options?.systemPrompt && entry.agent.isInitialized()) {
        entry.agent.setSystemPrompt(options.systemPrompt);
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
    initializeBuiltInTools();
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
    const agent = await this.getOrCreateAgent(
      session.sessionId,
      session.projectContext.projectId,
      {
        systemPrompt: session.systemPrompt || undefined,
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

    return this.getOrCreateAgent(
      session.sessionId,
      session.projectContext.projectId,
      {
        systemPrompt: session.systemPrompt || undefined,
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
    options?: { systemPrompt?: string; agentType?: string; agentBaseDir?: string; isWindowBound?: boolean; llmConfig?: RuntimeLLMConfig }
  ): Promise<OriginOSAgent> {
    const t0 = Date.now();
    const agent = createOriginOSAgent({
      sessionId,
      systemPrompt: options?.systemPrompt,
      variables: {
        projectId,
        projectName: options?.agentType || 'Agent Session',
      },
      llmConfig: options?.llmConfig,
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
    if (options?.agentBaseDir) {
      try {
        const memoryStart = Date.now();
        const { MemoryCore } = await import('../../../modules/memory-core');
        const { MemoryProvider } = await import('../../../modules/memory-core/session/memory-provider');
        const { CognitiveManager } = await import('./cognitive/manager');
        const { CoreMemoryTools } = await import('../../../modules/memory-core/tools/core-memory-tools');
        const { ArchivalMemoryTools } = await import('../../../modules/memory-core/tools/archival-memory-tools');

        const { PracticeLogger } = await import('./cognitive/practice-logger');
        const { PatternProvider } = await import('./cognitive/pattern/index');

        const memoryCore = new MemoryCore(options.agentBaseDir, sessionId);
        const memoryProvider = new MemoryProvider(memoryCore, sessionId);
        const cognitiveManager = new CognitiveManager(options.agentBaseDir);
        cognitiveManager.register(new PracticeLogger(options.agentBaseDir));
        cognitiveManager.register(memoryProvider);
        const patternProvider = new PatternProvider(options.agentBaseDir, memoryCore.archival);
        patternProvider.initialize()
          .then(() => console.log(`[AgentManager] PatternProvider initialized in background for ${sessionId}`))
          .catch((e: unknown) => console.warn('[AgentManager] PatternProvider init error:', e));
        cognitiveManager.register(patternProvider);

        const coreMemoryTools = new CoreMemoryTools(memoryCore.memory);
        const archivalMemoryTools = new ArchivalMemoryTools(memoryCore.archival);

        const registerMemoryTool = (name: string, description: string, label: string, params: unknown, execute: (toolCallId: string, args: any) => Promise<{ content: { type: string; text: string }[]; details: {} }>) => {
          agent.registerTool({ name, description, label, parameters: params, execute } as any);
        };

        registerMemoryTool('core_memory_append', 'Append content to a core memory block. Available blocks: human, persona, project, scratchpad, temporal.',
          'core_memory_append',
          { type: 'object', properties: { label: { type: 'string' }, content: { type: 'string' } }, required: ['label', 'content'] },
          async (_toolCallId, args) => {
            if (!args?.label) return { content: [{ type: 'text', text: "Error: 'label' parameter is required. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
            if (!args?.content) return { content: [{ type: 'text', text: "Error: 'content' parameter is required." }], details: {} };
            const result = await coreMemoryTools.core_memory_append(args.label, args.content);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('core_memory_replace', 'Replace content in a core memory block. Available blocks: human, persona, project, scratchpad, temporal.',
          'core_memory_replace',
          { type: 'object', properties: { label: { type: 'string' }, old_content: { type: 'string' }, new_content: { type: 'string' } }, required: ['label', 'old_content', 'new_content'] },
          async (_toolCallId, args) => {
            if (!args?.label) return { content: [{ type: 'text', text: "Error: 'label' parameter is required. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
            if (!args?.old_content) return { content: [{ type: 'text', text: "Error: 'old_content' parameter is required." }], details: {} };
            if (!args?.new_content) return { content: [{ type: 'text', text: "Error: 'new_content' parameter is required." }], details: {} };
            const result = await coreMemoryTools.core_memory_replace(args.label, args.old_content, args.new_content);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('insert_memory_block', 'Create a new custom core memory block.',
          'insert_memory_block',
          { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, description: { type: 'string' } }, required: ['label', 'value'] },
          async (_toolCallId, args) => {
            const result = await coreMemoryTools.insert_memory_block(args.label, args.value, args.description);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('read_memory_block', 'Read a core memory block.',
          'read_memory_block',
          { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
          async (_toolCallId, args) => {
            const result = await coreMemoryTools.read_memory_block(args.label);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('archival_memory_insert', 'Insert text into archival memory.',
          'archival_memory_insert',
          { type: 'object', properties: { text: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['text'] },
          async (_toolCallId, args) => {
            const result = await archivalMemoryTools.archival_memory_insert(args.text, args.tags);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('archival_memory_search', 'Semantically search archival memory.',
          'archival_memory_search',
          { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
          async (_toolCallId, args) => {
            const result = await archivalMemoryTools.archival_memory_search(args.query, args.limit);
            return { content: [{ type: 'text', text: result }], details: {} };
          });

        // 将 Memory 快照注入 system prompt
        this.injectMemoryIntoSystemPrompt(agent, memoryProvider);

        // 订阅 turn_end → cognitiveManager.on_turn_end
        this.subscribeInProcessCognitive(agent, cognitiveManager, sessionId);
        this.setCognitiveManager(agent, cognitiveManager);

        console.log(`[AgentManager] Memory Core integrated for in-process agent session ${sessionId} in ${Date.now() - memoryStart}ms`);
      } catch (err) {
        console.warn('[AgentManager] Failed to integrate Memory Core for in-process agent:', err);
      }
    }

    return agent;
  }

  /**
   * 将 Memory 快照注入 system prompt
   */
  private injectMemoryIntoSystemPrompt(
    agent: OriginOSAgent,
    memoryProvider: { system_prompt_block: () => Promise<string> }
  ): void {
    memoryProvider.system_prompt_block()
      .then(block => {
        if (block) {
          const existing = (agent as any).agent?.state?.systemPrompt ?? '';
          const augmented = existing
            ? existing + '\n\n---\n\n# Core Memory\n\n' + block
            : block;
          (agent as any).setSystemPrompt?.(augmented);
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
    _sessionId: string
  ): void {
    let turnCounter = 0;
    let lastUserMessage = '';
    let lastAssistantMessage = '';

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
        }
        if (role === 'assistant' && text) {
          lastAssistantMessage = text;
        }
      }

      if (event.type === 'turn_end') {
        const assistantMsg = lastAssistantMessage || extractText((event.message as any)?.content) || '';
        const userMsg = lastUserMessage;
        const corrections: unknown[] = detectCorrections(userMsg);
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
          timestamp: Date.now(),
        }).catch(err => console.error('[AgentManager] Cognitive sync_turn error:', err));
        lastUserMessage = '';
        lastAssistantMessage = '';
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
    });
  }
  return globalThis.__globalAgentManager;
}

export const agentManager = getGlobalAgentManager();
