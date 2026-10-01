/**
 * OriginOSAgent 主类——状态字段、initialize、事件路由与执行编排，completion 逻辑薄委托至 agent-completion.ts。
 */

import type {
	AgentEvent,
	AgentMessage,
	AgentTool,
	StreamFn,
} from "@originos/pi-agent-adapter";
import { Agent } from "@originos/pi-agent-adapter";
import type { AssistantMessage, Message, Model } from "@originos/pi-agent-adapter/ai";
import * as piAi from "@originos/pi-agent-adapter/ai";
import type {
	OriginOSAgentConfig,
	OriginOSAgentState,
} from "../types";
import { AgentStatus } from "../../../../types/agent";
import type {
	ProjectContext,
} from "../system/config";
import type { HealthMonitor, AgentHealthStatus } from "../health";
import { createHealthMonitor } from "../health";
import { sanitizeBaseUrlForLogging } from "../server-config";
import { compressRecentTrace } from "../recent-trace-compression";
import { getLoopDetector, removeLoopDetector } from "../tools/loop-detector";
import { findSuitableShell } from "../tools/bash-tools";
import { createWorkingSummaryMessage } from "../runtime-working-summary";
import { getVisibleStreamDelta } from "../stream-dedupe";
import {
	appendRuntimeEnvironmentPrompt,
	getRuntimeEnvironment,
} from "../system/runtime-environment";
import { createAgentPromptBoundary, injectSessionContext } from "../prompt-boundary";
import type { ToolFailureSummary } from "./completion-guard";
import { getToolEventStatus } from "./tool-event-status";
import {
	mapPersistedMessagesForRuntime,
	toRestorableRuntimeModel,
	type PersistedRuntimeMessage,
} from "./runtime-history";
import {
	estimateAgentContextTokens,
	estimateTokens,
} from "../token-usage";
import type { AgentContextTokenEstimate } from "../../../../types/agent";
import {
	EventEmitter,
	getMessageText,
	getPromptText,
	hashText,
	logInfo,
	normalizeStreamProvider,
	previewText,
	previewToolResult,
	redactErrorForLogging,
} from "./agent-internals";
import {
	emitCompletionFailureReport as runEmitCompletionFailureReport,
	runJudgePendingCompletion,
	runWithCompletionGuard,
	runWithEmptyStopRecovery,
	type SyntheticSystemMessage,
	type SyntheticUserMessage,
} from "./agent-completion";
import type { AgentCompletionContext } from "./agent-completion";
import {
	createOriginOSAgent as createOriginOSAgentBase,
	type CreateOriginOSAgentParams,
	type SessionData,
} from "./agent-factory";

export type AgentCompletionPolicy = "chat_guard" | "task_runtime";

export interface AgentExecutionOptions {
	completionPolicy?: AgentCompletionPolicy;
	internalMessage?: boolean;
	internalMessageIndexes?: readonly number[];
}

// ============================================================================
// OriginOS Agent
// ============================================================================

/**
 * OriginOS Agent 类
 * 包装 pi-agent-core 的 Agent，添加 OriginOS 特定功能
 */
export class OriginOSAgent {
	private agent: Agent | null = null;
	private sessionId: string;
	private projectContext: ProjectContext;
	private eventEmitter = new EventEmitter<AgentEvent>();
	private isDestroyed = false;
	private healthMonitor: HealthMonitor;
	private config?: OriginOSAgentConfig;
	private loggedStreamContent = "";
	private assistantStreamContent = "";
	private assistantLoopGuardTriggered = false;
	private turnSequence = 0;
	private activeTurnSequence = 0;
	private assistantMessageSequence = 0;
	private activeAssistantMessageSequence = 0;
	private toolCallDeltaCount = 0;
	private toolCallDeltaChars = 0;
	private previousAssistantTextHash = "";
	private previousAssistantTurnSequence = 0;
	private previousTaskAssistantTextHash = "";
	private runtimeEnvironment = getRuntimeEnvironment({
		defaultShell: findSuitableShell() ?? undefined,
	});
	private pendingPromiseStop = false;
	private lastToolFailure: ToolFailureSummary | null = null;
	private successfulToolAfterFailure = false;
	private lastModelError: Error | null = null;
	private activeUserRequest = "";
	private completionToolTrace: string[] = [];
	private pendingCompletionCandidate: {
		message: object;
		text: string;
		stopReason?: string;
		toolCallCount: number;
		repeatedResponse: boolean;
	} | null = null;
	private deferredAgentEndEvent: AgentEvent | null = null;
	private hiddenMessages = new WeakSet<object>();
	private activeCompletionPolicy: AgentCompletionPolicy = "chat_guard";
	private sessionContext = "";
	private rawSessionContext = "";
	private turnContextProvider?: (query: string) => Promise<string>;
	private turnContextCache?: {
		message: AgentMessage;
		index: number;
		timestamp?: number;
		value: Promise<string>;
	};
	private contextTokenEstimate: AgentContextTokenEstimate = estimateAgentContextTokens({});

	private isEmptyStopRecoveryEnabled(): boolean {
		return this.config?.emptyStopRecoveryEnabled === true;
	}

	private isCompletionGuardEnabled(): boolean {
		return this.config?.completionGuardEnabled !== false;
	}

	/**
	 * Agent 状态
	 */
	public readonly state: OriginOSAgentState = {
		isInitialized: false,
		sessionId: "",
		uiState: {
			isThinking: false,
			activeTools: [],
		},
	};

	constructor(config: OriginOSAgentConfig, healthMonitor?: HealthMonitor) {
		this.config = config;
		this.sessionId = config.sessionId ?? "";
		this.projectContext = config.projectContext ?? { projectId: "" };
		this.state.sessionId = config.sessionId ?? "";
		this.state.projectContext = config.projectContext;
		this.healthMonitor = healthMonitor ?? createHealthMonitor();
		this.turnContextProvider = config.turnContextProvider;

		// 设置 Agent 引用到健康监控器
		this.healthMonitor.setAgent(this);

		// 自动初始化（保持向后兼容性）
		this.initialize(config);
	}

