export const AGENT_TASK_RUNTIME_PROTOCOL_VERSION = 1 as const;
export const AGENT_TASK_RUNTIME_SCHEMA_VERSION = 1 as const;

export type AgentTaskExecutionMode = "chat" | "task_planning" | "task_running";

export type AgentTaskExecutionStatus =
	| "idle"
	| "planning"
	| "running"
	| "waiting_user"
	| "paused"
	| "failed"
	| "completed"
	| "cancelled";

export type AgentTaskAction = "stop" | "cancel" | "resume" | "retry" | "return_to_chat";

export type AgentTaskProjectPriorityV1 = "low" | "medium" | "high" | "urgent";

export interface AgentTaskProjectInputVersionV1 {
	readonly inputRef: string;
	readonly version: string;
}

/**
 * Optional project-owned metadata stored with the authoritative Task Runtime
 * state. The nested version lets later board features evolve these fields
 * without migrating legacy sessions during reads.
 */
export interface AgentTaskProjectMetadataV1 {
	readonly version: 1;
	readonly priority?: AgentTaskProjectPriorityV1;
	readonly semanticRefs: readonly string[];
	readonly inputVersions: readonly AgentTaskProjectInputVersionV1[];
}

export interface AgentTaskRuntimeErrorV1 {
	code: string;
	message: string;
	retryable: boolean;
}

export interface AgentTaskStepProjectionV1 {
	id: string;
	text: string;
	expectedOutput: string;
	status: "pending" | "active" | "done" | "skipped";
	evidenceRequired: boolean;
	evidenceCount: number;
}

export interface AgentTaskCriterionProjectionV1 {
	id: string;
	text: string;
	status: "pending" | "satisfied" | "failed" | "skipped";
	evidenceCount: number;
	note?: string;
}

export interface AgentTaskBlockerProjectionV1 {
	id: string;
	reason: string;
	blockedBy: "user" | "external" | "environment" | "dependency" | "ambiguity";
	neededToUnblock: string;
	resolved: boolean;
}

export interface AgentTaskProjectionV1 {
	version: 1;
	taskId: string;
	title: string;
	objective: string;
	status: "pending" | "active" | "blocked" | "review" | "done" | "cancelled";
	progress: number;
	currentStep?: string;
	nextAction?: string;
	steps: AgentTaskStepProjectionV1[];
	criteria: AgentTaskCriterionProjectionV1[];
	blockers: AgentTaskBlockerProjectionV1[];
	warnings: string[];
	evidenceCount: number;
	actions: AgentTaskAction[];
	revision: number;
	cursor: string | null;
	stateHash: string;
	truncated: boolean;
}

export interface AgentTaskExecutionStateV1 {
	schemaVersion: 1;
	mode: AgentTaskExecutionMode;
	status: AgentTaskExecutionStatus;
	projectMetadata?: AgentTaskProjectMetadataV1;
	/** Bounded idempotency receipts for controlled project metadata writes. */
	projectMetadataMutationReceipts?: readonly AgentTaskProjectMetadataMutationReceiptV1[];
	requestId?: string;
	draft?: {
		title?: string;
		objective: string;
		context?: string;
		acceptanceCriteria: string[];
	};
	taskId?: string;
	bridgeEpoch: number;
	expectedRevision: number;
	expectedCursor: string | null;
	branchId?: string;
	continuationCount: number;
	noProgressCount: number;
	lastProgressFingerprint?: string;
	lastError?: AgentTaskRuntimeErrorV1;
	projection?: AgentTaskProjectionV1;
	updatedAt: string;
}

export interface AgentTaskRuntimePersistenceV1 {
	schemaVersion: 1;
	execution: AgentTaskExecutionStateV1;
	/** `pi-tasks` 当前 Session branch 的 actual canonical entries。 */
	branchEntries: unknown[];
}

export interface CreateAgentTaskRequestV1 {
	version: 1;
	requestId: string;
	sessionId: string;
	objective: string;
	title?: string;
	context?: string;
	acceptanceCriteria?: string[];
}

export interface ControlAgentTaskRequestV1 {
	version: 1;
	requestId: string;
	sessionId: string;
	action: "stop" | "cancel" | "resume" | "retry";
	expectedRevision: number;
	expectedCursor: string | null;
	bridgeEpoch: number;
}

