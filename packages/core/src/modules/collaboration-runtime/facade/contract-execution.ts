/**
 * contract-execution — CollaborationExecutionStore 主类——公共执行 API、observers 桥接与模块组装（ctx 工厂）。
 */

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';

import { RunObserver } from "./run-observation";
import { getDataRoot } from '../../../lib/paths';
import type { SolutionExecutionContractPort } from '../../../lib/features/solution';
import type {
  AcceptedExternalOutputInput,
  AcceptedExternalOutputResult,
  AttemptStatus,
  CollaborationExecutionDependencies,
  CollaborationExecutionPort,
  CollaborationMutationLockPort,
  CollaborationRunSnapshot,
  CollaborationRunStatus,
  CollaborationWorkItem,
  EvidenceReceipt,
  ListWorkItemHandoffCandidatesInput,
  ResolveWorkItemHitlInput,
  SolutionTaskBinding,
  StartCollaborationRunInput,
  WorkItemAttempt,
  WorkItemExecutionRequest,
  WorkItemHandoffInput,
  WorkItemHandoffReceipt,
  WorkItemHandoffResult,
  WorkItemHitlRequest,
  WorkItemStatus,
  WorkerReceipt,
  WorkItemHandoffCandidate,
} from './contract-execution-types';
import {
  DEFAULT_CLAIM_TTL_MS,
  assertIntegrity,
  clone,
  createWorkItems,
  identifier,
  nonEmpty,
  TERMINAL_ATTEMPT_STATUSES,
  updateItem,
  CollaborationMutationConflictError,
  CollaborationReconciliationError,
  CollaborationWorkItemHandoffError,
} from './contract-execution-shared';
import { FileCollaborationMutationLock } from './contract-execution-lock';
import * as ops from './contract-execution-ops';
import {
  runClaimAttempt,
  runMutate,
  runPath,
  runReadRun,
  runTransition,
  type ContractExecutionCtx,
} from './contract-execution-ledger';
import { runAdvanceLedger } from './contract-execution-advance';
import { runCommitAttemptStage, runCommitEvidence } from './contract-execution-stages';

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

  private createCtx(): ContractExecutionCtx {
    const ctx: ContractExecutionCtx = {
      contractPort: this.contractPort,
      dataRoot: this.dataRoot,
      dependencies: this.dependencies,
      mutationLock: this.mutationLock,
      hostId: this.hostId,
      claimTtlMs: this.claimTtlMs,
      clock: this.clock,
      now: () => this.now(),
      readRun: (runId) => runReadRun(ctx, runId),
      observers: this.observers,
    };
    return ctx;
  }

  private mutate(
    runId: string,
    operation: (
      snapshot: CollaborationRunSnapshot,
    ) => CollaborationRunSnapshot | Promise<CollaborationRunSnapshot>,
  ): Promise<CollaborationRunSnapshot> {
    return runMutate(this.createCtx(), runId, operation);
  }

  private readRun(runId: string): Promise<CollaborationRunSnapshot> {
    return runReadRun(this.createCtx(), runId);
  }

  private runPath(projectId: string, runId: string): string {
    return runPath(this.createCtx(), projectId, runId);
  }

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
        const snapshot = ops.normalizeSnapshot(JSON.parse(
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
    const item = ops.item(snapshot, input.workItemId);
    return ops.handoffCandidates(snapshot, item);
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
      const item = ops.item(current, input.workItemId);
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
      const authorized = ops.handoffCandidates(current, item)
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
    const attemptId = await runClaimAttempt(this.createCtx(), input);
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
      const located = ops.findHitl(current, input.requestId);
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
      ops.assertRunning(current);
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
      const located = ops.findHitl(snapshot, input.requestId);
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
    return runCommitAttemptStage(
      this.createCtx(),
      runId,
      workItemId,
      attemptId,
      leaseEpoch,
      undefined,
      (attempt) => {
        ops.assertWorkerReceipt(receipt);
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
      ops.assertRunning(current);
      const item = ops.item(current, input.workItemId);
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

    const item = ops.item(snapshot, input.workItemId);
    const attempt = ops.attempt(item, input.attemptId);
    if (!attempt.evidenceReceipt) {
      if (!this.dependencies.evidenceSink) {
        throw new CollaborationReconciliationError(
          'UNKNOWN_EXTERNAL_RECEIPT',
          'The Evidence sink is unavailable for accepted output reconciliation',
        );
      }
      const evidenceHash = ops.evidenceHash(snapshot, item, attempt);
      let evidence: EvidenceReceipt;
      try {
        evidence = await this.dependencies.evidenceSink.record({
          run: snapshot,
          workItem: item,
          attempt,
          executionKey: ops.executionKey(snapshot, item, attempt),
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
      snapshot = await runCommitEvidence(
        this.createCtx(),
        snapshot.runId,
        item.id,
        attempt.attemptId,
        attempt.leaseEpoch,
        evidence,
      );
    }
    const completed = ops.item(snapshot, input.workItemId);
    const completedAttempt = ops.attempt(completed, input.attemptId);
    return {
      status: recovered ? 'recovered' : 'accepted',
      snapshot,
      workItemRevision: completed.revision,
      evidenceRevision:
        completedAttempt.evidenceReceipt?.revision ?? completed.revision,
    };
  }

  private transition(
    runId: string,
    status: CollaborationRunStatus,
    allowed: readonly CollaborationRunStatus[],
  ): Promise<CollaborationRunSnapshot> {
    return runTransition(this.createCtx(), runId, status, allowed);
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
      return await runAdvanceLedger(this.createCtx(), runId, workItemId, attemptId);
    } finally {
      active.users -= 1;
      if (active.users === 0) {
        await active.observer.stop();
        if (this.observers.get(runId) === active) this.observers.delete(runId);
      }
    }
  }

  private now(): string {
    return this.clock().toISOString();
  }
}

export { FileCollaborationMutationLock } from './contract-execution-lock';
export {
  CollaborationReconciliationError,
  CollaborationMutationConflictError,
  CollaborationWorkItemHandoffError,
} from './contract-execution-shared';
export type {
  AcceptedExternalOutputInput,
  AcceptedExternalOutputResult,
  AttemptStatus,
  CollaborationExecutionDependencies,
  CollaborationExecutionPort,
  CollaborationMutationLockPort,
  CollaborationRunSnapshot,
  CollaborationRunStatus,
  CollaborationRunTerminalStatus,
  CollaborationWorkItem,
  EvidenceReceipt,
  EvidenceSubmissionInput,
  HitlDecision,
  HitlOpenInput,
  HitlTrigger,
  ListWorkItemHandoffCandidatesInput,
  OutcomeCommitInput,
  OutcomeReceipt,
  ResolveWorkItemHitlInput,
  SolutionTaskBinding,
  StartCollaborationRunInput,
  VerifierExecutionInput,
  VerifierResult,
  WorkItemAttempt,
  WorkItemExecutionRequest,
  WorkItemExecutionStage,
  WorkItemHandoffCandidate,
  WorkItemHandoffInput,
  WorkItemHandoffReceipt,
  WorkItemHandoffResult,
  WorkItemHitlPort,
  WorkItemHitlRequest,
  WorkItemOutcomePort,
  WorkItemReadinessInput,
  WorkItemReadinessPort,
  WorkItemReadinessReceipt,
  WorkItemReadinessResult,
  WorkItemStageClaim,
  WorkItemStatus,
  WorkItemUsage,
  WorkItemVerifierPort,
  WorkItemWorkerPort,
  WorkerExecutionInput,
  WorkerReceipt,
  WorkItemEvidenceSink,
} from './contract-execution-types';
