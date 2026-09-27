import { RunObserver } from "./run-observation";
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs, type Dirent } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { getDataRoot } from '../../../lib/paths';
import type {
  ContractIntegrityResult,
  HitlPolicy,
  SolutionExecutionContract,
  SolutionExecutionContractPort,
  SolutionVersionRef,
} from '../../../lib/features/solution';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;
const TERMINAL_ATTEMPT_STATUSES = new Set<AttemptStatus>([
  'completed',
  'revision',
  'blocked',
  'needs_review',
  'failed',
]);
const DEFAULT_CLAIM_TTL_MS = 30_000;

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

export class CollaborationReconciliationError extends Error {
  constructor(
    readonly code:
      | 'WORK_ITEM_SCOPE_MISMATCH'
      | 'WORK_ITEM_REVISION_CONFLICT'
      | 'OLD_LEASE_EPOCH'
      | 'UNKNOWN_EXTERNAL_RECEIPT',
    message: string,
  ) {
    super(message);
  }
}

export class CollaborationMutationConflictError extends Error {
  readonly code = 'COLLABORATION_MUTATION_CONFLICT';

  constructor(message: string) {
    super(message);
  }
}

export class CollaborationWorkItemHandoffError extends Error {
  constructor(
    readonly code:
      | 'HANDOFF_SCOPE_MISMATCH'
      | 'HANDOFF_REQUEST_ID_CONFLICT'
      | 'HANDOFF_REVISION_CONFLICT'
      | 'HANDOFF_LEASE_CONFLICT'
      | 'HANDOFF_TARGET_UNAUTHORIZED'
      | 'HANDOFF_TARGET_UNCHANGED'
      | 'HANDOFF_TERMINAL'
      | 'STALE_LEASE_EPOCH',
    message: string,
  ) {
    super(message);
  }
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

function identifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

function nonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new TypeError(`${field} must not be empty`);
}

function assertIntegrity(result: ContractIntegrityResult): void {
  if (result.valid !== true) throw new Error(result.message);
}

