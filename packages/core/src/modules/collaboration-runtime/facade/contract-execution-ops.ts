/**
 * contract-execution-ops — Run 账本的无状态运算——定位/校验/HITL 判定/预算核算/聚合等纯函数。
 */

import { createHash } from 'node:crypto';

import type {
  AttemptStatus,
  CollaborationRunSnapshot,
  CollaborationWorkItem,
  HitlDecision,
  HitlTrigger,
  VerifierResult,
  WorkItemAttempt,
  WorkItemExecutionStage,
  WorkItemHandoffCandidate,
  WorkItemHitlRequest,
  WorkItemStageClaim,
  WorkItemStatus,
  WorkerReceipt,
} from './contract-execution-types';
import type { HitlPolicy } from '../../../lib/features/solution';
import {
  CollaborationMutationConflictError,
  CollaborationWorkItemHandoffError,
  TERMINAL_ATTEMPT_STATUSES,
} from './contract-execution-shared';

// 模块内自引用别名：locate 的局部变量 item/attempt 与模块函数同名（遮蔽规避），
// 语义与 this.item/this.attempt 直调完全一致。
const itemOf = item;
const attemptOf = attempt;

export interface StageClaimResult {
  readonly state: 'claimed' | 'busy' | 'done';
  readonly snapshot: CollaborationRunSnapshot;
  readonly claim?: WorkItemStageClaim;
}

export function item(
  snapshot: CollaborationRunSnapshot,
  workItemIdValue: string,
): CollaborationWorkItem {
  const item = snapshot.workItems.find(
    (candidate) => candidate.id === workItemIdValue,
  );
  if (!item) throw new Error(`WorkItem not found: ${workItemIdValue}`);
  return item;
}

export function handoffCandidates(
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

export function attempt(
  item: CollaborationWorkItem,
  attemptId: string,
): WorkItemAttempt {
  const attempt = item.attempts.find(
    (candidate) => candidate.attemptId === attemptId,
  );
  if (!attempt) throw new Error(`WorkItem attempt not found: ${attemptId}`);
  return attempt;
}

export function locate(
  snapshot: CollaborationRunSnapshot,
  workItemIdValue: string,
  attemptId: string,
): { item: CollaborationWorkItem; attempt: WorkItemAttempt } {
  const item = itemOf(snapshot, workItemIdValue);
  return { item, attempt: attemptOf(item, attemptId) };
}

export function findHitl(
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

export function assertRunning(snapshot: CollaborationRunSnapshot): void {
  if (snapshot.status !== 'running' || snapshot.terminalStatus) {
    throw new Error(
      `Cannot execute ${snapshot.terminalStatus ?? snapshot.status} run`,
    );
  }
}

export function fenceActiveAttempt(
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

export function assertCurrentLease(
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

export function assertClaim(
  item: CollaborationWorkItem,
  attempt: WorkItemAttempt,
  claim: WorkItemStageClaim,
): void {
  assertCurrentLease(item, attempt);
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

export function stageDone(
  attempt: WorkItemAttempt,
  stage: WorkItemExecutionStage,
): boolean {
  if (stage === 'readiness') return Boolean(attempt.readinessReceipt);
  if (stage === 'worker') return Boolean(attempt.workerReceipt);
  if (stage === 'verifier') return Boolean(attempt.verifierResult);
  if (stage === 'outcome') return Boolean(attempt.outcomeReceipt);
  return Boolean(attempt.evidenceReceipt);
}

export function hitlPolicy(
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  trigger: HitlTrigger,
): HitlPolicy | undefined {
  return snapshot.contract.hitl.find(
    (policy) =>
      policy.nodeId === item.designNodeId && policy.trigger === trigger,
  );
}

export function resolvedHitl(
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

export function hitlQuestion(
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

export function executionKey(
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  attempt: WorkItemAttempt,
): string {
  return `${snapshot.runId}:${item.id}:${attempt.attemptId}`;
}

export function evidenceHash(
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

export function itemStatusForAttempt(
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

export function assertWorkerReceipt(receipt: WorkerReceipt): void {
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

export function validPassedVerification(
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

export function newAttemptBudgetFailure(
  clock: () => Date,
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
): string | undefined {
  if (item.attempts.length >= snapshot.contract.budget.maxAttempts) {
    return 'MAX_ATTEMPTS_EXCEEDED';
  }
  return runtimeBudgetFailure(clock, snapshot);
}

export function runtimeBudgetFailure(
  clock: () => Date,
  snapshot: CollaborationRunSnapshot,
): string | undefined {
  const elapsed = clock().getTime() - new Date(snapshot.createdAt).getTime();
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

export function receiptBudgetFailure(
  clock: () => Date,
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
    clock().getTime() - new Date(snapshot.createdAt).getTime();
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

export function allIncluded(
  required: readonly string[],
  available: readonly string[],
): boolean {
  const values = new Set(available);
  return required.every((value) => values.has(value));
}

export function errorCode(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
    : 'UNKNOWN';
}

export function normalizeSnapshot(
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
