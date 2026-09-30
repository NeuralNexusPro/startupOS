// coordinator 协议命令方法体（Project metadata / Evidence / Review），纯函数，接收 coordinator ctx。

import {
	AGENT_TASK_RUNTIME_PROTOCOL_VERSION,
	type AgentTaskEvidenceReceiptV1,
	type AgentTaskEvidenceSubmissionV1,
	type AgentTaskExecutionStateV1,
	type AgentTaskProjectionV1,
	type AgentTaskProjectMetadataMutationReceiptV1,
	type AgentTaskProjectMetadataMutationRequestV1,
	type AgentTaskReviewRequestV1,
	type AgentTaskRuntimePersistenceV1,
	type AgentTaskRuntimeSnapshotV1,
} from "./types";
import {
	projectPiTaskSnapshot,
	type PiTaskSnapshotLike,
} from "./projection";
import type {
	TaskSessionHost,
	AgentTaskRuntimeCoordinatorOptions,
} from "./coordinator-types";
import {
	AgentTaskRuntimeConflictError,
	AgentTaskRuntimeProtocolError,
} from "./coordinator-shared";

export interface CoordinatorCommandsCtx {
	options: AgentTaskRuntimeCoordinatorOptions;
	// Live access to the coordinator's mutable state (getter/setter): the moved
	// bodies read `ctx.state` after `updateFromProjection` may have replaced it.
	get state(): AgentTaskRuntimePersistenceV1;
	set state(value: AgentTaskRuntimePersistenceV1);
	initialize(): Promise<AgentTaskRuntimeSnapshotV1>;
	requireHost(): TaskSessionHost;
	updateFromProjection(
		projection: AgentTaskProjectionV1,
		mode: AgentTaskExecutionStateV1["mode"],
		fullTurnBaseline?: string,
	): void;
	publishState(): Promise<void>;
	getSnapshot(): AgentTaskRuntimeSnapshotV1;
	completionInput(
		projection: AgentTaskProjectionV1,
		snapshot: PiTaskSnapshotLike,
	): {
		readonly evidenceIds: readonly string[];
		readonly criterionResults: readonly Record<string, unknown>[];
	};
}

export async function runMutateProjectTaskMetadata(
	ctx: CoordinatorCommandsCtx,
	input: AgentTaskProjectMetadataMutationRequestV1,
): Promise<AgentTaskProjectMetadataMutationReceiptV1> {
	await ctx.initialize();
	if (input.version !== AGENT_TASK_RUNTIME_PROTOCOL_VERSION
		|| !input.projectId.trim() || !input.sessionId.trim()
		|| !input.taskId.trim() || !input.requestId.trim()) {
		throw new AgentTaskRuntimeProtocolError("Project metadata 请求缺少必填字段");
	}
	if (input.sessionId !== ctx.options.sessionId
		|| (ctx.options.projectId !== undefined && input.projectId !== ctx.options.projectId)) {
		throw new AgentTaskRuntimeConflictError("Project metadata 请求跨越了 Project 或 Session");
	}
	const receipts = ctx.state.execution.projectMetadataMutationReceipts ?? [];
	const recorded = receipts.find((receipt) => receipt.requestId === input.requestId);
	if (recorded) {
		if (recorded.projectId !== input.projectId || recorded.sessionId !== input.sessionId
			|| recorded.taskId !== input.taskId || recorded.priority !== input.priority
			|| recorded.revisionBefore !== input.expectedRevision
			|| recorded.cursorBefore !== input.expectedCursor
			|| recorded.bridgeEpoch !== input.bridgeEpoch) {
			throw new AgentTaskRuntimeConflictError("Project metadata requestId 已用于不同请求");
		}
		return structuredClone(recorded);
	}
	const host = ctx.requireHost();
	const scope = host.getScope();
	const projection = projectPiTaskSnapshot(host.getSnapshot());
	if (!projection || projection.taskId !== input.taskId) {
		throw new AgentTaskRuntimeConflictError("Project metadata 只能修改当前 Session 的活动任务");
	}
	if (scope.revision !== input.expectedRevision || scope.cursor !== input.expectedCursor
		|| scope.bridgeEpoch !== input.bridgeEpoch) {
		throw new AgentTaskRuntimeConflictError("Project metadata revision、cursor 或 epoch 已过期");
	}
	await host.invoke({
		version: 1,
		requestId: input.requestId,
		toolName: "task_update",
		scope: {
			sessionId: scope.sessionId,
			expectedCursor: scope.cursor,
			expectedRevision: scope.revision,
			bridgeEpoch: scope.bridgeEpoch,
		},
		input: {
			task_id: input.taskId,
			activity: `Project priority set to ${input.priority}`,
			scope: "within_step",
		},
	});
	const nextScope = host.getScope();
	const updated = projectPiTaskSnapshot(host.getSnapshot());
	if (!updated || updated.taskId !== input.taskId
		|| nextScope.revision <= scope.revision || nextScope.cursor === scope.cursor
		|| nextScope.bridgeEpoch !== scope.bridgeEpoch) {
		throw new AgentTaskRuntimeProtocolError("Project metadata mutation 未推进权威 Task scope");
	}
	const previous = ctx.state.execution.projectMetadata;
	const metadata = {
		version: 1 as const,
		priority: input.priority,
		semanticRefs: [...(previous?.semanticRefs ?? [])],
		inputVersions: (previous?.inputVersions ?? []).map((entry) => ({ ...entry })),
	};
	const acceptedAt = new Date().toISOString();
	const receipt: AgentTaskProjectMetadataMutationReceiptV1 = {
		version: 1,
		projectId: input.projectId,
		sessionId: input.sessionId,
		taskId: input.taskId,
		requestId: input.requestId,
		priority: input.priority,
		revisionBefore: scope.revision,
		revisionAfter: nextScope.revision,
		cursorBefore: scope.cursor,
		cursorAfter: nextScope.cursor,
		bridgeEpoch: scope.bridgeEpoch,
		metadata,
		acceptedAt,
	};
	ctx.updateFromProjection(updated, updated.status === "done" || updated.status === "cancelled" ? "chat" : "task_running");
	ctx.state.execution = {
		...ctx.state.execution,
		projectMetadata: metadata,
		projectMetadataMutationReceipts: [...receipts, receipt].slice(-100),
		updatedAt: acceptedAt,
	};
	await ctx.publishState();
	return structuredClone(receipt);
}