	/**
	 * 初始化 Agent
	 */
	private initialize(config?: OriginOSAgentConfig): void {
		if (this.isDestroyed) {
			throw new Error("Agent 已销毁，无法初始化");
		}

		if (config) {
			this.config = config;
		}

		if (!this.config) {
			throw new Error("Agent 未配置，无法初始化");
		}

		// 设置初始化状态到健康监控器
		this.healthMonitor.setStatus(AgentStatus.INITIALIZING);
		this.setSessionContext(this.config.sessionContext ?? "");

		// 转换自定义消息类型到 LLM 消息格式
		// 包含 token 预算管理：超出 contextWindow 时截断旧消息
		const convertToLlm = (messages: AgentMessage[]): Message[] => {
			// 过滤有效消息
			const validMessages = messages.filter((m) => {
				const role: string = m.role;
				return role === "user" || role === "assistant" || role === "toolResult";
			}) as Message[];

			// Token 预算管理
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const modelAny = this.config?.model as any;
			const contextWindow: number = modelAny?.contextWindow ?? 128000;
			const maxOutputTokens: number = modelAny?.maxTokens ?? 16384;
			const tokenBudget = contextWindow - maxOutputTokens - 4000; // 预留 system prompt + buffer

			// 单条消息最大 token 限制（防止一条超大消息撑爆上下文）
			const maxSingleMessageTokens = Math.floor(tokenBudget * 0.4); // 单条最多占 40% 预算

			// 截断单条超大消息
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const truncateMessage = (msg: any): any => {
				const tokens = estimateTokens(msg.content);
				if (tokens <= maxSingleMessageTokens) return msg;

				// 截断内容
				if (typeof msg.content === 'string') {
					const maxChars = maxSingleMessageTokens * 3;
					const truncated = msg.content.slice(0, maxChars) + '\n\n[内容已截断，超出 token 限制]';
					return { ...msg, content: truncated };
				}
				if (Array.isArray(msg.content)) {
					let charCount = 0;
					const maxChars = maxSingleMessageTokens * 3;
					const truncated: unknown[] = [];
					for (const c of msg.content) {
						if (c && typeof c === 'object' && 'text' in c) {
							const text = (c as { text: string }).text;
							if (charCount + text.length > maxChars) {
								truncated.push({ ...c, text: text.slice(0, maxChars - charCount) + '\n\n[内容已截断]' });
								break;
							}
							charCount += text.length;
						}
						truncated.push(c);
					}
					return { ...msg, content: truncated };
				}
				return msg;
			};

			const sessionMessage = validMessages[0]?.role === "user" &&
				getMessageText(validMessages[0]).startsWith('<originos_session_context readonly="true">')
				? validMessages.shift()
				: undefined;

			// 从后往前保留消息，直到超出预算；会话上下文始终保留。
			let totalTokens = sessionMessage ? estimateTokens(sessionMessage.content) : 0;
			const keptMessages: Message[] = [];
			for (let i = validMessages.length - 1; i >= 0; i--) {
				const rawMsg = validMessages[i];
				if (!rawMsg) continue;
				const msg = truncateMessage(rawMsg) as Message; // 截断单条超大消息
				const tokens = estimateTokens(msg.content);
				if (totalTokens + tokens > tokenBudget && keptMessages.length >= 2) {
					break; // 至少保留最近 2 条消息
				}
				keptMessages.unshift(msg);
				totalTokens += tokens;
			}

			// 日志记录 token 使用情况
			if (validMessages.length !== keptMessages.length) {
				logInfo(`[Agent] Context truncated: ${validMessages.length} → ${keptMessages.length} messages, ~${totalTokens}/${tokenBudget} tokens`);
			}

			return sessionMessage ? [truncateMessage(sessionMessage) as Message, ...keptMessages] : keptMessages;
		};

		const getRuntimeModel = (): Model<any> => {
			const currentModel = (this.agent?.state as { model?: Model<any> } | undefined)?.model;
			return currentModel ?? this.config?.model ?? ({} as Model<any>);
		};

		// 提取凭证：bearer 模式下 token 保留在 authToken，不能再注入 options.apiKey。
		const initialModel = getRuntimeModel() as any;
		const modelApiKey = initialModel?.apiKey;
		const modelAuthToken = initialModel?.authToken;
		const modelCredentialSource = initialModel?.credentialSource;
		const modelCredentialAuthMode = initialModel?.credentialAuthMode;
		const modelId = initialModel?.id;
		const modelApi = initialModel?.api;
		const modelBaseUrl = initialModel?.baseUrl;

		logInfo('[OriginOSAgent] Initializing agent with:', {
			modelId,
			modelApi,
			modelBaseUrl: sanitizeBaseUrlForLogging(modelBaseUrl),
			hasApiKey: !!modelApiKey,
			hasAuthToken: !!modelAuthToken,
			credentialSource: modelCredentialSource || 'env/default',
			credentialAuthMode: modelCredentialAuthMode || (modelApiKey?.includes?.('sk-ant-oat') ? 'oauth' : 'api-key'),
		});

		// 包装 streamFn，注入 toolChoice 确保工具调用被启用
		const streamFnWithToolChoice: StreamFn = (model, context, options) => {
			const opts = { ...(options || {}) } as Record<string, unknown>;
			(opts as Record<string, unknown>)['toolChoice'] = 'auto';
			const currentModel = (getRuntimeModel() as any) ?? model;
			const currentModelApiKey = currentModel?.apiKey;
			const currentModelAuthToken = currentModel?.authToken;
			const currentModelCredentialAuthMode = currentModel?.credentialAuthMode;
			const currentModelUsesBearerAuth = currentModelCredentialAuthMode === "bearer" || currentModelCredentialAuthMode === "oauth";
			let streamModel = {
				...model,
				...currentModel,
			};
			if (currentModelUsesBearerAuth && currentModelAuthToken) {
				opts['apiKey'] = currentModelAuthToken;
				// pi-ai 的 Anthropic provider 从 options.headers 读取自定义 header（不是 model.headers），
				// 所以 Bearer Authorization 必须放在 opts 中传递。
				opts['headers'] = {
					...((streamModel as any).headers ?? {}),
					authorization: `Bearer ${currentModelAuthToken}`,
				};
				streamModel = {
					...streamModel,
					// pi-ai's Anthropic provider falls back to configured api-key auth.
					// Its Copilot path is the available Bearer-auth transport. streamSimple
					// still resolves credentials from options.apiKey, so keep the token there.
					provider: 'github-copilot',
					apiKey: null,
					authToken: null,
				} as typeof model & { apiKey: null; authToken: null };
			} else if (currentModelApiKey && !opts['apiKey']) {
				opts['apiKey'] = currentModelApiKey;
			}
			const finalCredential = opts['apiKey'] || (streamModel as any)?.apiKey || (streamModel as any)?.authToken;
			logInfo(`[streamFn] credential check: hasOptsApiKey=${!!opts['apiKey']}, modelApiKey=${currentModelApiKey ? 'set' : 'null'}, model.authToken=${(streamModel as any)?.authToken ? 'set' : 'null'}, bearer=${currentModelUsesBearerAuth}, hasFinalCredential=${!!finalCredential}`);
			logInfo(`[streamFn] Calling pi-ai streamSimple with model:`, {
				id: streamModel.id,
				api: streamModel.api,
				provider: streamModel.provider,
					baseUrl: sanitizeBaseUrlForLogging((streamModel as any).baseUrl),
			});
			logInfo(`[streamFn] Context messages count:`, context.messages?.length);

			const stream = piAi.streamSimple(streamModel, context, opts);

			return currentModelUsesBearerAuth ? normalizeStreamProvider(stream, model.provider) : stream;
		};

		// 检查模型是否支持 thinking（reasoning: false 表示不支持）
		const modelReasoning = (this.config.model as any)?.reasoning;
		const thinkingLevel = modelReasoning === false ? "off" : (this.config.thinkingLevel ?? "low");

		this.agent = new Agent({
			sessionId: this.sessionId,
			initialState: {
				systemPrompt: this.config.systemPrompt,
				model: this.config.model,
				thinkingLevel,
				tools: this.config.tools ?? [],
				messages: [],
			},
			convertToLlm,
			transformContext: async (messages) => {
				const withSessionContext = injectSessionContext(messages, this.sessionContext);
				const updateEstimate = (turnRecall = '') => {
					this.contextTokenEstimate = estimateAgentContextTokens({
						stableSystem: this.agent?.state.systemPrompt ?? this.config?.systemPrompt,
						sessionContext: this.sessionContext,
						turnRecall,
						history: messages,
					});
				};
				updateEstimate();
				const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
				const lastUserMessage = messages[lastUserIndex];
				const query = getMessageText(lastUserMessage);
				if (!query || !lastUserMessage || !this.turnContextProvider) return withSessionContext;
				try {
					const timestamp = typeof lastUserMessage.timestamp === 'number'
						? lastUserMessage.timestamp
						: undefined;
					const cached = this.turnContextCache;
					const sameTurn = cached?.message === lastUserMessage || (
						timestamp !== undefined &&
						cached?.index === lastUserIndex &&
						cached?.timestamp === timestamp
					);
					if (!sameTurn) {
						this.turnContextCache = {
							message: lastUserMessage,
							index: lastUserIndex,
							timestamp,
							value: this.turnContextProvider(query),
						};
					}
					const recalledContext = await this.turnContextCache!.value;
					if (!recalledContext.trim()) return withSessionContext;
					updateEstimate(recalledContext);
					const insertionIndex = withSessionContext.map((message) => message.role).lastIndexOf('user');
					const recalledMessage: AgentMessage = {
						role: 'user',
						content: [{ type: 'text', text: recalledContext }],
						timestamp: 0,
					};
					if (insertionIndex < 0) return [...withSessionContext, recalledMessage];
					return [
						...withSessionContext.slice(0, insertionIndex),
						recalledMessage,
						...withSessionContext.slice(insertionIndex),
					];
				} catch (error) {
					console.warn('[OriginOSAgent] Turn context prefetch failed', {
						sessionId: this.sessionId,
						errorCategory: error instanceof Error ? error.name : 'UnknownError',
					});
					return withSessionContext;
				}
			},
			// 提供 getApiKey 回调，确保 API key 可用于所有 provider
			getApiKey: async (_provider: string) => {
				// 优先使用当前模型配置中的 API key，支持 setModel() 后热切换
				return (getRuntimeModel() as any)?.apiKey;
			},
			// 使用包装的 streamFn 注入 toolChoice
			streamFn: streamFnWithToolChoice,
		});

		// 订阅 Agent 事件并转发到我们的事件发射器
		this.agent.subscribe((event) => {
			this.handleAgentEvent(event);
			this.routeAgentEvent(event);
		});

		this.state.isInitialized = true;
		this.logStablePromptDiagnostic("initial");

		// 标记为运行状态
		this.healthMonitor.markAsRunning();
	}

