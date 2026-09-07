export declare const TASK_EVENT_CUSTOM_TYPE = "pi-tasks:event";
export declare const TASK_SNAPSHOT_CUSTOM_TYPE = "pi-tasks:snapshot";
export type TaskStatus = "pending" | "active" | "blocked" | "review" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskStepStatus = "pending" | "active" | "done" | "skipped";
export type TaskStepGranularityStatus = "needs_breakdown" | "breaking_down" | "atomic" | "deferred";
export type VerificationLevel = "not_verified" | "static_read" | "unit_test" | "integration_test" | "e2e_smoke" | "release_grade_e2e" | "pi_dogfood" | "external_unverified";
export type EvidenceType = "test" | "command" | "review" | "file" | "commit" | "dogfood" | "user_acceptance" | "external" | "note";
export interface TaskEvidence {
    id: string;
    taskId: string;
    type: EvidenceType;
    level: VerificationLevel;
    summary: string;
    passed: boolean | "unknown";
    references: string[];
    quality: EvidenceQuality;
    createdAt: string;
}
export interface EvidenceQuality {
    source: string;
    reproducible: boolean;
    verifier: "agent" | "tool" | "user" | "external";
    command?: string;
    artifactRefs: string[];
    observedOutput?: string;
}
export interface AcceptanceCriterion {
    id: string;
    text: string;
    status: "pending" | "satisfied" | "failed" | "skipped";
    evidenceIds: string[];
    note?: string;
}
export interface TaskDecision {
    id: string;
    taskId: string;
    question: string;
    decision: string;
    decidedBy: "user" | "agent";
    rationale?: string;
    impact?: string;
    createdAt: string;
}
export interface TaskBlocker {
    id: string;
    taskId: string;
    reason: string;
    blockedBy: "user" | "external" | "environment" | "dependency" | "ambiguity";
    neededToUnblock: string;
    since: string;
    resolvedAt?: string;
}
export interface TaskStep {
    id: string;
    taskId: string;
    text: string;
    expectedOutput: string;
    status: TaskStepStatus;
    decompositionStatus: TaskStepGranularityStatus;
    granularityCheck: TaskGranularityCheck;
    parentStepId?: string;
    childStepIds: string[];
    depth: number;
    evidenceIds: string[];
    criterionIds: string[];
    evidenceRequired: boolean;
    allowedActions: string[];
    planQuality: PlanQuality;
    note?: string;
    startedAt?: string;
    completedAt?: string;
}
export interface TaskStepInput {
    text: string;
    expectedOutput: string;
    criterionIds?: string[];
    evidenceRequired?: boolean;
    allowedActions?: string[];
    decompositionStatus?: TaskStepGranularityStatus;
    granularityCheck?: TaskGranularityCheck;
    planQuality?: PlanQuality;
}
export interface PlanQuality {
    score: number;
    issues: string[];
}
export interface TaskGranularityCheck {
    isAtomic: boolean;
    reason: string;
    canBeDoneInOneAgentAction: boolean;
    hasSingleObservableOutput: boolean;
    hasSingleVerificationMethod: boolean;
    hasNoHiddenSubtasks: boolean;
}
export interface Task {
    id: string;
    title: string;
    objective: string;
    status: TaskStatus;
    priority: TaskPriority;
    progress: number;
    currentStep?: string;
    nextAction?: string;
    planSteps: TaskStep[];
    acceptanceCriteria: AcceptanceCriterion[];
    evidence: TaskEvidence[];
    decisions: TaskDecision[];
    blockers: TaskBlocker[];
    parentId?: string;
    dependencies: string[];
    tags: string[];
    linkedFiles: string[];
    linkedCommits: string[];
    confidence?: number;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    cancelledAt?: string;
    completionSummary?: string;
    warnings: string[];
}
export interface TaskResumeStep {
    id: string;
    text: string;
    status: TaskStepStatus;
    decompositionStatus: TaskStepGranularityStatus;
}
export interface TaskResumeContext {
    activeTaskId?: string;
    taskId?: string;
    title?: string;
    status?: TaskStatus;
    progress?: number;
    mode?: TaskExecutionMode;
    recommendedTool?: string;
    blockedTools?: string[];
    minimumParams?: Record<string, unknown>;
    currentStepId?: string;
    currentStepText?: string;
    currentStepLineage: TaskResumeStep[];
    expectedOutput?: string;
    evidenceRequired?: boolean;
    evidenceIds: string[];
    criterionIds: string[];
    allowedActions: string[];
    nextAllowedActions: string[];
    verificationGaps: string[];
    blockers: string[];
    decisions: string[];
    warnings: string[];
    resumeInstruction: string;
}
export type TaskExecutionMode = "planning" | "decomposing" | "executing" | "verifying" | "blocked" | "completing";
export interface TaskState {
    tasks: Record<string, Task>;
    activeTaskId?: string;
    events: TaskEvent[];
    lastUpdatedAt?: string;
    warnings: string[];
}
export interface TaskEventBase {
    version: 1;
    id: string;
    type: string;
    taskId: string;
    createdAt: string;
    source: "tool" | "command" | "system" | "import";
}
export interface TaskCreatedEvent extends TaskEventBase {
    type: "task.created";
    title: string;
    objective: string;
    acceptanceCriteria: string[];
    initialSteps?: string[];
    planSteps?: TaskStepInput[];
    priority?: TaskPriority;
    tags?: string[];
    parentId?: string;
    dependencies?: string[];
    linkedFiles?: string[];
    activate?: boolean;
}
export interface TaskUpdatedEvent extends TaskEventBase {
    type: "task.updated";
    status?: TaskStatus;
    progress?: number;
    currentStep?: string;
    nextAction?: string;
    stepId?: string;
    stepStatus?: TaskStepStatus;
    stepEvidenceIds?: string[];
    activity?: string;
    scope?: "within_step" | "scope_change" | "off_plan";
    scopeReason?: string;
    note?: string;
    blocker?: Omit<TaskBlocker, "id" | "taskId" | "since" | "resolvedAt">;
    resolveWarnings?: string[];
    reason?: string;
}
export interface TaskStepsDecomposedEvent extends TaskEventBase {
    type: "task.steps_decomposed";
    parentStepId: string;
    childSteps: TaskStepInput[];
    reason: string;
}
export interface TaskEvidenceAddedEvent extends TaskEventBase {
    type: "task.evidence_added";
    evidence: Omit<TaskEvidence, "taskId" | "createdAt" | "quality"> & {
        quality?: EvidenceQuality;
    };
    criterionIds?: string[];
    stepIds?: string[];
    overrideReason?: string;
}
export interface TaskDecisionRecordedEvent extends TaskEventBase {
    type: "task.decision_recorded";
    decision: Omit<TaskDecision, "taskId" | "createdAt">;
}
export interface TaskCompletedEvent extends TaskEventBase {
    type: "task.completed";
    summary: string;
    evidenceIds: string[];
    criterionResults?: Array<{
        criterionId: string;
        status: AcceptanceCriterion["status"];
        evidenceIds?: string[];
        note?: string;
    }>;
}
export interface TaskCancelledEvent extends TaskEventBase {
    type: "task.cancelled";
    reason: string;
}
export interface TaskSnapshotEvent extends TaskEventBase {
    type: "task.snapshot";
    state: Omit<TaskState, "events">;
    resume: TaskResumeContext;
    reason: "compaction" | "resume_repair" | "manual";
}
export type TaskEvent = TaskCreatedEvent | TaskUpdatedEvent | TaskStepsDecomposedEvent | TaskEvidenceAddedEvent | TaskDecisionRecordedEvent | TaskCompletedEvent | TaskCancelledEvent | TaskSnapshotEvent;
export interface ReplayResult {
    state: TaskState;
    malformedEvents: string[];
}
export declare function createEmptyState(): TaskState;
