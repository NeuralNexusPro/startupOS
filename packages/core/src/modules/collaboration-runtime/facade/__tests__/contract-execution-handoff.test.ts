import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SolutionExecutionContractStore,
  type SolutionExecutionContract,
  type SolutionExecutionContractBody,
} from '../../../../lib/features/solution';
import {
  body,
  ontology,
} from '../../../../lib/features/solution/__tests__/execution-contract-fixtures';
import {
  CollaborationExecutionStore,
  CollaborationReconciliationError,
  CollaborationWorkItemHandoffError,
  type CollaborationExecutionDependencies,
  type CollaborationRunSnapshot,
  type CollaborationWorkItem,
} from '../contract-execution';

function handoffBody(): SolutionExecutionContractBody {
  const source = body();
  const preparer = source.agents[0]!;
  const reviewer = { ...structuredClone(preparer), agentId: 'reviewer' };
  const editor = { ...structuredClone(preparer), agentId: 'editor' };
  return {
    ...source,
    agents: [preparer, reviewer, editor],
    semanticContext: {
      ...source.semanticContext,
      taskTemplates: source.semanticContext.taskTemplates.map((template) =>
        template.designNodeId === 'prepare'
          ? {
              ...template,
              candidateAgentIds: ['preparer', 'reviewer', 'editor'],
            }
          : template
      ),
    },
  };
}

async function fixture(
  dependencies: CollaborationExecutionDependencies = {},
): Promise<{
  readonly execution: CollaborationExecutionStore;
  readonly contract: SolutionExecutionContract;
  readonly run: CollaborationRunSnapshot;
}> {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'collaboration-handoff-'));
  const contracts = new SolutionExecutionContractStore(dataRoot);
  const published = await contracts.publishCompiled(
    ontology(),
    'confirmed',
    handoffBody(),
  );
  if (!published.ok) throw new Error('handoff fixture contract must publish');
  const contract = published.published.contract;
  const execution = new CollaborationExecutionStore(
    contracts,
    dataRoot,
    dependencies,
  );
  const run = await execution.start({
    projectId: contract.projectId,
    solutionId: contract.solutionId,
    solutionVersion: contract.solutionVersion,
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    taskRevision: 1,
    executionContractId: contract.contractId,
    contractHash: contract.contractHash,
    inputRefs: ['input-1'],
  });
  return { execution, contract, run };
}

function prepare(snapshot: CollaborationRunSnapshot): CollaborationWorkItem {
  const item = snapshot.workItems.find(
    (candidate) => candidate.designNodeId === 'prepare',
  );
  if (!item) throw new Error('prepare WorkItem missing');
  return item;
}

function request(
  run: CollaborationRunSnapshot,
  targetAgentId: string,
  requestId: string,
) {
  const item = prepare(run);
  return {
    projectId: run.projectId,
    runId: run.runId,
    workItemId: item.id,
    targetAgentId,
    requestId,
    expectedRunRevision: run.revision,
    expectedWorkItemRevision: item.revision,
    expectedLeaseEpoch: item.leaseEpoch,
  };
}