	private routeAgentEvent(event: AgentEvent): void {
		const eventType = event.type;

		if (this.isCompletionGuardEnabled() && eventType === "tool_execution_end") {
			const status = getToolEventStatus(event);
			this.completionToolTrace.push(
				`${event.toolName}: ${status.failed ? "failed" : "succeeded"}${status.reason ? ` (${status.reason.slice(0, 500)})` : ""}`,
			);
			if (this.completionToolTrace.length > 20) {
				this.completionToolTrace.shift();
			}
			if (status.failed) {
				this.lastToolFailure = {
					toolName: event.toolName,
					toolCallId: event.toolCallId,
					exitCode: status.exitCode,
					reason: status.reason || "工具返回失败，但未提供具体原因。",
				};
				this.successfulToolAfterFailure = false;
			} else if (this.lastToolFailure) {
				this.successfulToolAfterFailure = true;
			}
		}

		if (
			this.isCompletionGuardEnabled() &&
			this.activeCompletionPolicy === "chat_guard" &&
			eventType === "agent_end" &&
			(this.pendingPromiseStop || this.pendingCompletionCandidate)
		) {
			this.deferredAgentEndEvent = event;
			return;
		}

		this.emitUiEvent(event);

		if (
			eventType !== "message_end" ||
			event.message.role !== "assistant"
		) {
			return;
		}

		if ((event.message as AssistantMessage).stopReason === "error") {
			const errorMessage =
				(event.message as AssistantMessage).errorMessage?.trim() ||
				"Model stream ended with stopReason=error without an errorMessage";
			this.lastModelError = new Error(errorMessage);
			return;
		}
		const text = Array.isArray(event.message.content)
			? event.message.content
					.filter((block: any) => block.type === "text" && block.text != null)
					.map((block: any) => block.text)
					.join("")
			: "";
		const toolCallCount = Array.isArray(event.message.content)
			? event.message.content.filter((block: any) => block.type === "toolCall").length
			: 0;

			if (
				this.activeCompletionPolicy === "chat_guard" &&
				(event.message as AssistantMessage).stopReason === "stop" &&
				toolCallCount === 0
			) {
				this.pendingCompletionCandidate = {
					message: event.message,
					text,
					stopReason: (event.message as AssistantMessage).stopReason,
					toolCallCount,
					repeatedResponse: this.assistantLoopGuardTriggered,
				};
			}
		}

