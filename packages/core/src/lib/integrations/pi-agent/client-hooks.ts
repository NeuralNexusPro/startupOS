/**
 * Pi Agent 客户端 Hooks
 * 通过 API 路由与服务端 Agent 交互
 *
 * 这个模块不依赖任何 Node.js 特定包，可以在客户端安全使用
 */

import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import type { ProjectContext } from "./types";
import {
	createAgentSession,
	getAgentSession,
	sendAgentMessage,
	sendAgentMessageStream,
	subscribeAgentEvents,
	abortAgentSession,
} from "../electron/services/agent-session";
import { isElectron } from "../electron/env";
import { appendStreamDelta, reconcileFinalStreamContent } from "./stream-dedupe";
import { StreamRenderScheduler } from "./stream-render-scheduler";
import type { RuntimeLLMConfig } from "./llm-config";
import {
	createRestoreAgentSessionResult,
	toRestoreAgentSessionError,
	type RestoreAgentSessionRequest,
	type RestoreAgentSessionResult,
} from "./session-restore";

// ============================================================================
// 全局状态存储（解决 hook 重新实例化问题）
// ============================================================================

/**
 * 全局会话状态存储
 * 使用 sessionId 作为键，存储每个会话的状态
 */
interface SessionState {
	isInitialized: boolean;
	isRunning: boolean;
	isThinking: boolean;
	sessionId: string | null;
	projectContext: ProjectContext | null;
	messages: Array<{
		id?: string;
		role: "user" | "assistant" | "system" | "tool" | "toolResult";
		content: string;
		timestamp?: number;
	}>;
	activeTools: Array<{ toolName: string; startTime: number }>;
	progressMessage: string | null;
	errorMessage: string | null;
}

const globalSessionStore = new Map<string, SessionState>();
const sessionListeners = new Map<string, Set<() => void>>();

function getSessionState(sessionId: string): SessionState {
	if (!globalSessionStore.has(sessionId)) {
		globalSessionStore.set(sessionId, {
			isInitialized: false,
			isRunning: false,
			isThinking: false,
			sessionId: null,
			projectContext: null,
			messages: [],
			activeTools: [],
			progressMessage: null,
			errorMessage: null,
		});
	}
	return globalSessionStore.get(sessionId)!;
}

export function _updateSessionState(sessionId: string, updates: Partial<SessionState>): void {
	const state = getSessionState(sessionId);
	Object.assign(state, updates);
	// 通知所有监听器
	const listeners = sessionListeners.get(sessionId);
	if (listeners) {
		listeners.forEach(listener => listener());
	}
}