/** Controlled public Evidence command that retains the current Session scope. */
export async function runRecordVerifiedEvidence(ctx: CoordinatorCommandsCtx, input: AgentTaskEvidenceSubmissionV1): Promise<AgentTaskEvidenceReceiptV1> {
	await ctx.initialize();
	if (input.version !== AGENT_TASK_RUNTIME_PROTOCOL_VERSION) {
		throw new AgentTaskRuntimeProtocolError("不支持的 Evidence protocol version");
	}
	if (!input.requestId.trim() || !input.taskId.trim() || !input.summary.trim()
		|| !input.references.length || !input.artifactRefs.length || !input.verifier.trim() || !input.contentHash.trim()) {
		throw new AgentTaskRuntimeProtocolError("Evidence 请求缺少必填字段");
	}
	const projection = ctx.state.execution.projection;
	if (!projection || projection.taskId !== input.taskId) {
		throw new AgentTaskRuntimeConflictError("Evidence 只能写入当前 Agent Session 的活动任务");
	}
	const host = ctx.requireHost();
	const scope = host.getScope();
	const result = await host.invoke({
		version: 1,
		requestId: input.requestId,
		toolName: "task_evidence",
		scope: {
			sessionId: scope.sessionId,
			expectedCursor: scope.cursor,
			expectedRevision: scope.revision,
			bridgeEpoch: scope.bridgeEpoch,
		},
		input: {
			task_id: input.taskId,
			type: "agent_output",
			level: "runtime",
			summary: input.summary,
			passed: "true",
			references: [...input.references],
			...(input.stepId ? { step_ids: [input.stepId] } : {}),
			quality: {
				source: "collaboration-runtime",
				reproducible: true,
				verifier: input.verifier,
				artifactRefs: [...input.artifactRefs],
				observedOutput: input.contentHash,
			},
		},
	});
	const receipt = result as Partial<AgentTaskEvidenceReceiptV1> & { isError?: boolean };
	if (receipt.isError || typeof receipt.eventId !== "string" || typeof receipt.revisionBefore !== "number"
		|| typeof receipt.revisionAfter !== "number" || typeof receipt.stateHash !== "string") {
		throw new AgentTaskRuntimeProtocolError("task_evidence 未返回可确认的回执");
	}
	return { version: 1, requestId: input.requestId, eventId: receipt.eventId, revisionBefore: receipt.revisionBefore, revisionAfter: receipt.revisionAfter, stateHash: receipt.stateHash };
}