	private emitUiEvent(event: AgentEvent): void {
		if (
			(event.type === "message_start" ||
				event.type === "message_end" ||
				event.type === "turn_end") &&
			typeof event.message === "object" &&
			event.message !== null &&
			this.hiddenMessages.has(event.message)
		) {
			return;
		}

		if (event.type === "agent_end") {
			const stateMessages = this.agent?.state.messages ?? [];
			const sourceMessages = stateMessages.length > 0
				? stateMessages
				: event.messages;
			const visibleMessages = sourceMessages.filter(
				(message) =>
					typeof message !== "object" ||
					message === null ||
					!this.hiddenMessages.has(message),
			);
			this.eventEmitter.emit({
				...event,
				messages: visibleMessages,
			});
			return;
		}

		this.eventEmitter.emit(event);
	}

	private resetCompletionGuard(userRequest = ""): void {
		this.pendingPromiseStop = false;
		this.lastToolFailure = null;
		this.successfulToolAfterFailure = false;
		this.lastModelError = null;
		this.activeUserRequest = userRequest;
		this.completionToolTrace = [];
		this.pendingCompletionCandidate = null;
		this.deferredAgentEndEvent = null;
		this.previousTaskAssistantTextHash = "";
	}

	private throwIfModelStreamFailed(): void {
		if (this.lastModelError) {
			throw this.lastModelError;
		}
	}

	/**
	 * 组装 completion 模块函数共用的调用上下文。
	 * 可变状态字段以 getter/setter 闭包直接读写主类实例属性（模块函数内的赋值
	 * 经闭包写回 this.xxx，不会停留在 ctx 对象上）；方法回调以实例闭包注入，
	 * 与原 this 调用链行为一致。
	 */
	private createCompletionCtx(): AgentCompletionContext {
		const self = this;
		return {
			get pendingCompletionCandidate() {
				return self.pendingCompletionCandidate;
			},
			set pendingCompletionCandidate(value) {
				self.pendingCompletionCandidate = value;
			},
			get pendingPromiseStop() {
				return self.pendingPromiseStop;
			},
			set pendingPromiseStop(value) {
				self.pendingPromiseStop = value;
			},
			get deferredAgentEndEvent() {
				return self.deferredAgentEndEvent;
			},
			set deferredAgentEndEvent(value) {
				self.deferredAgentEndEvent = value;
			},
			get lastToolFailure() {
				return self.lastToolFailure;
			},
			set lastToolFailure(value) {
				self.lastToolFailure = value;
			},
			hiddenMessages: this.hiddenMessages,
			agent: this.agent,
			eventEmitter: this.eventEmitter,
			get activeUserRequest() {
				return self.activeUserRequest;
			},
			get completionToolTrace() {
				return self.completionToolTrace;
			},
			get successfulToolAfterFailure() {
				return self.successfulToolAfterFailure;
			},
			throwIfModelStreamFailed: () => this.throwIfModelStreamFailed(),
			emitUiEvent: (event) => this.emitUiEvent(event),
			getVisibleMessages: () => this.getVisibleMessages(),
			handleAgentEvent: (event) => this.handleAgentEvent(event),
			isEmptyStopRecoveryEnabled: () => this.isEmptyStopRecoveryEnabled(),
			isCompletionGuardEnabled: () => this.isCompletionGuardEnabled(),
			emitCompletionFailureReport: () =>
				this.emitCompletionFailureReport(),
			judgePendingCompletion: () => this.judgePendingCompletion(),
		};
	}

	protected async judgePendingCompletion(): Promise<void> {
		return runJudgePendingCompletion(this.createCompletionCtx());
	}

	private async runWithEmptyStopRecovery(
		start: () => Promise<void>,
	): Promise<void> {
		return runWithEmptyStopRecovery(this.createCompletionCtx(), start);
	}

	private async runWithCompletionGuard(
		start: () => Promise<void>,
	): Promise<void> {
		return runWithCompletionGuard(this.createCompletionCtx(), start);
	}

	private emitCompletionFailureReport(): void {
		return runEmitCompletionFailureReport(this.createCompletionCtx());
	}

