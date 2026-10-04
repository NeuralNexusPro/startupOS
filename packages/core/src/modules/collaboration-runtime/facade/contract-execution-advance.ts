/**
 * contract-execution-advance — WorkItem 状态机推进——五阶段调度循环（readiness→worker→verifier→outcome→evidence）。
 */

import type {
  CollaborationRunSnapshot,
  EvidenceReceipt,
  OutcomeReceipt,
  VerifierResult,
  WorkerReceipt,
  WorkItemReadinessResult,
} from './contract-execution-types';
import type { ContractExecutionCtx } from './contract-execution-ledger';
import * as ops from './contract-execution-ops';
import { TERMINAL_ATTEMPT_STATUSES } from './contract-execution-shared';
import {
  runClaimStage,
  runCommitEvidence,
  runCommitOutcome,
  runCommitReadiness,
  runCommitVerification,
  runCommitWorker,
  runEnsureFailureHitlIfConfigured,
  runEnsureHitl,
  runFailBudget,
  runPublishPendingHitl,
  runRecordFailure,
  runRecordUnavailable,
  runStageFailure,
} from './contract-execution-stages';

export async function runAdvanceLedger(
  ctx: ContractExecutionCtx,
  runId: string,
  workItemId: string,
  attemptId: string,
): Promise<CollaborationRunSnapshot> {
  for (let guard = 0; guard < 12; guard += 1) {
    let snapshot = await ctx.readRun(runId);
    if (snapshot.status !== 'running') return snapshot;
    let item = ops.item(snapshot, workItemId);
    let attempt = ops.attempt(item, attemptId);
    if (TERMINAL_ATTEMPT_STATUSES.has(attempt.status)) return snapshot;
    if (attempt.status === 'waiting_hitl') {
      await runPublishPendingHitl(ctx, snapshot, attempt);
      return ctx.readRun(runId);
    }
    const runtimeBudget = ops.runtimeBudgetFailure(ctx.clock, snapshot);
    if (runtimeBudget) {
      return runFailBudget(ctx, snapshot, item, attempt, runtimeBudget);
    }

    if (!attempt.readinessReceipt) {
      if (!ctx.dependencies.readiness) {
        return runRecordUnavailable(
          ctx,
          snapshot,
          item,
          attempt,
          'READINESS_UNAVAILABLE',
        );
      }
      const claim = await runClaimStage(
        ctx,
        runId,
        item.id,
        attempt.attemptId,
        'readiness',
      );
      if (claim.state !== 'claimed') return claim.snapshot;
      const claimed = ops.locate(claim.snapshot, item.id, attempt.attemptId);
      let result: WorkItemReadinessResult;
      try {
        result = await ctx.dependencies.readiness.check({
          run: claim.snapshot,
          workItem: claimed.item,
          attempt: claimed.attempt,
          requiredInputRefs: claimed.item.inputRefs,
          requiredPermissions: claim.snapshot.contract.permissions.allowed,
        });
      } catch (error) {
        return runStageFailure(
          ctx,
          claim.snapshot,
          claimed.item,
          claimed.attempt,
          claim.claim!,
          `READINESS_FAILED:${ops.errorCode(error)}`,
        );
      }
      snapshot = await runCommitReadiness(
        ctx,
        runId,
        claimed.item.id,
        claimed.attempt.attemptId,
        claimed.attempt.leaseEpoch,
        claim.claim!,
        result,
      );
      item = ops.item(snapshot, workItemId);
      attempt = ops.attempt(item, attemptId);
      if (attempt.readinessReceipt?.status !== 'ready') return snapshot;
      continue;
    }

    const beforePolicy = ops.hitlPolicy(snapshot, item, 'before_execution');
    if (
      beforePolicy
      && !ops.resolvedHitl(attempt, beforePolicy.id, 'approve')
    ) {
      snapshot = await runEnsureHitl(ctx, snapshot, item, attempt, beforePolicy);
      await runPublishPendingHitl(
        ctx,
        snapshot,
        ops.attempt(ops.item(snapshot, item.id), attempt.attemptId),
      );
      return snapshot;
    }

    if (!attempt.workerReceipt) {
      if (!ctx.dependencies.worker) {
        return runRecordUnavailable(
          ctx,
          snapshot,
          item,
          attempt,
          'WORKER_UNAVAILABLE',
        );
      }
      const claim = await runClaimStage(ctx, runId, item.id, attempt.attemptId, 'worker');
      if (claim.state !== 'claimed') return claim.snapshot;
      const claimed = ops.locate(claim.snapshot, item.id, attempt.attemptId);
      let receipt: WorkerReceipt;
      try {
        receipt = await ctx.dependencies.worker.execute({
          run: claim.snapshot,
          workItem: claimed.item,
          attempt: claimed.attempt,
          executionKey: ops.executionKey(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
          ),
          idempotencyKey: claim.claim!.idempotencyKey,
        });
        ops.assertWorkerReceipt(receipt);
      } catch (error) {
        return runStageFailure(
          ctx,
          claim.snapshot,
          claimed.item,
          claimed.attempt,
          claim.claim!,
          `WORKER_RECEIPT_UNKNOWN:${ops.errorCode(error)}`,
        );
      }
      snapshot = await runCommitWorker(
        ctx,
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
      if (!ctx.dependencies.verifier) {
        return runRecordUnavailable(
          ctx,
          snapshot,
          item,
          attempt,
          'VERIFIER_UNAVAILABLE',
        );
      }
      const claim = await runClaimStage(
        ctx,
        runId,
        item.id,
        attempt.attemptId,
        'verifier',
      );
      if (claim.state !== 'claimed') return claim.snapshot;
      const claimed = ops.locate(claim.snapshot, item.id, attempt.attemptId);
      let result: VerifierResult;
      try {
        result = await ctx.dependencies.verifier.verify({
          run: claim.snapshot,
          workItem: claimed.item,
          attempt: claimed.attempt,
          executionKey: ops.executionKey(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
          ),
          idempotencyKey: claim.claim!.idempotencyKey,
          workerReceipt: claimed.attempt.workerReceipt!,
        });
      } catch (error) {
        return runStageFailure(
          ctx,
          claim.snapshot,
          claimed.item,
          claimed.attempt,
          claim.claim!,
          `VERIFIER_FAILED:${ops.errorCode(error)}`,
        );
      }
      snapshot = await runCommitVerification(
        ctx,
        runId,
        claimed.item.id,
        claimed.attempt.attemptId,
        claimed.attempt.leaseEpoch,
        claim.claim!,
        result,
      );
      item = ops.item(snapshot, workItemId);
      attempt = ops.attempt(item, attemptId);
      if (attempt.verifierResult?.status !== 'passed') {
        return runEnsureFailureHitlIfConfigured(ctx, snapshot, item, attempt);
      }
      continue;
    }

    if (
      !ops.validPassedVerification(
        attempt.verifierResult,
        snapshot.contract.contractHash,
      )
    ) {
      return runRecordFailure(
        ctx,
        snapshot,
        item,
        attempt,
        'blocked',
        'VERIFIER_RESULT_INCOMPLETE',
      );
    }

    const afterPolicy = ops.hitlPolicy(snapshot, item, 'after_verification');
    if (
      afterPolicy
      && !ops.resolvedHitl(attempt, afterPolicy.id, 'approve')
    ) {
      snapshot = await runEnsureHitl(ctx, snapshot, item, attempt, afterPolicy);
      await runPublishPendingHitl(
        ctx,
        snapshot,
        ops.attempt(ops.item(snapshot, item.id), attempt.attemptId),
      );
      return snapshot;
    }

    if (!attempt.outcomeReceipt) {
      if (!ctx.dependencies.outcome) {
        return runRecordUnavailable(
          ctx,
          snapshot,
          item,
          attempt,
          'OUTCOME_COMMIT_UNAVAILABLE',
        );
      }
      const claim = await runClaimStage(ctx, runId, item.id, attempt.attemptId, 'outcome');
      if (claim.state !== 'claimed') return claim.snapshot;
      const claimed = ops.locate(claim.snapshot, item.id, attempt.attemptId);
      let receipt: OutcomeReceipt;
      try {
        receipt = await ctx.dependencies.outcome.commit({
          run: claim.snapshot,
          workItem: claimed.item,
          attempt: claimed.attempt,
          executionKey: ops.executionKey(
            claim.snapshot,
            claimed.item,
            claimed.attempt,
          ),
          workerReceipt: claimed.attempt.workerReceipt!,
          verifierResult: claimed.attempt.verifierResult!,
          idempotencyKey: claim.claim!.idempotencyKey,
        });
      } catch (error) {
        return runStageFailure(
          ctx,
          claim.snapshot,
          claimed.item,
          claimed.attempt,
          claim.claim!,
          `OUTCOME_RECEIPT_UNKNOWN:${ops.errorCode(error)}`,
        );
      }
      snapshot = await runCommitOutcome(
        ctx,
        runId,
        claimed.item.id,
        claimed.attempt.attemptId,
        claimed.attempt.leaseEpoch,
        claim.claim!,
        receipt,
      );
      item = ops.item(snapshot, workItemId);
      attempt = ops.attempt(item, attemptId);
      if (attempt.outcomeReceipt?.status !== 'accepted') {
        return runEnsureFailureHitlIfConfigured(ctx, snapshot, item, attempt);
      }
      continue;
    }

    if (!attempt.evidenceReceipt) {
      if (!ctx.dependencies.evidenceSink) {
        return runRecordUnavailable(
          ctx,
          snapshot,
          item,
          attempt,
          'EVIDENCE_SINK_UNAVAILABLE',
        );
      }
      const claim = await runClaimStage(ctx, runId, item.id, attempt.attemptId, 'evidence');
      if (claim.state !== 'claimed') return claim.snapshot;
      const claimed = ops.locate(claim.snapshot, item.id, attempt.attemptId);
      const evidenceHash = ops.evidenceHash(
        claim.snapshot,
        claimed.item,
        claimed.attempt,
      );
      let receipt: EvidenceReceipt;
      try {
        receipt = await ctx.dependencies.evidenceSink.record({
          run: claim.snapshot,
          workItem: claimed.item,
          attempt: claimed.attempt,
          executionKey: ops.executionKey(
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
        return runStageFailure(
          ctx,
          claim.snapshot,
          claimed.item,
          claimed.attempt,
          claim.claim!,
          `EVIDENCE_RECEIPT_UNKNOWN:${ops.errorCode(error)}`,
        );
      }
      if (!receipt.receiptId || receipt.status !== 'accepted') {
        return runStageFailure(
          ctx,
          claim.snapshot,
          claimed.item,
          claimed.attempt,
          claim.claim!,
          'EVIDENCE_RECEIPT_UNKNOWN',
        );
      }
      snapshot = await runCommitEvidence(
        ctx,
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
