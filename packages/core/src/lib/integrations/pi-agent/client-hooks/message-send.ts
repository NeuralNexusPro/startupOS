/**
 * 非流式消息发送流程（纯函数，接收 hook deps）。
 *
 * 这个模块不依赖任何 Node.js 特定包，可以在客户端安全使用
 */

import type { Dispatch, SetStateAction } from "react";
import type { ProjectContext } from "../types";
import type { ClientAgentEvent, ClientHookMessage } from "./types";
import { sendMessageToAgent } from "./api";

/**
 * runSendMessage 的依赖集合（字段与 usePiAgent hook 内同名变量一一对应）
 */
export interface SendMessageDeps {
	sessionIdRef: React.MutableRefObject<string | null>;
	projectContextRef: React.MutableRefObject<ProjectContext | null>;
	isInitializedRef: React.MutableRefObject<boolean>;
	restoreTargetRef: React.MutableRefObject<string | null>;
	setMessages: Dispatch<SetStateAction<ClientHookMessage[]>>;
	setErrorMessage: (v: string | null) => void;
	setIsRunning: (v: boolean) => void;
	setIsThinking: (v: boolean) => void;
	emitEvent: (event: ClientAgentEvent) => void;
}

/**
 * 非流式发送流程主体（原 sendMessage useCallback 函数体外移）
 */
export async function runSendMessage(deps: SendMessageDeps, message: string): Promise<void> {
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
		} = deps;
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
						usage: assistantMessage.usage,
						contextTokenEstimate: assistantMessage.contextTokenEstimate,
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
						usage: assistantMessage.usage,
						contextTokenEstimate: assistantMessage.contextTokenEstimate,
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
}