	/**
	 * 公开的启动方法（如果已停止可以重新启动）
	 */
	async start(config?: OriginOSAgentConfig): Promise<void> {
		if (this.isDestroyed) {
			throw new Error("Agent 已销毁，无法初始化");
		}

		if (config) {
			this.config = config;
		}

		if (this.isInitialized()) {
			// 已初始化，标记为运行中
			this.healthMonitor.markAsRunning();
			return;
		}

		// 需要重新初始化
		if (this.config) {
			this.initialize(this.config);
		}
	}

	/**
	 * 处理 Agent 事件
	 */
	private handleAgentEvent(event: AgentEvent): void {
		switch ((event as any).type) {
			case "agent_start":
				this.state.uiState.isThinking = true;
				this.healthMonitor.markProcessingStart();
				logInfo(`[LLM Event] agent_start`);
				break;

			case "agent_end":
				this.state.uiState.isThinking = false;
				this.state.uiState.activeTools = [];
				this.healthMonitor.markProcessingEnd();
				this.healthMonitor.recordMessageHandled();
				logInfo(`[LLM Event] agent_end — messages=${(event as any).messages?.length ?? 0}`);
				break;

			case "turn_start":
				this.activeTurnSequence = ++this.turnSequence;
				this.state.uiState.isThinking = true;
				this.healthMonitor.markProcessingStart();
				logInfo(`[LLM Event] turn_start — turnSeq=${this.activeTurnSequence}`);
				break;

			case "turn_end": {
				const turnEnd = event as any;
				const msg = turnEnd.message;
				const toolCount = turnEnd.toolResults?.length ?? 0;
				const hasToolCalls = msg?.content?.filter?.((c: any) => c.type === "toolCall")?.length ?? 0;
				this.state.uiState.isThinking = false;
				this.healthMonitor.markProcessingEnd();
				this.healthMonitor.recordMessageHandled();

				// 详细日志：打印 turn 结束时的完整消息结构
				logInfo(
					`[LLM Event] turn_end — turnSeq=${this.activeTurnSequence}, toolCalls=${hasToolCalls}, toolResults=${toolCount}`
				);
				if (msg) {
					const assistantText =
						Array.isArray(msg.content)
							? msg.content
									.filter((block: any) => block.type === "text" && block.text != null)
									.map((block: any) => block.text)
									.join("")
							: "";
					const assistantTextHash = hashText(assistantText);
					const sameAsPreviousAssistant =
						msg.role === "assistant" &&
						assistantText.length > 0 &&
						assistantTextHash === this.previousAssistantTextHash;
					logInfo(
						`[LLM Turn Detail] turnSeq=${this.activeTurnSequence}, model=${msg.model ?? 'unknown'}, provider=${msg.provider ?? 'unknown'}, api=${msg.api ?? 'unknown'}, stopReason=${msg.stopReason ?? 'unknown'}, assistantTextHash=${assistantTextHash}, sameAsPreviousAssistant=${sameAsPreviousAssistant}${sameAsPreviousAssistant ? `, previousTurnSeq=${this.previousAssistantTurnSequence}` : ""}`
					);
					if (msg.content && Array.isArray(msg.content)) {
						msg.content.forEach((block: any, i: number) => {
							if (block.type === "toolCall") {
								logInfo(`[LLM Turn Detail]   toolCall[${i}]: name=${block.name}, id=${block.id}, args=${JSON.stringify(block.arguments).slice(0, 300)}`);
							} else if (block.type === "text") {
								logInfo(`[LLM Turn Detail]   text[${i}]: len=${block.text?.length ?? 0}, preview="${(block.text ?? '').slice(0, 100)}"`);
							} else if (block.type === "thinking") {
								logInfo(`[LLM Turn Detail]   thinking[${i}]: len=${block.thinking?.length ?? 0}`);
							} else {
								logInfo(`[LLM Turn Detail]   block[${i}]: type=${block.type}`);
							}
						});
					}
					if (toolCount > 0) {
						turnEnd.toolResults.forEach((tr: any, i: number) => {
							const content = tr.content?.map((c: any) => c.type === 'text' ? c.text : `[${c.type}]`).join('') ?? '';
							logInfo(`[LLM Turn Detail]   toolResult[${i}]: name=${tr.toolName ?? 'unknown'}, callId=${tr.toolCallId ?? 'unknown'}, content_preview="${content.slice(0, 200)}"`);
						});
					}
					if (msg.role === "assistant" && assistantText.length > 0) {
						this.previousAssistantTextHash = assistantTextHash;
						this.previousAssistantTurnSequence = this.activeTurnSequence;
					}
				}
				break;
			}

			case "tool_execution_start":
				this.applyLoopProtection(event as any);
				this.state.uiState.activeTools.push({
					toolName: (event as any).toolName,
					startTime: Date.now(),
				});
				logInfo(`[LLM Event] tool_start — ${(event as any).toolName}`);
				break;

			case "tool_execution_end": {
				this.state.uiState.activeTools =
					this.state.uiState.activeTools.filter(
						(t) => t.toolName !== (event as any).toolName
					);
				const toolEndEvent = event as any;
				const resultContent = toolEndEvent.result?.content;
				const resultText = Array.isArray(resultContent)
					? resultContent.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
					: typeof resultContent === 'string' ? resultContent : JSON.stringify(toolEndEvent.result ?? '');
				const status = getToolEventStatus(toolEndEvent);
				const toolCallId = toolEndEvent.toolCallId ? `, callId=${toolEndEvent.toolCallId}` : "";
				const exitCode = status.exitCode !== undefined ? `, exitCode=${status.exitCode}` : "";
				const reason = status.reason ? `, reason=${status.reason}` : "";
				const message = `[LLM Event] tool_end — ${toolEndEvent.toolName}${status.failed ? " (ERROR)" : ""}${toolCallId}${exitCode}${reason}\n[ToolResult] ${previewToolResult(resultText)}`;
				if (status.failed) {
					console.error(message);
				} else {
					logInfo(message);
				}
				break;
			}

			case "message_start": {
				const msg = (event as any).message;
				const role = msg?.role || "unknown";
				if (role === "assistant") {
					this.activeAssistantMessageSequence = ++this.assistantMessageSequence;
					this.loggedStreamContent = "";
					this.assistantStreamContent = "";
					this.assistantLoopGuardTriggered = false;
					this.toolCallDeltaCount = 0;
					this.toolCallDeltaChars = 0;
				} else {
					this.activeAssistantMessageSequence = 0;
				}
				logInfo(
					`[LLM Event] message_start — role=${role}, turnSeq=${this.activeTurnSequence}${role === "assistant" ? `, assistantMsgSeq=${this.activeAssistantMessageSequence}` : ""}`
				);
				break;
			}

			case "message_update": {
				const update = event as any;
				const eventType = update.assistantMessageEvent?.type || "unknown";
				if (eventType === "text_delta") {
					const delta = update.assistantMessageEvent?.delta || "";
					if (delta.length > 0) {
						const merged = getVisibleStreamDelta(this.assistantStreamContent, delta);
						update.assistantMessageEvent.delta = merged.delta;
						this.assistantStreamContent = merged.content;
						if (merged.delta.length > 0) {
							const logMerged = getVisibleStreamDelta(this.loggedStreamContent, merged.delta);
							this.loggedStreamContent = logMerged.content;
						}
					}
				} else if (eventType === "thinking_delta") {
					const delta = update.assistantMessageEvent?.delta || "";
					if (delta.length > 0) {
						const merged = getVisibleStreamDelta(this.loggedStreamContent, delta);
						this.loggedStreamContent = merged.content;
					}
				}
				if (eventType === "toolcall_delta") {
					const delta = update.assistantMessageEvent?.delta;
					this.toolCallDeltaCount += 1;
					this.toolCallDeltaChars += typeof delta === "string"
						? delta.length
						: JSON.stringify(delta ?? "").length;
				} else if (eventType === "toolcall_start" || eventType === "toolcall_end") {
					const ae = update.assistantMessageEvent || {};
					const deltaSummary = eventType === "toolcall_end"
						? `, deltas=${this.toolCallDeltaCount}, deltaChars=${this.toolCallDeltaChars}`
						: "";
					logInfo(`\n[LLM Event] message_update — ${eventType}${deltaSummary}`);
					if (ae.toolCall) {
						const tc = ae.toolCall;
						logInfo(`  → name=${tc.name}, id=${tc.id}, args=${JSON.stringify(tc.arguments).slice(0, 200)}`);
					}
				}
				break;
			}

			case "message_end": {
				const msg = (event as any).message;
				const role = msg?.role || "unknown";
				const hasToolCalls = msg?.content?.filter?.((c: any) => c.type === "toolCall")?.length ?? 0;
				const textContent = Array.isArray(msg?.content)
					? msg.content.filter((b: any) => b.type === "text" && b.text != null).map((b: any) => b.text).join("")
					: "";
				if (role === "assistant" && textContent.length > 0) {
					const completedHash = hashText(textContent);
					this.assistantLoopGuardTriggered =
						this.previousTaskAssistantTextHash.length > 0 &&
						completedHash === this.previousTaskAssistantTextHash;
					this.previousTaskAssistantTextHash = completedHash;
					if (this.assistantLoopGuardTriggered) {
						console.warn(
							`[LLM LoopGuard] repeated completed assistant response — turnSeq=${this.activeTurnSequence}, assistantMsgSeq=${this.activeAssistantMessageSequence}, textHash=${completedHash}`,
						);
					}
				}
				const stopReason = msg?.stopReason || "";
				const messageEndLog =
					`\n[LLM Event] message_end — role=${role}, turnSeq=${this.activeTurnSequence}${role === "assistant" ? `, assistantMsgSeq=${this.activeAssistantMessageSequence}` : ""}, stopReason=${stopReason}, toolCalls=${hasToolCalls}, textLen=${textContent.length}, textHash=${hashText(textContent)}, loopGuard=${role === "assistant" ? this.assistantLoopGuardTriggered : false}, preview="${previewText(textContent)}"`;
				if (stopReason === "error") {
					const errorMessage =
						typeof msg?.errorMessage === "string" && msg.errorMessage.trim()
							? redactErrorForLogging(msg.errorMessage)
							: "Model stream ended without an errorMessage";
					console.error(`${messageEndLog}, errorMessage="${errorMessage}"`);
				} else {
					logInfo(messageEndLog);
				}
				if (role === "assistant") {
					this.loggedStreamContent = "";
				}
				break;
			}

			case "agent_error":
				this.healthMonitor.recordError(
					(event as any).error?.message ?? "Unknown agent error"
				);
				console.error(
					`[LLM Event] agent_error: ${redactErrorForLogging(
						(event as any).error?.message ?? String((event as any).error),
					)}`,
				);
				break;
		}
	}

