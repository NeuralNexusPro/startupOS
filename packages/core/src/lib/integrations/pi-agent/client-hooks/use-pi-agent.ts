/**
 * usePiAgent 主 hook——组装状态、事件与发送流程（含 usePiAgentEvent/usePiAgentStatus 辅助 hooks）。
 *
 * 这个模块不依赖任何 Node.js 特定包，可以在客户端安全使用
 */

import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import type { ProjectContext } from "../types";
import {
	getAgentSession,
	subscribeAgentEvents,
	abortAgentSession,
} from "../../electron/services/agent-session";
import { isElectron } from "../../electron/env";
import {
	createRestoreAgentSessionResult,
	toRestoreAgentSessionError,
	type RestoreAgentSessionRequest,
	type RestoreAgentSessionResult,
} from "../session-restore";
import type { AgentContextTokenEstimate, AgentTokenUsage } from "../../../types/agent";
import type { ClientAgentEvent, ClientHookMessage, UseClientPiAgentState } from "./types";
import { initializeSession } from "./api";
import { runSendMessage } from "./message-send";
import { runSendMessageStream } from "./message-stream";

// ============================================================================
// usePiAgent Hook (客户端版本)
// ============================================================================

/**
 * React hook for interacting with the Pi Agent via API
 *
 * 这个 hook 通过 API 路由与服务端 Agent 交互，不依赖 Node.js 特定包
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { sendMessage, isThinking, uiState } = usePiAgent();
 *
 *   const handleSend = async (text: string) => {
 *     await sendMessage(text);
 *   };
 *
 *   return (
 *     <div>
 *       {isThinking && <p>正在思考...</p>}
 *       <ChatInput onSubmit={handleSend} disabled={isThinking} />
 *     </div>
 *   );
 * }
 * ```
 */