export function _subscribeToSession(sessionId: string, listener: () => void): () => void {
	if (!sessionListeners.has(sessionId)) {
		sessionListeners.set(sessionId, new Set());
	}
	sessionListeners.get(sessionId)!.add(listener);
	return () => {
		sessionListeners.get(sessionId)?.delete(listener);
	};
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Agent 事件类型（客户端版本）
 */
export type ClientAgentEvent =
	| { type: "agent_start" }
	| { type: "agent_end" }
	| { type: "turn_start" }
	| { type: "turn_end" }
	| { type: "message_start"; message?: { role: string; content?: string } }
	| { type: "message_delta"; delta?: { text?: string } }
	| { type: "message_end"; message?: { role: string; content?: string } }
	| { type: "tool_execution_start"; toolName: string; toolCallId?: string; args?: unknown }
	| { type: "tool_execution_end"; toolName: string; toolCallId?: string; result?: unknown; isError?: boolean }
	| { type: "agent_error"; error?: { message: string } };

/**
 * Hook 返回值类型
 */
export interface UseClientPiAgentState {
	// === State ===
	isInitialized: boolean;
	isRunning: boolean;
	isThinking: boolean;
	isRestoring: boolean;
	sessionId: string | null;
	projectContext: ProjectContext | null;
	restoredSession: RestoreAgentSessionResult | null;
	uiState: {
		isThinking: boolean;
		isRunning: boolean;
		isRestoring: boolean;
		activeTools: Array<{
			toolName: string;
			startTime: number;
		}>;
		progressMessage: string | null;
		errorMessage: string | null;
	};
	messages?: Array<{
		id?: string;
		role: "user" | "assistant" | "system" | "tool" | "toolResult";
		content: string;
		timestamp?: number;
		isStreaming?: boolean;
	}>;
	artifactVersion: number;

	// === Actions ===
	initialize: (
		sessionId: string,
		projectContext: ProjectContext,
		variables?: Record<string, string>,
		llmConfig?: RuntimeLLMConfig
	) => Promise<void>;
	restoreSession: (
		request: RestoreAgentSessionRequest
	) => Promise<RestoreAgentSessionResult | null>;
	destroy: () => void;
	sendMessage: (message: string) => Promise<void>;
	sendMessageStream: (message: string) => Promise<void>;
	abort: () => void;
	updateProjectContext: (context: Partial<ProjectContext>) => void;
	setSystemPrompt: (prompt: string) => void;
	setThinkingLevel: (level: "off" | "minimal" | "low" | "medium" | "high") => void;
	subscribe: (listener: (event: ClientAgentEvent) => void) => (() => void) | void;
	reset: () => void;
}

// ============================================================================
// API 客户端
// ============================================================================

const API_BASE = "/api/agent/sessions";

// ============================================================================
// SSE 解析器
// ============================================================================

function parseSSE(text: string): Array<{ type: string; data: unknown }> {
	const lines = text.split('\n');
	const events: Array<{ type: string; data: unknown }> = [];
	let currentData = '';

	for (const line of lines) {
		if (line.startsWith('data: ')) {
			if (currentData) {
				currentData += '\n';
			}
			currentData += line.slice(6);
		} else if (line === '') {
			if (currentData.trim()) {
				try {
					const parsed = JSON.parse(currentData);
					events.push(parsed);
				} catch (e) {
					console.error('[SSE] Failed to parse:', currentData, e);
				}
				currentData = '';
			}
		}
	}

	return events;
}

/**
 * 初始化 Agent 会话
 * @returns 服务器生成的 sessionId
 */
async function initializeSession(
	sessionId: string,
	projectContext: ProjectContext,
	variables?: Record<string, string>,
	llmConfig?: RuntimeLLMConfig
): Promise<{ sessionId: string; projectContext: ProjectContext }> {
	const agentType = variables?.['agentType'];
	const entryType = projectContext.entryType
		?? (agentType === 'skill'
			? 'skill'
			: agentType === 'role-agent'
				? 'role-agent'
				: 'agent');
	const entryId = projectContext.entryId
		?? (entryType === 'skill' && projectContext.projectId.startsWith('skill-')
			? projectContext.projectId.slice('skill-'.length)
			: projectContext.projectId);
	const scopedProjectContext: ProjectContext = {
		...projectContext,
		entryType,
		entryId,
	};
	const response = await createAgentSession({
		sessionId,
		projectId: scopedProjectContext.projectId,
		projectName: scopedProjectContext.projectName || "Agent Session",
		agentType,
		systemPrompt: variables?.['systemPrompt'],
		projectContext: scopedProjectContext as unknown as Record<string, unknown>,
		llmConfig,
		agentBaseDir: variables?.['agentBaseDir'],
		outputDir: variables?.['outputDir'],
	});

	if (!response.success) {
		throw new Error(response.error?.message || 'Failed to initialize session');
	}

	return {
		sessionId: (response.data as { sessionId: string }).sessionId,
		projectContext: scopedProjectContext,
	};
}

/**
 * 发送消息到 Agent (非流式)
 * 返回包含用户消息和助手消息的响应
 */
async function sendMessageToAgent(
	sessionId: string,
	message: string,
	projectContext?: ProjectContext,
): Promise<{ userMessage: { id: string; role: string; content: string; timestamp?: number }; assistantMessage?: { id: string; role: string; content: string; timestamp?: number } }> {
	const response = await sendAgentMessage({
		sessionId,
		content: message,
		role: "user",
		projectId: projectContext?.projectId,
		entryType: projectContext?.entryType,
		entryId: projectContext?.entryId,
	});

	if (!response.success) {
		throw new Error(response.error?.message || 'Failed to send message');
	}

	return response.data as { userMessage: { id: string; role: string; content: string; timestamp?: number }; assistantMessage?: { id: string; role: string; content: string; timestamp?: number } };
}

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
	const [messages, setMessages] = useState<Array<{
		id?: string;
		role: "user" | "assistant" | "system" | "tool" | "toolResult";
		content: string;
		timestamp?: number;
		isStreaming?: boolean;
	}>>([]);

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
		async (message: string) => {
			if (!isInitializedRef.current || !sessionIdRef.current) {
				throw new Error("Agent 未初始化。请先调用 initialize()。");
			}
			if (restoreTargetRef.current) {
				throw new Error("会话正在恢复，请稍后再发送消息。");
			}

			const operationSessionId = sessionIdRef.current;
			const operationProjectContext = projectContextRef.current ?? undefined;
			const isCurrentOperation = () => sessionIdRef.current === operationSessionId;
			console.log('[usePiAgent] sendMessage called with:', message?.slice(0, 50));
			setErrorMessage(null);
			setIsRunning(true);
			setIsThinking(true);

			// 添加用户消息
			const userMessageId = `msg-user-${Date.now()}`;
			setMessages(prev => {
				const newMessages = [...prev, {
					id: userMessageId,
					role: "user" as const,
					content: message,
					timestamp: Date.now(),
				}];
				console.log('[usePiAgent] Added user message, total:', newMessages.length);
				return newMessages;
			});

			emitEvent({ type: "agent_start" });

			try {
				// 发送消息到 API 并获取响应
				console.log('[usePiAgent] Calling API...');
				const result = await sendMessageToAgent(
					operationSessionId,
					message,
					operationProjectContext,
				);
				if (!isCurrentOperation()) return;
				console.log('[usePiAgent] API result:', result);

				// 添加助手消息（如果有）
				if (result.assistantMessage) {
					const assistantMessage = result.assistantMessage;
					console.log('[usePiAgent] Adding assistant message:', assistantMessage.content?.slice(0, 50));
					setMessages(prev => {
						const newMessages = [...prev, {
							id: assistantMessage.id || `msg-assistant-${Date.now()}`,
							role: "assistant" as const,
							content: assistantMessage.content,
							timestamp: assistantMessage.timestamp || Date.now(),
						}];
						console.log('[usePiAgent] Added assistant message, total:', newMessages.length);
						return newMessages;
					});

					// 发送 message_end 事件
					emitEvent({
						type: "message_end",
						message: {
							role: "assistant",
							content: assistantMessage.content,
						},
					});
				} else {
					console.log('[usePiAgent] No assistant message in result');
				}

				emitEvent({ type: "agent_end" });
			} catch (err) {
				if (!isCurrentOperation()) return;
				const msg = err instanceof Error ? err.message : "发送消息失败";
				console.error('[usePiAgent] Error:', msg);
				setErrorMessage(msg);
				emitEvent({ type: "agent_error", error: { message: msg } });
			} finally {
				if (isCurrentOperation()) {
					setIsThinking(false);
					setIsRunning(false);
				}
			}
		},
		[emitEvent]
	);

	// 发送消息 (流式响应)
	const sendMessageStream = useCallback(
		async (message: string) => {
			if (!isInitializedRef.current || !sessionIdRef.current) {
				throw new Error("Agent 未初始化。请先调用 initialize()。");
			}
			if (restoreTargetRef.current) {
				throw new Error("会话正在恢复，请稍后再发送消息。");
			}

			const streamSessionId = sessionIdRef.current;
			const streamProjectContext = projectContextRef.current;
			console.log('[usePiAgent] sendMessageStream called, sessionId:', streamSessionId, message?.slice(0, 50));
			setErrorMessage(null);
			setIsRunning(true);
			setIsThinking(true);

			// Invalidate and detach any previous stream before starting a new one.
			// Late IPC/SSE events from an aborted turn must never mutate old messages.
			streamUnsubscribeRef.current?.();
			streamUnsubscribeRef.current = null;
			abortControllerRef.current?.abort();

			// 创建 AbortController
			const abortController = new AbortController();
			abortControllerRef.current = abortController;
			const streamId = `stream-${Date.now()}-${streamSequenceRef.current++}`;
			activeStreamIdRef.current = streamId;
			const isActiveStream = () =>
				activeStreamIdRef.current === streamId
					&& sessionIdRef.current === streamSessionId
					&& !abortController.signal.aborted;

			// 添加用户消息
			const userMessageId = `msg-user-${Date.now()}`;
			setMessages(prev => [...prev, {
				id: userMessageId,
				role: "user" as const,
				content: message,
				timestamp: Date.now(),
			}]);

			// 添加占位助手消息（流式更新）
			let assistantMessageSequence = 0;
			const nextAssistantMessageId = () =>
				`msg-assistant-${Date.now()}-${assistantMessageSequence++}`;
			let currentAssistantMessageId = nextAssistantMessageId();
			setMessages(prev => [...prev, {
				id: currentAssistantMessageId,
				role: "assistant" as const,
				content: "",
				timestamp: Date.now(),
				isStreaming: true,
			}]);

			emitEvent({ type: "agent_start" });

			let receivedAssistantContent = "";
			let assistantTurnFinalized = false;
			let rendererDeltaEvents = 0;
			let rendererDeltaChars = 0;

			const renderSchedulers = new Set<StreamRenderScheduler>();
			const createRenderScheduler = (assistantMessageId: string) => {
				const scheduler = new StreamRenderScheduler({
					onCommit: (content, isStreaming) => {
						if (isStreaming && !isActiveStream()) return;
						setMessages(prev => prev.map(msg =>
							msg.id === assistantMessageId
								? { ...msg, content, isStreaming }
								: msg
						));
					},
					onDebug: (debugEvent) => {
							console.info("[StreamRender] scheduler", {
								streamId,
								sessionId: streamSessionId,
							assistantMessageId,
							...debugEvent,
						});
					},
				});
				renderSchedulers.add(scheduler);
				return scheduler;
			};
			let renderScheduler = createRenderScheduler(currentAssistantMessageId);

			const cancelRenderSchedulers = () => {
				for (const scheduler of renderSchedulers) {
					scheduler.cancel();
				}
				renderSchedulers.clear();
			};

			const beginAssistantTurn = () => {
				assistantTurnFinalized = false;
				receivedAssistantContent = "";
				currentAssistantMessageId = nextAssistantMessageId();
				renderScheduler = createRenderScheduler(currentAssistantMessageId);
				setMessages(prev => [...prev, {
					id: currentAssistantMessageId,
					role: "assistant" as const,
					content: "",
					timestamp: Date.now(),
					isStreaming: true,
				}]);
			};

			const flushUpdate = (isStreaming: boolean) => {
				renderScheduler.flush(receivedAssistantContent, isStreaming);
			};

			const finishUpdate = () => {
				const scheduler = renderScheduler;
				return scheduler.finish(receivedAssistantContent);
			};

			// Cap React commits independently from IPC frequency. Long messages otherwise
			// re-render and re-parse the accumulated content every animation frame.
			const scheduleUpdate = () => {
				if (isActiveStream()) {
					renderScheduler.schedule(receivedAssistantContent);
				}
			};


			// Electron 模式：通过 IPC 事件流
			if (isElectron()) {
				try {
					// 先订阅事件，再发送请求，避免竞态丢失 text_delta
					const unsubscribeEvents = subscribeAgentEvents((event) => {
						if (event.streamId !== streamId) return;
						if (!isActiveStream()) return;
						if (event.type === "text_delta") {
							const delta = (event.data as { delta?: string })?.delta;
							if (delta) {
								rendererDeltaEvents += 1;
								rendererDeltaChars += delta.length;
								if (rendererDeltaEvents === 1 || rendererDeltaEvents % 25 === 0) {
									console.info("[StreamRender] renderer-delta", {
										streamId,
										sessionId: streamSessionId,
										eventCount: rendererDeltaEvents,
										deltaChars: rendererDeltaChars,
										incomingLength: delta.length,
										accumulatedLength: receivedAssistantContent.length,
									});
								}
								if (assistantTurnFinalized) {
									beginAssistantTurn();
								}
								receivedAssistantContent = appendStreamDelta(receivedAssistantContent, delta);
								scheduleUpdate();
							}
						} else if (event.type === "assistant_message") {
							const content = (event.data as { content?: string })?.content;
							console.info("[StreamRender] renderer-assistant-message", {
								streamId,
								sessionId: streamSessionId,
								incomingLength: content?.length ?? 0,
								accumulatedLength: receivedAssistantContent.length,
								deltaEvents: rendererDeltaEvents,
								deltaChars: rendererDeltaChars,
							});
							if (content) {
								receivedAssistantContent = reconcileFinalStreamContent(receivedAssistantContent, content);
							}
							assistantTurnFinalized = true;
							void finishUpdate();
						} else if (event.type === "tool_start") {
							const toolName = (event.data as { toolName?: string })?.toolName;
							if (toolName) setProgressMessage(`正在执行: ${toolName}`);
						} else if (event.type === "tool_end") {
							setProgressMessage(null);
						} else if (event.type === "artifact_changed") {
							setArtifactVersion(v => v + 1);
						} else if (event.type === "error") {
							if (!isActiveStream()) return;
							const errMsg = (event.data as { message?: string })?.message || "Unknown error";
							setErrorMessage(errMsg);
							cancelRenderSchedulers();
							setMessages(prev => prev.map(m =>
								m.id === currentAssistantMessageId ? { ...m, content: `错误: ${errMsg}`, isStreaming: false } : m
							));
							emitEvent({ type: "agent_error", error: { message: errMsg } });
							setIsThinking(false);
							setIsRunning(false);
							setActiveTools([]);
							emitEvent({ type: "agent_end" });
							unsubscribeEvents();
							if (streamUnsubscribeRef.current === unsubscribeEvents) {
								streamUnsubscribeRef.current = null;
							}
							if (activeStreamIdRef.current === streamId) {
								activeStreamIdRef.current = null;
							}
						} else if (event.type === "done") {
							if (!isActiveStream()) return;
							const content = (event.data as { content?: string })?.content;
							console.info("[StreamRender] renderer-done", {
								streamId,
								sessionId: streamSessionId,
								incomingLength: content?.length ?? 0,
								accumulatedLength: receivedAssistantContent.length,
								deltaEvents: rendererDeltaEvents,
								deltaChars: rendererDeltaChars,
							});
							if (content) {
								receivedAssistantContent = reconcileFinalStreamContent(
									receivedAssistantContent,
									content
								);
							}
							void finishUpdate().then(() => {
								if (!isActiveStream()) return;
								cancelRenderSchedulers();
								setProgressMessage(null);
								setIsThinking(false);
								setIsRunning(false);
								setActiveTools([]);
								emitEvent({ type: "agent_end" });
								unsubscribeEvents();
								if (streamUnsubscribeRef.current === unsubscribeEvents) {
									streamUnsubscribeRef.current = null;
								}
								if (activeStreamIdRef.current === streamId) {
									activeStreamIdRef.current = null;
								}
							});
						}
						}, streamSessionId);
					streamUnsubscribeRef.current = unsubscribeEvents;

					// 发送请求（主进程立即返回 started:true，后台异步推事件）
					const response = await sendAgentMessageStream({
						sessionId: streamSessionId,
						content: message,
						role: "user",
						projectId: streamProjectContext?.projectId,
						entryType: streamProjectContext?.entryType,
						entryId: streamProjectContext?.entryId,
						streamId,
					});

					if (!response.success) {
						unsubscribeEvents();
						if (streamUnsubscribeRef.current === unsubscribeEvents) {
							streamUnsubscribeRef.current = null;
						}
						throw new Error(response.error?.message || 'Failed to start stream');
					}
				} catch (err) {
					if (!isActiveStream()) return;
					cancelRenderSchedulers();
					const msg = err instanceof Error ? err.message : "发送消息失败";
					setErrorMessage(msg);
					setMessages(prev => prev.map(m =>
						m.id === currentAssistantMessageId ? { ...m, content: `错误: ${msg}`, isStreaming: false } : m
					));
					setIsThinking(false);
					setIsRunning(false);
					setActiveTools([]);
					emitEvent({ type: "agent_end" });
					if (activeStreamIdRef.current === streamId) {
						activeStreamIdRef.current = null;
					}
				}
				return;
			}

			// Web 模式：通过 HTTP SSE
			// 复用上面已声明的 stream 生命周期变量。
			try {
				const response = await fetch(`${API_BASE}/${streamSessionId}/messages`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "text/event-stream",
					},
					body: JSON.stringify({
						role: "user",
						content: message,
						projectId: streamProjectContext?.projectId,
						entryType: streamProjectContext?.entryType,
						entryId: streamProjectContext?.entryId,
					}),
					signal: abortController.signal,
				});

				if (!response.ok) {
					const payload = await response.json().catch(() => null) as {
						error?: { code?: string; message?: string };
					} | null;
					const code = payload?.error?.code;
					const detail = payload?.error?.message;
					throw new Error(
						[code, detail].filter(Boolean).join(": ")
							|| `Failed to send message: ${response.statusText}`,
					);
				}

				const contentType = response.headers.get("content-type") || "";
				if (!contentType.includes("text/event-stream")) {
					// 非流式响应
					const data = await response.json();
					if (data.data?.assistantMessage) {
						receivedAssistantContent = data.data.assistantMessage.content;
						flushUpdate(false);
					}
					return;
				}

				// 处理 SSE 流
				const reader = response.body?.getReader();
				if (!reader) {
					throw new Error("No response body");
				}

				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (!isActiveStream()) break;
					if (done) break;

					buffer += decoder.decode(value, { stream: true });

					const lastCompleteEventEnd = buffer.lastIndexOf("\n\n");
					if (lastCompleteEventEnd !== -1) {
						const completedPart = buffer.slice(0, lastCompleteEventEnd + 2);
						const events = parseSSE(completedPart);

						for (const event of events) {
							if (!isActiveStream()) break;
							if (event.type === "text_delta" || event.type === "message_delta") {
								const nestedData = event.data as { delta?: string };
								if (nestedData.delta) {
									// 新 LLM 轮次开始：创建新的助手消息占位符
									if (assistantTurnFinalized) {
										beginAssistantTurn();
									}
									receivedAssistantContent = appendStreamDelta(receivedAssistantContent, nestedData.delta);
									scheduleUpdate();
								}
							} else if (event.type === "assistant_message") {
								const nestedData = (event.data as any) as {
									content?: string | any[];
									isStreaming?: boolean;
								};
								let content = '';
								if (typeof nestedData.content === 'string') {
									content = nestedData.content;
								} else if (Array.isArray(nestedData.content)) {
									const textBlock = nestedData.content.find(
										(c: any) => c && c.type === 'text' && typeof c.text === 'string'
									);
									if (textBlock?.text) content = textBlock.text;
								}
								if (content) {
									receivedAssistantContent = reconcileFinalStreamContent(receivedAssistantContent, content);
									void finishUpdate();
								}
								// 标记本轮 LLM 输出已完成
								assistantTurnFinalized = true;
							} else if (event.type === "tool_start") {
								const data = event.data as { toolCallId?: string; toolName?: string; args?: unknown };
								if (data.toolName) {
									setProgressMessage(`正在执行: ${data.toolName}`);
								}
							} else if (event.type === "tool_end") {
								setProgressMessage(null);
							} else if (event.type === "artifact_changed") {
								setArtifactVersion(v => v + 1);
							} else if (event.type === "status") {
								const data = event.data as { toolName?: string };
								if (data.toolName) {
									setProgressMessage(`正在执行: ${data.toolName}`);
								}
							} else if (event.type === "error") {
								const data = event.data as { message?: string };
								throw new Error(data.message || "Unknown error");
							} else if (event.type === "done") {
								const data = event.data as { content?: string };
								if (data.content) {
									receivedAssistantContent = reconcileFinalStreamContent(
										receivedAssistantContent,
										data.content
									);
								}
								await finishUpdate();
								setProgressMessage(null);
							}
						}

						buffer = buffer.slice(lastCompleteEventEnd + 2);
					}
				}

				// 处理剩余缓冲区
				if (buffer.trim()) {
					const events = parseSSE(buffer);
					for (const event of events) {
						if (!isActiveStream()) break;
						if (event.type === "text_delta" || event.type === "message_delta") {
							const nestedData = event.data as { delta?: string };
							if (nestedData.delta) {
								receivedAssistantContent = appendStreamDelta(receivedAssistantContent, nestedData.delta);
							}
						} else if (event.type === "assistant_message") {
							const nestedData = (event.data as any) as { content?: string | any[] };
							if (typeof nestedData.content === 'string') {
								receivedAssistantContent = reconcileFinalStreamContent(
									receivedAssistantContent,
									nestedData.content
								);
							}
						}
					}
					if (receivedAssistantContent) {
						await finishUpdate();
					}
				}

				await finishUpdate();

				if (isActiveStream()) {
					emitEvent({
						type: "message_end",
						message: { role: "assistant", content: receivedAssistantContent },
					});
					console.log(
						"[usePiAgent] Stream completed, content length:",
						receivedAssistantContent.length
					);
				}
			} catch (err) {
				cancelRenderSchedulers();
				if (err instanceof Error && err.name === "AbortError") {
					console.log("[usePiAgent] Request aborted");
				} else if (isActiveStream()) {
					const msg = err instanceof Error ? err.message : "发送消息失败";
					console.error('[usePiAgent] Error:', msg);
					setErrorMessage(msg);
					setMessages(prev => prev.map(m =>
						m.id === currentAssistantMessageId ? { ...m, content: `错误: ${msg}`, isStreaming: false } : m
					));
					emitEvent({ type: "agent_error", error: { message: msg } });
				}
			} finally {
				cancelRenderSchedulers();
				if (activeStreamIdRef.current === streamId) {
					setIsThinking(false);
					setIsRunning(false);
					abortControllerRef.current = null;
					activeStreamIdRef.current = null;
					emitEvent({ type: "agent_end" });
				}
			}
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