function workItemId(runId: string, designNodeId: string): string {
  return `${runId}:${designNodeId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function updateItem(
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  timestamp: string,
): CollaborationRunSnapshot {
  return aggregateRun({
    ...snapshot,
    workItems: snapshot.workItems.map((candidate) =>
      candidate.id === item.id ? item : candidate
    ),
    revision: snapshot.revision + 1,
    updatedAt: timestamp,
  });
}

function aggregateRun(snapshot: CollaborationRunSnapshot): CollaborationRunSnapshot {
  if (snapshot.status === 'canceled' || snapshot.status === 'paused') {
    return snapshot;
  }
  if (
    snapshot.workItems.length > 0
    && snapshot.workItems.every((item) => item.status === 'completed')
  ) {
    return { ...snapshot, terminalStatus: 'completed' };
  }
  if (snapshot.workItems.some((item) => item.status === 'failed')) {
    return { ...snapshot, terminalStatus: 'failed' };
  }
  return { ...snapshot, status: 'running' };
}

function createWorkItems(
  contract: SolutionExecutionContract,
  binding: SolutionTaskBinding,
  inputRefs: readonly string[],
): CollaborationWorkItem[] {
  const agentById = new Map(contract.agents.map((agent) => [agent.agentId, agent]));
  const skillById = new Map(contract.skills.map((skill) => [skill.skillId, skill]));
  return contract.topology.nodes.map((node) => {
    const incoming = contract.topology.edges
      .filter((edge) => edge.toNodeId === node.id)
      .map((edge) => edge.factType.factTypeId);
    const outputs = node.kind === 'agent'
      ? agentById.get(node.contractRef)?.outputs
      : skillById.get(node.contractRef)?.outputs;
    return {
      id: workItemId(binding.runId, node.id),
      binding,
      designNodeId: node.id,
      assignedAgentId: node.kind === 'agent' ? node.contractRef : '',
      skillRefs: node.kind === 'skill' ? [node.contractRef] : [],
      dependsOn: contract.topology.edges
        .filter((edge) => edge.toNodeId === node.id)
        .map((edge) => workItemId(binding.runId, edge.fromNodeId)),
      inputRefs: incoming.length ? incoming : inputRefs,
      outputRefs: (outputs ?? []).map(({ factType }) => factType.factTypeId),
      status: 'pending',
      revision: 0,
      leaseEpoch: 0,
      attempts: [],
    };
  });
}

export class FileCollaborationMutationLock
implements CollaborationMutationLockPort {
  constructor(
    private readonly dataRoot: string,
    private readonly timeoutMs = 5_000,
    private readonly retryMs = 10,
  ) {}

  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    identifier(key, 'lock key');
    const lockRoot = path.join(this.dataRoot, '.collaboration-locks');
    await fs.mkdir(lockRoot, { recursive: true });
    const lockPath = path.join(lockRoot, `${key}.lock`);
    const startedAt = Date.now();
    let handle: FileHandle | undefined;
    while (!handle) {
      try {
        handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
        }));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() - startedAt >= this.timeoutMs) {
          const stat = await fs.stat(lockPath).catch(() => undefined);
          if (stat && Date.now() - stat.mtimeMs >= this.timeoutMs) {
            await fs.unlink(lockPath).catch((unlinkError: unknown) => {
              if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw unlinkError;
              }
            });
            continue;
          }
          throw new CollaborationMutationConflictError(
            `Timed out acquiring mutation lock for ${key}`,
          );
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.retryMs);
        });
      }
    }
    try {
      return await operation();
    } finally {
      await handle.close();
      await fs.unlink(lockPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
  }
}

interface StageClaimResult {
  readonly state: 'claimed' | 'busy' | 'done';
  readonly snapshot: CollaborationRunSnapshot;
  readonly claim?: WorkItemStageClaim;
}

export class CollaborationExecutionStore implements CollaborationExecutionPort {
  private readonly mutationLock: CollaborationMutationLockPort;
  private readonly hostId: string;
  private readonly claimTtlMs: number;
  private readonly clock: () => Date;

  constructor(
    private readonly contractPort: SolutionExecutionContractPort,
    private readonly dataRoot = getDataRoot(),
    private readonly dependencies: CollaborationExecutionDependencies = {},
  ) {
    this.mutationLock =
      dependencies.mutationLock ?? new FileCollaborationMutationLock(dataRoot);
    this.hostId = dependencies.hostId ?? `host-${randomUUID()}`;
    this.claimTtlMs = dependencies.claimTtlMs ?? DEFAULT_CLAIM_TTL_MS;
    this.clock = dependencies.clock ?? (() => new Date());
  }

  private readonly observers = new Map<string, { observer: RunObserver; users: number }>();

  async start(input: StartCollaborationRunInput): Promise<CollaborationRunSnapshot> {
    for (const [field, value] of Object.entries(input)) {
      if (typeof value === 'string') identifier(value, field);
    }
    if (!Number.isInteger(input.taskRevision) || input.taskRevision < 0) {
      throw new TypeError('taskRevision must be a non-negative integer');
    }
    const published = await this.contractPort.load(input);
    if (!published) throw new Error('Execution contract not found');
    if (published.revocation) throw new Error('Execution contract is revoked');
    const { contract } = published;
    if (
      contract.projectId !== input.projectId
      || contract.solutionId !== input.solutionId
      || contract.solutionVersion !== input.solutionVersion
    ) {
      throw new Error('Execution contract reference does not match the request');
    }
    if (contract.status !== 'approved') {
      throw new Error('Execution contract is not approved');
    }
    if (contract.contractId !== input.executionContractId) {
      throw new Error('Execution contract ID does not match the task binding');
    }
    if (contract.contractHash !== input.contractHash) {
      throw new Error('Execution contract hash does not match the task binding');
    }
    assertIntegrity(await this.contractPort.verifyIntegrity(contract));
    const timestamp = this.now();
    const runId = `run-${randomUUID()}`;
    const binding: SolutionTaskBinding = {
      parentTaskId: input.parentTaskId,
      parentStepId: input.parentStepId,
      runId,
      solutionId: contract.solutionId,
      solutionVersion: contract.solutionVersion,
      executionContractId: contract.contractId,
      contractHash: contract.contractHash,
      taskRevision: input.taskRevision,
      parentSessionId: input.parentSessionId,
    };
    const snapshot: CollaborationRunSnapshot = {
      runId,
      projectId: input.projectId,
      binding,
      contract,
      workItems: createWorkItems(contract, binding, input.inputRefs),
      status: 'running',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const filePath = this.runPath(input.projectId, runId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    try {
      await fs.link(temporary, filePath);
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
    return snapshot;
  }

  async inspect(runId: string): Promise<CollaborationRunSnapshot> {
    identifier(runId, 'runId');
    return this.readRun(runId);
  }

  async findByTask(
    projectId: string,
    parentTaskId: string,
  ): Promise<CollaborationRunSnapshot | null> {
    identifier(projectId, 'projectId');
    identifier(parentTaskId, 'parentTaskId');
    let files: Dirent[];
    try {
      files = await fs.readdir(
        path.join(this.dataRoot, 'projects', projectId, 'collaboration-runs'),
        { withFileTypes: true },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const matches = await Promise.all(files
      .filter((file) => file.isFile() && file.name.endsWith('.json'))
      .map(async (file) => {
        const snapshot = this.normalizeSnapshot(JSON.parse(
          await fs.readFile(path.join(
            this.dataRoot,
            'projects',
            projectId,
            'collaboration-runs',
            file.name,
          ), 'utf8'),
        ) as CollaborationRunSnapshot);
        if (snapshot.projectId !== projectId) {
          throw new Error('Collaboration run crossed project scope');
        }
        assertIntegrity(await this.contractPort.verifyIntegrity(snapshot.contract));
        return snapshot.binding.parentTaskId === parentTaskId ? snapshot : null;
      }));
    const runs = matches.filter(
      (snapshot): snapshot is CollaborationRunSnapshot => Boolean(snapshot),
    );
    if (runs.length > 1) {
      throw new Error('Multiple collaboration runs match one project task');
    }
    return runs[0] ?? null;
  }

  async listWorkItemHandoffCandidates(
    input: ListWorkItemHandoffCandidatesInput,
  ): Promise<readonly WorkItemHandoffCandidate[]> {
    identifier(input.projectId, 'projectId');
    identifier(input.runId, 'runId');
    identifier(input.workItemId, 'workItemId');
    const snapshot = await this.readRun(input.runId);
    if (snapshot.projectId !== input.projectId) {
      throw new CollaborationWorkItemHandoffError(
        'HANDOFF_SCOPE_MISMATCH',
        'The run does not belong to the requested project',
      );
    }
    const item = this.item(snapshot, input.workItemId);
    return this.handoffCandidates(snapshot, item);
  }

  async handoffWorkItem(input: WorkItemHandoffInput): Promise<WorkItemHandoffResult> {
    identifier(input.projectId, 'projectId');
    identifier(input.runId, 'runId');
    identifier(input.workItemId, 'workItemId');
    identifier(input.targetAgentId, 'targetAgentId');
    identifier(input.requestId, 'requestId');
    for (const [field, value] of Object.entries({
      expectedRunRevision: input.expectedRunRevision,
      expectedWorkItemRevision: input.expectedWorkItemRevision,
      expectedLeaseEpoch: input.expectedLeaseEpoch,
    })) {
      if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`${field} must be a non-negative integer`);
      }
    }
    const snapshot = await this.mutate(input.runId, (current) => {
      if (current.projectId !== input.projectId) {
        throw new CollaborationWorkItemHandoffError(
          'HANDOFF_SCOPE_MISMATCH',
          'The run does not belong to the requested project',
        );
      }
      const recorded = current.workItems.flatMap(
        (candidate) => candidate.handoffReceipts ?? [],
      ).find((receipt) => receipt.requestId === input.requestId);
      if (recorded) {
        if (recorded.projectId !== input.projectId || recorded.runId !== input.runId
          || recorded.workItemId !== input.workItemId
          || recorded.assignedAgentId !== input.targetAgentId
          || recorded.runRevisionBefore !== input.expectedRunRevision
          || recorded.workItemRevisionBefore !== input.expectedWorkItemRevision
          || recorded.leaseEpochBefore !== input.expectedLeaseEpoch) {
          throw new CollaborationWorkItemHandoffError(
            'HANDOFF_REQUEST_ID_CONFLICT',
            'The handoff requestId was already used with different input',
          );
        }
        return current;
      }
      if (current.terminalStatus || current.status === 'canceled') {
        throw new CollaborationWorkItemHandoffError(
          'HANDOFF_TERMINAL',
          'A terminal collaboration run cannot be handed off',
        );
      }
      const item = this.item(current, input.workItemId);
      if (current.revision !== input.expectedRunRevision
        || item.revision !== input.expectedWorkItemRevision) {
        throw new CollaborationWorkItemHandoffError(
          'HANDOFF_REVISION_CONFLICT',
          'The Run or WorkItem revision changed before handoff',
        );
      }
      if (item.leaseEpoch !== input.expectedLeaseEpoch) {
        throw new CollaborationWorkItemHandoffError(
          'HANDOFF_LEASE_CONFLICT',
          'The WorkItem lease epoch changed before handoff',
        );
      }
      if (item.status === 'completed' || item.status === 'reported') {
        throw new CollaborationWorkItemHandoffError(
          'HANDOFF_TERMINAL',
          'A terminal WorkItem cannot be handed off',
        );
      }
      if (item.assignedAgentId === input.targetAgentId) {
        throw new CollaborationWorkItemHandoffError(
          'HANDOFF_TARGET_UNCHANGED',
          'The target Agent already owns this WorkItem',
        );
      }
      const authorized = this.handoffCandidates(current, item)
        .some(({ agentId }) => agentId === input.targetAgentId);
      if (!authorized) {
        throw new CollaborationWorkItemHandoffError(
          'HANDOFF_TARGET_UNAUTHORIZED',
          'The target Agent is not authorized by the frozen contract',
        );
      }
      const timestamp = this.now();
      const leaseEpochAfter = item.leaseEpoch + 1;
      const workItemRevisionAfter = item.revision + 1;
      const runRevisionAfter = current.revision + 1;
      const receiptBase = {
        version: 1 as const,
        requestId: input.requestId,
        projectId: input.projectId,
        runId: input.runId,
        workItemId: input.workItemId,
        previousAgentId: item.assignedAgentId,
        assignedAgentId: input.targetAgentId,
        runRevisionBefore: current.revision,
        runRevisionAfter,
        workItemRevisionBefore: item.revision,
        workItemRevisionAfter,
        leaseEpochBefore: item.leaseEpoch,
        leaseEpochAfter,
        unknownExternalResults: 'manual_review' as const,
        acceptedAt: timestamp,
      };
      const receipt: WorkItemHandoffReceipt = {
        ...receiptBase,
        receiptId: `handoff:${createHash('sha256')
          .update(JSON.stringify(receiptBase))
          .digest('hex')}`,
      };
      const active = item.attempts.at(-1);
      const attempts = !active || TERMINAL_ATTEMPT_STATUSES.has(active.status)
        ? item.attempts
        : item.attempts.map((attempt) => attempt.attemptId === active.attemptId
          ? {
              ...attempt,
              status: 'blocked' as const,
              stageClaim: undefined,
              reason: 'AGENT_HANDOFF',
              updatedAt: timestamp,
            }
          : attempt);
      const nextItem: CollaborationWorkItem = {
        ...item,
        assignedAgentId: input.targetAgentId,
        status: 'assigned',
        revision: workItemRevisionAfter,
        leaseEpoch: leaseEpochAfter,
        attempts,
        handoffReceipts: [...(item.handoffReceipts ?? []), receipt],
      };
      return updateItem(current, nextItem, timestamp);
    });
    const receipt = snapshot.workItems.flatMap(
      (item) => item.handoffReceipts ?? [],
    ).find((candidate) => candidate.requestId === input.requestId);
    if (!receipt) {
      throw new CollaborationMutationConflictError(
        'The accepted handoff receipt is missing from the Run ledger',
      );
    }
    return { receipt: clone(receipt), snapshot };
  }

  async pause(runId: string): Promise<CollaborationRunSnapshot> {
    const snapshot = await this.transition(runId, 'paused', ['running']);
    await this.observers.get(runId)?.observer.stop();
    this.observers.delete(runId);
    return snapshot;
  }

  async resume(runId: string): Promise<CollaborationRunSnapshot> {
    return this.transition(runId, 'running', ['paused']);
  }

  async cancel(runId: string): Promise<CollaborationRunSnapshot> {
    const snapshot = await this.transition(runId, 'canceled', ['running', 'paused']);
    await this.observers.get(runId)?.observer.stop();
    this.observers.delete(runId);
    return snapshot;
  }

  async executeWorkItem(
    input: WorkItemExecutionRequest,
  ): Promise<CollaborationRunSnapshot> {
    identifier(input.runId, 'runId');
    identifier(input.workItemId, 'workItemId');
    identifier(input.requestId, 'requestId');
    nonEmpty(input.payloadHash, 'payloadHash');
    const attemptId = await this.claimAttempt(input);
    return this.advance(input.runId, input.workItemId, attemptId);
  }

  async recover(runId: string): Promise<CollaborationRunSnapshot> {
    identifier(runId, 'runId');
    let snapshot = await this.readRun(runId);
    if (snapshot.status !== 'running') return snapshot;
    for (const item of snapshot.workItems) {
      const attempt = item.attempts.at(-1);
      if (!attempt || TERMINAL_ATTEMPT_STATUSES.has(attempt.status)) continue;
      snapshot = await this.advance(runId, item.id, attempt.attemptId);
      if (snapshot.status !== 'running') break;
    }
    return snapshot;
  }

  async resolveHitl(
    input: ResolveWorkItemHitlInput,
  ): Promise<CollaborationRunSnapshot> {
    identifier(input.runId, 'runId');
    identifier(input.requestId, 'requestId');
    identifier(input.attemptId, 'attemptId');
    identifier(input.decisionRef, 'decisionRef');
    if (input.decision === 'edit') {
      nonEmpty(input.editedPayloadHash ?? '', 'editedPayloadHash');
    }
    const snapshot = await this.mutate(input.runId, (current) => {
      const located = this.findHitl(current, input.requestId);
      const { item, attempt, request } = located;
      if (
        attempt.attemptId !== input.attemptId
        || attempt.leaseEpoch !== input.leaseEpoch
        || item.leaseEpoch !== input.leaseEpoch
      ) {
        throw new Error('Stale HITL lease epoch');
      }
      if (request.status === 'resolved') {
        if (
          request.decision !== input.decision
          || request.decisionRef !== input.decisionRef
          || request.editedPayloadHash !== input.editedPayloadHash
        ) {
          throw new Error('HITL decision conflicts with recorded decision');
        }
        return current;
      }
      this.assertRunning(current);
      const timestamp = this.now();
      const resolved: WorkItemHitlRequest = {
        ...request,
        status: 'resolved',
        decision: input.decision,
        decisionRef: input.decisionRef,
        editedPayloadHash: input.editedPayloadHash,
        updatedAt: timestamp,
      };
      let attemptStatus: AttemptStatus;
      let itemStatus: WorkItemStatus;
      if (input.decision === 'approve') {
        if (request.trigger === 'before_execution') {
          attemptStatus = 'ready';
          itemStatus = 'running';
        } else if (request.trigger === 'after_verification') {
          attemptStatus = 'outcome_pending';
          itemStatus = 'verifying';
        } else {
          attemptStatus = 'revision';
          itemStatus = 'revision';
        }
      } else if (input.decision === 'edit') {
        attemptStatus = 'revision';
        itemStatus = 'revision';
      } else {
        attemptStatus = 'failed';
        itemStatus = 'failed';
      }
      const nextAttempt: WorkItemAttempt = {
        ...attempt,
        status: attemptStatus,
        payloadHash: input.editedPayloadHash ?? attempt.payloadHash,
        hitlRequests: (attempt.hitlRequests ?? []).map((candidate) =>
          candidate.requestId === resolved.requestId ? resolved : candidate
        ),
        updatedAt: timestamp,
        reason: input.decision === 'reject' ? 'HITL_REJECTED' : attempt.reason,
      };
      const nextItem: CollaborationWorkItem = {
        ...item,
        status: itemStatus,
        revision: item.revision + 1,
        attempts: item.attempts.map((candidate) =>
          candidate.attemptId === attempt.attemptId ? nextAttempt : candidate
        ),
      };
      return updateItem(current, nextItem, timestamp);
    });
    if (input.decision === 'approve') {
      const located = this.findHitl(snapshot, input.requestId);
      if (located.request.trigger !== 'on_failure') {
        return this.advance(input.runId, located.item.id, located.attempt.attemptId);
      }
    }
    return snapshot;
  }

  async recordWorkerReceipt(
    runId: string,
    workItemId: string,
    attemptId: string,
    leaseEpoch: number,
    receipt: WorkerReceipt,
  ): Promise<CollaborationRunSnapshot> {
    return this.commitAttemptStage(
      runId,
      workItemId,
      attemptId,
      leaseEpoch,
      undefined,
      (attempt) => {
        this.assertWorkerReceipt(receipt);
        return {
          ...attempt,
          status: 'worker_received',
          workerReceipt: receipt,
          stageClaim: undefined,
        };
      },
      'running',
    );
  }

  async reconcileAcceptedOutput(
    input: AcceptedExternalOutputInput,
  ): Promise<AcceptedExternalOutputResult> {
    let recovered = false;
    let snapshot = await this.mutate(input.runId, (current) => {
      if (current.projectId !== input.projectId) {
        throw new CollaborationReconciliationError(
          'WORK_ITEM_SCOPE_MISMATCH',
          'The run does not belong to the requested project',
        );
      }
      this.assertRunning(current);
      const item = this.item(current, input.workItemId);
      let attempt = item.attempts.find(
        (candidate) => candidate.attemptId === input.attemptId,
      );
      if (attempt) {
        recovered = true;
        if (
          attempt.leaseEpoch !== input.leaseEpoch
          || item.leaseEpoch !== input.leaseEpoch
        ) {
          throw new CollaborationReconciliationError(
            'OLD_LEASE_EPOCH',
            'The WorkItem lease epoch is no longer current',
          );
        }
        if (
          attempt.requestId !== input.requestId
          || attempt.payloadHash !== input.payloadHash
          || (
            attempt.workerReceipt
            && attempt.workerReceipt.receiptId !== input.workerReceipt.receiptId
          )
        ) {
          throw new CollaborationReconciliationError(
            'WORK_ITEM_SCOPE_MISMATCH',
            'The existing attempt does not match the accepted output',
          );
        }
        if (attempt.evidenceReceipt) return current;
      } else {
        if (item.revision !== input.expectedWorkItemRevision) {
          throw new CollaborationReconciliationError(
            'WORK_ITEM_REVISION_CONFLICT',
            'The WorkItem revision changed before reconciliation',
          );
        }
        if (input.leaseEpoch !== item.leaseEpoch + 1) {
          throw new CollaborationReconciliationError(
            'OLD_LEASE_EPOCH',
            'The WorkItem lease epoch is stale or skips the current fence',
          );
        }
        const timestamp = this.now();
        attempt = {
          attemptId: input.attemptId,
          leaseEpoch: input.leaseEpoch,
          requestId: input.requestId,
          payloadHash: input.payloadHash,
          status: 'evidence_pending',
          createdAt: timestamp,
          updatedAt: timestamp,
          readinessReceipt: {
            receiptId: `${input.requestId}:external-readiness`,
            status: 'ready',
            checkedAt: timestamp,
            inputRefs: item.inputRefs,
            grantedPermissions: current.contract.permissions.allowed,
            targetAvailable: true,
          },
          workerReceipt: input.workerReceipt,
          verifierResult: input.verifierResult,
          outcomeReceipt: input.outcomeReceipt ?? {
            receiptId: `${input.requestId}:external-outcome`,
            status: 'accepted',
            operationRef: input.workerReceipt.receiptId,
            contentHash: input.workerReceipt.outputHash,
          },
        };
        const nextItem: CollaborationWorkItem = {
          ...item,
          status: 'verifying',
          revision: item.revision + 1,
          leaseEpoch: input.leaseEpoch,
          attempts: [...item.attempts, attempt],
        };
        return updateItem(current, nextItem, timestamp);
      }
      const timestamp = this.now();
      const mergedAttempt: WorkItemAttempt = {
        ...attempt,
        status: 'evidence_pending',
        workerReceipt: attempt.workerReceipt ?? input.workerReceipt,
        verifierResult: attempt.verifierResult ?? input.verifierResult,
        outcomeReceipt: attempt.outcomeReceipt ?? input.outcomeReceipt ?? {
          receiptId: `${input.requestId}:external-outcome`,
          status: 'accepted',
          operationRef: input.workerReceipt.receiptId,
          contentHash: input.workerReceipt.outputHash,
        },
        updatedAt: timestamp,
      };
      const nextItem: CollaborationWorkItem = {
        ...item,
        status: 'verifying',
        revision: item.revision + 1,
        attempts: item.attempts.map((candidate) =>
          candidate.attemptId === mergedAttempt.attemptId
            ? mergedAttempt
            : candidate
        ),
      };
      return updateItem(current, nextItem, timestamp);
    });

    const item = this.item(snapshot, input.workItemId);
    const attempt = this.attempt(item, input.attemptId);
    if (!attempt.evidenceReceipt) {
      if (!this.dependencies.evidenceSink) {
        throw new CollaborationReconciliationError(
          'UNKNOWN_EXTERNAL_RECEIPT',
          'The Evidence sink is unavailable for accepted output reconciliation',
        );
      }
      const evidenceHash = this.evidenceHash(snapshot, item, attempt);
      let evidence: EvidenceReceipt;
      try {
        evidence = await this.dependencies.evidenceSink.record({
          run: snapshot,
          workItem: item,
          attempt,
          executionKey: this.executionKey(snapshot, item, attempt),
          idempotencyKey: `${input.requestId}:evidence`,
          workerReceipt: input.workerReceipt,
          verifierResult: input.verifierResult,
          outcomeReceipt: attempt.outcomeReceipt!,
          evidenceHash,
        });
      } catch {
        throw new CollaborationReconciliationError(
          'UNKNOWN_EXTERNAL_RECEIPT',
          'The Evidence result could not be proven; manual reconciliation is required',
        );
      }
      if (!evidence.receiptId || evidence.status !== 'accepted') {
        throw new CollaborationReconciliationError(
          'UNKNOWN_EXTERNAL_RECEIPT',
          'The Evidence result is unknown; manual reconciliation is required',
        );
      }
      snapshot = await this.commitEvidence(
        snapshot.runId,
        item.id,
        attempt.attemptId,
        attempt.leaseEpoch,
        evidence,
      );
    }
    const completed = this.item(snapshot, input.workItemId);
    const completedAttempt = this.attempt(completed, input.attemptId);
    return {
      status: recovered ? 'recovered' : 'accepted',
      snapshot,
      workItemRevision: completed.revision,
      evidenceRevision:
        completedAttempt.evidenceReceipt?.revision ?? completed.revision,
    };
  }

  private async claimAttempt(input: WorkItemExecutionRequest): Promise<string> {
    let attemptId = '';
    await this.mutate(input.runId, (snapshot) => {
      this.assertRunning(snapshot);
      const item = this.item(snapshot, input.workItemId);
      if (!item.dependsOn.every(
        (id) => this.item(snapshot, id).status === 'completed',
      )) {
        throw new Error('WorkItem dependencies are not satisfied');
      }
      const matching = item.attempts.find(
        (attempt) => attempt.requestId === input.requestId,
      );
      if (matching && matching.payloadHash !== input.payloadHash) {
        throw new Error('Execution request ID conflicts with an existing payload');
      }
      if (matching) {
        attemptId = matching.attemptId;
        return snapshot;
      }
      if (item.status === 'completed') {
        throw new Error('WorkItem is already completed');
      }
      const budgetReason = this.newAttemptBudgetFailure(snapshot, item);
      if (budgetReason) {
        const timestamp = this.now();
        const nextItem: CollaborationWorkItem = {
          ...item,
          status: 'failed',
          revision: item.revision + 1,
        };
        return {
          ...updateItem(snapshot, nextItem, timestamp),
          failureReason: budgetReason,
        };
      }
      const leaseEpoch = item.leaseEpoch + 1;
      const timestamp = this.now();
      const attempt: WorkItemAttempt = {
        attemptId: `${item.id}:attempt-${leaseEpoch}`,
        leaseEpoch,
        requestId: input.requestId,
        payloadHash: input.payloadHash,
        status: 'intent',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      attemptId = attempt.attemptId;
      const nextItem: CollaborationWorkItem = {
        ...item,
        status: 'running',
        revision: item.revision + 1,
        leaseEpoch,
        attempts: [...item.attempts, attempt],
      };
      return updateItem(snapshot, nextItem, timestamp);
    });
    if (!attemptId) {
      const current = await this.readRun(input.runId);
      const item = this.item(current, input.workItemId);
      const existing = item.attempts.find(
        (attempt) => attempt.requestId === input.requestId,
      );
      if (!existing) {
        throw new Error(current.failureReason ?? 'WorkItem budget exhausted');
      }
      attemptId = existing.attemptId;
    }
    return attemptId;
  }

  private async advance(runId: string, workItemId: string, attemptId: string): Promise<CollaborationRunSnapshot> {
    let active = this.observers.get(runId);
    if (!active) {
      active = { observer: new RunObserver(this.dataRoot, this.hostId, () => this.readRun(runId)), users: 0 };
      this.observers.set(runId, active);
      active.observer.start();
    }
    active.users += 1;
    try {
      return await this.advanceLedger(runId, workItemId, attemptId);
    } finally {
      active.users -= 1;
      if (active.users === 0) {
        await active.observer.stop();
        if (this.observers.get(runId) === active) this.observers.delete(runId);
      }
    }
  }

  private async advanceLedger(
    runId: string,
    workItemId: string,
    attemptId: string,
  ): Promise<CollaborationRunSnapshot> {
    for (let guard = 0; guard < 12; guard += 1) {
      let snapshot = await this.readRun(runId);
      if (snapshot.status !== 'running') return snapshot;
      let item = this.item(snapshot, workItemId);
      let attempt = this.attempt(item, attemptId);
      if (TERMINAL_ATTEMPT_STATUSES.has(attempt.status)) return snapshot;
      if (attempt.status === 'waiting_hitl') {
        await this.publishPendingHitl(snapshot, attempt);
        return this.readRun(runId);
      }
      const runtimeBudget = this.runtimeBudgetFailure(snapshot);
      if (runtimeBudget) {
        return this.failBudget(snapshot, item, attempt, runtimeBudget);
      }

      if (!attempt.readinessReceipt) {
        if (!this.dependencies.readiness) {
          return this.recordUnavailable(
            snapshot,
            item,
            attempt,
            'READINESS_UNAVAILABLE',
          );
        }
        const claim = await this.claimStage(
          runId,
          item.id,
          attempt.attemptId,
          'readiness',
        );
        if (claim.state !== 'claimed') return claim.snapshot;
        const claimed = this.locate(claim.snapshot, item.id, attempt.attemptId);
        let result: WorkItemReadinessResult;
        try {
          result = await this.dependencies.readiness.check({
            run: claim.snapshot,
            workItem: claimed.item,
            attempt: claimed.attempt,
            requiredInputRefs: claimed.item.inputRefs,
            requiredPermissions: claim.snapshot.contract.permissions.allowed,
          });
        } catch (error) {
          return this.stageFailure(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
            claim.claim!,
            `READINESS_FAILED:${this.errorCode(error)}`,
          );
        }
        snapshot = await this.commitReadiness(
          runId,
          claimed.item.id,
          claimed.attempt.attemptId,
          claimed.attempt.leaseEpoch,
          claim.claim!,
          result,
        );
        item = this.item(snapshot, workItemId);
        attempt = this.attempt(item, attemptId);
        if (attempt.readinessReceipt?.status !== 'ready') return snapshot;
        continue;
      }

      const beforePolicy = this.hitlPolicy(snapshot, item, 'before_execution');
      if (
        beforePolicy
        && !this.resolvedHitl(attempt, beforePolicy.id, 'approve')
      ) {
        snapshot = await this.ensureHitl(snapshot, item, attempt, beforePolicy);
        await this.publishPendingHitl(
          snapshot,
          this.attempt(this.item(snapshot, item.id), attempt.attemptId),
        );
        return snapshot;
      }

      if (!attempt.workerReceipt) {
        if (!this.dependencies.worker) {
          return this.recordUnavailable(
            snapshot,
            item,
            attempt,
            'WORKER_UNAVAILABLE',
          );
        }
        const claim = await this.claimStage(runId, item.id, attempt.attemptId, 'worker');
        if (claim.state !== 'claimed') return claim.snapshot;
        const claimed = this.locate(claim.snapshot, item.id, attempt.attemptId);
        let receipt: WorkerReceipt;
        try {
          receipt = await this.dependencies.worker.execute({
            run: claim.snapshot,
            workItem: claimed.item,
            attempt: claimed.attempt,
            executionKey: this.executionKey(
              claim.snapshot,
              claimed.item,
              claimed.attempt,
            ),
            idempotencyKey: claim.claim!.idempotencyKey,
          });
          this.assertWorkerReceipt(receipt);
        } catch (error) {
          return this.stageFailure(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
            claim.claim!,
            `WORKER_RECEIPT_UNKNOWN:${this.errorCode(error)}`,
          );
        }
        snapshot = await this.commitWorker(
          runId,
          claimed.item.id,
          claimed.attempt.attemptId,
          claimed.attempt.leaseEpoch,
          claim.claim!,
          receipt,
        );
        continue;
      }

      if (!attempt.verifierResult) {
        if (!this.dependencies.verifier) {
          return this.recordUnavailable(
            snapshot,
            item,
            attempt,
            'VERIFIER_UNAVAILABLE',
          );
        }
        const claim = await this.claimStage(
          runId,
          item.id,
          attempt.attemptId,
          'verifier',
        );
        if (claim.state !== 'claimed') return claim.snapshot;
        const claimed = this.locate(claim.snapshot, item.id, attempt.attemptId);
        let result: VerifierResult;
        try {
          result = await this.dependencies.verifier.verify({
            run: claim.snapshot,
            workItem: claimed.item,
            attempt: claimed.attempt,
            executionKey: this.executionKey(
              claim.snapshot,
              claimed.item,
              claimed.attempt,
            ),
            idempotencyKey: claim.claim!.idempotencyKey,
            workerReceipt: claimed.attempt.workerReceipt!,
          });
        } catch (error) {
          return this.stageFailure(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
            claim.claim!,
            `VERIFIER_FAILED:${this.errorCode(error)}`,
          );
        }
        snapshot = await this.commitVerification(
          runId,
          claimed.item.id,
          claimed.attempt.attemptId,
          claimed.attempt.leaseEpoch,
          claim.claim!,
          result,
        );
        item = this.item(snapshot, workItemId);
        attempt = this.attempt(item, attemptId);
        if (attempt.verifierResult?.status !== 'passed') {
          return this.ensureFailureHitlIfConfigured(snapshot, item, attempt);
        }
        continue;
      }

      if (
        !this.validPassedVerification(
          attempt.verifierResult,
          snapshot.contract.contractHash,
        )
      ) {
        return this.recordFailure(
          snapshot,
          item,
          attempt,
          'blocked',
          'VERIFIER_RESULT_INCOMPLETE',
        );
      }

      const afterPolicy = this.hitlPolicy(snapshot, item, 'after_verification');
      if (
        afterPolicy
        && !this.resolvedHitl(attempt, afterPolicy.id, 'approve')
      ) {
        snapshot = await this.ensureHitl(snapshot, item, attempt, afterPolicy);
        await this.publishPendingHitl(
          snapshot,
          this.attempt(this.item(snapshot, item.id), attempt.attemptId),
        );
        return snapshot;
      }

      if (!attempt.outcomeReceipt) {
        if (!this.dependencies.outcome) {
          return this.recordUnavailable(
            snapshot,
            item,
            attempt,
            'OUTCOME_COMMIT_UNAVAILABLE',
          );
        }
        const claim = await this.claimStage(runId, item.id, attempt.attemptId, 'outcome');
        if (claim.state !== 'claimed') return claim.snapshot;
        const claimed = this.locate(claim.snapshot, item.id, attempt.attemptId);
        let receipt: OutcomeReceipt;
        try {
          receipt = await this.dependencies.outcome.commit({
            run: claim.snapshot,
            workItem: claimed.item,
            attempt: claimed.attempt,
            executionKey: this.executionKey(
              claim.snapshot,
              claimed.item,
              claimed.attempt,
            ),
            workerReceipt: claimed.attempt.workerReceipt!,
            verifierResult: claimed.attempt.verifierResult!,
            idempotencyKey: claim.claim!.idempotencyKey,
          });
        } catch (error) {
          return this.stageFailure(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
            claim.claim!,
            `OUTCOME_RECEIPT_UNKNOWN:${this.errorCode(error)}`,
          );
        }
        snapshot = await this.commitOutcome(
          runId,
          claimed.item.id,
          claimed.attempt.attemptId,
          claimed.attempt.leaseEpoch,
          claim.claim!,
          receipt,
        );
        item = this.item(snapshot, workItemId);
        attempt = this.attempt(item, attemptId);
        if (attempt.outcomeReceipt?.status !== 'accepted') {
          return this.ensureFailureHitlIfConfigured(snapshot, item, attempt);
        }
        continue;
      }

      if (!attempt.evidenceReceipt) {
        if (!this.dependencies.evidenceSink) {
          return this.recordUnavailable(
            snapshot,
            item,
            attempt,
            'EVIDENCE_SINK_UNAVAILABLE',
          );
        }
        const claim = await this.claimStage(runId, item.id, attempt.attemptId, 'evidence');
        if (claim.state !== 'claimed') return claim.snapshot;
        const claimed = this.locate(claim.snapshot, item.id, attempt.attemptId);
        const evidenceHash = this.evidenceHash(
          claim.snapshot,
          claimed.item,
          claimed.attempt,
        );
        let receipt: EvidenceReceipt;
        try {
          receipt = await this.dependencies.evidenceSink.record({
            run: claim.snapshot,
            workItem: claimed.item,
            attempt: claimed.attempt,
            executionKey: this.executionKey(
              claim.snapshot,
              claimed.item,
              claimed.attempt,
            ),
            workerReceipt: claimed.attempt.workerReceipt!,
            verifierResult: claimed.attempt.verifierResult!,
            outcomeReceipt: claimed.attempt.outcomeReceipt!,
            evidenceHash,
            idempotencyKey: claim.claim!.idempotencyKey,
          });
        } catch (error) {
          return this.stageFailure(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
            claim.claim!,
            `EVIDENCE_RECEIPT_UNKNOWN:${this.errorCode(error)}`,
          );
        }
        if (!receipt.receiptId || receipt.status !== 'accepted') {
          return this.stageFailure(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
            claim.claim!,
            'EVIDENCE_RECEIPT_UNKNOWN',
          );
        }
        snapshot = await this.commitEvidence(
          runId,
          claimed.item.id,
          claimed.attempt.attemptId,
          claimed.attempt.leaseEpoch,
          receipt,
          claim.claim!,
        );
        continue;
      }
      return snapshot;
    }
    throw new Error('WorkItem stage guard exhausted');
  }

  private async claimStage(
    runId: string,
    workItemIdValue: string,
    attemptId: string,
    stage: WorkItemExecutionStage,
  ): Promise<StageClaimResult> {
    let result: StageClaimResult | undefined;
    await this.mutate(runId, (snapshot) => {
      this.assertRunning(snapshot);
      const item = this.item(snapshot, workItemIdValue);
      const attempt = this.attempt(item, attemptId);
      this.assertCurrentLease(item, attempt);
      if (this.stageDone(attempt, stage)) {
        result = { state: 'done', snapshot };
        return snapshot;
      }
      const timestamp = this.now();
      if (
        attempt.stageClaim
        && new Date(attempt.stageClaim.expiresAt).getTime()
          > new Date(timestamp).getTime()
      ) {
        result = { state: 'busy', snapshot };
        return snapshot;
      }
      const claim: WorkItemStageClaim = {
        stage,
        claimId: `claim-${randomUUID()}`,
        hostId: this.hostId,
        expectedWorkItemRevision: item.revision + 1,
        claimedAt: timestamp,
        expiresAt: new Date(
          new Date(timestamp).getTime() + this.claimTtlMs,
        ).toISOString(),
        idempotencyKey:
          `${snapshot.runId}:${item.id}:${attempt.attemptId}:${stage}`,
      };
      const nextAttempt: WorkItemAttempt = {
        ...attempt,
        stageClaim: claim,
        updatedAt: timestamp,
      };
      const nextItem: CollaborationWorkItem = {
        ...item,
        revision: item.revision + 1,
        attempts: item.attempts.map((candidate) =>
          candidate.attemptId === attemptId ? nextAttempt : candidate
        ),
      };
      const next = updateItem(snapshot, nextItem, timestamp);
      result = { state: 'claimed', snapshot: next, claim };
      return next;
    });
    return result ?? {
      state: 'busy',
      snapshot: await this.readRun(runId),
    };
  }

  private async commitReadiness(
    runId: string,
    workItemIdValue: string,
    attemptId: string,
    leaseEpoch: number,
    claim: WorkItemStageClaim,
    result: WorkItemReadinessResult,
  ): Promise<CollaborationRunSnapshot> {
    const timestamp = this.now();
    const inputRefs = result.inputRefs ?? [];
    const grantedPermissions = result.grantedPermissions ?? [];
    return this.commitAttemptStage(
      runId,
      workItemIdValue,
      attemptId,
      leaseEpoch,
      claim,
      (attempt, snapshot, item) => {
        const permissionsReady = this.allIncluded(
          snapshot.contract.permissions.allowed,
          grantedPermissions,
        );
        const inputsReady = this.allIncluded(item.inputRefs, inputRefs);
        const accepted =
          result.status === 'ready'
          && result.targetAvailable
          && permissionsReady
          && inputsReady;
        return {
          ...attempt,
          status: accepted ? 'ready' : 'blocked',
          readinessReceipt: {
            receiptId: result.receiptId,
            status: accepted ? 'ready' : 'blocked',
            checkedAt: timestamp,
            inputRefs,
            grantedPermissions,
            targetAvailable: result.targetAvailable ?? false,
            stateRef: result.stateRef,
            reason: accepted
              ? undefined
              : (result.status === 'blocked' ? result.reason : undefined)
                ?? 'READINESS_REQUIREMENTS_NOT_SATISFIED',
          },
          stageClaim: undefined,
          reason: accepted
            ? undefined
            : (result.status === 'blocked' ? result.reason : undefined)
              ?? 'READINESS_REQUIREMENTS_NOT_SATISFIED',
        };
      },
      result.status === 'ready' ? 'running' : 'blocked',
    );
  }

  private async commitWorker(
    runId: string,
    workItemIdValue: string,
    attemptId: string,
    leaseEpoch: number,
    claim: WorkItemStageClaim,
    receipt: WorkerReceipt,
  ): Promise<CollaborationRunSnapshot> {
    try {
      return await this.commitAttemptStage(
        runId,
        workItemIdValue,
        attemptId,
        leaseEpoch,
        claim,
        (attempt, snapshot, item) => {
          const budgetReason = this.receiptBudgetFailure(snapshot, item, receipt);
          return {
            ...attempt,
            status: budgetReason ? 'failed' : 'worker_received',
            workerReceipt: receipt,
            stageClaim: undefined,
            reason: budgetReason,
          };
        },
        'running',
      );
    } catch (error) {
      if (!(error instanceof CollaborationMutationConflictError)) throw error;
      const current = await this.readRun(runId);
      const recorded = this.attempt(
        this.item(current, workItemIdValue),
        attemptId,
      ).workerReceipt;
      if (recorded?.receiptId === receipt.receiptId) return current;
      throw error;
    }
  }

  private async commitVerification(
    runId: string,
    workItemIdValue: string,
    attemptId: string,
    leaseEpoch: number,
    claim: WorkItemStageClaim,
    result: VerifierResult,
  ): Promise<CollaborationRunSnapshot> {
    let status: AttemptStatus;
    let itemStatus: WorkItemStatus;
    let reason = result.reason;
    if (!result || result.status === 'placeholder') {
      status = 'blocked';
      itemStatus = 'blocked';
      reason = 'VERIFIER_PLACEHOLDER';
    } else if (result.status === 'failed') {
      status = 'revision';
      itemStatus = 'revision';
    } else {
      status = 'outcome_pending';
      itemStatus = 'verifying';
    }
    return this.commitAttemptStage(
      runId,
      workItemIdValue,
      attemptId,
      leaseEpoch,
      claim,
      (attempt) => ({
        ...attempt,
        status,
        verifierResult: result,
        stageClaim: undefined,
        reason,
      }),
      itemStatus,
    );
  }

  private async commitOutcome(
    runId: string,
    workItemIdValue: string,
    attemptId: string,
    leaseEpoch: number,
    claim: WorkItemStageClaim,
    receipt: OutcomeReceipt,
  ): Promise<CollaborationRunSnapshot> {
    const accepted = Boolean(
      receipt
      && receipt.receiptId
      && receipt.status === 'accepted'
      && receipt.operationRef,
    );
    return this.commitAttemptStage(
      runId,
      workItemIdValue,
      attemptId,
      leaseEpoch,
      claim,
      (attempt) => ({
        ...attempt,
        status: accepted ? 'evidence_pending' : 'needs_review',
        outcomeReceipt: receipt,
        stageClaim: undefined,
        reason: accepted
          ? undefined
          : receipt.reason ?? 'OUTCOME_RECEIPT_UNKNOWN',
      }),
      accepted ? 'verifying' : 'needs_review',
    );
  }

  private async commitEvidence(
    runId: string,
    workItemIdValue: string,
    attemptId: string,
    leaseEpoch: number,
    receipt: EvidenceReceipt,
    claim?: WorkItemStageClaim,
  ): Promise<CollaborationRunSnapshot> {
    return this.commitAttemptStage(
      runId,
      workItemIdValue,
      attemptId,
      leaseEpoch,
      claim,
      (attempt) => ({
        ...attempt,
        status: 'completed',
        evidenceReceipt: receipt,
        stageClaim: undefined,
      }),
      'completed',
    );
  }

  private async commitAttemptStage(
    runId: string,
    workItemIdValue: string,
    attemptId: string,
    leaseEpoch: number,
    claim: WorkItemStageClaim | undefined,
    change: (
      attempt: WorkItemAttempt,
      snapshot: CollaborationRunSnapshot,
      item: CollaborationWorkItem,
    ) => WorkItemAttempt,
    requestedItemStatus: WorkItemStatus,
  ): Promise<CollaborationRunSnapshot> {
    return this.mutate(runId, (snapshot) => {
      this.assertRunning(snapshot);
      const item = this.item(snapshot, workItemIdValue);
      const attempt = this.attempt(item, attemptId);
      if (attempt.leaseEpoch !== leaseEpoch || item.leaseEpoch !== leaseEpoch) {
        throw new CollaborationWorkItemHandoffError(
          'STALE_LEASE_EPOCH',
          'Stale WorkItem lease epoch',
        );
      }
      if (claim) this.assertClaim(item, attempt, claim);
      const timestamp = this.now();
      const nextAttempt = { ...change(attempt, snapshot, item), updatedAt: timestamp };
      const itemStatus = this.itemStatusForAttempt(
        nextAttempt.status,
        requestedItemStatus,
      );
      const nextItem: CollaborationWorkItem = {
        ...item,
        status: itemStatus,
        revision: item.revision + 1,
        attempts: item.attempts.map((candidate) =>
          candidate.attemptId === attemptId ? nextAttempt : candidate
        ),
      };
      return updateItem(snapshot, nextItem, timestamp);
    });
  }

  private async stageFailure(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
    claim: WorkItemStageClaim,
    reason: string,
  ): Promise<CollaborationRunSnapshot> {
    const policy = this.hitlPolicy(snapshot, item, 'on_failure');
    const failed = await this.commitAttemptStage(
      snapshot.runId,
      item.id,
      attempt.attemptId,
      attempt.leaseEpoch,
      claim,
      (current) => ({
        ...current,
        status: policy ? 'waiting_hitl' : 'needs_review',
        stageClaim: undefined,
        reason,
      }),
      policy ? 'waiting_hitl' : 'needs_review',
    );
    if (!policy) return failed;
    const currentItem = this.item(failed, item.id);
    const waiting = await this.ensureHitl(
      failed,
      currentItem,
      this.attempt(currentItem, attempt.attemptId),
      policy,
    );
    await this.publishPendingHitl(
      waiting,
      this.attempt(this.item(waiting, item.id), attempt.attemptId),
    );
    return waiting;
  }

  private async ensureFailureHitlIfConfigured(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
  ): Promise<CollaborationRunSnapshot> {
    const policy = this.hitlPolicy(snapshot, item, 'on_failure');
    if (!policy) return snapshot;
    const waiting = await this.ensureHitl(snapshot, item, attempt, policy);
    await this.publishPendingHitl(
      waiting,
      this.attempt(this.item(waiting, item.id), attempt.attemptId),
    );
    return waiting;
  }

  private async ensureHitl(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
    policy: HitlPolicy,
  ): Promise<CollaborationRunSnapshot> {
    const existing = (attempt.hitlRequests ?? []).find(
      (request) => request.policyId === policy.id
        && request.trigger === policy.trigger,
    );
    if (existing) return snapshot;
    if (!this.dependencies.hitl) {
      return this.recordUnavailable(
        snapshot,
        item,
        attempt,
        'HITL_PORT_UNAVAILABLE',
      );
    }
    return this.mutate(snapshot.runId, (current) => {
      this.assertRunning(current);
      const currentItem = this.item(current, item.id);
      const currentAttempt = this.attempt(currentItem, attempt.attemptId);
      this.assertCurrentLease(currentItem, currentAttempt);
      const duplicate = (currentAttempt.hitlRequests ?? []).find(
        (request) => request.policyId === policy.id
          && request.trigger === policy.trigger,
      );
      if (duplicate) return current;
      const timestamp = this.now();
      const request: WorkItemHitlRequest = {
        requestId:
          `${current.runId}:${currentItem.id}:${currentAttempt.attemptId}:hitl:${policy.id}`,
        policyId: policy.id,
        trigger: policy.trigger,
        approverRole: policy.approverRole,
        parentTaskId: current.binding.parentTaskId,
        parentStepId: current.binding.parentStepId,
        parentSessionId: current.binding.parentSessionId,
        workItemId: currentItem.id,
        attemptId: currentAttempt.attemptId,
        leaseEpoch: currentAttempt.leaseEpoch,
        question: this.hitlQuestion(policy.trigger, currentItem),
        options: ['approve', 'reject', 'edit'],
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'pending',
      };
      const nextAttempt: WorkItemAttempt = {
        ...currentAttempt,
        status: 'waiting_hitl',
        hitlRequests: [...(currentAttempt.hitlRequests ?? []), request],
        updatedAt: timestamp,
      };
      const nextItem: CollaborationWorkItem = {
        ...currentItem,
        status: 'waiting_hitl',
        revision: currentItem.revision + 1,
        attempts: currentItem.attempts.map((candidate) =>
          candidate.attemptId === currentAttempt.attemptId
            ? nextAttempt
            : candidate
        ),
      };
      return updateItem(current, nextItem, timestamp);
    });
  }

  private async publishPendingHitl(
    snapshot: CollaborationRunSnapshot,
    attempt: WorkItemAttempt,
  ): Promise<void> {
    if (!this.dependencies.hitl) return;
    const pending = (attempt.hitlRequests ?? []).filter(
      (request) => request.status === 'pending',
    );
    await Promise.all(pending.map((request) =>
      this.dependencies.hitl!.open({
        run: snapshot,
        request,
        idempotencyKey: request.requestId,
      })
    ));
  }

  private async recordUnavailable(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
    reason: string,
  ): Promise<CollaborationRunSnapshot> {
    return this.commitAttemptStage(
      snapshot.runId,
      item.id,
      attempt.attemptId,
      attempt.leaseEpoch,
      undefined,
      (current) => ({ ...current, reason, stageClaim: undefined }),
      'blocked',
    );
  }

  private async recordFailure(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
    status: Extract<AttemptStatus, 'blocked' | 'needs_review'>,
    reason: string,
  ): Promise<CollaborationRunSnapshot> {
    return this.commitAttemptStage(
      snapshot.runId,
      item.id,
      attempt.attemptId,
      attempt.leaseEpoch,
      undefined,
      (current) => ({ ...current, status, reason, stageClaim: undefined }),
      status,
    );
  }

  private async failBudget(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
    reason: string,
  ): Promise<CollaborationRunSnapshot> {
    return this.commitAttemptStage(
      snapshot.runId,
      item.id,
      attempt.attemptId,
      attempt.leaseEpoch,
      undefined,
      (current) => ({
        ...current,
        status: 'failed',
        reason,
        stageClaim: undefined,
      }),
      'failed',
    );
  }

  private async transition(
    runId: string,
    status: CollaborationRunStatus,
    allowed: readonly CollaborationRunStatus[],
  ): Promise<CollaborationRunSnapshot> {
    identifier(runId, 'runId');
    return this.mutate(runId, (snapshot) => {
      if (snapshot.terminalStatus || !allowed.includes(snapshot.status)) {
        throw new Error(
          `Cannot transition ${snapshot.terminalStatus ?? snapshot.status} run to ${status}`,
        );
      }
      const timestamp = this.now();
      const fencedItems = status === 'paused' || status === 'canceled'
        ? snapshot.workItems.map((item) => this.fenceActiveAttempt(
          item,
          status === 'paused' ? 'RUN_PAUSED' : 'RUN_CANCELED',
          timestamp,
        ))
        : snapshot.workItems;
      return {
        ...snapshot,
        workItems: fencedItems,
        status,
        terminalStatus: status === 'canceled' ? 'canceled' : snapshot.terminalStatus,
        revision: snapshot.revision + 1,
        updatedAt: timestamp,
      };
    });
  }

  private async mutate(
    runId: string,
    operation: (
      snapshot: CollaborationRunSnapshot,
    ) => CollaborationRunSnapshot | Promise<CollaborationRunSnapshot>,
  ): Promise<CollaborationRunSnapshot> {
    return this.mutationLock.withLock(runId, async () => {
      const snapshot = await this.readRun(runId);
      const next = await operation(clone(snapshot));
      if (next === snapshot || JSON.stringify(next) === JSON.stringify(snapshot)) {
        return snapshot;
      }
      if (next.revision !== snapshot.revision + 1) {
        throw new CollaborationMutationConflictError(
          `Expected revision ${snapshot.revision + 1}, received ${next.revision}`,
        );
      }
      await this.writeRunCas(next, snapshot.revision);
      return next;
    });
  }

  private async readRun(runId: string): Promise<CollaborationRunSnapshot> {
    let directories: Dirent[];
    try {
      directories = await fs.readdir(path.join(this.dataRoot, 'projects'), {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Collaboration run not found: ${runId}`);
      }
      throw error;
    }
    for (const directory of directories) {
      if (!directory.isDirectory()) continue;
      const filePath = this.runPath(directory.name, runId);
      try {
        const snapshot = JSON.parse(
          await fs.readFile(filePath, 'utf8'),
        ) as CollaborationRunSnapshot;
        if (snapshot.runId !== runId) {
          throw new Error('Run ID does not match its ledger');
        }
        assertIntegrity(await this.contractPort.verifyIntegrity(snapshot.contract));
        return this.normalizeSnapshot(snapshot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new Error(`Collaboration run not found: ${runId}`);
  }

  private normalizeSnapshot(
    snapshot: CollaborationRunSnapshot,
  ): CollaborationRunSnapshot {
    return {
      ...snapshot,
      workItems: snapshot.workItems.map((item) => ({
        ...item,
        leaseEpoch: item.leaseEpoch ?? 0,
        attempts: (item.attempts ?? []).map((attempt) => ({
          ...attempt,
          hitlRequests: attempt.hitlRequests ?? [],
        })),
      })),
    };
  }

  private async writeRunCas(
    snapshot: CollaborationRunSnapshot,
    expectedRevision: number,
  ): Promise<void> {
    const filePath = this.runPath(snapshot.projectId, snapshot.runId);
    const current = JSON.parse(
      await fs.readFile(filePath, 'utf8'),
    ) as CollaborationRunSnapshot;
    if (current.revision !== expectedRevision) {
      throw new CollaborationMutationConflictError(
        `Run revision changed from ${expectedRevision} to ${current.revision}`,
      );
    }
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    try {
      await fs.rename(temporary, filePath);
      this.observers.get(snapshot.runId)?.observer.checkpoint();
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
  }

  private runPath(projectId: string, runId: string): string {
    identifier(projectId, 'projectId');
    identifier(runId, 'runId');
    return path.join(
      this.dataRoot,
      'projects',
      projectId,
      'collaboration-runs',
      `${runId}.json`,
    );
  }

  private item(
    snapshot: CollaborationRunSnapshot,
    workItemIdValue: string,
  ): CollaborationWorkItem {
    const item = snapshot.workItems.find(
      (candidate) => candidate.id === workItemIdValue,
    );
    if (!item) throw new Error(`WorkItem not found: ${workItemIdValue}`);
    return item;
  }

  private handoffCandidates(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
  ): readonly WorkItemHandoffCandidate[] {
    const template = snapshot.contract.semanticContext.taskTemplates.find(
      (candidate) => candidate.designNodeId === item.designNodeId,
    );
    if (!template) return [];
    const allowedPermissions = new Set(snapshot.contract.permissions.allowed);
    const allowedAgentIds = new Set(template.candidateAgentIds);
    return snapshot.contract.agents.flatMap((agent) => {
      if (!allowedAgentIds.has(agent.agentId)
        || !agent.permissions.every((permission) => allowedPermissions.has(permission))) {
        return [];
      }
      return [{
        agentId: agent.agentId,
        displayName: agent.agentId,
        permissions: [...agent.permissions],
      }];
    });
  }

  private attempt(
    item: CollaborationWorkItem,
    attemptId: string,
  ): WorkItemAttempt {
    const attempt = item.attempts.find(
      (candidate) => candidate.attemptId === attemptId,
    );
    if (!attempt) throw new Error(`WorkItem attempt not found: ${attemptId}`);
    return attempt;
  }

  private locate(
    snapshot: CollaborationRunSnapshot,
    workItemIdValue: string,
    attemptId: string,
  ): { item: CollaborationWorkItem; attempt: WorkItemAttempt } {
    const item = this.item(snapshot, workItemIdValue);
    return { item, attempt: this.attempt(item, attemptId) };
  }

  private findHitl(
    snapshot: CollaborationRunSnapshot,
    requestId: string,
  ): {
    item: CollaborationWorkItem;
    attempt: WorkItemAttempt;
    request: WorkItemHitlRequest;
  } {
    for (const item of snapshot.workItems) {
      for (const attempt of item.attempts) {
        const request = (attempt.hitlRequests ?? []).find(
          (candidate) => candidate.requestId === requestId,
        );
        if (request) return { item, attempt, request };
      }
    }
    throw new Error(`HITL request not found: ${requestId}`);
  }

  private assertRunning(snapshot: CollaborationRunSnapshot): void {
    if (snapshot.status !== 'running' || snapshot.terminalStatus) {
      throw new Error(
        `Cannot execute ${snapshot.terminalStatus ?? snapshot.status} run`,
      );
    }
  }

  private fenceActiveAttempt(
    item: CollaborationWorkItem,
    reason: string,
    timestamp: string,
  ): CollaborationWorkItem {
    const current = item.attempts.at(-1);
    if (!current || TERMINAL_ATTEMPT_STATUSES.has(current.status)) return item;
    const fenced: WorkItemAttempt = {
      ...current,
      status: 'blocked',
      stageClaim: undefined,
      reason,
      updatedAt: timestamp,
    };
    return {
      ...item,
      status: 'blocked',
      revision: item.revision + 1,
      leaseEpoch: item.leaseEpoch + 1,
      attempts: item.attempts.map((candidate) =>
        candidate.attemptId === current.attemptId ? fenced : candidate
      ),
    };
  }

  private assertCurrentLease(
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
  ): void {
    if (attempt.leaseEpoch !== item.leaseEpoch) {
      throw new CollaborationWorkItemHandoffError(
        'STALE_LEASE_EPOCH',
        'Stale WorkItem lease epoch',
      );
    }
  }

  private assertClaim(
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
    claim: WorkItemStageClaim,
  ): void {
    this.assertCurrentLease(item, attempt);
    if (
      item.revision !== claim.expectedWorkItemRevision
      || attempt.stageClaim?.claimId !== claim.claimId
      || attempt.stageClaim.stage !== claim.stage
    ) {
      throw new CollaborationMutationConflictError(
        `Stage ${claim.stage} no longer owns WorkItem revision ${claim.expectedWorkItemRevision}`,
      );
    }
  }

  private stageDone(
    attempt: WorkItemAttempt,
    stage: WorkItemExecutionStage,
  ): boolean {
    if (stage === 'readiness') return Boolean(attempt.readinessReceipt);
    if (stage === 'worker') return Boolean(attempt.workerReceipt);
    if (stage === 'verifier') return Boolean(attempt.verifierResult);
    if (stage === 'outcome') return Boolean(attempt.outcomeReceipt);
    return Boolean(attempt.evidenceReceipt);
  }

  private hitlPolicy(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    trigger: HitlTrigger,
  ): HitlPolicy | undefined {
    return snapshot.contract.hitl.find(
      (policy) =>
        policy.nodeId === item.designNodeId && policy.trigger === trigger,
    );
  }

  private resolvedHitl(
    attempt: WorkItemAttempt,
    policyId: string,
    decision: HitlDecision,
  ): boolean {
    return Boolean((attempt.hitlRequests ?? []).find(
      (request) =>
        request.policyId === policyId
        && request.status === 'resolved'
        && request.decision === decision,
    ));
  }

  private hitlQuestion(
    trigger: HitlTrigger,
    item: CollaborationWorkItem,
  ): string {
    if (trigger === 'before_execution') {
      return `是否允许开始执行 ${item.designNodeId}？`;
    }
    if (trigger === 'after_verification') {
      return `${item.designNodeId} 已通过验证，是否接受结果并提交？`;
    }
    return `${item.designNodeId} 执行失败，是否调整后重试？`;
  }

  private executionKey(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
  ): string {
    return `${snapshot.runId}:${item.id}:${attempt.attemptId}`;
  }

  private evidenceHash(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
  ): string {
    const source = JSON.stringify({
      runId: snapshot.runId,
      workItemId: item.id,
      contractHash: snapshot.contract.contractHash,
      verifierHash: attempt.verifierResult?.contentHash ?? '',
      outcomeHash:
        attempt.outcomeReceipt?.contentHash
        ?? attempt.outcomeReceipt?.receiptId
        ?? '',
    });
    return `sha256:${createHash('sha256').update(source).digest('hex')}`;
  }

  private itemStatusForAttempt(
    attemptStatus: AttemptStatus,
    fallback: WorkItemStatus,
  ): WorkItemStatus {
    if (attemptStatus === 'completed') return 'completed';
    if (attemptStatus === 'failed') return 'failed';
    if (attemptStatus === 'revision') return 'revision';
    if (attemptStatus === 'blocked') return 'blocked';
    if (attemptStatus === 'needs_review') return 'needs_review';
    if (attemptStatus === 'waiting_hitl') return 'waiting_hitl';
    return fallback;
  }

  private assertWorkerReceipt(receipt: WorkerReceipt): void {
    if (
      !receipt
      || !receipt.receiptId
      || !receipt.outputHash
      || !receipt.outputRefs?.length
      || !receipt.usage
      || !Number.isFinite(receipt.usage.durationMs)
      || receipt.usage.durationMs < 0
      || !Number.isFinite(receipt.usage.tokens)
      || receipt.usage.tokens < 0
    ) {
      throw new Error('Worker receipt is incomplete');
    }
  }

  private validPassedVerification(
    result: VerifierResult,
    contractHash: string,
  ): boolean {
    return (
      result.status === 'passed'
      && Boolean(
        result.verificationMethod
        && result.artifactRefs?.length
        && result.resultRef
        && result.contentHash
        && result.contractHash === contractHash
      )
    );
  }

  private newAttemptBudgetFailure(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
  ): string | undefined {
    if (item.attempts.length >= snapshot.contract.budget.maxAttempts) {
      return 'MAX_ATTEMPTS_EXCEEDED';
    }
    return this.runtimeBudgetFailure(snapshot);
  }

  private runtimeBudgetFailure(
    snapshot: CollaborationRunSnapshot,
  ): string | undefined {
    const elapsed = this.clock().getTime() - new Date(snapshot.createdAt).getTime();
    if (elapsed > snapshot.contract.budget.maxDurationMs) {
      return 'MAX_DURATION_EXCEEDED';
    }
    const tokens = snapshot.workItems.reduce(
      (total, item) => total + item.attempts.reduce(
        (attemptTotal, attempt) =>
          attemptTotal + (attempt.workerReceipt?.usage?.tokens ?? 0),
        0,
      ),
      0,
    );
    if (tokens >= snapshot.contract.budget.maxTokens) {
      return 'MAX_TOKENS_EXCEEDED';
    }
    return undefined;
  }

  private receiptBudgetFailure(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    receipt: WorkerReceipt,
  ): string | undefined {
    if (!receipt.usage) return 'WORKER_USAGE_MISSING';
    const previousTokens = snapshot.workItems.reduce(
      (total, candidate) => total + candidate.attempts.reduce(
        (attemptTotal, attempt) =>
          attemptTotal + (attempt.workerReceipt?.usage?.tokens ?? 0),
        0,
      ),
      0,
    );
    if (
      previousTokens + receipt.usage.tokens > snapshot.contract.budget.maxTokens
    ) {
      return 'MAX_TOKENS_EXCEEDED';
    }
    const elapsed =
      this.clock().getTime() - new Date(snapshot.createdAt).getTime();
    if (
      elapsed > snapshot.contract.budget.maxDurationMs
      || receipt.usage.durationMs > snapshot.contract.budget.maxDurationMs
    ) {
      return 'MAX_DURATION_EXCEEDED';
    }
    if (item.attempts.length > snapshot.contract.budget.maxAttempts) {
      return 'MAX_ATTEMPTS_EXCEEDED';
    }
    return undefined;
  }

  private allIncluded(
    required: readonly string[],
    available: readonly string[],
  ): boolean {
    const values = new Set(available);
    return required.every((value) => values.has(value));
  }

  private errorCode(error: unknown): string {
    return error instanceof Error
      ? error.message.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
      : 'UNKNOWN';
  }

  private now(): string {
    return this.clock().toISOString();
  }
}
