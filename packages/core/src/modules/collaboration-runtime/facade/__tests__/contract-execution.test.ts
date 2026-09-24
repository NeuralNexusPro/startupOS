import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { SolutionExecutionContractStore } from '../../../../lib/features/solution';
import {
  body,
  ontology,
} from '../../../../lib/features/solution/__tests__/execution-contract-fixtures';
import { CollaborationExecutionStore } from '../contract-execution';
import type { SolutionExecutionContract } from '../../../../lib/features/solution';

async function setup(): Promise<{
  contract: SolutionExecutionContract;
  contractStore: SolutionExecutionContractStore;
  execution: CollaborationExecutionStore;
}> {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'collaboration-run-'));
  const contractStore = new SolutionExecutionContractStore(dataRoot);
  const publication = await contractStore.publishCompiled(
    ontology(),
    'confirmed',
    body()
  );
  expect(publication.ok).toBe(true);
  if (!publication.ok) throw new Error('Fixture contract must publish');
  return {
    contract: publication.published.contract,
    contractStore,
    execution: new CollaborationExecutionStore(contractStore, dataRoot),
  };
}

function startInput(contract: SolutionExecutionContract) {
  return {
    projectId: contract.projectId,
    solutionId: contract.solutionId,
    solutionVersion: contract.solutionVersion,
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    taskRevision: 1,
    executionContractId: contract.contractId,
    contractHash: contract.contractHash,
    inputRefs: ['input-1'],
  };
}

describe('contract-bound collaboration execution', () => {
  it('starts a run from the exact approved contract and instantiates WorkItems', async () => {
    const { contract, execution } = await setup();
    const snapshot = await execution.start(startInput(contract));
    const prepare = snapshot.workItems.find(
      (workItem) => workItem.designNodeId === 'prepare'
    );
    const publish = snapshot.workItems.find(
      (workItem) => workItem.designNodeId === 'publish'
    );

    expect(snapshot.binding.executionContractId).toBe(contract.contractId);
    expect(snapshot.binding.contractHash).toBe(contract.contractHash);
    expect(snapshot.workItems).toHaveLength(2);
    expect(prepare?.assignedAgentId).toBe('preparer');
    expect(prepare?.dependsOn).toEqual([]);
    expect(publish?.skillRefs).toEqual(['publisher']);
    expect(publish?.dependsOn).toEqual([prepare?.id]);
    expect(publish?.inputRefs).toEqual(['order-ready']);
    await expect(execution.inspect(snapshot.runId)).resolves.toEqual(snapshot);
  });

  it('rejects revoked and hash-mismatched contracts before creating a run', async () => {
    const { contract, contractStore, execution } = await setup();
    await contractStore.revoke(
      {
        projectId: contract.projectId,
        solutionId: contract.solutionId,
        solutionVersion: contract.solutionVersion,
        contractId: contract.contractId,
      },
      'Retired'
    );
    await expect(execution.start(startInput(contract))).rejects.toThrow(
      /revoked/
    );

    const valid = await setup();
    const mismatch = {
      ...startInput(valid.contract),
      contractHash:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    };
    await expect(valid.execution.start(mismatch)).rejects.toThrow(
      /hash does not match/
    );
  });

  it('persists run transitions and resumes the frozen snapshot', async () => {
    const { contract, execution } = await setup();
    const snapshot = await execution.start(startInput(contract));

    const paused = await execution.pause(snapshot.runId);
    expect(paused.status).toBe('paused');
    expect(paused.revision).toBe(snapshot.revision + 1);
    const resumed = await execution.resume(snapshot.runId);
    expect(resumed.status).toBe('running');
    expect(resumed.contract).toEqual(snapshot.contract);
    const canceled = await execution.cancel(snapshot.runId);
    expect(canceled.status).toBe('canceled');
    await expect(execution.resume(snapshot.runId)).rejects.toThrow(
      /Cannot transition/
    );
  });
});

function receipt() {
  return {
    receiptId: 'worker-receipt-1',
    outputRefs: ['artifact-1'],
    outputHash: 'sha256:worker-output',
  };
}

function passingVerification(contract: SolutionExecutionContract) {
  return {
    status: 'passed' as const,
    verificationMethod: 'deterministic-fixture',
    artifactRefs: ['artifact-1'],
    resultRef: 'verification-1',
    contentHash: 'sha256:verification-content',
    contractHash: contract.contractHash,
  };
}

