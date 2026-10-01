/**
 * OriginOSAgent 的 completion 判定与恢复——语义 judge、empty-stop 恢复、guard 循环与失败报告的模块级实现。
 */

import type { Agent, AgentEvent, AgentMessage } from "@originos/pi-agent-adapter";
import type { Model } from "@originos/pi-agent-adapter/ai";
import * as piAi from "@originos/pi-agent-adapter/ai";
import {
	buildEmptyStopRecoveryMessage,
} from "./skill-empty-stop-recovery";
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
import {
	getMessageText,
	hashText,
	logInfo,
	previewText,
	redactErrorForLogging,
	type EventEmitter,
} from "./agent-internals";

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

export type SyntheticSystemMessage = {
	role: "system";
	content: Array<{
		type: "text";
		text: string;
	}>;
};

export type SyntheticUserMessage = {
	role: "user";
	content: Array<{
		type: "text";
		text: string;
	}>;
};

/**
 * completion 四方法共用的调用上下文（internal）。
 * 可变状态字段以 getter/setter 绑定主类实例属性（模块函数内的赋值写回主类）；
 * 方法回调由主类以箭头闭包注入，保持 this 语义不变。
 */
/** pendingCompletionCandidate 元素结构（internal） */
type PendingCompletionCandidate = {
	message: object;
	text: string;
	stopReason?: string;
	toolCallCount: number;
	repeatedResponse: boolean;
} | null;

/**
 * completion 四方法共用的调用上下文（internal）。
 * 可变状态字段以 getter/setter 绑定主类实例属性（模块函数内的赋值写回主类）；
 * 方法回调由主类以箭头闭包注入，保持 this 语义不变。
 */
export interface AgentCompletionContext {
	get pendingCompletionCandidate(): PendingCompletionCandidate;
	set pendingCompletionCandidate(value: PendingCompletionCandidate);
	get pendingPromiseStop(): boolean;
	set pendingPromiseStop(value: boolean);
	get deferredAgentEndEvent(): AgentEvent | null;
	set deferredAgentEndEvent(value: AgentEvent | null);
	get lastToolFailure(): ToolFailureSummary | null;
	set lastToolFailure(value: ToolFailureSummary | null);
	hiddenMessages: WeakSet<object>;
	// 只读引用
	agent: Agent | null;
	eventEmitter: EventEmitter<AgentEvent>;
	get activeUserRequest(): string;
	get completionToolTrace(): string[];
	get successfulToolAfterFailure(): boolean;
	// 主类方法回调（保持行为：调用点逐字，仅 this.X() → ctx.X()）
	throwIfModelStreamFailed: () => void;
	emitUiEvent: (event: AgentEvent) => void;
	getVisibleMessages: () => AgentMessage[];
	handleAgentEvent: (event: AgentEvent) => void;
	isEmptyStopRecoveryEnabled: () => boolean;
	isCompletionGuardEnabled: () => boolean;
	emitCompletionFailureReport: () => void;
	judgePendingCompletion: () => Promise<void>;
}