	private applyLoopProtection(event: { toolName?: string; args?: unknown }): void {
		if (!this.agent || !this.sessionId || !event.toolName) {
			return;
		}

		const detector = getLoopDetector(this.sessionId);
		const result = detector.record(event.toolName, event.args ?? {});
		if (result.type === 'ok') {
			return;
		}

		const workingSummary = createWorkingSummaryMessage(this.agent.state.messages as AgentMessage[]);
		const summaryText =
			workingSummary && 'content' in workingSummary && Array.isArray(workingSummary.content)
				? ((workingSummary.content[0] as { text?: string } | undefined)?.text ?? '')
				: '';
		const warningText = workingSummary
			? `${result.message}\n\n${summaryText}`
			: result.message;
		const warningMessage: SyntheticSystemMessage = {
			role: "system",
			content: [
				{
					type: "text",
					text: warningText,
				},
			],
		};

		this.agent.state.messages = [
			...this.agent.state.messages,
			warningMessage as unknown as AgentMessage,
		];
		console.warn(`[LLM LoopGuard] ${result.type} — ${result.toolName} x${result.count}`);
	}

	/**
	 * 检查 Agent 是否已初始化
	 */
	isInitialized(): boolean {
		return this.state.isInitialized && this.agent !== null;
	}

	/**
	 * 获取健康状态
	 */
	healthCheck(): AgentHealthStatus {
		return this.healthMonitor.getHealthStatus();
	}

