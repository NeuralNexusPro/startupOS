/**
 * contract-execution-types — 协作执行账本的公共类型面——运行/工作项/阶段状态、执行端口与依赖注入契约。
 */

import type {
  HitlPolicy,
  SolutionExecutionContract,
  SolutionVersionRef,
} from '../../../lib/features/solution';

export type WorkItemStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'waiting_hitl'
  | 'verifying'
  | 'revision'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'reported'
  | 'needs_review';

export type AttemptStatus =
  | 'intent'
  | 'ready'
  | 'worker_received'
  | 'verifying'
  | 'outcome_pending'
  | 'evidence_pending'
  | 'waiting_hitl'
  | 'completed'
  | 'revision'
  | 'blocked'
  | 'needs_review'
  | 'failed';

export type CollaborationRunStatus = 'running' | 'paused' | 'canceled';
export type CollaborationRunTerminalStatus = 'completed' | 'failed' | 'canceled';

export type WorkItemExecutionStage =
  | 'readiness'
  | 'worker'
  | 'verifier'
  | 'outcome'
  | 'evidence';

export interface SolutionTaskBinding {
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly runId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly executionContractId: string;
  readonly contractHash: string;
  readonly taskRevision: number;
  readonly parentSessionId?: string;
}

export interface WorkItemUsage {
  readonly durationMs: number;
  readonly tokens: number;
}

export interface WorkerReceipt {
  readonly receiptId: string;
  readonly outputRefs: readonly string[];
  readonly outputHash: string;
  readonly usage?: WorkItemUsage;
  readonly checkpointRef?: string;
}

export interface VerifierResult {
  readonly status: 'passed' | 'failed' | 'placeholder';
  readonly verificationMethod?: string;
  readonly artifactRefs?: readonly string[];
  readonly resultRef?: string;
  readonly contentHash?: string;
  readonly contractHash?: string;
  readonly reason?: string;
}

export interface OutcomeReceipt {
  readonly receiptId: string;
  readonly status: 'accepted' | 'rejected' | 'unknown';
  readonly operationRef?: string;
  readonly factRefs?: readonly string[];
  readonly contentHash?: string;
  readonly reason?: string;
}

export interface EvidenceReceipt {
  readonly receiptId: string;
  readonly status: 'accepted' | 'unknown';
  readonly evidenceRef?: string;
  readonly revision?: number;
  readonly evidenceHash?: string;
}

export interface WorkItemReadinessReceipt {
  readonly receiptId: string;
  readonly status: 'ready' | 'blocked';
  readonly checkedAt: string;
  readonly inputRefs: readonly string[];
  readonly grantedPermissions: readonly string[];
  readonly targetAvailable: boolean;
  readonly stateRef?: string;
  readonly reason?: string;
}

export interface WorkItemStageClaim {
  readonly stage: WorkItemExecutionStage;
  readonly claimId: string;
  readonly hostId: string;
  readonly expectedWorkItemRevision: number;
  readonly claimedAt: string;
  readonly expiresAt: string;
  readonly idempotencyKey: string;
}

export interface WorkItemHandoffCandidate {
  readonly agentId: string;
  readonly displayName: string;
  readonly permissions: readonly string[];
}

export interface ListWorkItemHandoffCandidatesInput {
  readonly projectId: string;
  readonly runId: string;
  readonly workItemId: string;
}

export interface WorkItemHandoffInput extends ListWorkItemHandoffCandidatesInput {
  readonly targetAgentId: string;
  readonly requestId: string;
  readonly expectedRunRevision: number;
  readonly expectedWorkItemRevision: number;
  readonly expectedLeaseEpoch: number;
}

export interface WorkItemHandoffReceipt {
  readonly version: 1;
  readonly receiptId: string;
  readonly requestId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly workItemId: string;
  readonly previousAgentId: string;
  readonly assignedAgentId: string;
  readonly runRevisionBefore: number;
  readonly runRevisionAfter: number;
  readonly workItemRevisionBefore: number;
  readonly workItemRevisionAfter: number;
  readonly leaseEpochBefore: number;
  readonly leaseEpochAfter: number;
  readonly unknownExternalResults: 'manual_review';
  readonly acceptedAt: string;
}

