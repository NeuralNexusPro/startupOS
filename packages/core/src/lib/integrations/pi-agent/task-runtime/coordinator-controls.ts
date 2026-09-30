// coordinator 任务控制动作方法体（pause/cancel/resume/retry），纯函数，接收 coordinator ctx。

import type {
	AgentTaskRuntimePersistenceV1,
	AgentTaskRuntimeSnapshotV1,
	CreateAgentTaskRequestV1,
} from "./types";
import type {
	TaskSessionHost,
	AgentTaskRuntimeCoordinatorOptions,
} from "./coordinator-types";
import {
	AgentTaskRuntimeConflictError,
	isActiveExecution,
} from "./coordinator-shared";

export interface CoordinatorControlsCtx {
	options: AgentTaskRuntimeCoordinatorOptions;
	// Live access to the coordinator's mutable state (getter/setter), so control
	// actions never observe a stale object replaced by updateFromProjection.
	get state(): AgentTaskRuntimePersistenceV1;
	set state(value: AgentTaskRuntimePersistenceV1);
	requireHost(): TaskSessionHost;
	installTaskTools(): void;
	restoreBaselineTools(): void;
	publishState(): Promise<void>;
	startContinuationLoop(): void;
	createTask(request: CreateAgentTaskRequestV1): Promise<AgentTaskRuntimeSnapshotV1>;
	// 可变字段访问器（对应原方法体语句）：
	// - bumpContinuationGeneration() ← `this.continuationGeneration += 1`（pauseTask/cancelTask）
	// - resetRunningPromise() ← `this.runningPromise = null`（pauseTask/cancelTask）
	bumpContinuationGeneration(): void;
	resetRunningPromise(): void;
}

export async function runPauseTask(ctx: CoordinatorControlsCtx): Promise<void> {
	if (ctx.state.execution.mode !== "task_running" || !isActiveExecution(ctx.state.execution.status)) {
		throw new AgentTaskRuntimeConflictError("只有活动任务可以停止");
	}
	ctx.bumpContinuationGeneration();
	ctx.resetRunningPromise();
	ctx.options.agent.abort();
	ctx.state.execution.status = "paused";
	ctx.state.execution.lastError = {
		code: "TASK_PAUSED_BY_USER",
		message: "用户停止了当前任务执行，进度已保留",
		retryable: true,
	};
	ctx.state.execution.updatedAt = new Date().toISOString();
	ctx.restoreBaselineTools();
	await ctx.publishState();
}

export async function runCancelTask(ctx: CoordinatorControlsCtx, requestId: string): Promise<void> {
	ctx.bumpContinuationGeneration();
	ctx.resetRunningPromise();
	ctx.options.agent.abort();
	const projection = ctx.state.execution.projection;
	if (projection && projection.status !== "done" && projection.status !== "cancelled") {
		const scope = ctx.requireHost().getScope();
		await ctx.requireHost().invoke({
			version: 1,
			requestId,
			toolName: "task_update",
			scope: {
				sessionId: ctx.options.sessionId,
				expectedCursor: scope.cursor,
				expectedRevision: scope.revision,
				bridgeEpoch: scope.bridgeEpoch,
			},
			input: {
				task_id: projection.taskId,
				status: "cancelled",
				reason: "用户取消任务",
				activity: "用户从 Task 卡片取消任务",
			},
		});
	}
	ctx.state.execution.mode = "chat";
	ctx.state.execution.status = "cancelled";
	ctx.state.execution.updatedAt = new Date().toISOString();
	ctx.restoreBaselineTools();
	await ctx.publishState();
}

export function runResumeTask(ctx: CoordinatorControlsCtx): void {
	if (ctx.state.execution.status !== "paused" && ctx.state.execution.status !== "waiting_user") {
		throw new AgentTaskRuntimeConflictError("只有暂停或等待用户的任务可以恢复");
	}
	ctx.state.execution.mode = "task_running";
	ctx.state.execution.status = "running";
	ctx.state.execution.lastError = undefined;
	ctx.state.execution.updatedAt = new Date().toISOString();
	ctx.installTaskTools();
	void ctx.publishState();
	ctx.startContinuationLoop();
}

export async function runRetryTask(ctx: CoordinatorControlsCtx, requestId: string): Promise<void> {
	const draft = ctx.state.execution.draft;
	if (ctx.state.execution.status !== "failed") {
		throw new AgentTaskRuntimeConflictError("只有失败的任务可以重试");
	}
	if (ctx.state.execution.projection) {
		ctx.state.execution.mode = "task_running";
		ctx.state.execution.status = "running";
		ctx.state.execution.lastError = undefined;
		ctx.state.execution.updatedAt = new Date().toISOString();
		ctx.installTaskTools();
		await ctx.publishState();
		ctx.startContinuationLoop();
		return;
	}
	if (!draft) {
		throw new AgentTaskRuntimeConflictError("失败任务没有可重试的草稿或 canonical state");
	}
	await ctx.createTask({
		version: 1,
		requestId,
		sessionId: ctx.options.sessionId,
		objective: draft.objective,
		title: draft.title,
		context: draft.context,
		acceptanceCriteria: draft.acceptanceCriteria,
	});
}

export function buildContinuationPromptText(): string {
	return [
		"[Internal Task Runtime] 继续当前 canonical pi-tasks 任务。",
		"先调用 task_focus 或 task_next 获取唯一当前步骤，只执行该步骤。",
		"完成可验证工作后先用 task_evidence 记录可复现证据，再用 task_update 更新步骤。",
		"任务规划的最后一步必须是最终交付：读取或确认最终交付物，整理关键结论、文件路径/链接、证据和限制，并直接在当前会话中向用户呈现；仅写入文件或调用 task_complete 不算完成交付。",
		"只有全部步骤和验收标准具备有效证据且无 blocker 时才能调用 task_complete。",
		"若确实需要用户或外部条件，记录 blocker 并清楚说明所需输入；不要仅承诺稍后继续。",
	].join("\n\n");
}

export async function runInvokeReadOnlyTaskTool(ctx: CoordinatorControlsCtx, toolName: "task_next" | "task_focus", requestId: string): Promise<string> {
	const host = ctx.requireHost();
	const tool = host.getAgentTools().find((candidate) => candidate.name === toolName);
	if (!tool) {
		throw new Error(`Task read-only tool is not active: ${toolName}`);
	}
	// Read-only tools are intentionally invoked through their agent-tool
	// descriptor.  The adapter command contract only allowlists mutations;
	// routing task_next/task_focus through host.invoke would be rejected.
	const result = await tool.execute(requestId, {});
	if (result && typeof result === "object" && "content" in result) {
		const content = (result as { content?: unknown }).content;
		if (Array.isArray(content)) {
			const text = content
				.filter((block): block is { type?: string; text?: string } =>
					Boolean(block) && typeof block === "object" && typeof (block as { text?: unknown }).text === "string")
				.map((block) => block.text ?? "")
				.join("\n")
				.trim();
			if (text) return text;
		}
	}
	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
}