	/**
	 * 获取健康监控器实例
	 */
	getHealthMonitor(): HealthMonitor {
		return this.healthMonitor;
	}

	/**
	 * 发送消息给 Agent
	 */
	async prompt(
		message: string | AgentMessage | AgentMessage[],
		images?: Array<{ type: "image"; data: string; mimeType: string }>,
		options: AgentExecutionOptions = {},
	): Promise<void> {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		if (this.isDestroyed) {
			throw new Error("Agent 已销毁");
		}

		const historyBeforeCompression = this.agent.state.messages.length;
		const compression = compressRecentTrace(this.agent.state.messages as AgentMessage[]);
		if (compression.compressed) {
			this.agent.state.messages = compression.messages;
			logInfo(
				`[LLM] >>> Compressed message history: ${historyBeforeCompression} → ${compression.messages.length} | preservedTrace=${compression.preservedTraceCount}`
			);
		}

		const workingSummary = createWorkingSummaryMessage(this.agent.state.messages as AgentMessage[]);
		if (workingSummary) {
			this.agent.state.messages = [
				...this.agent.state.messages,
				workingSummary,
			];
			logInfo(`[LLM] >>> Working summary injected before prompt`);
		}

		// LLM 调用日志
		const promptPreview = typeof message === "string"
			? message.slice(0, 150)
			: Array.isArray(message)
				? message.map(m => `${m.role}: ${typeof (m as any).content === "string" ? (m as any).content.slice(0, 100) : "[complex]"}`).join(" | ")
				: `${(message as any).role}: ${typeof (message as any).content === "string" ? (message as any).content.slice(0, 100) : "[complex]"}`;
		const msgCount = this.agent.state.messages?.length ?? 0;
		const modelInfo = {
			provider: this.agent.state.model.provider,
			id: this.agent.state.model.id,
		};
		const thinkingLevel = this.agent.state.thinkingLevel;
		const toolCount = this.agent.state.tools?.length ?? 0;

		logInfo(`[LLM] >>> Prompt called | Model: ${modelInfo.provider}/${modelInfo.id} | Thinking: ${thinkingLevel} | History msgs: ${msgCount} | Tools: ${toolCount}`);
		logInfo(`[LLM] >>> Prompt preview: ${promptPreview}`);
		if (images && images.length > 0) {
			logInfo(`[LLM] >>> Images: ${images.length} attached`);
		}

		const t0 = Date.now();
		const completionPolicy = options.completionPolicy ?? "chat_guard";
		try {
			this.resetCompletionGuard(getPromptText(message));
			const messages = Array.isArray(message) ? message : [message];
			if (options.internalMessage) {
				for (const candidate of messages) {
					if (typeof candidate === "object" && candidate !== null) {
						this.hiddenMessages.add(candidate);
					}
				}
			} else if (options.internalMessageIndexes) {
				for (const index of options.internalMessageIndexes) {
					const candidate = messages[index];
					if (typeof candidate === "object" && candidate !== null) {
						this.hiddenMessages.add(candidate);
					}
				}
			}
			this.activeCompletionPolicy = completionPolicy;
			if (completionPolicy === "task_runtime") {
				await this.agent.prompt(message as string, images);
				this.throwIfModelStreamFailed();
			} else if (this.isEmptyStopRecoveryEnabled()) {
				await this.runWithEmptyStopRecovery(
					() => this.agent!.prompt(message as string, images),
				);
			} else {
				await this.runWithCompletionGuard(
					() => this.agent!.prompt(message as string, images),
				);
			}
			const elapsed = Date.now() - t0;
			logInfo(`[LLM] <<< Prompt completed | Policy: ${completionPolicy} | Elapsed: ${elapsed}ms`);
		} catch (error) {
			const elapsed = Date.now() - t0;
			const agentError = error instanceof Error ? error : new Error(String(error));
			this.state.uiState.isThinking = false;
			this.state.uiState.activeTools = [];
			this.healthMonitor.markProcessingEnd();
			this.healthMonitor.recordError(agentError.message);
			this.eventEmitter.emit({
				type: "agent_error",
				error: agentError,
			} as unknown as AgentEvent);
			console.error(
				`[LLM] <<< Prompt failed | Elapsed: ${elapsed}ms | ${redactErrorForLogging(agentError.message)}`,
			);
			throw agentError;
		} finally {
			this.activeCompletionPolicy = "chat_guard";
		}
	}

	/**
	 * 继续上一次请求（用于重试）
	 */
	async continue(options: AgentExecutionOptions = {}): Promise<void> {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		if (this.isDestroyed) {
			throw new Error("Agent 已销毁");
		}

		const latestUserRequest = [...this.agent.state.messages]
			.reverse()
			.find((message) => message.role === "user");
		this.resetCompletionGuard(getMessageText(latestUserRequest));
		const completionPolicy = options.completionPolicy ?? "chat_guard";
		this.activeCompletionPolicy = completionPolicy;
		try {
			if (completionPolicy === "task_runtime") {
				await this.agent.continue();
				this.throwIfModelStreamFailed();
				return;
			}
			if (this.isEmptyStopRecoveryEnabled()) {
				await this.runWithEmptyStopRecovery(() => this.agent!.continue());
				return;
			}
			await this.runWithCompletionGuard(() => this.agent!.continue());
		} finally {
			this.activeCompletionPolicy = "chat_guard";
		}
	}