export interface WorkItemHandoffResult {
  readonly receipt: WorkItemHandoffReceipt;
  readonly snapshot: CollaborationRunSnapshot;
}

export type HitlTrigger = HitlPolicy['trigger'];
export type HitlDecision = 'approve' | 'reject' | 'edit';

export interface WorkItemHitlRequest {
  readonly requestId: string;
  readonly policyId: string;
  readonly trigger: HitlTrigger;
  readonly approverRole: string;
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly parentSessionId?: string;
  readonly workItemId: string;
  readonly attemptId: string;
  readonly leaseEpoch: number;
  readonly question: string;
  readonly options: readonly HitlDecision[];
  readonly createdAt: string;
  status: 'pending' | 'resolved';
  updatedAt: string;
  decision?: HitlDecision;
  decisionRef?: string;
  editedPayloadHash?: string;
}

export interface AcceptedExternalOutputInput {
  readonly projectId: string;
  readonly runId: string;
  readonly workItemId: string;
  readonly attemptId: string;
  readonly leaseEpoch: number;
  readonly expectedWorkItemRevision: number;
  readonly requestId: string;
  readonly payloadHash: string;
  readonly workerReceipt: WorkerReceipt;
  readonly verifierResult: VerifierResult & {
    readonly status: 'passed';
    readonly verificationMethod: string;
    readonly artifactRefs: readonly string[];
    readonly resultRef: string;
    readonly contentHash: string;
    readonly contractHash: string;
  };
  readonly outcomeReceipt?: OutcomeReceipt & {
    readonly status: 'accepted';
  };
}

export interface AcceptedExternalOutputResult {
  readonly status: 'accepted' | 'recovered';
  readonly snapshot: CollaborationRunSnapshot;
  readonly workItemRevision: number;
  readonly evidenceRevision: number;
}

export interface WorkItemAttempt {
  readonly attemptId: string;
  readonly leaseEpoch: number;
  readonly requestId: string;
  readonly payloadHash: string;
  status: AttemptStatus;
  readonly createdAt: string;
  updatedAt: string;
  readinessReceipt?: WorkItemReadinessReceipt;
  workerReceipt?: WorkerReceipt;
  verifierResult?: VerifierResult;
  outcomeReceipt?: OutcomeReceipt;
  evidenceReceipt?: EvidenceReceipt;
  stageClaim?: WorkItemStageClaim;
  hitlRequests?: readonly WorkItemHitlRequest[];
  reason?: string;
}

export interface CollaborationWorkItem {
  readonly id: string;
  readonly binding: SolutionTaskBinding;
  readonly designNodeId: string;
  readonly assignedAgentId: string;
  readonly skillRefs: readonly string[];
  readonly dependsOn: readonly string[];
  readonly inputRefs: readonly string[];
  readonly outputRefs: readonly string[];
  status: WorkItemStatus;
  revision: number;
  leaseEpoch: number;
  readonly attempts: readonly WorkItemAttempt[];
  readonly handoffReceipts?: readonly WorkItemHandoffReceipt[];
}

export interface CollaborationRunSnapshot {
  readonly runId: string;
  readonly projectId: string;
  readonly binding: SolutionTaskBinding;
  readonly contract: SolutionExecutionContract;
  readonly workItems: readonly CollaborationWorkItem[];
  status: CollaborationRunStatus;
  terminalStatus?: CollaborationRunTerminalStatus;
  revision: number;
  readonly createdAt: string;
  updatedAt: string;
  failureReason?: string;
}

export interface StartCollaborationRunInput extends SolutionVersionRef {
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly taskRevision: number;
  readonly executionContractId: string;
  readonly contractHash: string;
  readonly inputRefs: readonly string[];
  readonly parentSessionId?: string;
}

export interface WorkItemExecutionRequest {
  readonly runId: string;
  readonly workItemId: string;
  readonly requestId: string;
  readonly payloadHash: string;
}

export interface WorkerExecutionInput {
  readonly run: CollaborationRunSnapshot;
  readonly workItem: CollaborationWorkItem;
  readonly attempt: WorkItemAttempt;
  readonly executionKey: string;
  readonly idempotencyKey: string;
}

