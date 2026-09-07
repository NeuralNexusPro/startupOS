/**
 * OriginOS Agent 核心包装类
 * 包装 pi-agent-core 的 Agent，提供 OriginOS 特定的功能
 */

import type {
	AgentEvent,
	AgentMessage,
	AgentTool,
	StreamFn,
	ThinkingLevel,
} from "@originos/pi-agent-adapter";
import { Agent } from "@originos/pi-agent-adapter";
import type { AssistantMessage, AssistantMessageEvent, AssistantMessageEventStream, Message, Model } from "@originos/pi-agent-adapter/ai";
import * as piAi from "@originos/pi-agent-adapter/ai";
import type {
	OriginOSAgentConfig,
	OriginOSAgentState,
} from "../types";
import { AgentStatus } from "../../../../types/agent";
import type {
	ProjectContext,
} from "../system/config";
import type { SystemPromptVariables } from "../system/prompt";
import type { HealthMonitor, AgentHealthStatus } from "../health";
import { createHealthMonitor } from "../health";
import { createAnthropicModel, createGoogleModel, createAutoModel, createRuntimeModel, getConfigStatus, sanitizeBaseUrlForLogging } from "../server-config";
import type { RuntimeLLMConfig } from "../llm-config";
import { compressRecentTrace } from "../recent-trace-compression";
import { getLoopDetector, removeLoopDetector } from "../tools/loop-detector";
import { findSuitableShell } from "../tools/bash-tools";
import { createWorkingSummaryMessage } from "../runtime-working-summary";
import { getVisibleStreamDelta } from "../stream-dedupe";
import {
	appendRuntimeEnvironmentPrompt,
	buildRuntimeEnvironmentPrompt,
	getRuntimeEnvironment,
} from "../system/runtime-environment";
import {
	assessCompletion,
	buildCompletionFailureReport,
	buildCompletionRecoveryMessage,
	DEFAULT_COMPLETION_RECOVERY_LIMIT,
	type ToolFailureSummary,
} from "./completion-guard";
import {
	buildCompletionJudgePrompt,
	COMPLETION_JUDGE_SYSTEM_PROMPT,
	parseCompletionJudgeDecision,
	type SemanticCompletionDecision,
} from "./completion-judge";
import { getToolEventStatus } from "./tool-event-status";
import {
	mapPersistedMessagesForRuntime,
	toRestorableRuntimeModel,
	type PersistedRuntimeMessage,
} from "./runtime-history";

// ============================================================================
// Event Emitter
// ============================================================================

/**
 * 简单的事件发射器
 */
class EventEmitter<T> {
	private listeners = new Set<(event: T) => void>();

	subscribe(listener: (event: T) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(event: T): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}

function normalizeStreamProvider(
	stream: AssistantMessageEventStream,
	provider: string
): AssistantMessageEventStream {
	const rewriteMessage = (message: AssistantMessage): AssistantMessage => {
		message.provider = provider;
		return message;
	};
	const rewriteEvent = (event: AssistantMessageEvent): AssistantMessageEvent => {
		if ("partial" in event) {
			rewriteMessage(event.partial);
		}
		if ("message" in event) {
			rewriteMessage(event.message);
		}
		return event;
	};

	return ({
		[Symbol.asyncIterator]: async function* () {
			for await (const event of stream) {
				yield rewriteEvent(event);
			}
		},
		result: async () => rewriteMessage(await stream.result()),
	} as unknown) as AssistantMessageEventStream;
}

function hashText(text: string): string {
	if (!text) {
		return "empty";
	}
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function previewText(text: string, max = 80): string {
	return text.replace(/\s+/g, " ").slice(0, max);
}

function previewToolResult(text: string, max = 1_000): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	const preview = normalized.slice(0, max);
	return `length=${text.length}, hash=${hashText(text)}, preview=${JSON.stringify(preview)}${normalized.length > max ? ", truncated=true" : ""}`;
}

function getMessageText(message: unknown): string {
	if (typeof message === "string") {
		return message;
	}
	if (!message || typeof message !== "object") {
		return "";
	}
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.filter((block): block is { type: "text"; text: string } =>
			typeof block === "object" &&
			block !== null &&
			(block as { type?: unknown }).type === "text" &&
			typeof (block as { text?: unknown }).text === "string"
		)
		.map((block) => block.text)
		.join("");
}

function getPromptText(message: string | AgentMessage | AgentMessage[]): string {
	if (typeof message === "string") {
		return message;
	}
	if (Array.isArray(message)) {
		for (let index = message.length - 1; index >= 0; index -= 1) {
			const candidate = message[index];
			if (candidate?.role === "user") {
				return getMessageText(candidate);
			}
		}
		return "";
	}
	return getMessageText(message);
}

function redactErrorForLogging(message: string): string {
	return message
		.replace(/\bBearer\s+\S+/giu, "Bearer [REDACTED]")
		.replace(/\b(?:sk|tp)-[A-Za-z0-9._-]{8,}\b/gu, "[REDACTED]");
}

function logInfo(...args: unknown[]): void {
	if (process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"] === "1") {
		return;
	}
	console.info(...args);
}

const COMPLETION_JUDGE_MAX_ATTEMPTS = 2;
const COMPLETION_JUDGE_TIMEOUT_MS = 15_000;

type CompletionJudgeFailureCategory =
	| "aborted"
	| "error"
	| "invalid_response"
	| "exception";

class CompletionJudgeAttemptError extends Error {
	constructor(
		public readonly category: CompletionJudgeFailureCategory,
		public readonly stopReason: string,
		public readonly attempt: number,
		public readonly elapsedMs: number,
		message: string,
	) {
		super(message);
		this.name = "CompletionJudgeAttemptError";
	}
}

type SyntheticSystemMessage = {
	role: "system";
	content: Array<{
		type: "text";
		text: string;
	}>;
};

type SyntheticUserMessage = {
	role: "user";
	content: Array<{
		type: "text";
		text: string;
	}>;
};

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
	private runtimeEnvironmentPrompt = buildRuntimeEnvironmentPrompt(this.runtimeEnvironment);
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