export function usePiAgent(): UseClientPiAgentState {
	// 内部状态
	const [isInitialized, setIsInitialized] = useState(false);
	const [isRunning, setIsRunning] = useState(false);
	const [isThinking, setIsThinking] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [artifactVersion, setArtifactVersion] = useState(0);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
	const [restoredSession, setRestoredSession] = useState<RestoreAgentSessionResult | null>(null);
	const [activeTools, setActiveTools] = useState<Array<{ toolName: string; startTime: number }>>([]);
	const [progressMessage, setProgressMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [messages, setMessages] = useState<ClientHookMessage[]>([]);

	// 事件监听器
	const eventListenersRef = useRef<Set<(event: ClientAgentEvent) => void>>(new Set());

	// Session ID ref for access in sendMessage (避免闭包问题)
	const sessionIdRef = useRef<string | null>(null);
	const projectContextRef = useRef<ProjectContext | null>(null);
	const isInitializedRef = useRef(false);
	const abortControllerRef = useRef<AbortController | null>(null);
	const activeStreamIdRef = useRef<string | null>(null);
	const streamSequenceRef = useRef(0);
	const streamUnsubscribeRef = useRef<(() => void) | null>(null);
	const sessionOperationEpochRef = useRef(0);
	const restoreAbortControllerRef = useRef<AbortController | null>(null);
	const restoreTargetRef = useRef<string | null>(null);
	const destroyedRef = useRef(false);

	useEffect(() => {
		return () => {
			destroyedRef.current = true;
			sessionOperationEpochRef.current += 1;
			restoreTargetRef.current = null;
			restoreAbortControllerRef.current?.abort();
			restoreAbortControllerRef.current = null;
			activeStreamIdRef.current = null;
			streamUnsubscribeRef.current?.();
			streamUnsubscribeRef.current = null;
			abortControllerRef.current?.abort();
			abortControllerRef.current = null;
		};
	}, []);

	// Task Runtime may finish after the original message stream has ended. Keep
	// a session-scoped IPC listener so its final assistant summary still enters
	// the conversation instead of being dropped with the short-lived stream.
	useEffect(() => {
		if (!isElectron() || !sessionId) return undefined;
		return subscribeAgentEvents((event) => {
			if (event.type !== 'assistant_message') return;
			const data = event.data as { content?: unknown; taskRuntimeCompletion?: unknown } | undefined;
			const content = typeof data?.content === 'string' ? data.content.trim() : '';
			if (data?.taskRuntimeCompletion !== true || !content) return;
			setMessages((previous) => [
				...previous.filter((message) => !(message.role === 'assistant' && message.content.trim() === content)),
				{
					id: `task-completion-${Date.now()}`,
					role: 'assistant' as const,
					content,
					timestamp: Date.now(),
				},
			]);
		}, sessionId);
	}, [sessionId]);

	// 触发事件
	const emitEvent = useCallback((event: ClientAgentEvent) => {
		eventListenersRef.current.forEach(listener => {
			try {
				listener(event);
			} catch (err) {
				console.error("Event listener error:", err);
			}
		});
	}, []);

	const invalidatePendingRestore = useCallback(() => {
		restoreTargetRef.current = null;
		restoreAbortControllerRef.current?.abort();
		restoreAbortControllerRef.current = null;
		setIsRestoring(false);
	}, []);

	const detachActiveStream = useCallback((notifyServer: boolean) => {
		const previousSessionId = sessionIdRef.current;
		activeStreamIdRef.current = null;
		streamUnsubscribeRef.current?.();
		streamUnsubscribeRef.current = null;
		abortControllerRef.current?.abort();
		abortControllerRef.current = null;
		setIsThinking(false);
		setIsRunning(false);
		setActiveTools([]);
		if (notifyServer && previousSessionId) {
			void abortAgentSession(previousSessionId).catch(() => {});
		}
	}, []);

	// 初始化
	const initialize = useCallback(
		async (newSessionId: string, newProjectContext: ProjectContext, variables?: Record<string, string>, llmConfig?: { provider?: string; baseUrl?: string; apiKey?: string; model?: string; maxTokens?: number }) => {
			destroyedRef.current = false;
			const operationEpoch = sessionOperationEpochRef.current + 1;
			sessionOperationEpochRef.current = operationEpoch;
			invalidatePendingRestore();
			detachActiveStream(true);
			setErrorMessage(null);
			setProgressMessage("初始化中...");
			const isCurrentOperation = () =>
				!destroyedRef.current
					&& sessionOperationEpochRef.current === operationEpoch;

			try {
				// 获取服务器返回的真实 sessionId
				const initializedSession = await initializeSession(
					newSessionId,
					newProjectContext,
					variables,
					llmConfig,
				);
				if (!isCurrentOperation()) return;
				setSessionId(initializedSession.sessionId);
				sessionIdRef.current = initializedSession.sessionId;
				setProjectContext(initializedSession.projectContext);
				projectContextRef.current = initializedSession.projectContext;
				setRestoredSession(null);
				setIsInitialized(true);
				isInitializedRef.current = true;
				setMessages([]);  // 清空消息
				setProgressMessage(null);
			} catch (err) {
				if (!isCurrentOperation()) return;
				const msg = err instanceof Error ? err.message : "初始化失败";
				setErrorMessage(msg);
				setProgressMessage(null);
				throw err;
			}
		},
		[detachActiveStream, invalidatePendingRestore]
	);

	const restoreSession = useCallback(
		async (
			request: RestoreAgentSessionRequest,
		): Promise<RestoreAgentSessionResult | null> => {
			if (
				isInitializedRef.current
				&& sessionIdRef.current === request.sessionId
			) {
				return null;
			}

			destroyedRef.current = false;
			const operationEpoch = sessionOperationEpochRef.current + 1;
			sessionOperationEpochRef.current = operationEpoch;
			restoreTargetRef.current = request.sessionId;
			restoreAbortControllerRef.current?.abort();
			const restoreController = new AbortController();
			restoreAbortControllerRef.current = restoreController;

			detachActiveStream(true);
			setIsRestoring(true);
			setErrorMessage(null);
			setProgressMessage("正在恢复会话...");

			const isLatestRestore = () =>
				!destroyedRef.current
				&& !restoreController.signal.aborted
				&& sessionOperationEpochRef.current === operationEpoch
				&& restoreTargetRef.current === request.sessionId;

			try {
				const response = await getAgentSession(request);
				if (!isLatestRestore()) {
					return null;
				}
				if (!response.success || !response.data) {
					throw toRestoreAgentSessionError(
						response.error ?? { code: 'RESTORE_FAILED' },
					);
				}

				const snapshot = createRestoreAgentSessionResult(response.data, request);
				if (!isLatestRestore()) {
					return null;
				}

				sessionIdRef.current = snapshot.sessionId;
				projectContextRef.current = snapshot.projectContext;
				isInitializedRef.current = true;
				setSessionId(snapshot.sessionId);
				setProjectContext(snapshot.projectContext);
				setMessages(snapshot.messages);
				setRestoredSession(snapshot);
				setIsInitialized(true);
				setIsThinking(false);
				setIsRunning(false);
				setActiveTools([]);
				setProgressMessage(null);
				setErrorMessage(null);
				return snapshot;
			} catch (error) {
				if (!isLatestRestore()) {
					return null;
				}
				const restoreError = toRestoreAgentSessionError(error);
				setErrorMessage(`${restoreError.code}: ${restoreError.message}`);
				setProgressMessage(null);
				throw restoreError;
			} finally {
				if (isLatestRestore()) {
					restoreTargetRef.current = null;
					restoreAbortControllerRef.current = null;
					setIsRestoring(false);
				}
			}
		},
		[detachActiveStream],
	);

	// 发送消息
	const sendMessage = useCallback(
		(message: string) => {
			return runSendMessage({
				sessionIdRef,
				projectContextRef,
				isInitializedRef,
				restoreTargetRef,
				setMessages,
				setErrorMessage,
				setIsRunning,
				setIsThinking,
				emitEvent,
			}, message);
		},
		[emitEvent]
	);

	// 发送消息 (流式响应)
	const sendMessageStream = useCallback(
		(message: string) => {
			return runSendMessageStream({
				sessionIdRef,
				projectContextRef,
				isInitializedRef,
				restoreTargetRef,
				setMessages,
				setErrorMessage,
				setIsRunning,
				setIsThinking,
				emitEvent,
				activeStreamIdRef,
				streamSequenceRef,
				streamUnsubscribeRef,
				abortControllerRef,
				setProgressMessage,
				setActiveTools,
				setArtifactVersion,
			}, message);
		},
		[emitEvent]
	);

	// 中断
	const abort = useCallback(() => {
		activeStreamIdRef.current = null;
		streamUnsubscribeRef.current?.();
		streamUnsubscribeRef.current = null;
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		// Mark streaming messages as stopped
		setMessages(prev => prev.map(msg => {
			if (msg.role === 'assistant' && msg.isStreaming) {
				return { ...msg, isStreaming: false, content: msg.content || '已停止' };
			}
			return msg;
		}));
		setIsThinking(false);
		setIsRunning(false);
		setActiveTools([]);

		// 通知服务端中止
		if (sessionIdRef.current) {
			abortAgentSession(sessionIdRef.current).catch(() => {});
		}
	}, []);

	// 销毁
	const destroy = useCallback(() => {
		destroyedRef.current = true;
		sessionOperationEpochRef.current += 1;
		restoreTargetRef.current = null;
		restoreAbortControllerRef.current?.abort();
		restoreAbortControllerRef.current = null;
		setIsInitialized(false);
		isInitializedRef.current = false;
		setIsRestoring(false);
		setSessionId(null);
		sessionIdRef.current = null;
		setProjectContext(null);
		projectContextRef.current = null;
		setRestoredSession(null);
		setMessages([]);
		setActiveTools([]);
		setProgressMessage(null);
		setErrorMessage(null);
		setIsThinking(false);
		setIsRunning(false);
		activeStreamIdRef.current = null;
		streamUnsubscribeRef.current?.();
		streamUnsubscribeRef.current = null;
		abortControllerRef.current?.abort();
		abortControllerRef.current = null;
		eventListenersRef.current.clear();
	}, []);

	// 更新项目上下文
	const updateProjectContext = useCallback(
		(context: Partial<ProjectContext>) => {
			setProjectContext(prev => {
				const nextContext = prev ? { ...prev, ...context } : null;
				projectContextRef.current = nextContext;
				return nextContext;
			});
		},
		[]
	);

	// 设置系统提示词（需要服务端支持）
	const setSystemPrompt = useCallback(
		(prompt: string) => {
			if (!isInitialized) {
				console.warn("Agent 未初始化，无法设置系统提示词");
				return;
			}
			// TODO: 调用 API 更新系统提示词
			console.log("setSystemPrompt:", prompt);
		},
		[isInitialized]
	);

	// 设置思考级别（需要服务端支持）
	const setThinkingLevel = useCallback(
		(level: "off" | "minimal" | "low" | "medium" | "high") => {
			if (!isInitialized) {
				console.warn("Agent 未初始化，无法设置思考级别");
				return;
			}
			// TODO: 调用 API 更新思考级别
			console.log("setThinkingLevel:", level);
		},
		[isInitialized]
	);

	// 订阅事件
	const subscribe = useCallback(
		(listener: (event: ClientAgentEvent) => void): (() => void) => {
			eventListenersRef.current.add(listener);
			return () => {
				eventListenersRef.current.delete(listener);
			};
		},
		[]
	);

	// 重置
	const reset = useCallback(() => {
		destroy();
	}, [destroy]);

	// UI 状态
	const uiState = useMemo(
		() => ({
			isThinking,
			isRunning,
			isRestoring,
			activeTools,
			progressMessage,
			errorMessage,
		}),
		[isThinking, isRunning, isRestoring, activeTools, progressMessage, errorMessage]
	);

	return {
		// State
		isInitialized,
			isRunning,
			isThinking,
			isRestoring,
			sessionId,
			projectContext,
			restoredSession,
		uiState,
		messages,
		artifactVersion,

		// Actions
			initialize,
			restoreSession,
		destroy,
		sendMessage,
		sendMessageStream,
		abort,
		updateProjectContext,
		setSystemPrompt,
		setThinkingLevel,
		subscribe,
		reset,
	};
}

// ============================================================================
// Helper Hooks
// ============================================================================

/**
 * Hook to subscribe to agent events and handle them in a component
 */
export function usePiAgentEvent(
	handler: (event: ClientAgentEvent) => void,
	deps?: React.DependencyList
): void {
	const { subscribe, isInitialized } = usePiAgent();

	useEffect(() => {
		if (!isInitialized) {
			return;
		}

		const unsubscribe = subscribe(handler);
		return unsubscribe;
	}, [subscribe, isInitialized, ...(deps || [])]);
}

/**
 * Hook to get agent status for UI display
 */
export function usePiAgentStatus(): {
	status: "idle" | "thinking" | "running" | "error";
	message: string;
} {
	const { isThinking, isRunning, uiState } = usePiAgent();

	return useMemo(() => {
		if (uiState.errorMessage) {
			return { status: "error", message: uiState.errorMessage };
		}
		if (isThinking) {
			if (uiState.activeTools.length > 0) {
				const toolName = uiState.activeTools[0]?.toolName;
				return { status: "thinking", message: `正在执行工具: ${toolName}` };
			}
			return { status: "thinking", message: "正在思考..." };
		}
		if (isRunning) {
			return { status: "running", message: "处理中..." };
		}
		return { status: "idle", message: "就绪" };
	}, [isThinking, isRunning, uiState.errorMessage, uiState.activeTools]);
}