export interface WorkItemReadinessInput {
  readonly run: CollaborationRunSnapshot;
  readonly workItem: CollaborationWorkItem;
  readonly attempt: WorkItemAttempt;
  readonly requiredInputRefs: readonly string[];
  readonly requiredPermissions: readonly string[];
}

export type WorkItemReadinessResult =
  | {
      readonly status: 'ready';
      readonly receiptId: string;
      readonly inputRefs: readonly string[];
      readonly grantedPermissions: readonly string[];
      readonly targetAvailable: true;
      readonly stateRef?: string;
    }
  | {
      readonly status: 'blocked';
      readonly receiptId: string;
      readonly inputRefs?: readonly string[];
      readonly grantedPermissions?: readonly string[];
      readonly targetAvailable?: boolean;
      readonly stateRef?: string;
      readonly reason: string;
    };

export interface VerifierExecutionInput extends WorkerExecutionInput {
  readonly workerReceipt: WorkerReceipt;
}

export interface OutcomeCommitInput extends VerifierExecutionInput {
  readonly verifierResult: VerifierResult;
  readonly idempotencyKey: string;
}

export interface EvidenceSubmissionInput extends OutcomeCommitInput {
  readonly outcomeReceipt: OutcomeReceipt;
  readonly evidenceHash: string;
}

export interface HitlOpenInput {
  readonly run: CollaborationRunSnapshot;
  readonly request: WorkItemHitlRequest;
  readonly idempotencyKey: string;
}

export interface ResolveWorkItemHitlInput {
  readonly runId: string;
  readonly requestId: string;
  readonly attemptId: string;
  readonly leaseEpoch: number;
  readonly decision: HitlDecision;
  readonly decisionRef: string;
  readonly editedPayloadHash?: string;
}

export interface WorkItemReadinessPort {
  check(input: WorkItemReadinessInput): Promise<WorkItemReadinessResult>;
}

export interface WorkItemWorkerPort {
  execute(input: WorkerExecutionInput): Promise<WorkerReceipt>;
}

export interface WorkItemVerifierPort {
  verify(input: VerifierExecutionInput): Promise<VerifierResult>;
}

export interface WorkItemOutcomePort {
  commit(input: OutcomeCommitInput): Promise<OutcomeReceipt>;
}

export interface WorkItemEvidenceSink {
  record(input: EvidenceSubmissionInput): Promise<EvidenceReceipt>;
}

export interface WorkItemHitlPort {
  open(input: HitlOpenInput): Promise<void>;
}

export interface CollaborationMutationLockPort {
  withLock<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

export interface CollaborationExecutionDependencies {
  readonly readiness?: WorkItemReadinessPort;
  readonly worker?: WorkItemWorkerPort;
  readonly verifier?: WorkItemVerifierPort;
  readonly outcome?: WorkItemOutcomePort;
  readonly evidenceSink?: WorkItemEvidenceSink;
  readonly hitl?: WorkItemHitlPort;
  readonly mutationLock?: CollaborationMutationLockPort;
  readonly hostId?: string;
  readonly claimTtlMs?: number;
  readonly clock?: () => Date;
}

export interface CollaborationExecutionPort {
  start(input: StartCollaborationRunInput): Promise<CollaborationRunSnapshot>;
  inspect(runId: string): Promise<CollaborationRunSnapshot>;
  findByTask(
    projectId: string,
    parentTaskId: string,
  ): Promise<CollaborationRunSnapshot | null>;
  pause(runId: string): Promise<CollaborationRunSnapshot>;
  resume(runId: string): Promise<CollaborationRunSnapshot>;
  cancel(runId: string): Promise<CollaborationRunSnapshot>;
  executeWorkItem(
    input: WorkItemExecutionRequest,
  ): Promise<CollaborationRunSnapshot>;
  recover(runId: string): Promise<CollaborationRunSnapshot>;
  resolveHitl(
    input: ResolveWorkItemHitlInput,
  ): Promise<CollaborationRunSnapshot>;
  reconcileAcceptedOutput(
    input: AcceptedExternalOutputInput,
  ): Promise<AcceptedExternalOutputResult>;
  listWorkItemHandoffCandidates(
    input: ListWorkItemHandoffCandidatesInput,
  ): Promise<readonly WorkItemHandoffCandidate[]>;
  handoffWorkItem(input: WorkItemHandoffInput): Promise<WorkItemHandoffResult>;
}