export interface GetAgentTaskRequestV1 {
	version: 1;
	sessionId: string;
}

export interface AgentTaskRuntimeSnapshotV1 {
	version: 1;
	sessionId: string;
	execution: AgentTaskExecutionStateV1;
	projection?: AgentTaskProjectionV1;
}

export interface AgentTaskRuntimeEventV1 {
	version: 1;
	type: "agent_task_runtime_state";
	sessionId: string;
	snapshot: AgentTaskRuntimeSnapshotV1;
}

export interface AgentTaskRuntimeResultV1 {
	version: 1;
	ok: boolean;
	snapshot?: AgentTaskRuntimeSnapshotV1;
	error?: AgentTaskRuntimeErrorV1;
}

export interface AgentTaskProjectMetadataMutationRequestV1 {
	readonly version: 1;
	readonly projectId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly requestId: string;
	readonly priority: AgentTaskProjectPriorityV1;
	readonly expectedRevision: number;
	readonly expectedCursor: string | null;
	readonly bridgeEpoch: number;
}

export interface AgentTaskProjectMetadataMutationReceiptV1 {
	readonly version: 1;
	readonly projectId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly requestId: string;
	readonly priority: AgentTaskProjectPriorityV1;
	readonly revisionBefore: number;
	readonly revisionAfter: number;
	readonly cursorBefore: string | null;
	readonly cursorAfter: string | null;
	readonly bridgeEpoch: number;
	readonly metadata: AgentTaskProjectMetadataV1;
	readonly acceptedAt: string;
}

/** Public CAS boundary for project-owned Task Runtime metadata. */
export interface ProjectTaskMetadataMutationPort {
	updateProjectTaskMetadata(
		input: AgentTaskProjectMetadataMutationRequestV1,
	): Promise<AgentTaskProjectMetadataMutationReceiptV1>;
}

export function createIdleAgentTaskExecutionState(
	bridgeEpoch = 1,
	updatedAt = new Date().toISOString(),
): AgentTaskExecutionStateV1 {
	return {
		schemaVersion: AGENT_TASK_RUNTIME_SCHEMA_VERSION,
		mode: "chat",
		status: "idle",
		bridgeEpoch,
		expectedRevision: 0,
		expectedCursor: null,
		continuationCount: 0,
		noProgressCount: 0,
		updatedAt,
	};
}

export function isAgentTaskRuntimePersistenceV1(
	value: unknown,
): value is AgentTaskRuntimePersistenceV1 {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Partial<AgentTaskRuntimePersistenceV1>;
	return candidate.schemaVersion === AGENT_TASK_RUNTIME_SCHEMA_VERSION
		&& Array.isArray(candidate.branchEntries)
		&& candidate.execution?.schemaVersion === AGENT_TASK_RUNTIME_SCHEMA_VERSION;
}


/**
 * Public, controlled mutation boundary for evidence created outside the Agent's
 * normal tool loop.  Implementations must retain the current Session scope.
 */
export interface AgentTaskEvidenceSubmissionV1 {
	version: 1;
	requestId: string;
	taskId: string;
	stepId?: string;
	summary: string;
	references: readonly string[];
	artifactRefs: readonly string[];
	verifier: string;
	contentHash: string;
}

export interface AgentTaskEvidenceReceiptV1 {
	version: 1;
	requestId: string;
	eventId: string;
	revisionBefore: number;
	revisionAfter: number;
	stateHash: string;
}

export interface AgentTaskEvidencePort {
	recordVerifiedEvidence(input: AgentTaskEvidenceSubmissionV1): Promise<AgentTaskEvidenceReceiptV1>;
}

export interface AgentTaskReviewRequestV1 {
	readonly version: 1;
	readonly requestId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly expectedRevision: number;
	readonly expectedCursor: string | null;
	/** The Task Session Host bridge epoch is the public mutation lease. */
	readonly leaseEpoch: number;
	readonly reason?: string;
}

export interface AgentTaskReviewPort {
	requestReview(input: AgentTaskReviewRequestV1): Promise<AgentTaskRuntimeSnapshotV1>;
	approveCompletion(input: AgentTaskReviewRequestV1): Promise<AgentTaskRuntimeSnapshotV1>;
	rejectReview(input: AgentTaskReviewRequestV1): Promise<AgentTaskRuntimeSnapshotV1>;
}