export async function runJudgePendingCompletion(ctx: AgentCompletionContext): Promise<void> {
	const candidate = ctx.pendingCompletionCandidate;
	if (!candidate || !ctx.agent) {
		return;
	}
	ctx.pendingCompletionCandidate = null;

	if (candidate.repeatedResponse) {
		ctx.pendingPromiseStop = true;
		ctx.hiddenMessages.add(candidate.message);
		ctx.deferredAgentEndEvent = null;
		console.warn(
			`[LLM CompletionGuard] repeated completed assistant response — textHash=${hashText(candidate.text)}`,
		);
		return;
	}

	let decision: SemanticCompletionDecision | null = null;
	let lastFailure: CompletionJudgeAttemptError | null = null;
	try {
		const runtimeModel = ctx.agent.state.model as Model<any> & {
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
								userRequest: ctx.activeUserRequest,
								assistantResponse: candidate.text,
								toolTrace: ctx.completionToolTrace,
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
			hasUnresolvedToolFailure: ctx.lastToolFailure !== null,
			hasSuccessfulToolAfterFailure: ctx.successfulToolAfterFailure,
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

	ctx.pendingPromiseStop = decision.status === "incomplete";
	if (ctx.pendingPromiseStop) {
		ctx.hiddenMessages.add(candidate.message);
		ctx.deferredAgentEndEvent = null;
		return;
	}

	ctx.eventEmitter.emit({
		type: "completion_accepted",
		message: candidate.message,
		content: candidate.text,
	} as unknown as AgentEvent);

	if (ctx.deferredAgentEndEvent) {
		const deferred = ctx.deferredAgentEndEvent;
		ctx.deferredAgentEndEvent = null;
		ctx.emitUiEvent(deferred);
	}
}

export async function runWithEmptyStopRecovery(
	ctx: AgentCompletionContext,
	start: () => Promise<void>,
): Promise<void> {
	if (!ctx.agent) {
		throw new Error("Agent 未初始化");
	}

	await start();
	ctx.throwIfModelStreamFailed();
	if (!ctx.isEmptyStopRecoveryEnabled()) {
		return;
	}
	const candidate = ctx.pendingCompletionCandidate;
	if (!candidate || candidate.text.trim().length > 0) {
		return;
	}
	ctx.pendingCompletionCandidate = null;
	ctx.deferredAgentEndEvent = null;
	ctx.hiddenMessages.add(candidate.message);
	const recoveryMessage: SyntheticUserMessage = {
		role: "user",
		content: [{ type: "text", text: buildEmptyStopRecoveryMessage(1) }],
	};
	ctx.hiddenMessages.add(recoveryMessage);
	logInfo("[LLM EmptyStopRecovery] retrying empty terminal response — attempt=1/1");
	try {
		await ctx.agent.prompt(recoveryMessage as unknown as AgentMessage);
		ctx.throwIfModelStreamFailed();
		const recoveryCandidate = ctx.pendingCompletionCandidate as
			| typeof candidate
			| null;
		if (recoveryCandidate?.text.trim().length === 0) {
			ctx.pendingCompletionCandidate = null;
			ctx.lastToolFailure = {
				toolName: "empty-stop-recovery",
				reason: "The skill returned an empty terminal response twice.",
			};
			ctx.emitCompletionFailureReport();
		}
	} catch (error) {
		ctx.lastToolFailure = {
			toolName: "empty-stop-recovery",
			reason: error instanceof Error ? error.message : String(error),
		};
		ctx.emitCompletionFailureReport();
	}
}

export async function runWithCompletionGuard(
	ctx: AgentCompletionContext,
	start: () => Promise<void>,
): Promise<void> {
	if (!ctx.agent) {
		throw new Error("Agent 未初始化");
	}

	await start();
	ctx.throwIfModelStreamFailed();
	if (!ctx.isCompletionGuardEnabled()) {
		return;
	}
	await ctx.judgePendingCompletion();
	let recoveryAttempt = 0;

	while (
		ctx.pendingPromiseStop &&
		recoveryAttempt < DEFAULT_COMPLETION_RECOVERY_LIMIT
	) {
		recoveryAttempt += 1;
		ctx.pendingPromiseStop = false;

		const recoveryMessage: SyntheticUserMessage = {
			role: "user",
			content: [{
				type: "text",
				text: buildCompletionRecoveryMessage(
					"",
					ctx.lastToolFailure,
					recoveryAttempt,
				),
			}],
		};
		ctx.hiddenMessages.add(recoveryMessage);
		logInfo(
			`[LLM CompletionGuard] recovering incomplete stop — attempt=${recoveryAttempt}/${DEFAULT_COMPLETION_RECOVERY_LIMIT}`,
		);
		try {
			await ctx.agent.prompt(recoveryMessage as unknown as AgentMessage);
			ctx.throwIfModelStreamFailed();
			await ctx.judgePendingCompletion();
		} catch (error) {
			ctx.lastToolFailure = {
				toolName: "agent-recovery",
				reason: error instanceof Error ? error.message : String(error),
			};
			ctx.pendingPromiseStop = false;
			ctx.emitCompletionFailureReport();
			return;
		}
	}

	if (!ctx.pendingPromiseStop) {
		return;
	}

	ctx.pendingPromiseStop = false;
	ctx.emitCompletionFailureReport();
}

export function emitCompletionFailureReport(ctx: AgentCompletionContext): void {
	if (!ctx.agent) {
		return;
	}

	const report = buildCompletionFailureReport(ctx.lastToolFailure);
	const message = {
		role: "assistant",
		content: [{ type: "text", text: report }],
		stopReason: "stop",
		completionFailure: true,
	} as unknown as AgentMessage;
	ctx.agent.state.messages = [...ctx.agent.state.messages, message];

		const visibleMessages = ctx.getVisibleMessages();
		const events = [
			{ type: "message_start", message },
			{ type: "message_end", message },
			{ type: "turn_end", message, toolResults: [] },
			{ type: "agent_end", messages: visibleMessages },
	] as unknown as AgentEvent[];
	events.forEach((event) => {
		ctx.handleAgentEvent(event);
		ctx.eventEmitter.emit(event);
	});
	console.error(
		`[LLM EmptyStopRecovery] retry exhausted — tool=${ctx.lastToolFailure?.toolName ?? "unknown"}, exitCode=${ctx.lastToolFailure?.exitCode ?? "unknown"}, reason=${ctx.lastToolFailure?.reason ?? "empty terminal response"}`,
	);
}