async function executableSetup(
  options: {
    readonly verifier?: 'passed' | 'failed' | 'placeholder';
    readonly evidence?: 'accepted' | 'unknown';
  } = {}
) {
  const dataRoot = await mkdtemp(
    path.join(tmpdir(), 'collaboration-execution-')
  );
  const contractStore = new SolutionExecutionContractStore(dataRoot);
  const publication = await contractStore.publishCompiled(
    ontology(),
    'confirmed',
    body()
  );
  if (!publication.ok) throw new Error('Fixture contract must publish');
  const calls = { worker: 0, verifier: 0, evidence: 0 };
  const execution = new CollaborationExecutionStore(contractStore, dataRoot, {
    worker: {
      execute: async () => {
        calls.worker += 1;
        return receipt();
      },
    },
    verifier: {
      verify: async () => {
        calls.verifier += 1;
        const status = options.verifier ?? 'passed';
        return status === 'passed'
          ? passingVerification(publication.published.contract)
          : { status, reason: 'fixture verifier result' };
      },
    },
    evidenceSink: {
      record: async () => {
        calls.evidence += 1;
        const status = options.evidence ?? 'accepted';
        return {
          receiptId: 'evidence-1',
          status,
          ...(status === 'accepted' ? { evidenceRef: 'evidence-1' } : {}),
        };
      },
    },
  });
  const run = await execution.start(startInput(publication.published.contract));
  return {
    contract: publication.published.contract,
    contractStore,
    dataRoot,
    execution,
    run,
    calls,
  };
}