describe('contract-bound WorkItem handoff', () => {
  it('returns frozen authorized candidates and persists a stable idempotent receipt', async () => {
    const { execution, run } = await fixture();
    const item = prepare(run);
    await expect(execution.listWorkItemHandoffCandidates({
      projectId: run.projectId,
      runId: run.runId,
      workItemId: item.id,
    })).resolves.toEqual([
      { agentId: 'preparer', displayName: 'preparer', permissions: ['order.prepare'] },
      { agentId: 'reviewer', displayName: 'reviewer', permissions: ['order.prepare'] },
      { agentId: 'editor', displayName: 'editor', permissions: ['order.prepare'] },
    ]);

    const input = request(run, 'reviewer', 'handoff-1');
    const accepted = await execution.handoffWorkItem(input);
    expect(accepted.receipt).toMatchObject({
      requestId: 'handoff-1',
      previousAgentId: 'preparer',
      assignedAgentId: 'reviewer',
      runRevisionBefore: 1,
      runRevisionAfter: 2,
      workItemRevisionBefore: 0,
      workItemRevisionAfter: 1,
      leaseEpochBefore: 0,
      leaseEpochAfter: 1,
      unknownExternalResults: 'manual_review',
    });
    expect(prepare(accepted.snapshot)).toMatchObject({
      assignedAgentId: 'reviewer',
      status: 'assigned',
      revision: 1,
      leaseEpoch: 1,
    });

    const repeated = await execution.handoffWorkItem(input);
    expect(repeated.receipt).toEqual(accepted.receipt);
    expect(repeated.snapshot.revision).toBe(2);
    await expect(execution.handoffWorkItem({
      ...input,
      targetAgentId: 'editor',
    })).rejects.toMatchObject({
      code: 'HANDOFF_REQUEST_ID_CONFLICT',
    });
  });

  it('rejects unauthorized and stale concurrent targets with zero overwrite', async () => {
    const { execution, run } = await fixture();
    await expect(execution.handoffWorkItem(
      request(run, 'outside-contract', 'handoff-unauthorized'),
    )).rejects.toMatchObject({
      code: 'HANDOFF_TARGET_UNAUTHORIZED',
    });
    const unchanged = await execution.inspect(run.runId);
    expect(unchanged.revision).toBe(run.revision);
    expect(prepare(unchanged)).toMatchObject({
      assignedAgentId: 'preparer',
      revision: 0,
      leaseEpoch: 0,
    });

    const settled = await Promise.allSettled([
      execution.handoffWorkItem(request(run, 'reviewer', 'handoff-reviewer')),
      execution.handoffWorkItem(request(run, 'editor', 'handoff-editor')),
    ]);
    expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toBeInstanceOf(CollaborationWorkItemHandoffError);
    expect(rejected?.reason).toMatchObject({
      code: 'HANDOFF_REVISION_CONFLICT',
    });
    const authoritative = await execution.inspect(run.runId);
    expect(authoritative.revision).toBe(2);
    expect(prepare(authoritative).revision).toBe(1);
  });

  it('fences an in-flight claim and rejects late old-epoch execution receipts', async () => {
    let releaseWorker: ((value: {
      receiptId: string;
      outputRefs: string[];
      outputHash: string;
    }) => void) | undefined;
    const workerGate = new Promise<{
      receiptId: string;
      outputRefs: string[];
      outputHash: string;
    }>((resolve) => {
      releaseWorker = resolve;
    });
    const { execution, contract, run } = await fixture({
      readiness: {
        check: async ({ workItem, run: snapshot }) => ({
          status: 'ready',
          receiptId: 'ready-1',
          inputRefs: workItem.inputRefs,
          grantedPermissions: snapshot.contract.permissions.allowed,
          targetAvailable: true,
        }),
      },
      worker: { execute: async () => workerGate },
    });
    const initial = prepare(run);
    const inFlight = execution.executeWorkItem({
      runId: run.runId,
      workItemId: initial.id,
      requestId: 'execute-before-handoff',
      payloadHash: 'sha256:before-handoff',
    });
    let claimed: CollaborationRunSnapshot | undefined;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const snapshot = await execution.inspect(run.runId);
      if (prepare(snapshot).attempts.at(-1)?.stageClaim?.stage === 'worker') {
        claimed = snapshot;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    if (!claimed) throw new Error('worker claim was not observed');
    const oldItem = prepare(claimed);
    const oldAttempt = oldItem.attempts.at(-1)!;
    const handed = await execution.handoffWorkItem(
      request(claimed, 'reviewer', 'handoff-in-flight'),
    );
    const handedItem = prepare(handed.snapshot);
    expect(handedItem.leaseEpoch).toBe(oldItem.leaseEpoch + 1);
    expect(handedItem.attempts.at(-1)).toMatchObject({
      attemptId: oldAttempt.attemptId,
      status: 'blocked',
      reason: 'AGENT_HANDOFF',
    });
    expect(handedItem.attempts.at(-1)?.stageClaim).toBeUndefined();

    releaseWorker?.({
      receiptId: 'late-worker',
      outputRefs: ['artifact:late'],
      outputHash: 'sha256:late',
    });
    await expect(inFlight).rejects.toMatchObject({
      code: 'STALE_LEASE_EPOCH',
    });
    await expect(execution.recordWorkerReceipt(
      run.runId,
      oldItem.id,
      oldAttempt.attemptId,
      oldAttempt.leaseEpoch,
      {
        receiptId: 'late-worker-direct',
        outputRefs: ['artifact:late-direct'],
        outputHash: 'sha256:late-direct',
      },
    )).rejects.toMatchObject({
      code: 'STALE_LEASE_EPOCH',
    });
    await expect(execution.reconcileAcceptedOutput({
      projectId: run.projectId,
      runId: run.runId,
      workItemId: oldItem.id,
      attemptId: oldAttempt.attemptId,
      leaseEpoch: oldAttempt.leaseEpoch,
      expectedWorkItemRevision: oldItem.revision,
      requestId: oldAttempt.requestId,
      payloadHash: oldAttempt.payloadHash,
      workerReceipt: {
        receiptId: 'late-external-worker',
        outputRefs: ['artifact:late-external'],
        outputHash: 'sha256:late-external',
      },
      verifierResult: {
        status: 'passed',
        verificationMethod: 'late-verifier',
        artifactRefs: ['artifact:late-external'],
        resultRef: 'late-verification',
        contentHash: 'sha256:late-verification',
        contractHash: contract.contractHash,
      },
      outcomeReceipt: {
        receiptId: 'late-action',
        status: 'accepted',
        operationRef: 'operation:late',
      },
    })).rejects.toEqual(expect.objectContaining<Partial<CollaborationReconciliationError>>({
      code: 'OLD_LEASE_EPOCH',
    }));
    const afterLateResults = await execution.inspect(run.runId);
    expect(afterLateResults.revision).toBe(handed.snapshot.revision);
    expect(prepare(afterLateResults)).toEqual(handedItem);
  });

  it('routes an unprovable external result to manual reconciliation', async () => {
    const { execution, contract, run } = await fixture();
    const item = prepare(run);
    await expect(execution.reconcileAcceptedOutput({
      projectId: run.projectId,
      runId: run.runId,
      workItemId: item.id,
      attemptId: 'external-attempt-1',
      leaseEpoch: 1,
      expectedWorkItemRevision: item.revision,
      requestId: 'external-request-1',
      payloadHash: 'sha256:external',
      workerReceipt: {
        receiptId: 'external-worker',
        outputRefs: ['artifact:external'],
        outputHash: 'sha256:external',
      },
      verifierResult: {
        status: 'passed',
        verificationMethod: 'external-verifier',
        artifactRefs: ['artifact:external'],
        resultRef: 'external-verification',
        contentHash: 'sha256:external-verification',
        contractHash: contract.contractHash,
      },
    })).rejects.toEqual(expect.objectContaining<Partial<CollaborationReconciliationError>>({
      code: 'UNKNOWN_EXTERNAL_RECEIPT',
    }));
    expect(prepare(await execution.inspect(run.runId))).toMatchObject({
      status: 'verifying',
      attempts: [{
        attemptId: 'external-attempt-1',
        status: 'evidence_pending',
      }],
    });
  });
});