export async function runMutateReview(
	ctx: CoordinatorCommandsCtx,
	input: AgentTaskReviewRequestV1,
	action: "request_review" | "approve_completion" | "reject_review",
): Promise<AgentTaskRuntimeSnapshotV1> {
	await ctx.initialize();
	if (input.version !== AGENT_TASK_RUNTIME_PROTOCOL_VERSION || !input.requestId.trim()
		|| !input.sessionId.trim() || !input.taskId.trim()) {
		throw new AgentTaskRuntimeProtocolError("Review 请求缺少必填字段");
	}
	if (input.sessionId !== ctx.options.sessionId) {
		throw new AgentTaskRuntimeConflictError("Review 请求跨越了 Agent Session");
	}
	const host = ctx.requireHost();
	const scope = host.getScope();
	if (scope.revision !== input.expectedRevision || scope.cursor !== input.expectedCursor
		|| scope.bridgeEpoch !== input.leaseEpoch) {
		throw new AgentTaskRuntimeConflictError("Review 请求的 revision、cursor 或 lease 已过期");
	}
	const projection = projectPiTaskSnapshot(host.getSnapshot());
	if (!projection || projection.taskId !== input.taskId) {
		throw new AgentTaskRuntimeConflictError("Review 只能修改当前 Agent Session 的活动任务");
	}
	if (action === "request_review" && projection.status !== "active") {
		throw new AgentTaskRuntimeConflictError("只有 active Task 可以请求审核");
	}
	if ((action === "approve_completion" || action === "reject_review")
		&& projection.status !== "review") {
		throw new AgentTaskRuntimeConflictError("只有 review Task 可以审核");
	}

	let toolName = "task_update";
	let toolInput: Record<string, unknown> = {
		task_id: input.taskId,
		status: action === "request_review" ? "review" : "active",
		activity: action === "request_review" ? "请求 Task 完成审核" : "审核拒绝，Task 返回执行",
		scope: "within_step",
		...(input.reason?.trim() ? { reason: input.reason.trim(), note: input.reason.trim() } : {}),
	};
	if (action === "approve_completion") {
		const completion = ctx.completionInput(projection, host.getSnapshot());
		toolName = "task_complete";
		toolInput = {
			task_id: input.taskId,
			summary: input.reason?.trim() || "Task review approved with verified evidence",
			evidence_ids: completion.evidenceIds,
			criterion_results: completion.criterionResults,
		};
	}
	await host.invoke({
		version: 1,
		requestId: input.requestId,
		toolName,
		scope: {
			sessionId: scope.sessionId,
			expectedCursor: input.expectedCursor,
			expectedRevision: input.expectedRevision,
			bridgeEpoch: input.leaseEpoch,
		},
		input: toolInput,
	});
	const updated = projectPiTaskSnapshot(host.getSnapshot());
	if (!updated || updated.taskId !== input.taskId) {
		throw new AgentTaskRuntimeProtocolError("Review mutation 未返回当前 Task 投影");
	}
	ctx.updateFromProjection(
		updated,
		updated.status === "done" || updated.status === "cancelled" ? "chat" : "task_running",
	);
	await ctx.publishState();
	return ctx.getSnapshot();
}

export function runCompletionInput(
	projection: AgentTaskProjectionV1,
	snapshot: PiTaskSnapshotLike,
): {
	readonly evidenceIds: readonly string[];
	readonly criterionResults: readonly Record<string, unknown>[];
} {
	const gaps: string[] = [];
	for (const blocker of projection.blockers) {
		if (!blocker.resolved) gaps.push(`blocker:${blocker.id}`);
	}
	for (const step of projection.steps) {
		if (step.status !== "done" && step.status !== "skipped") gaps.push(`step:${step.id}:status`);
		if (step.evidenceRequired && step.status === "done" && step.evidenceCount < 1) gaps.push(`step:${step.id}:evidence`);
	}
	for (const criterion of projection.criteria) {
		if (criterion.status !== "satisfied" && criterion.status !== "skipped") {
			gaps.push(`criterion:${criterion.id}:status`);
		}
		if (criterion.status === "satisfied" && criterion.evidenceCount < 1) {
			gaps.push(`criterion:${criterion.id}:evidence`);
		}
	}
	if (projection.evidenceCount < 1) gaps.push("task:evidence");
	if (gaps.length > 0) {
		throw new AgentTaskRuntimeConflictError(`TASK_EVIDENCE_GATE_FAILED:${gaps.join(",")}`);
	}
	const state = snapshot.state && typeof snapshot.state === "object"
		? snapshot.state as Record<string, unknown>
		: {};
	const tasks = state["tasks"] && typeof state["tasks"] === "object"
		? state["tasks"] as Record<string, unknown>
		: {};
	const task = tasks[projection.taskId] && typeof tasks[projection.taskId] === "object"
		? tasks[projection.taskId] as Record<string, unknown>
		: {};
	const evidenceIds = Array.isArray(task["evidence"])
		? task["evidence"].flatMap((item) => item && typeof item === "object"
			&& typeof (item as { id?: unknown }).id === "string" ? [(item as { id: string }).id] : [])
		: [];
	if (evidenceIds.length < 1) {
		throw new AgentTaskRuntimeConflictError("TASK_EVIDENCE_GATE_FAILED:task:evidence_ids");
	}
	const criterionResults = Array.isArray(task["acceptanceCriteria"])
		? task["acceptanceCriteria"].flatMap((item) => {
			if (!item || typeof item !== "object") return [];
			const criterion = item as Record<string, unknown>;
			if (typeof criterion["id"] !== "string" || typeof criterion["status"] !== "string") return [];
			return [{
				criterionId: criterion["id"],
				status: criterion["status"],
				evidenceIds: Array.isArray(criterion["evidenceIds"])
					? criterion["evidenceIds"].filter((id): id is string => typeof id === "string")
					: [],
				...(typeof criterion["note"] === "string" ? { note: criterion["note"] } : {}),
			}];
		})
		: [];
	return { evidenceIds, criterionResults };
}
