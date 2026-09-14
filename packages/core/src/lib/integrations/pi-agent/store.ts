/**
 * Pi Agent Store
 * Zustand store 用于管理 OriginOS Agent 的状态
 */

import { create } from "zustand";
import type { OriginOSAgent } from "./core/agent";
import { createOriginOSAgent } from "./core/agent";
import type { AgentEvent, AgentTool } from "@originos/pi-agent-adapter";
import type {
	ProjectContext,
} from "./types";
import { setToolContext, removeToolContext } from "./tools/context";

// Lazy-loaded to prevent Node.js fs modules from entering the browser bundle
const getSessionStore = async () => {
	const mod = await import("./session-store");
	return mod.sessionStore;
};

// ============================================================================
// Store State
// ============================================================================

/**
 * Pi Agent Store State
 */
export interface PiAgentStore {
	// === Agent 实例 ===
	agent: OriginOSAgent | null;

	// === 代理代理状态
	/**
	 * 是否已初始化
	 */
	isInitialized: boolean;

	/**
	 * 是否正在运行
	 */
	isRunning: boolean;

	/**
	 * 会话ID
	 */
	sessionId: string | null;

	/**
	 * 项目上下文
	 */
	projectContext: ProjectContext | null;

	// === UI 状态 ===
	/**
	 * 是否正在思考
	 */
	isThinking: boolean;

	/**
	 * 当前执行的工具
	 */
	activeTools: Array<{
	toolName: string;
		startTime: number;
	}>;

	/**
	 * 当前进度消息
	 */
	progressMessage: string | null;

	// === 错误状态 ===
	/**
	 * 最后的错误消息
	 */
	errorMessage: string | null;

	// === 会话状态 ===
	/**
	 * 所有会话列表
	 */
	sessions: Array<{
		id: string;
		name: string;
		createdAt: number;
		updatedAt: number;
	}>;

	/**
	 * 当前会话 ID（与会话列表中的 ID 一致）
	 */

	currentSessionId: string | null;

	// === Actions ===
	/**
	 * 初始化 Agent
	 */
	initialize: (
		sessionId: string,
		projectContext: ProjectContext,
		variables: Record<string, string>,
		llmConfig?: {
			provider?: string;
			baseUrl?: string;
			apiKey?: string;
			model?: string;
			maxTokens?: number;
		}
	) => Promise<void>;

	/**
	 * 销毁 Agent
	 */
	destroy: () => void;

	/**
	 * 发送消息
	 */
	sendMessage: (message: string) => Promise<void>;

	/**
	 * 中断当前操作
	 */
	abort: () => void;

	/**
	 * 更新项目上下文
	 */
	updateProjectContext: (context: Partial<ProjectContext>) => void;

	/**
	 * 设置系统提示词
	 */
	setSystemPrompt: (prompt: string) => void;

	/**
	 * 设置思考级别
	 */
	setThinkingLevel: (level: "off" | "minimal" | "low" | "medium" | "high") => void;

	/**
	 * 订阅事件
	 */
	subscribe: (listener: (event: AgentEvent) => void) => () => void;

	/**
	 * 重置状态
	 */
	reset: () => void;

	// === 会话管理 ===
	/**
	 * 保存当前会话
	 */
	saveCurrentSession: () => Promise<void>;

	/**
	 * 加载指定会话
	 */
	loadSession: (sessionId: string) => Promise<void>;

	/**
	 * 删除会话
	 */
	deleteSession: (sessionId: string) => Promise<void>;

	/**
	 * 重命名会话
	 */
	renameSession: (sessionId: string, newName: string) => Promise<void>;

	/**
	 * 切换会话
	 */
	switchSession: (sessionId: string) => Promise<void>;

	/**
	 * 创建新会话
	 */
	createNewSession: (name?: string) => Promise<void>;

	/**
	 * 刷新会话列表
	 */
	refreshSessions: () => Promise<void>;
}

/**
 * 默认状态
 */
const DEFAULT_STATE: Omit<
	PiAgentStore,
	| "initialize"
	| "destroy"
	| "sendMessage"
	| "abort"
	| "updateProjectContext"
	| "setSystemPrompt"
	| "setThinkingLevel"
	| "subscribe"
	| "reset"
	| "saveCurrentSession"
	| "loadSession"
	| "deleteSession"
	| "renameSession"
	| "switchSession"
	| "createNewSession"
	| "refreshSessions"
