import { randomUUID } from 'node:crypto';
import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';

import { getDataRoot } from '../../../lib/paths';
import type {
  ContractIntegrityResult,
  SolutionExecutionContract,
  SolutionExecutionContractPort,
  SolutionVersionRef,
} from '../../../lib/features/solution';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;

type WorkItemStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'verifying'
  | 'revision'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'reported'
  | 'needs_review';
type AttemptStatus =
  | 'intent'
  | 'worker_received'
  | 'verifying'
  | 'evidence_pending'
  | 'completed'
  | 'revision'
  | 'blocked'
  | 'needs_review';

export interface SolutionTaskBinding {
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly runId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly executionContractId: string;
  readonly contractHash: string;
  readonly taskRevision: number;
}

export interface WorkerReceipt {
  readonly receiptId: string;
  readonly outputRefs: readonly string[];
  readonly outputHash: string;
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

export interface EvidenceReceipt {
  readonly receiptId: string;
  readonly status: 'accepted' | 'unknown';
  readonly evidenceRef?: string;
}

export interface WorkItemAttempt {
  readonly attemptId: string;
  readonly leaseEpoch: number;
  readonly requestId: string;
  readonly payloadHash: string;
  status: AttemptStatus;
  readonly createdAt: string;
  updatedAt: string;
  workerReceipt?: WorkerReceipt;
  verifierResult?: VerifierResult;
  evidenceReceipt?: EvidenceReceipt;
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
  /** The monotonically increasing fence; never derived from wall clock time. */
  leaseEpoch: number;
  readonly attempts: readonly WorkItemAttempt[];
}

export interface CollaborationRunSnapshot {
  readonly runId: string;
  readonly projectId: string;
  readonly binding: SolutionTaskBinding;
  readonly contract: SolutionExecutionContract;
  readonly workItems: readonly CollaborationWorkItem[];
  status: 'running' | 'paused' | 'canceled';
  revision: number;
  readonly createdAt: string;
  updatedAt: string;
}

export interface StartCollaborationRunInput extends SolutionVersionRef {
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly taskRevision: number;
  readonly executionContractId: string;
  readonly contractHash: string;
  readonly inputRefs: readonly string[];
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
}

export interface VerifierExecutionInput extends WorkerExecutionInput {
  readonly workerReceipt: WorkerReceipt;
}

export interface EvidenceSubmissionInput extends VerifierExecutionInput {
  readonly verifierResult: VerifierResult;
  readonly idempotencyKey: string;
}

/** Host-owned port. A missing port is a fail-closed execution condition. */
export interface WorkItemWorkerPort {
  execute(input: WorkerExecutionInput): Promise<WorkerReceipt>;
}
export interface WorkItemVerifierPort {
  verify(input: VerifierExecutionInput): Promise<VerifierResult>;
}
export interface WorkItemEvidenceSink {
  record(input: EvidenceSubmissionInput): Promise<EvidenceReceipt>;
}
export interface CollaborationExecutionDependencies {
  readonly worker?: WorkItemWorkerPort;
  readonly verifier?: WorkItemVerifierPort;
  readonly evidenceSink?: WorkItemEvidenceSink;
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
    input: WorkItemExecutionRequest
  ): Promise<CollaborationRunSnapshot>;
  recover(runId: string): Promise<CollaborationRunSnapshot>;
}

function identifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..'))
    throw new TypeError(`Invalid ${field}: ${value}`);
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
function now(): string {
  return new Date().toISOString();
}

function createWorkItems(
  contract: SolutionExecutionContract,
  binding: SolutionTaskBinding,
  inputRefs: readonly string[]
): CollaborationWorkItem[] {
  const agentById = new Map(
    contract.agents.map((agent) => [agent.agentId, agent])
  );
  const skillById = new Map(
    contract.skills.map((skill) => [skill.skillId, skill])
  );
  return contract.topology.nodes.map((node) => {
    const incoming = contract.topology.edges
      .filter((edge) => edge.toNodeId === node.id)
      .map((edge) => edge.factType.factTypeId);
    const contractOutputs =
      node.kind === 'agent'
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
      outputRefs: (contractOutputs ?? []).map(
        ({ factType }) => factType.factTypeId
      ),
      status: 'pending' as const,
      revision: 0,
      leaseEpoch: 0,
      attempts: [],
    };
  });
}

function updateItem(
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem
): CollaborationRunSnapshot {
  return {
    ...snapshot,
    workItems: snapshot.workItems.map((candidate) =>
      candidate.id === item.id ? item : candidate
    ),
    revision: snapshot.revision + 1,
    updatedAt: now(),
  };
}

