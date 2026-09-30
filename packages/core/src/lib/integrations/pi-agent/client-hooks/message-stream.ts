/**
 * 流式消息发送流程（Electron IPC 与 Web SSE 双分支，纯函数，接收 hook deps）。
 *
 * 这个模块不依赖任何 Node.js 特定包，可以在客户端安全使用
 */

import type { Dispatch, SetStateAction } from "react";
import {
	getAgentSession,
	sendAgentMessageStream,
	subscribeAgentEvents,
	abortAgentSession,
} from "../../electron/services/agent-session";
import { isElectron } from "../../electron/env";
import { appendStreamDelta, reconcileFinalStreamContent } from "../stream-dedupe";
import { StreamRenderScheduler } from "../stream-render-scheduler";
import type { AgentContextTokenEstimate, AgentTokenUsage } from "../../../types/agent";
import { normalizeAgentTokenUsage } from "../token-usage";
import type { ClientAgentEvent, ClientHookMessage } from "./types";
import { API_BASE, parseSSE } from "./api";
import type { SendMessageDeps } from "./message-send";

/**
 * runSendMessageStream 的依赖集合（SendMessageDeps 全集 + 流式专属字段）
 */
export interface SendMessageStreamDeps extends SendMessageDeps {
	activeStreamIdRef: React.MutableRefObject<string | null>;
	streamSequenceRef: React.MutableRefObject<number>;
	streamUnsubscribeRef: React.MutableRefObject<(() => void) | null>;
	abortControllerRef: React.MutableRefObject<AbortController | null>;
	setProgressMessage: (v: string | null) => void;
	setActiveTools: (v: Array<{ toolName: string; startTime: number }>) => void;
	setArtifactVersion: Dispatch<SetStateAction<number>>;
}

/**
 * 流式发送流程主体（原 sendMessageStream useCallback 函数体外移）
 */
export async function runSendMessageStream(deps: SendMessageStreamDeps, message: string): Promise<void> {
		const {
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
		} = deps;
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
		let completedUsage: AgentTokenUsage | undefined;
		let completedContextTokenEstimate: AgentContextTokenEstimate | undefined;
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
						const data = event.data as { content?: string };
						const content = data.content;
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
						const data = event.data as { content?: string; usage?: unknown; contextTokenEstimate?: AgentContextTokenEstimate };
						completedUsage = normalizeAgentTokenUsage(data.usage);
						completedContextTokenEstimate = data.contextTokenEstimate;
						const content = data.content;
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
							setMessages(prev => prev.map(message =>
								message.id === currentAssistantMessageId
									? { ...message, usage: completedUsage, contextTokenEstimate: completedContextTokenEstimate }
									: message
							));
							emitEvent({ type: "message_end", message: { role: "assistant", content: receivedAssistantContent, usage: completedUsage, contextTokenEstimate: completedContextTokenEstimate } });
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
							const data = event.data as { content?: string; usage?: unknown; contextTokenEstimate?: AgentContextTokenEstimate };
							completedUsage = normalizeAgentTokenUsage(data.usage);
							completedContextTokenEstimate = data.contextTokenEstimate;
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
					} else if (event.type === "done") {
						const data = event.data as { content?: string; usage?: unknown; contextTokenEstimate?: AgentContextTokenEstimate };
						if (data.content) receivedAssistantContent = reconcileFinalStreamContent(receivedAssistantContent, data.content);
						completedUsage = normalizeAgentTokenUsage(data.usage);
						completedContextTokenEstimate = data.contextTokenEstimate;
					}
				}
				if (receivedAssistantContent) {
					await finishUpdate();
				}
			}

			await finishUpdate();
			setMessages(prev => prev.map(message =>
				message.id === currentAssistantMessageId
					? { ...message, usage: completedUsage, contextTokenEstimate: completedContextTokenEstimate }
					: message
			));

			if (isActiveStream()) {
				emitEvent({
					type: "message_end",
					message: { role: "assistant", content: receivedAssistantContent, usage: completedUsage, contextTokenEstimate: completedContextTokenEstimate },
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
}