> = {
	agent: null,
	isInitialized: false,
	isRunning: false,
	sessionId: null,
	projectContext: null,
	isThinking: false,
	activeTools: [],
	progressMessage: null,
	errorMessage: null,
	sessions: [],
	currentSessionId: null,
};

/**
 * 创建 PiAgent Store
 */
export const createPiAgentStore = (initializeTools: () => void | Promise<void>) => create<PiAgentStore>((set, get) => ({
	...DEFAULT_STATE,

	/**
	 * 初始化 Agent
	 */
	initialize: async (
		sessionId: string,
		projectContext: ProjectContext,
		variables: Record<string, string>,
		llmConfig?: {
			provider?: string;
			baseUrl?: string;
			apiKey?: string;
			model?: string;
			maxTokens?: number;
		}
	): Promise<void> => {
		try {
			set({
				isRunning: true,
				errorMessage: null,
				sessionId,
				projectContext,
				currentSessionId: sessionId,
			});

			// 动态导入工具模块（避免 Node.js fs 模块被打包进浏览器 bundle）
			const { getAgentTools } = await import("./tools/index");

			// 显式初始化内置工具（避免模块加载时的副作用）
			await initializeTools();

			// 设置工具执行上下文
			setToolContext(sessionId, {
				sessionId,
			});

			const agent = await createOriginOSAgent({
				sessionId,
				variables: {
					...variables,
					projectId: projectContext.projectId,
					ontologyId: projectContext.ontologyId ?? "",
					projectName: projectContext.projectName ?? "",
					projectPath: projectContext.currentPath ?? "",
					userId: projectContext.userId ?? "",
				},
				llmConfig,
			});

			// 将工具注册到 Agent
			agent.setTools(getAgentTools() as AgentTool<any>[]);

			// 初始化 SessionStore 并保存初始会话
			const sessionStore = await getSessionStore();
			await sessionStore.initialize();
			const initialSession = {
				id: sessionId,
				name: projectContext.projectName || "新会话",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messages: [],
				systemPrompt: "",
				model: {
					provider: "anthropic",
					id: "claude-haiku-4-5",
				},
				projectContext,
			};
			await sessionStore.saveSession(initialSession);

			// 订阅内部事件更新状态
			agent.subscribe((event) => {
				switch ((event as any).type) {
					case "agent_start":
						set({ isRunning: true });
						break;
					case "agent_end":
						set({ isRunning: false });
						break;
					case "turn_start":
						set({ isRunning: true, isThinking: true });
						break;
					case "turn_end":
						set({ isRunning: false, isThinking: false });
						// 自动保存会话
						const { agent: currentAgent, sessionId: currentSessionId } = get();
						if (currentAgent && currentSessionId) {
							(async () => {
								try {
									const sess = await currentAgent.getSessionState();
									const sessionStore = await getSessionStore();
									await sessionStore.saveSession({
										id: currentSessionId,
										name: sess.projectContext?.projectName || "新会话",
										createdAt: sess.createdAt,
										updatedAt: sess.updatedAt,
										messages: sess.messages,
										systemPrompt: sess.systemPrompt,
										model: sess.model,
										projectContext: sess.projectContext,
									});
								} catch (error) {
									console.error("自动保存会话失败:", error);
								}
							})();
						}
						break;
					case "tool_execution_start":
						set((state) => ({
							activeTools: [
								...state.activeTools,
								{ toolName: (event as { toolName: string }).toolName, startTime: Date.now() },
							],
						}));
						break;
					case "tool_execution_end":
						set((state) => ({
							activeTools: state.activeTools.filter(
								(t) => t.toolName !== (event as { toolName: string }).toolName
							),
						}));
						break;
					case "message_end":
						// 处理错误消息
						if ((event as { message?: { errorMessage?: string } }).message?.errorMessage) {
							set({
								errorMessage: (event as { message: { errorMessage: string } }).message.errorMessage,
							});
						}
						break;
					case "agent_error":
						// 处理 agent 错误事件
						set({
							errorMessage: (event as any).error?.message ?? "Unknown agent error",
							isRunning: false,
							isThinking: false,
						});
						break;
				}
			});

			set({
				agent,
				isInitialized: true,
				isRunning: false,
			});

			// 刷新会话列表
			const sessions = await sessionStore.listSessions();
			set({
				sessions: sessions.map((s) => ({
					id: s.id,
					name: s.name,
					createdAt: s.createdAt,
					updatedAt: s.updatedAt,
				})),
			});
		} catch (error) {
			set({
				errorMessage: error instanceof Error ? error.message : String(error),
				isRunning: false,
			});
			throw error;
		}
	},

	/**
	 * 销毁 Agent
	 */
	destroy: () => {
		const { agent, sessionId } = get();
		if (agent) {
			agent.destroy();
		}
		// 清理工具上下文
		if (sessionId) {
			removeToolContext(sessionId);
		}
		set(DEFAULT_STATE);
	},

	/**
	 * 发送消息
	 */
	sendMessage: async (message: string): Promise<void> => {
		const { agent } = get();
		if (!agent) {
			throw new Error("Agent 未初始化");
		}

		try {
			set({ isRunning: true, errorMessage: null });
			await agent.prompt(message);
		} catch (error) {
			set({
				errorMessage: error instanceof Error ? error.message : String(error),
				isRunning: false,
			});
			throw error;
		}
	},

	/**
	 * 中断当前操作
	 */
	abort: (): void => {
		const { agent } = get();
		if (agent) {
			agent.abort();
		}
		set({ isRunning: false });
	},

	/**
	 * 更新项目上下文
	 */
	updateProjectContext: (context: Partial<ProjectContext>): void => {
		set((state) => ({
			projectContext: state.projectContext
				? { ...state.projectContext, ...context }
				: { ...context } as ProjectContext,
		}));
	},

	/**
	 * 设置系统提示词
	 */
	setSystemPrompt: (prompt: string): void => {
		const { agent } = get();
		if (agent) {
			agent.setSystemPrompt(prompt);
		}
	},

	/**
	 * 设置思考级别
	 */
	setThinkingLevel: (
		level: "off" | "minimal" | "low" | "medium" | "high"
	): void => {
		const { agent } = get();
		if (agent) {
			agent.setThinkingLevel?.(level);
		}
	},

	/**
	 * 订阅事件
	 */
	subscribe: (listener: (event: AgentEvent) => void): (() => void) => {
		const { agent } = get();
		if (!agent) {
			return () => {};
		}
		return agent.subscribe(listener);
	},

	/**
	 * 重置状态
	 */
	reset: (): void => {
		set(DEFAULT_STATE);
	},

	/**
	 * 保存当前会话
	 */
	saveCurrentSession: async (): Promise<void> => {
		const { agent, sessionId } = get();
		if (!agent || !sessionId) {
			return;
		}
		try {
			const sessionStore = await getSessionStore();
			const session = await agent.getSessionState();
			await sessionStore.saveSession({
				id: sessionId,
				name: session.projectContext?.projectName || "新会话",
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				messages: session.messages,
				systemPrompt: session.systemPrompt,
				model: session.model,
				projectContext: session.projectContext,
			});
		} catch (error) {
			console.error("保存会话失败:", error);
		}
	},

	/**
	 * 加载指定会话
	 */
	loadSession: async (sessionId: string): Promise<void> => {
		const sessionStore = await getSessionStore();
		const session = await sessionStore.loadSession(sessionId);
		if (!session) {
			throw new Error(`会话 ${sessionId} 不存在`);
		}

		const variables = {
			projectId: session.projectContext?.projectId || session.id,
			ontologyId: session.projectContext?.ontologyId,
			projectName: session.projectContext?.projectName || "加载的会话",
			projectPath: session.projectContext?.currentPath,
			userId: session.projectContext?.userId,
		};

		const projectContext = session.projectContext || {
			projectId: variables.projectId,
			ontologyId: variables.ontologyId,
			projectName: variables.projectName,
			currentPath: variables.projectPath,
			userId: variables.userId,
		};

		try {
			set({ isRunning: true, errorMessage: null });

			const { getAgentTools } = await import("./tools/index");
			await initializeTools();

			// 设置工具执行上下文
			setToolContext(sessionId, {
				sessionId,
			});

			const agent = await createOriginOSAgent({
				sessionId,
				variables,
			});

			agent.setTools(getAgentTools() as AgentTool<any>[]);

			// 恢复会话状态
			agent.replaceMessages(session.messages);

			// 订阅内部事件更新状态
			agent.subscribe((event) => {
				switch ((event as any).type) {
					case "agent_start":
						set({ isRunning: true });
						break;
					case "agent_end":
						set({ isRunning: false });
						break;
					case "turn_start":
						set({ isRunning: true, isThinking: true });
						break;
					case "turn_end":
						set({
							isRunning: false,
							isThinking: false,
						});
						// 自动保存会话
						const { agent: currentAgent, sessionId: currentSessionId } = get();
						if (currentAgent && currentSessionId) {
							(async () => {
								try {
									const sess = await currentAgent.getSessionState();
									const sessionStore = await getSessionStore();
									await sessionStore.saveSession({
										id: currentSessionId,
										name: sess.projectContext?.projectName || "新会话",
										createdAt: sess.createdAt,
										updatedAt: sess.updatedAt,
										messages: sess.messages,
										systemPrompt: sess.systemPrompt,
										model: sess.model,
										projectContext: sess.projectContext,
									});
								} catch (error) {
									console.error("自动保存会话失败:", error);
								}
							})();
						}
						break;
					case "tool_execution_start":
						set((state) => ({
							activeTools: [
								...state.activeTools,
								{ toolName: (event as { toolName: string }).toolName, startTime: Date.now() },
							],
						}));
						break;
					case "tool_execution_end":
						set((state) => ({
							activeTools: state.activeTools.filter(
								(t) => t.toolName !== (event as { toolName: string }).toolName
							),
						}));
						break;
					case "message_end":
						if ((event as { message?: { errorMessage?: string } }).message?.errorMessage) {
							set({ errorMessage: (event as { message: { errorMessage: string } }).message.errorMessage });
						}
						break;
					case "agent_error":
						set({
							errorMessage: (event as any).error?.message ?? "Unknown agent error",
							isRunning: false,
							isThinking: false,
						});
						break;
					default:
						// Ignore agent events that don't affect UI state
						break;
				}
			});

			set({
				agent,
				isInitialized: true,
				isRunning: false,
				sessionId,
				projectContext,
				currentSessionId: sessionId,
			});

			// 刷新会话列表
			const sessions = await sessionStore.listSessions();
			set({
				sessions: sessions.map((s) => ({
					id: s.id,
					name: s.name,
					createdAt: s.createdAt,
					updatedAt: s.updatedAt,
				})),
			});
		} catch (error) {
			set({
				errorMessage: error instanceof Error ? error.message : String(error),
				isRunning: false,
			});
			throw error;
		}
	},

	/**
	 * 删除会话
	 */
	deleteSession: async (sessionId: string): Promise<void> => {
		const { currentSessionId } = get();
		const sessionStore = await getSessionStore();
		const success = await sessionStore.deleteSession(sessionId);
		if (!success) {
			throw new Error(`删除会话 ${sessionId} 失败`);
		}

		// 如果删除的是当前会话，需要重新初始化
		if (currentSessionId === sessionId) {
			set({
				agent: null,
				isInitialized: false,
				isRunning: false,
				sessionId: null,
				projectContext: null,
				currentSessionId: null,
			});
		}

		// 刷新会话列表
		const sessions = await sessionStore.listSessions();
		set({
			sessions: sessions.map((s) => ({
				id: s.id,
				name: s.name,
				createdAt: s.createdAt,
				updatedAt: s.updatedAt,
			})),
		});
	},

	/**
	 * 重命名会话
	 */
	renameSession: async (sessionId: string, newName: string): Promise<void> => {
		const sessionStore = await getSessionStore();
		const success = await sessionStore.renameSession(sessionId, newName);
		if (!success) {
			throw new Error(`重命名会话 ${sessionId} 失败`);
		}
		// 刷新会话列表
		const sessions = await sessionStore.listSessions();
		set({
			sessions: sessions.map((s) => ({
				id: s.id,
				name: s.name,
				createdAt: s.createdAt,
				updatedAt: s.updatedAt,
			})),
		});
	},

	/**
	 * 切换会话
	 */
	switchSession: async (sessionId: string): Promise<void> => {
		// 切换会话实际上是加载该会话
		await get().loadSession(sessionId);
	},

	/**
	 * 创建新会话
	 */
	createNewSession: async (name?: string): Promise<void> => {
		const sessionStore = await getSessionStore();
		const session = await sessionStore.createSession(name);

		const variables = {
			projectId: "new-session",
			projectName: name || "新会话",
		};

		const projectContext = {
			projectId: "new-session",
			projectName: name || "新会话",
		};

		try {
			set({ isRunning: true, errorMessage: null });

			const { getAgentTools } = await import("./tools/index");
			await initializeTools();

			const agent = await createOriginOSAgent({
				sessionId: session.id,
				variables,
			});

			agent.setTools(getAgentTools() as AgentTool<any>[]);

			// 订阅内部事件更新状态
			agent.subscribe((event) => {
				switch ((event as any).type) {
					case "agent_start":
						set({ isRunning: true });
						break;
					case "agent_end":
						set({ isRunning: false });
						break;
					case "turn_start":
						set({ isRunning: true, isThinking: true });
						break;
					case "turn_end":
						set({
							isRunning: false,
							isThinking: false,
						});
						// 自动保存会话
						const { agent: currentAgent, sessionId: currentSessionId } = get();
						if (currentAgent && currentSessionId) {
							(async () => {
								try {
									const sess = await currentAgent.getSessionState();
									const sessionStore = await getSessionStore();
									await sessionStore.saveSession({
										id: currentSessionId,
										name: sess.projectContext?.projectName || "新会话",
										createdAt: sess.createdAt,
										updatedAt: sess.updatedAt,
										messages: sess.messages,
										systemPrompt: sess.systemPrompt,
										model: sess.model,
										projectContext: sess.projectContext,
									});
								} catch (error) {
									console.error("自动保存会话失败:", error);
								}
							})();
						}
						break;
					case "tool_execution_start":
						set((state) => ({
							activeTools: [
								...state.activeTools,
								{ toolName: (event as { toolName: string }).toolName, startTime: Date.now() },
							],
						}));
						break;
					case "tool_execution_end":
						set((state) => ({
							activeTools: state.activeTools.filter(
								(t) => t.toolName !== (event as { toolName: string }).toolName
							),
						}));
						break;
					case "message_end":
						if ((event as { message?: { errorMessage?: string } }).message?.errorMessage) {
							set({ errorMessage: (event as { message: { errorMessage: string } }).message.errorMessage });
						}
						break;
					case "agent_error":
						set({
							errorMessage: (event as any).error?.message ?? "Unknown agent error",
							isRunning: false,
							isThinking: false,
						});
						break;
					default:
						// Ignore agent events that don't affect UI state
						break;
				}
			});

			set({
				agent,
				isInitialized: true,
				isRunning: false,
				sessionId: session.id,
				projectContext,
				currentSessionId: session.id,
			});

			// 刷新会话列表
			const sessions = await sessionStore.listSessions();
			set({
				sessions: sessions.map((s) => ({
					id: s.id,
					name: s.name,
					createdAt: s.createdAt,
					updatedAt: s.updatedAt,
				})),
			});
		} catch (error) {
			set({
				errorMessage: error instanceof Error ? error.message : String(error),
				isRunning: false,
			});
			throw error;
		}
	},

	/**
	 * 刷新会话列表
	 */
	refreshSessions: async (): Promise<void> => {
		const sessionStore = await getSessionStore();
		const sessions = await sessionStore.listSessions();
		set({
			sessions: sessions.map((s) => ({
				id: s.id,
				name: s.name,
				createdAt: s.createdAt,
				updatedAt: s.updatedAt,
			})),
		});
	},
}));

export const usePiAgentStore = createPiAgentStore(() => {
  throw new Error("Local Agent Store requires business tool initialization; use the server-composed store or the HTTP/IPC agent hook");
});