export class CollaborationExecutionStore implements CollaborationExecutionPort {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly contractPort: SolutionExecutionContractPort,
    private readonly dataRoot = getDataRoot(),
    private readonly dependencies: CollaborationExecutionDependencies = {}
  ) {}

  async start(
    input: StartCollaborationRunInput
  ): Promise<CollaborationRunSnapshot> {
    for (const [field, value] of Object.entries(input))
      if (typeof value === 'string') identifier(value, field);
    if (!Number.isInteger(input.taskRevision) || input.taskRevision < 0)
      throw new TypeError('taskRevision must be a non-negative integer');
    const published = await this.contractPort.load(input);
    if (!published) throw new Error('Execution contract not found');
    if (published.revocation) throw new Error('Execution contract is revoked');
    const { contract } = published;
    if (
      contract.projectId !== input.projectId ||
      contract.solutionId !== input.solutionId ||
      contract.solutionVersion !== input.solutionVersion
    )
      throw new Error(
        'Execution contract reference does not match the request'
      );
    if (contract.status !== 'approved')
      throw new Error('Execution contract is not approved');
    if (contract.contractId !== input.executionContractId)
      throw new Error('Execution contract ID does not match the task binding');
    if (contract.contractHash !== input.contractHash)
      throw new Error(
        'Execution contract hash does not match the task binding'
      );
    assertIntegrity(await this.contractPort.verifyIntegrity(contract));
    const createdAt = now();
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
    };
    const snapshot: CollaborationRunSnapshot = {
      runId,
      projectId: input.projectId,
      binding,
      contract,
      workItems: createWorkItems(contract, binding, input.inputRefs),
      status: 'running',
      revision: 1,
      createdAt,
      updatedAt: createdAt,
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
          await fs.readFile(
            path.join(this.dataRoot, 'projects', projectId, 'collaboration-runs', file.name),
            'utf8',
          ),
        ) as CollaborationRunSnapshot);
        if (snapshot.projectId !== projectId) {
          throw new Error('Collaboration run crossed project scope');
        }
        assertIntegrity(await this.contractPort.verifyIntegrity(snapshot.contract));
        return snapshot.binding.parentTaskId === parentTaskId
          ? snapshot
          : null;
      }));
    const runs = matches.filter((snapshot): snapshot is CollaborationRunSnapshot => Boolean(snapshot));
    if (runs.length > 1) {
      throw new Error('Multiple collaboration runs match one project task');
    }
    return runs[0] ?? null;
  }
  async pause(runId: string): Promise<CollaborationRunSnapshot> {
    return this.transition(runId, 'paused', ['running']);
  }
  async resume(runId: string): Promise<CollaborationRunSnapshot> {
    return this.transition(runId, 'running', ['paused']);
  }
  async cancel(runId: string): Promise<CollaborationRunSnapshot> {
    return this.transition(runId, 'canceled', ['running', 'paused']);
  }

  async executeWorkItem(
    input: WorkItemExecutionRequest
  ): Promise<CollaborationRunSnapshot> {
    identifier(input.runId, 'runId');
    identifier(input.workItemId, 'workItemId');
    identifier(input.requestId, 'requestId');
    nonEmpty(input.payloadHash, 'payloadHash');
    return this.enqueue(input.runId, async () => this.executeOrRecover(input));
  }

  /** Replays only ledger stages that are provably missing; it never creates a lease. */
  async recover(runId: string): Promise<CollaborationRunSnapshot> {
    identifier(runId, 'runId');
    return this.enqueue(runId, async () => {
      let snapshot = await this.readRun(runId);
      if (snapshot.status !== 'running') return snapshot;
      for (const item of snapshot.workItems) {
        const attempt = item.attempts.at(-1);
        if (
          !attempt ||
          ['completed', 'revision', 'blocked', 'needs_review'].includes(
            attempt.status
          )
        )
          continue;
        snapshot = await this.advance(snapshot, item.id, attempt.attemptId);
      }
      return snapshot;
    });
  }

  private async executeOrRecover(
    input: WorkItemExecutionRequest
  ): Promise<CollaborationRunSnapshot> {
    let snapshot = await this.readRun(input.runId);
    this.assertRunning(snapshot);
    const item = this.item(snapshot, input.workItemId);
    if (
      !item.dependsOn.every(
        (id) => this.item(snapshot, id).status === 'completed'
      )
    )
      throw new Error('WorkItem dependencies are not satisfied');
    const matching = item.attempts.find(
      (attempt) => attempt.requestId === input.requestId
    );
    if (matching && matching.payloadHash !== input.payloadHash)
      throw new Error(
        'Execution request ID conflicts with an existing payload'
      );
    let attemptId: string;
    if (matching) {
      attemptId = matching.attemptId;
    } else {
      if (item.status === 'completed')
        throw new Error('WorkItem is already completed');
      const leaseEpoch = item.leaseEpoch + 1;
      const createdAt = now();
      const attempt: WorkItemAttempt = {
        attemptId: `${item.id}:attempt-${leaseEpoch}`,
        leaseEpoch,
        requestId: input.requestId,
        payloadHash: input.payloadHash,
        status: 'intent',
        createdAt,
        updatedAt: createdAt,
      };
      const updatedItem: CollaborationWorkItem = {
        ...item,
        status: 'running',
        revision: item.revision + 1,
        leaseEpoch,
        attempts: [...item.attempts, attempt],
      };
      snapshot = updateItem(snapshot, updatedItem);
      await this.writeRun(snapshot);
      attemptId = attempt.attemptId;
    }
    return this.advance(snapshot, input.workItemId, attemptId);
  }

  private async advance(
    snapshot: CollaborationRunSnapshot,
    workItemId: string,
    attemptId: string
  ): Promise<CollaborationRunSnapshot> {
    this.assertRunning(snapshot);
    let item = this.item(snapshot, workItemId);
    let attempt = this.attempt(item, attemptId);
    if (
      ['completed', 'revision', 'blocked', 'needs_review'].includes(
        attempt.status
      )
    )
      return snapshot;
    if (!attempt.workerReceipt) {
      if (!this.dependencies.worker)
        return this.recordUnavailable(
          snapshot,
          item,
          attempt,
          'WORKER_UNAVAILABLE'
        );
      try {
        const receipt = await this.dependencies.worker.execute({
          run: snapshot,
          workItem: item,
          attempt,
        });
        this.assertWorkerReceipt(receipt);
        snapshot = await this.persistWorkerReceipt(
          snapshot,
          item.id,
          attempt.attemptId,
          attempt.leaseEpoch,
          receipt
        );
      } catch (error) {
        return this.recordFailure(
          snapshot,
          item,
          attempt,
          'needs_review',
          `WORKER_RECEIPT_UNKNOWN:${this.errorCode(error)}`
        );
      }
    }
    item = this.item(snapshot, workItemId);
    attempt = this.attempt(item, attemptId);
    if (!attempt.verifierResult) {
      if (!this.dependencies.verifier)
        return this.recordUnavailable(
          snapshot,
          item,
          attempt,
          'VERIFIER_UNAVAILABLE'
        );
      snapshot = await this.verify(snapshot, item, attempt);
    }
    item = this.item(snapshot, workItemId);
    attempt = this.attempt(item, attemptId);
    if (!attempt.verifierResult || attempt.verifierResult.status !== 'passed')
      return snapshot;
    if (
      !this.validPassedVerification(
        attempt.verifierResult,
        snapshot.contract.contractHash
      )
    )
      return this.recordFailure(
        snapshot,
        item,
        attempt,
        'blocked',
        'VERIFIER_RESULT_INCOMPLETE'
      );
    if (!attempt.evidenceReceipt) {
      if (!this.dependencies.evidenceSink)
        return this.recordUnavailable(
          snapshot,
          item,
          attempt,
          'EVIDENCE_SINK_UNAVAILABLE'
        );
      try {
        const receipt = await this.dependencies.evidenceSink.record({
          run: snapshot,
          workItem: item,
          attempt,
          workerReceipt: attempt.workerReceipt!,
          verifierResult: attempt.verifierResult,
          idempotencyKey: `${snapshot.runId}:${item.id}:${attempt.attemptId}:evidence`,
        });
        if (!receipt || !receipt.receiptId || receipt.status === 'unknown')
          return this.recordFailure(
            snapshot,
            item,
            attempt,
            'needs_review',
            'EVIDENCE_RECEIPT_UNKNOWN'
          );
        snapshot = await this.recordEvidenceReceipt(
          snapshot,
          item.id,
          attempt.attemptId,
          attempt.leaseEpoch,
          receipt
        );
      } catch (error) {
        return this.recordFailure(
          snapshot,
          item,
          attempt,
          'needs_review',
          `EVIDENCE_RECEIPT_UNKNOWN:${this.errorCode(error)}`
        );
      }
    }
    return snapshot;
  }

  private async verify(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt
  ): Promise<CollaborationRunSnapshot> {
    try {
      const result = await this.dependencies.verifier!.verify({
        run: snapshot,
        workItem: item,
        attempt,
        workerReceipt: attempt.workerReceipt!,
      });
      if (!result || result.status === 'placeholder')
        return this.recordFailure(
          snapshot,
          item,
          attempt,
          'blocked',
          'VERIFIER_PLACEHOLDER'
        );
      const status: AttemptStatus =
        result.status === 'passed' ? 'evidence_pending' : 'revision';
      return this.updateAttempt(
        snapshot,
        item.id,
        attempt.attemptId,
        attempt.leaseEpoch,
        (current) => ({
          ...current,
          status,
          verifierResult: result,
          reason: result.reason,
        }),
        result.status === 'passed' ? 'verifying' : 'revision'
      );
    } catch (error) {
      return this.recordFailure(
        snapshot,
        item,
        attempt,
        'blocked',
        `VERIFIER_FAILED:${this.errorCode(error)}`
      );
    }
  }

  /** Accepts a late host receipt only when its current attempt and lease still match. */
  async recordWorkerReceipt(
    runId: string,
    workItemId: string,
    attemptId: string,
    leaseEpoch: number,
    receipt: WorkerReceipt
  ): Promise<CollaborationRunSnapshot> {
    return this.enqueue(runId, async () =>
      this.persistWorkerReceipt(
        await this.readRun(runId),
        workItemId,
        attemptId,
        leaseEpoch,
        receipt
      )
    );
  }
  private async persistWorkerReceipt(
    snapshot: CollaborationRunSnapshot,
    workItemId: string,
    attemptId: string,
    leaseEpoch: number,
    receipt: WorkerReceipt
  ): Promise<CollaborationRunSnapshot> {
    this.assertRunning(snapshot);
    this.assertWorkerReceipt(receipt);
    const item = this.item(snapshot, workItemId);
    const current = this.attempt(item, attemptId);
    if (current.leaseEpoch !== leaseEpoch || item.leaseEpoch !== leaseEpoch)
      throw new Error('Stale WorkItem lease epoch');
    if (current.workerReceipt) {
      if (current.workerReceipt.receiptId !== receipt.receiptId)
        throw new Error('Worker receipt conflicts with recorded receipt');
      return snapshot;
    }
    return this.updateAttempt(
      snapshot,
      workItemId,
      attemptId,
      leaseEpoch,
      (attempt) => ({
        ...attempt,
        status: 'worker_received',
        workerReceipt: receipt,
      }),
      'running'
    );
  }

  private async recordEvidenceReceipt(
    snapshot: CollaborationRunSnapshot,
    workItemId: string,
    attemptId: string,
    leaseEpoch: number,
    receipt: EvidenceReceipt
  ): Promise<CollaborationRunSnapshot> {
    return this.updateAttempt(
      snapshot,
      workItemId,
      attemptId,
      leaseEpoch,
      (attempt) => ({
        ...attempt,
        status: 'completed',
        evidenceReceipt: receipt,
      }),
      'completed'
    );
  }

  /** A host capability can appear after restart; retain the last proven ledger stage. */
  private async recordUnavailable(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
    reason: string
  ): Promise<CollaborationRunSnapshot> {
    return this.updateAttempt(
      snapshot,
      item.id,
      attempt.attemptId,
      attempt.leaseEpoch,
      (current) => ({ ...current, reason }),
      'blocked'
    );
  }

  private async recordFailure(
    snapshot: CollaborationRunSnapshot,
    item: CollaborationWorkItem,
    attempt: WorkItemAttempt,
    status: Extract<AttemptStatus, 'blocked' | 'needs_review'>,
    reason: string
  ): Promise<CollaborationRunSnapshot> {
    return this.updateAttempt(
      snapshot,
      item.id,
      attempt.attemptId,
      attempt.leaseEpoch,
      (current) => ({ ...current, status, reason }),
      status
    );
  }

  private async updateAttempt(
    snapshot: CollaborationRunSnapshot,
    workItemId: string,
    attemptId: string,
    leaseEpoch: number,
    change: (attempt: WorkItemAttempt) => WorkItemAttempt,
    workStatus: WorkItemStatus
  ): Promise<CollaborationRunSnapshot> {
    this.assertRunning(snapshot);
    const item = this.item(snapshot, workItemId);
    const current = this.attempt(item, attemptId);
    if (current.leaseEpoch !== leaseEpoch || item.leaseEpoch !== leaseEpoch)
      throw new Error('Stale WorkItem lease epoch');
    const nextAttempt = { ...change(current), updatedAt: now() };
    const nextItem: CollaborationWorkItem = {
      ...item,
      status: workStatus,
      revision: item.revision + 1,
      attempts: item.attempts.map((attempt) =>
        attempt.attemptId === attemptId ? nextAttempt : attempt
      ),
    };
    const updated = updateItem(snapshot, nextItem);
    await this.writeRun(updated);
    return updated;
  }

  private assertRunning(snapshot: CollaborationRunSnapshot): void {
    if (snapshot.status !== 'running')
      throw new Error(`Cannot execute ${snapshot.status} run`);
  }
  private item(
    snapshot: CollaborationRunSnapshot,
    workItemId: string
  ): CollaborationWorkItem {
    const item = snapshot.workItems.find(
      (candidate) => candidate.id === workItemId
    );
    if (!item) throw new Error(`WorkItem not found: ${workItemId}`);
    return item;
  }
  private attempt(
    item: CollaborationWorkItem,
    attemptId: string
  ): WorkItemAttempt {
    const attempt = item.attempts.find(
      (candidate) => candidate.attemptId === attemptId
    );
    if (!attempt) throw new Error(`WorkItem attempt not found: ${attemptId}`);
    return attempt;
  }
  private assertWorkerReceipt(receipt: WorkerReceipt): void {
    if (
      !receipt ||
      !receipt.receiptId ||
      !receipt.outputHash ||
      !receipt.outputRefs?.length
    )
      throw new Error('Worker receipt is incomplete');
  }
  private validPassedVerification(
    result: VerifierResult,
    contractHash: string
  ): boolean {
    return (
      result.status === 'passed' &&
      Boolean(
        result.verificationMethod &&
        result.artifactRefs?.length &&
        result.resultRef &&
        result.contentHash &&
        result.contractHash === contractHash
      )
    );
  }
  private errorCode(error: unknown): string {
    return error instanceof Error
      ? error.message.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
      : 'UNKNOWN';
  }

  private async transition(
    runId: string,
    status: CollaborationRunSnapshot['status'],
    allowed: readonly CollaborationRunSnapshot['status'][]
  ): Promise<CollaborationRunSnapshot> {
    identifier(runId, 'runId');
    return this.enqueue(runId, async () => {
      const snapshot = await this.readRun(runId);
      if (!allowed.includes(snapshot.status))
        throw new Error(
          `Cannot transition ${snapshot.status} run to ${status}`
        );
      const updated = {
        ...snapshot,
        status,
        revision: snapshot.revision + 1,
        updatedAt: now(),
      };
      await this.writeRun(updated);
      return updated;
    });
  }
  private async readRun(runId: string): Promise<CollaborationRunSnapshot> {
    let directories: Dirent[];
    try {
      directories = await fs.readdir(path.join(this.dataRoot, 'projects'), {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new Error(`Collaboration run not found: ${runId}`);
      throw error;
    }
    for (const directory of directories) {
      if (!directory.isDirectory()) continue;
      const filePath = this.runPath(directory.name, runId);
      try {
        const snapshot = JSON.parse(
          await fs.readFile(filePath, 'utf8')
        ) as CollaborationRunSnapshot;
        if (snapshot.runId !== runId)
          throw new Error('Run ID does not match its ledger');
        assertIntegrity(
          await this.contractPort.verifyIntegrity(snapshot.contract)
        );
        return this.normalizeSnapshot(snapshot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new Error(`Collaboration run not found: ${runId}`);
  }
  private normalizeSnapshot(
    snapshot: CollaborationRunSnapshot
  ): CollaborationRunSnapshot {
    return {
      ...snapshot,
      workItems: snapshot.workItems.map((item) => ({
        ...item,
        leaseEpoch: item.leaseEpoch ?? 0,
        attempts: item.attempts ?? [],
      })),
    };
  }
  private async writeRun(snapshot: CollaborationRunSnapshot): Promise<void> {
    const filePath = this.runPath(snapshot.projectId, snapshot.runId);
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    try {
      await fs.rename(temporary, filePath);
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
      `${runId}.json`
    );
  }
  private async enqueue<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const queued =
      this.queues.get(key)?.then(operation, operation) ?? operation();
    this.queues.set(key, queued);
    try {
      return await queued;
    } finally {
      if (this.queues.get(key) === queued) this.queues.delete(key);
    }
  }
}