			// 估算 token 数（chars/4 启发式，中文约 2 chars/token）
			const estimateTokens = (content: unknown): number => {
				if (typeof content === 'string') {
					return Math.ceil(content.length / 3);
				}
				if (Array.isArray(content)) {
					return content.reduce((sum, c) => {
						if (c && typeof c === 'object' && 'text' in c) {
							return sum + Math.ceil((c.text as string).length / 3);
						}
						return sum;
					}, 0);
				}
				return 0;
			};

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

			// 从后往前保留消息，直到超出预算
			let totalTokens = 0;
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

			return keptMessages;
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
			initialState: {
				systemPrompt: appendRuntimeEnvironmentPrompt(
					this.config.systemPrompt,
					this.runtimeEnvironment,
				),
				model: this.config.model,
				thinkingLevel,
				tools: this.config.tools ?? [],
				messages: [],
			},
			convertToLlm,
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
			!this.isCompletionGuardEnabled() ||
			eventType !== "message_end" ||
			event.message.role !== "assistant"
		) {
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
			if ((event.message as AssistantMessage).stopReason === "error") {
				const errorMessage =
					(event.message as AssistantMessage).errorMessage?.trim() ||
					"Model stream ended with stopReason=error without an errorMessage";
				this.lastModelError = new Error(errorMessage);
				this.pendingPromiseStop = false;
				return;
			}
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

	private async judgePendingCompletion(): Promise<void> {
		const candidate = this.pendingCompletionCandidate;
		if (!candidate || !this.agent) {
			return;
		}
		this.pendingCompletionCandidate = null;

		if (candidate.repeatedResponse) {
			this.pendingPromiseStop = true;
			this.hiddenMessages.add(candidate.message);
			this.deferredAgentEndEvent = null;
			console.warn(
				`[LLM CompletionGuard] repeated completed assistant response — textHash=${hashText(candidate.text)}`,
			);
			return;
		}

		let decision: SemanticCompletionDecision | null = null;
		let lastFailure: CompletionJudgeAttemptError | null = null;
		try {
			const runtimeModel = this.agent.state.model as Model<any> & {
				apiKey?: string;
				authToken?: string;
				credentialAuthMode?: string;
				headers?: Record<string, string>;
			};
			const baseOptions: Record<string, unknown> = {
				temperature: 0,
				maxTokens: 512,
				reasoning: "minimal",
				maxRetryDelayMs: 5_000,
			};
			let judgeModel = runtimeModel;
			if (
				(runtimeModel.credentialAuthMode === "bearer" ||
					runtimeModel.credentialAuthMode === "oauth") &&
				runtimeModel.authToken
			) {
				baseOptions["apiKey"] = runtimeModel.authToken;
				baseOptions["headers"] = {
					...(runtimeModel.headers ?? {}),
					authorization: `Bearer ${runtimeModel.authToken}`,
				};
				judgeModel = {
					...runtimeModel,
					provider: "github-copilot",
					apiKey: undefined,
					authToken: undefined,
				};
			} else if (runtimeModel.apiKey) {
				baseOptions["apiKey"] = runtimeModel.apiKey;
			}

			for (let attempt = 1; attempt <= COMPLETION_JUDGE_MAX_ATTEMPTS; attempt += 1) {
				const startedAt = Date.now();
				try {
					const judgeMessage = await piAi.completeSimple(
						judgeModel,
						{
							systemPrompt: COMPLETION_JUDGE_SYSTEM_PROMPT,
							messages: [{
								role: "user",
								content: buildCompletionJudgePrompt({
									userRequest: this.activeUserRequest,
									assistantResponse: candidate.text,
									toolTrace: this.completionToolTrace,
								}),
								timestamp: Date.now(),
							}],
						},
						{
							...baseOptions,
							signal: AbortSignal.timeout(COMPLETION_JUDGE_TIMEOUT_MS),
						},
					);
					const elapsedMs = Date.now() - startedAt;
					if (
						judgeMessage.stopReason === "error" ||
						judgeMessage.stopReason === "aborted"
					) {
						throw new CompletionJudgeAttemptError(
							judgeMessage.stopReason,
							judgeMessage.stopReason,
							attempt,
							elapsedMs,
							judgeMessage.errorMessage ||
								`Completion judge ${judgeMessage.stopReason}`,
						);
					}
					const judgeText = getMessageText(judgeMessage);
					try {
						decision = parseCompletionJudgeDecision(judgeText);
					} catch (parseError) {
						throw new CompletionJudgeAttemptError(
							"invalid_response",
							judgeMessage.stopReason || "unknown",
							attempt,
							elapsedMs,
							`${parseError instanceof Error ? parseError.message : String(parseError)}; responseLen=${judgeText.length}; responseHash=${hashText(judgeText)}`,
						);
					}
					logInfo(
						`[LLM CompletionJudge] status=${decision.status}, reason="${previewText(decision.reason, 160)}", attempt=${attempt}/${COMPLETION_JUDGE_MAX_ATTEMPTS}, elapsedMs=${elapsedMs}`,
					);
					break;
				} catch (error) {
					const elapsedMs = Date.now() - startedAt;
					lastFailure = error instanceof CompletionJudgeAttemptError
						? error
						: new CompletionJudgeAttemptError(
							"exception",
							"unknown",
							attempt,
							elapsedMs,
							error instanceof Error ? error.message : String(error),
						);
					console.warn(
						`[LLM CompletionJudge] attempt failed — attempt=${attempt}/${COMPLETION_JUDGE_MAX_ATTEMPTS}, category=${lastFailure.category}, stopReason=${lastFailure.stopReason}, elapsedMs=${lastFailure.elapsedMs}, retry=${attempt < COMPLETION_JUDGE_MAX_ATTEMPTS}, reason="${previewText(redactErrorForLogging(lastFailure.message), 300)}"`,
					);
				}
			}
			if (!decision) {
				throw lastFailure ?? new CompletionJudgeAttemptError(
					"exception",
					"unknown",
					COMPLETION_JUDGE_MAX_ATTEMPTS,
					0,
					"Completion judge failed without an error",
				);
			}
		} catch (error) {
			const fallback = assessCompletion({
				role: "assistant",
				stopReason: candidate.stopReason,
				text: candidate.text,
				toolCallCount: candidate.toolCallCount,
				hasUnresolvedToolFailure: this.lastToolFailure !== null,
				hasSuccessfulToolAfterFailure: this.successfulToolAfterFailure,
			});
			decision = {
				status: fallback.shouldRecover ? "incomplete" : "complete",
				reason: `fallback:${fallback.reason}`,
			};
			const failure = error instanceof CompletionJudgeAttemptError
				? error
				: new CompletionJudgeAttemptError(
					"exception",
					"unknown",
					0,
					0,
					error instanceof Error ? error.message : String(error),
				);
			console.warn(
				`[LLM CompletionJudge] failed, using fallback — decision=${decision.status}, reason="${previewText(decision.reason, 160)}", attempts=${failure.attempt}, lastFailure=${failure.category}, stopReason=${failure.stopReason}, elapsedMs=${failure.elapsedMs}`,
			);
		}

		this.pendingPromiseStop = decision.status === "incomplete";
		if (this.pendingPromiseStop) {
			this.hiddenMessages.add(candidate.message);
			this.deferredAgentEndEvent = null;
			return;
		}

		this.eventEmitter.emit({
			type: "completion_accepted",
			message: candidate.message,
			content: candidate.text,
		} as unknown as AgentEvent);

		if (this.deferredAgentEndEvent) {
			const deferred = this.deferredAgentEndEvent;
			this.deferredAgentEndEvent = null;
			this.emitUiEvent(deferred);
		}
	}

	private async runWithCompletionGuard(
		start: () => Promise<void>,
	): Promise<void> {
		if (!this.agent) {
			throw new Error("Agent 未初始化");
		}

		await start();
		this.throwIfModelStreamFailed();
		if (!this.isCompletionGuardEnabled()) {
			return;
		}
		await this.judgePendingCompletion();
		let recoveryAttempt = 0;

		while (
			this.pendingPromiseStop &&
			recoveryAttempt < DEFAULT_COMPLETION_RECOVERY_LIMIT
		) {
			recoveryAttempt += 1;
			this.pendingPromiseStop = false;

			const recoveryMessage: SyntheticUserMessage = {
				role: "user",
				content: [{
					type: "text",
					text: buildCompletionRecoveryMessage(
						this.runtimeEnvironmentPrompt,
						this.lastToolFailure,
						recoveryAttempt,
					),
				}],
			};
			this.hiddenMessages.add(recoveryMessage);
			logInfo(
				`[LLM CompletionGuard] recovering incomplete stop — attempt=${recoveryAttempt}/${DEFAULT_COMPLETION_RECOVERY_LIMIT}`,
			);
				try {
					await this.agent.prompt(recoveryMessage as unknown as AgentMessage);
					this.throwIfModelStreamFailed();
					await this.judgePendingCompletion();
				} catch (error) {
					const recoveryError = error instanceof Error
						? error
						: new Error(String(error));
					this.lastToolFailure = {
						toolName: "agent-recovery",
						reason: recoveryError.message,
					};
					this.pendingPromiseStop = false;
					this.emitCompletionFailureReport();
					return;
				}
		}

		if (!this.pendingPromiseStop) {
			return;
		}

		this.pendingPromiseStop = false;
		this.emitCompletionFailureReport();
	}

	private emitCompletionFailureReport(): void {
		if (!this.agent) {
			return;
		}

		const report = buildCompletionFailureReport(this.lastToolFailure);
		const message = {
			role: "assistant",
			content: [{ type: "text", text: report }],
			stopReason: "stop",
			completionFailure: true,
		} as unknown as AgentMessage;
		this.agent.state.messages = [...this.agent.state.messages, message];

			const visibleMessages = this.getVisibleMessages();
			const events = [
				{ type: "message_start", message },
				{ type: "message_end", message },
				{ type: "turn_end", message, toolResults: [] },
				{ type: "agent_end", messages: visibleMessages },
		] as unknown as AgentEvent[];
		events.forEach((event) => {
			this.handleAgentEvent(event);
			this.eventEmitter.emit(event);
		});
		console.error(
			`[LLM CompletionGuard] recovery exhausted — tool=${this.lastToolFailure?.toolName ?? "unknown"}, exitCode=${this.lastToolFailure?.exitCode ?? "unknown"}, reason=${this.lastToolFailure?.reason ?? "semantic completion check reported incomplete"}`,
		);
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
			await this.runWithCompletionGuard(() => this.agent!.continue());
		} finally {
			this.activeCompletionPolicy = "chat_guard";
		}
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
		this.agent.state.systemPrompt = appendRuntimeEnvironmentPrompt(
			prompt,
			this.runtimeEnvironment,
		);
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

// ============================================================================
// 辅助类型
// ============================================================================

/**
 * 会话数据
 */
export interface SessionData {
	sessionId: string;
	messages: AgentMessage[];
	systemPrompt: string;
	model: {
		provider: string;
		id: string;
	};
	createdAt: number;
	updatedAt: number;
	projectContext?: ProjectContext;
}

/**
 * 创建 OriginOS Agent 的工厂函数
 */
export interface CreateOriginOSAgentParams {
	/**
	 * 会话ID
	 */
	sessionId: string;

	/**
	 * 系统提示词
	 */
	systemPrompt?: string;

	/**
	 * 系统提示词变量
	 */
	variables?: SystemPromptVariables;

	/**
	 * 模型（可选）
	 */
	model?: Model<any>;

	/**
	 * 思考级别（可选）
	 */
	thinkingLevel?: ThinkingLevel;

	/**
	 * 是否使用基础模型（降级选项）
	 */
	useBaseModel?: boolean;

	/**
	 * 代理自带的健康监控器（可选）
	 */
	healthMonitor?: HealthMonitor;

	/**
	 * 运行时 LLM 配置（可选，覆盖环境变量）
	 */
	llmConfig?: RuntimeLLMConfig;

	/** 是否启用语义完成度检查与自动恢复，默认开启。 */
	completionGuardEnabled?: boolean;
}

/**
 * 创建未初始化的 OriginOS Agent
 */
export function createOriginOSAgent(
	params: CreateOriginOSAgentParams
): OriginOSAgent {
	const { sessionId, variables, model, thinkingLevel, useBaseModel, healthMonitor, llmConfig, completionGuardEnabled } =
		params;

	// 获取配置状态
	const configStatus = getConfigStatus();

	// 调试日志
	logInfo('[createOriginOSAgent] Config status:', configStatus);
	logInfo('[createOriginOSAgent] Environment:', {
		hasAnthropicAuthToken: !!process.env['ANTHROPIC_AUTH_TOKEN'],
			anthropicBaseUrl: sanitizeBaseUrlForLogging(process.env['ANTHROPIC_BASE_URL']),
		anthropicModel: process.env['ANTHROPIC_MODEL'],
	});

	// 根据 provider 和配置选择模型
	let agentModel: Model<any>;
	const modelOptions = llmConfig?.maxTokens ? { maxTokens: llmConfig.maxTokens } : undefined;

	if (model) {
		// 用户明确指定了模型
		agentModel = model;
	} else if (llmConfig) {
		// 用户运行时配置优先级最高，不通过 process.env 间接传递
		agentModel = createRuntimeModel(llmConfig);
	} else if (useBaseModel || configStatus.defaultProvider === "google") {
		// 使用 Google 模型作为基础模型或备选
		agentModel = createGoogleModel("gemini-2.5-flash-preview-05-20");
	} else if (configStatus.llmProvider === "azure-openai" || configStatus.defaultProvider === "azure") {
		// Azure OpenAI 直连（显式设置或检测到配置）
		agentModel = createAutoModel(undefined, modelOptions);
	} else if (configStatus.useOpenAICompatible) {
		// 使用 OpenAI 兼容 API（自动检测或显式配置）
		agentModel = createAutoModel(undefined, modelOptions);
	} else if (configStatus.hasAnthropicKey) {
		// 使用 Anthropic 模型，支持自定义 baseUrl 和模型 ID
		agentModel = createAnthropicModel(); // 不传 modelId，让函数从环境变量获取
	} else {
		// 默认使用自动选择
		agentModel = createAutoModel(undefined, modelOptions);
	}

	// 确保 maxTokens 被应用（兜底）
	if (llmConfig?.maxTokens && agentModel) {
		agentModel.maxTokens = llmConfig.maxTokens;
	}

	// 调试：查看创建的模型配置
	const debugCredential = (agentModel as any).apiKey || (agentModel as any).authToken;
	logInfo('[createOriginOSAgent] Created model:', {
		id: agentModel.id,
		api: agentModel.api,
		provider: agentModel.provider,
			baseUrl: sanitizeBaseUrlForLogging((agentModel as any).baseUrl),
		hasCredential: !!debugCredential,
		credentialSource: (agentModel as any).credentialSource || (llmConfig?.anthropicAuthToken || llmConfig?.authToken
			? 'user.anthropicAuthToken'
			: llmConfig?.anthropicApiKey || llmConfig?.apiKey
				? 'user.anthropicApiKey'
				: 'env/default'),
			credentialAuthMode: (agentModel as any).credentialAuthMode || (debugCredential?.includes?.('sk-ant-oat') ? 'oauth' : 'api-key'),
		});

	const projectContext = variables
		? {
				projectId: variables.projectId || "default",
				ontologyId: variables.ontologyId,
				projectName: variables.projectName,
				currentPath: variables.projectPath,
				userId: variables.userId,
			}
		: { projectId: "default" };

	const systemPrompt =
		params.systemPrompt ||
		(variables
			? `You are OriginOS AI assistant. You are working on project: ${variables.projectName || "unnamed"}`
			: "You are OriginOS AI assistant.");

	const config: OriginOSAgentConfig = {
		sessionId,
		systemPrompt,
		model: agentModel,
		projectContext,
		thinkingLevel: (thinkingLevel || "low") as OriginOSAgentConfig['thinkingLevel'],
		tools: [],
		completionGuardEnabled,
	};

	// 返回未初始化的 Agent，用户需要调用 start() 方法
	return new OriginOSAgent(config, healthMonitor);
}
