/**
 * contract-execution-ledger — Run 账本的持久化边界——CAS 读写、互斥 mutate、租约意图认领与运行状态迁移。
 */

import { randomUUID } from 'node:crypto';
import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';

import type { SolutionExecutionContractPort } from '../../../lib/features/solution';
import type {
  CollaborationExecutionDependencies,
  CollaborationMutationLockPort,
  CollaborationRunSnapshot,
  CollaborationRunStatus,
  CollaborationWorkItem,
  WorkItemAttempt,
  WorkItemExecutionRequest,
} from './contract-execution-types';
import * as ops from './contract-execution-ops';
import {
  CollaborationMutationConflictError,
  assertIntegrity,
  clone,
  identifier,
  updateItem,
} from './contract-execution-shared';

/**
 * Run 账本边界上下文：ledger/stages/advance 模块函数经 ctx 消费
 * 存储字段（contractPort/dataRoot/mutationLock/observers）与主类回调（now/readRun），
 * 以及依赖注入配置（dependencies/hostId/claimTtlMs/clock）。
 */
export interface ContractExecutionCtx {
  readonly contractPort: SolutionExecutionContractPort;
  readonly dataRoot: string;
  readonly dependencies: CollaborationExecutionDependencies;
  readonly mutationLock: CollaborationMutationLockPort;
  readonly hostId: string;
  readonly claimTtlMs: number;
  readonly clock: () => Date;
  now(): string;
  readRun(runId: string): Promise<CollaborationRunSnapshot>;
  readonly observers: Map<
    string,
    { observer: { checkpoint(): void }; users: number }
  >;
}

export async function runMutate(
  ctx: ContractExecutionCtx,
  runId: string,
  operation: (
    snapshot: CollaborationRunSnapshot,
  ) => CollaborationRunSnapshot | Promise<CollaborationRunSnapshot>,
): Promise<CollaborationRunSnapshot> {
  return ctx.mutationLock.withLock(runId, async () => {
    const snapshot = await ctx.readRun(runId);
    const next = await operation(clone(snapshot));
    if (next === snapshot || JSON.stringify(next) === JSON.stringify(snapshot)) {
      return snapshot;
    }
    if (next.revision !== snapshot.revision + 1) {
      throw new CollaborationMutationConflictError(
        `Expected revision ${snapshot.revision + 1}, received ${next.revision}`,
      );
    }
    await runWriteRunCas(ctx, next, snapshot.revision);
    return next;
  });
}

export async function runReadRun(
  ctx: ContractExecutionCtx,
  runId: string,
): Promise<CollaborationRunSnapshot> {
  let directories: Dirent[];
  try {
    directories = await fs.readdir(path.join(ctx.dataRoot, 'projects'), {
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
    const filePath = runPath(ctx, directory.name, runId);
    try {
      const snapshot = JSON.parse(
        await fs.readFile(filePath, 'utf8'),
      ) as CollaborationRunSnapshot;
      if (snapshot.runId !== runId) {
        throw new Error('Run ID does not match its ledger');
      }
      assertIntegrity(await ctx.contractPort.verifyIntegrity(snapshot.contract));
      return ops.normalizeSnapshot(snapshot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Collaboration run not found: ${runId}`);
}

export async function runWriteRunCas(
  ctx: ContractExecutionCtx,
  snapshot: CollaborationRunSnapshot,
  expectedRevision: number,
): Promise<void> {
  const filePath = runPath(ctx, snapshot.projectId, snapshot.runId);
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
    ctx.observers.get(snapshot.runId)?.observer.checkpoint();
  } finally {
    await fs.unlink(temporary).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }
}

export function runPath(
  ctx: ContractExecutionCtx,
  projectId: string,
  runId: string,
): string {
  identifier(projectId, 'projectId');
  identifier(runId, 'runId');
  return path.join(
    ctx.dataRoot,
    'projects',
    projectId,
    'collaboration-runs',
    `${runId}.json`,
  );
}

export async function runClaimAttempt(
  ctx: ContractExecutionCtx,
  input: WorkItemExecutionRequest,
): Promise<string> {
  let attemptId = '';
  await runMutate(ctx, input.runId, (snapshot) => {
    ops.assertRunning(snapshot);
    const item = ops.item(snapshot, input.workItemId);
    if (!item.dependsOn.every(
      (id) => ops.item(snapshot, id).status === 'completed',
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
    const budgetReason = ops.newAttemptBudgetFailure(ctx.clock, snapshot, item);
    if (budgetReason) {
      const timestamp = ctx.now();
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
    const timestamp = ctx.now();
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
    const current = await runReadRun(ctx, input.runId);
    const item = ops.item(current, input.workItemId);
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

export async function runTransition(
  ctx: ContractExecutionCtx,
  runId: string,
  status: CollaborationRunStatus,
  allowed: readonly CollaborationRunStatus[],
): Promise<CollaborationRunSnapshot> {
  identifier(runId, 'runId');
  return runMutate(ctx, runId, (snapshot) => {
    if (snapshot.terminalStatus || !allowed.includes(snapshot.status)) {
      throw new Error(
        `Cannot transition ${snapshot.terminalStatus ?? snapshot.status} run to ${status}`,
      );
    }
    const timestamp = ctx.now();
    const fencedItems = status === 'paused' || status === 'canceled'
      ? snapshot.workItems.map((item) => ops.fenceActiveAttempt(
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