	/**
	 * 在当前 turn 尚未结束时追加用户消息。
	 * 底层 Pi Agent 会在当前回复完成后按顺序处理，避免并发 prompt()。
	 */
	queueFollowUp(message: string): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		if (this.isDestroyed) {
			throw new Error("Agent 已销毁");
		}
		const followUpMessage: SyntheticUserMessage = {
			role: "user",
			content: [{ type: "text", text: message }],
		};
		this.agent.followUp(followUpMessage as unknown as AgentMessage);
	}

	/**
	 * 订阅事件
	 */
	subscribe(listener: (event: AgentEvent) => void): () => void {
		return this.eventEmitter.subscribe(listener);
	}

	/**
	 * 设置系统提示词
	 */
	setSystemPrompt(prompt: string): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.systemPrompt = prompt;
		this.logStablePromptDiagnostic("explicit_update");
	}

	setSessionContext(context: string): void {
		this.rawSessionContext = context;
		this.sessionContext = appendRuntimeEnvironmentPrompt(this.rawSessionContext, this.runtimeEnvironment);
	}

	getContextTokenEstimate(): AgentContextTokenEstimate {
		return { ...this.contextTokenEstimate };
	}

	setTurnContextProvider(provider?: (query: string) => Promise<string>): void {
		this.turnContextProvider = provider;
		this.turnContextCache = undefined;
	}

	appendSessionContext(context: string): void {
		if (!context.trim()) return;
		this.setSessionContext([this.rawSessionContext, context].filter(Boolean).join("\n\n---\n\n"));
	}

	private logStablePromptDiagnostic(reason: "initial" | "explicit_update"): void {
		if (!this.agent) return;
		const diagnostic = createAgentPromptBoundary(this.agent.state.systemPrompt);
		logInfo("[OriginOSAgent] Stable prompt:", {
			sessionId: this.sessionId,
			hash: diagnostic.stablePromptHash,
			length: diagnostic.stablePromptLength,
			reason,
		});
	}

	/**
	 * 设置思考级别
	 */
	setThinkingLevel(level: "off" | "minimal" | "low" | "medium" | "high"): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.thinkingLevel = level;
	}

	/**
	 * 设置模型
	 */
	setModel(model: Model<any>): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.model = model;
	}

	/**
	 * 设置工具
	 */
	setTools(tools: AgentTool<any>[]): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.tools = tools;
	}

	getTools(): readonly AgentTool<any>[] {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		return [...this.agent.state.tools];
	}

	/**
	 * 注册单个工具
	 */
	registerTool(tool: AgentTool<any>): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.tools = [...this.agent.state.tools, tool];
	}

	/**
	 * 移除工具
	 */
	unregisterTool(toolName: string): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.tools = this.agent.state.tools.filter(
			(t) => t.name !== toolName,
		);
	}

	/**
	 * 清空所有消息
	 */
	clearMessages(): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.messages = [];
	}

	/**
	 * 替换所有消息
	 */
	replaceMessages(messages: AgentMessage[]): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.messages = messages;
	}

	/**
	 * 使用当前 Runtime model 的公开元数据恢复持久化消息。
	 */
	replacePersistedMessages(messages: readonly PersistedRuntimeMessage[]): number {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		const runtimeMessages = mapPersistedMessagesForRuntime(
			messages,
			toRestorableRuntimeModel(this.agent.state.model),
			this.sessionId,
		);
		this.agent.state.messages = runtimeMessages;
		return runtimeMessages.length;
	}

	/**
	 * 追加消息
	 */
	appendMessage(message: AgentMessage): void {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}
		this.agent.state.messages = [...this.agent.state.messages, message];
	}

	/**
	 * 中断当前操作
	 */
	abort(): void {
		if (!this.agent) {
			return;
		}
		this.agent.abort();
	}

	/**
	 * 等待空闲状态
	 */
	async waitForIdle(): Promise<void> {
		if (!this.agent) {
			return;
		}
		await this.agent.waitForIdle();
	}

	/**
	 * 获取会话状态
	 */
	async getSessionState(): Promise<SessionData> {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}

		return {
			sessionId: this.sessionId,
				messages: this.getVisibleMessages(),
			systemPrompt: this.agent.state.systemPrompt,
			model: {
				provider: this.agent.state.model.provider || "unknown",
				id: this.agent.state.model.id || "unknown",
			},
			createdAt: Date.now(),
			updatedAt: Date.now(),
			projectContext: this.projectContext,
		};
	}

	private getVisibleMessages(): AgentMessage[] {
		if (!this.agent) {
			return [];
		}
		return this.agent.state.messages.filter(
			(message) =>
				typeof message !== "object" ||
				message === null ||
				!this.hiddenMessages.has(message),
		);
	}

	/**
	 * 销毁 Agent
	 */
	destroy(): void {
		if (this.sessionId) {
			removeLoopDetector(this.sessionId);
		}
		this.isDestroyed = true;
		this.eventEmitter.clear();
		this.healthMonitor.markAsStopped();
		// pi-agent-core 的 Agent 没有显式的 destroy 方法
		// 只需要清理我们的引用和事件监听器
		this.agent = null;
		this.state.isInitialized = false;
	}

	/**
	 * 正确停止 Agent
	 */
	stop(): void {
		this.healthMonitor.markAsStopped();
		this.abort();
	}
}

// 工厂包装：类构造器经参数注入 agent-factory（D4 传参注入预案，
// factory 不持有对 agent.ts 的任何 import，保证单向依赖与零 madge 环）。
export function createOriginOSAgent(
	params: CreateOriginOSAgentParams,
): OriginOSAgent {
	return createOriginOSAgentBase(params, OriginOSAgent);
}

export type {
	CreateOriginOSAgentParams,
	SessionData,
} from "./agent-factory";