describe('WorkItem execution ledger', () => {
  it('records intent, receipt, verification and evidence once for an idempotent request', async () => {
    const { execution, run, calls } = await executableSetup();
    const prepare = run.workItems.find(
      (item) => item.designNodeId === 'prepare'
    )!;
    const request = {
      runId: run.runId,
      workItemId: prepare.id,
      requestId: 'request-1',
      payloadHash: 'sha256:payload-1',
    };
    const completed = await execution.executeWorkItem(request);
    const replay = await execution.executeWorkItem(request);
    const item = completed.workItems.find(
      (candidate) => candidate.id === prepare.id
    )!;
    expect(item.status).toBe('completed');
    expect(item.leaseEpoch).toBe(1);
    expect(item.attempts).toHaveLength(1);
    expect(item.attempts[0]).toMatchObject({
      status: 'completed',
      workerReceipt: receipt(),
      evidenceReceipt: { receiptId: 'evidence-1', status: 'accepted' },
    });
    expect(replay).toEqual(completed);
    expect(calls).toEqual({ worker: 1, verifier: 1, evidence: 1 });
    await expect(
      execution.executeWorkItem({ ...request, payloadHash: 'sha256:other' })
    ).rejects.toThrow(/conflicts/);
  });

  it('fences late receipts after pause, cancellation, and a newer lease epoch', async () => {
    const { execution, run } = await executableSetup();
    const prepare = run.workItems.find(
      (item) => item.designNodeId === 'prepare'
    )!;
    const request = {
      runId: run.runId,
      workItemId: prepare.id,
      requestId: 'request-1',
      payloadHash: 'sha256:payload-1',
    };
    const done = await execution.executeWorkItem(request);
    const attempt = done.workItems.find((item) => item.id === prepare.id)!
      .attempts[0]!;
    await execution.pause(run.runId);
    await expect(
      execution.recordWorkerReceipt(
        run.runId,
        prepare.id,
        attempt.attemptId,
        attempt.leaseEpoch,
        receipt()
      )
    ).rejects.toThrow(/paused/);
    await execution.resume(run.runId);
    await execution.cancel(run.runId);
    await expect(
      execution.recordWorkerReceipt(
        run.runId,
        prepare.id,
        attempt.attemptId,
        attempt.leaseEpoch,
        receipt()
      )
    ).rejects.toThrow(/canceled/);
  });

  it('rejects an old lease receipt after a retry receives a newer epoch', async () => {
    const { execution, run } = await executableSetup({ verifier: 'failed' });
    const prepare = run.workItems.find(
      (item) => item.designNodeId === 'prepare'
    )!;
    const first = await execution.executeWorkItem({
      runId: run.runId,
      workItemId: prepare.id,
      requestId: 'request-first',
      payloadHash: 'sha256:first',
    });
    const firstAttempt = first.workItems.find((item) => item.id === prepare.id)!
      .attempts[0]!;
    const retried = await execution.executeWorkItem({
      runId: run.runId,
      workItemId: prepare.id,
      requestId: 'request-second',
      payloadHash: 'sha256:second',
    });
    expect(
      retried.workItems.find((item) => item.id === prepare.id)?.leaseEpoch
    ).toBe(2);
    await expect(
      execution.recordWorkerReceipt(
        run.runId,
        prepare.id,
        firstAttempt.attemptId,
        firstAttempt.leaseEpoch,
        receipt()
      )
    ).rejects.toThrow(/Stale/);
  });

  it('never marks verifier failures or placeholders as evidence', async () => {
    for (const verifier of ['failed', 'placeholder'] as const) {
      const { execution, run, calls } = await executableSetup({ verifier });
      const prepare = run.workItems.find(
        (item) => item.designNodeId === 'prepare'
      )!;
      const result = await execution.executeWorkItem({
        runId: run.runId,
        workItemId: prepare.id,
        requestId: `request-${verifier}`,
        payloadHash: `sha256:${verifier}`,
      });
      const item = result.workItems.find(
        (candidate) => candidate.id === prepare.id
      )!;
      expect(item.status).toBe(verifier === 'failed' ? 'revision' : 'blocked');
      expect(item.attempts[0]?.evidenceReceipt).toBeUndefined();
      expect(calls.evidence).toBe(0);
    }
  });

  it('recovers only stages missing after a persisted worker receipt', async () => {
    const { execution, run, calls } = await executableSetup({
      evidence: 'unknown',
    });
    const prepare = run.workItems.find(
      (item) => item.designNodeId === 'prepare'
    )!;
    const first = await execution.executeWorkItem({
      runId: run.runId,
      workItemId: prepare.id,
      requestId: 'request-recover',
      payloadHash: 'sha256:recover',
    });
    expect(first.workItems.find((item) => item.id === prepare.id)?.status).toBe(
      'needs_review'
    );
    expect(calls).toEqual({ worker: 1, verifier: 1, evidence: 1 });
    const recovered = await execution.recover(run.runId);
    expect(recovered).toEqual(first);
    expect(calls).toEqual({ worker: 1, verifier: 1, evidence: 1 });
  });

  it('restarts from a persisted worker receipt without replaying that worker action', async () => {
    const { contract, contractStore, dataRoot, run } = await executableSetup();
    const prepare = run.workItems.find(
      (item) => item.designNodeId === 'prepare'
    )!;
    const firstHost = new CollaborationExecutionStore(contractStore, dataRoot, {
      worker: { execute: async () => receipt() },
    });
    const blocked = await firstHost.executeWorkItem({
      runId: run.runId,
      workItemId: prepare.id,
      requestId: 'request-restart',
      payloadHash: 'sha256:restart',
    });
    expect(
      blocked.workItems.find((item) => item.id === prepare.id)?.status
    ).toBe('blocked');
    const calls = { worker: 0, verifier: 0, evidence: 0 };
    const restarted = new CollaborationExecutionStore(contractStore, dataRoot, {
      worker: {
        execute: async () => {
          calls.worker += 1;
          return receipt();
        },
      },
      verifier: {
        verify: async () => {
          calls.verifier += 1;
          return passingVerification(contract);
        },
      },
      evidenceSink: {
        record: async () => {
          calls.evidence += 1;
          return {
            receiptId: 'evidence-restart',
            status: 'accepted',
            evidenceRef: 'evidence-restart',
          };
        },
      },
    });
    const recovered = await restarted.recover(run.runId);
    expect(
      recovered.workItems.find((item) => item.id === prepare.id)?.status
    ).toBe('completed');
    expect(calls).toEqual({ worker: 0, verifier: 1, evidence: 1 });
  });

  it('does not auto-start paused or cancelled runs during recovery', async () => {
    const { execution, run, calls } = await executableSetup();
    await execution.pause(run.runId);
    expect((await execution.recover(run.runId)).status).toBe('paused');
    await execution.resume(run.runId);
    await execution.cancel(run.runId);
    expect((await execution.recover(run.runId)).status).toBe('canceled');
    expect(calls).toEqual({ worker: 0, verifier: 0, evidence: 0 });
  });
});
