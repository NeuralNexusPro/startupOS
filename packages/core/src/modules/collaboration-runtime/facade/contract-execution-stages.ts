/**
 * contract-execution-stages — WorkItem 阶段提交——stage 认领、五阶段 commit、HITL 保障与失败登记。
 */

import { randomUUID } from 'node:crypto';

import type { HitlPolicy } from '../../../lib/features/solution';
import type {
  AttemptStatus,
  CollaborationRunSnapshot,
  CollaborationWorkItem,
  EvidenceReceipt,
  OutcomeReceipt,
  VerifierResult,
  WorkItemAttempt,
  WorkItemExecutionStage,
  WorkItemHitlRequest,
  WorkItemReadinessResult,
  WorkItemStageClaim,
  WorkItemStatus,
  WorkerReceipt,
} from './contract-execution-types';
import type { ContractExecutionCtx } from './contract-execution-ledger';
import { runMutate, runReadRun } from './contract-execution-ledger';
import * as ops from './contract-execution-ops';
import type { StageClaimResult } from './contract-execution-ops';
import {
  CollaborationMutationConflictError,
  CollaborationWorkItemHandoffError,
  updateItem,
} from './contract-execution-shared';

export async function runClaimStage(
  ctx: ContractExecutionCtx,
  runId: string,
  workItemIdValue: string,
  attemptId: string,
  stage: WorkItemExecutionStage,
): Promise<StageClaimResult> {
  let result: StageClaimResult | undefined;
  await runMutate(ctx, runId, (snapshot) => {
    ops.assertRunning(snapshot);
    const item = ops.item(snapshot, workItemIdValue);
    const attempt = ops.attempt(item, attemptId);
    ops.assertCurrentLease(item, attempt);
    if (ops.stageDone(attempt, stage)) {
      result = { state: 'done', snapshot };
      return snapshot;
    }
    const timestamp = ctx.now();
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
      hostId: ctx.hostId,
      expectedWorkItemRevision: item.revision + 1,
      claimedAt: timestamp,
      expiresAt: new Date(
        new Date(timestamp).getTime() + ctx.claimTtlMs,
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
    snapshot: await runReadRun(ctx, runId),
  };
}

export async function runCommitReadiness(
  ctx: ContractExecutionCtx,
  runId: string,
  workItemIdValue: string,
  attemptId: string,
  leaseEpoch: number,
  claim: WorkItemStageClaim,
  result: WorkItemReadinessResult,
): Promise<CollaborationRunSnapshot> {
  const timestamp = ctx.now();
  const inputRefs = result.inputRefs ?? [];
  const grantedPermissions = result.grantedPermissions ?? [];
  return runCommitAttemptStage(
    ctx,
    runId,
    workItemIdValue,
    attemptId,
    leaseEpoch,
    claim,
    (attempt, snapshot, item) => {
      const permissionsReady = ops.allIncluded(
        snapshot.contract.permissions.allowed,
        grantedPermissions,
      );
      const inputsReady = ops.allIncluded(item.inputRefs, inputRefs);
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

export async function runCommitWorker(
  ctx: ContractExecutionCtx,
  runId: string,
  workItemIdValue: string,
  attemptId: string,
  leaseEpoch: number,
  claim: WorkItemStageClaim,
  receipt: WorkerReceipt,
): Promise<CollaborationRunSnapshot> {
  try {
    return await runCommitAttemptStage(
      ctx,
      runId,
      workItemIdValue,
      attemptId,
      leaseEpoch,
      claim,
      (attempt, snapshot, item) => {
        const budgetReason = ops.receiptBudgetFailure(ctx.clock, snapshot, item, receipt);
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
    const current = await runReadRun(ctx, runId);
    const recorded = ops.attempt(
      ops.item(current, workItemIdValue),
      attemptId,
    ).workerReceipt;
    if (recorded?.receiptId === receipt.receiptId) return current;
    throw error;
  }
}

export async function runCommitVerification(
  ctx: ContractExecutionCtx,
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
  return runCommitAttemptStage(
    ctx,
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

export async function runCommitOutcome(
  ctx: ContractExecutionCtx,
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
  return runCommitAttemptStage(
    ctx,
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

export async function runCommitEvidence(
  ctx: ContractExecutionCtx,
  runId: string,
  workItemIdValue: string,
  attemptId: string,
  leaseEpoch: number,
  receipt: EvidenceReceipt,
  claim?: WorkItemStageClaim,
): Promise<CollaborationRunSnapshot> {
  return runCommitAttemptStage(
    ctx,
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

export async function runCommitAttemptStage(
  ctx: ContractExecutionCtx,
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
  return runMutate(ctx, runId, (snapshot) => {
    ops.assertRunning(snapshot);
    const item = ops.item(snapshot, workItemIdValue);
    const attempt = ops.attempt(item, attemptId);
    if (attempt.leaseEpoch !== leaseEpoch || item.leaseEpoch !== leaseEpoch) {
      throw new CollaborationWorkItemHandoffError(
        'STALE_LEASE_EPOCH',
        'Stale WorkItem lease epoch',
      );
    }
    if (claim) ops.assertClaim(item, attempt, claim);
    const timestamp = ctx.now();
    const nextAttempt = { ...change(attempt, snapshot, item), updatedAt: timestamp };
    const itemStatus = ops.itemStatusForAttempt(
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

export async function runStageFailure(
  ctx: ContractExecutionCtx,
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  attempt: WorkItemAttempt,
  claim: WorkItemStageClaim,
  reason: string,
): Promise<CollaborationRunSnapshot> {
  const policy = ops.hitlPolicy(snapshot, item, 'on_failure');
  const failed = await runCommitAttemptStage(
    ctx,
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
  const currentItem = ops.item(failed, item.id);
  const waiting = await runEnsureHitl(
    ctx,
    failed,
    currentItem,
    ops.attempt(currentItem, attempt.attemptId),
    policy,
  );
  await runPublishPendingHitl(
    ctx,
    waiting,
    ops.attempt(ops.item(waiting, item.id), attempt.attemptId),
  );
  return waiting;
}

export async function runEnsureFailureHitlIfConfigured(
  ctx: ContractExecutionCtx,
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  attempt: WorkItemAttempt,
): Promise<CollaborationRunSnapshot> {
  const policy = ops.hitlPolicy(snapshot, item, 'on_failure');
  if (!policy) return snapshot;
  const waiting = await runEnsureHitl(ctx, snapshot, item, attempt, policy);
  await runPublishPendingHitl(
    ctx,
    waiting,
    ops.attempt(ops.item(waiting, item.id), attempt.attemptId),
  );
  return waiting;
}

export async function runEnsureHitl(
  ctx: ContractExecutionCtx,
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
  if (!ctx.dependencies.hitl) {
    return runRecordUnavailable(
      ctx,
      snapshot,
      item,
      attempt,
      'HITL_PORT_UNAVAILABLE',
    );
  }
  return runMutate(ctx, snapshot.runId, (current) => {
    ops.assertRunning(current);
    const currentItem = ops.item(current, item.id);
    const currentAttempt = ops.attempt(currentItem, attempt.attemptId);
    ops.assertCurrentLease(currentItem, currentAttempt);
    const duplicate = (currentAttempt.hitlRequests ?? []).find(
      (request) => request.policyId === policy.id
        && request.trigger === policy.trigger,
    );
    if (duplicate) return current;
    const timestamp = ctx.now();
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
      question: ops.hitlQuestion(policy.trigger, currentItem),
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

export async function runPublishPendingHitl(
  ctx: ContractExecutionCtx,
  snapshot: CollaborationRunSnapshot,
  attempt: WorkItemAttempt,
): Promise<void> {
  if (!ctx.dependencies.hitl) return;
  const pending = (attempt.hitlRequests ?? []).filter(
    (request) => request.status === 'pending',
  );
  await Promise.all(pending.map((request) =>
    ctx.dependencies.hitl!.open({
      run: snapshot,
      request,
      idempotencyKey: request.requestId,
    })
  ));
}

export async function runRecordUnavailable(
  ctx: ContractExecutionCtx,
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  attempt: WorkItemAttempt,
  reason: string,
): Promise<CollaborationRunSnapshot> {
  return runCommitAttemptStage(
    ctx,
    snapshot.runId,
    item.id,
    attempt.attemptId,
    attempt.leaseEpoch,
    undefined,
    (current) => ({ ...current, reason, stageClaim: undefined }),
    'blocked',
  );
}

export async function runRecordFailure(
  ctx: ContractExecutionCtx,
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  attempt: WorkItemAttempt,
  status: Extract<AttemptStatus, 'blocked' | 'needs_review'>,
  reason: string,
): Promise<CollaborationRunSnapshot> {
  return runCommitAttemptStage(
    ctx,
    snapshot.runId,
    item.id,
    attempt.attemptId,
    attempt.leaseEpoch,
    undefined,
    (current) => ({ ...current, status, reason, stageClaim: undefined }),
    status,
  );
}

export async function runFailBudget(
  ctx: ContractExecutionCtx,
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  attempt: WorkItemAttempt,
  reason: string,
): Promise<CollaborationRunSnapshot> {
  return runCommitAttemptStage(
    ctx,
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
