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
  type CollaborationExecutionDependencies,
  type CollaborationRunSnapshot,
  type WorkItemHitlRequest,
  type WorkerReceipt,
} from '../contract-execution';


function noHitlBody(
  overrides: Partial<SolutionExecutionContractBody> = {},
): SolutionExecutionContractBody {
  const source = body();
  return {
    ...source,
    ...overrides,
    topology: {
      ...source.topology,
      nodes: source.topology.nodes.map((node) => {
        const { hitlPolicyId: _hitlPolicyId, ...withoutPolicy } = node;
        return withoutPolicy;
      }),
    },
    hitl: [],
  };
}

function workerReceipt(
  id = 'worker-1',
  tokens = 10,
): WorkerReceipt {
  return {
    receiptId: id,
    outputRefs: [`artifact:${id}`],
    outputHash: `sha256:${id}`,
    usage: { durationMs: 5, tokens },
  };
}

function startInput(contract: SolutionExecutionContract, parentTaskId = 'task-1') {
  return {
    projectId: contract.projectId,
    solutionId: contract.solutionId,
    solutionVersion: contract.solutionVersion,
    parentTaskId,
    parentStepId: 'step-1',
    taskRevision: 1,
    executionContractId: contract.contractId,
    contractHash: contract.contractHash,
    inputRefs: ['input-1'],
  };
}

async function fixture(
  contractBody: SolutionExecutionContractBody = noHitlBody(),
  dependenciesFactory?: (
    contract: SolutionExecutionContract,
  ) => CollaborationExecutionDependencies,
  clock?: () => Date,
) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'collaboration-stage-'));
  const contractStore = new SolutionExecutionContractStore(dataRoot);
  const publication = await contractStore.publishCompiled(
    ontology(),
    'confirmed',
    contractBody,
  );
  if (!publication.ok) throw new Error('Fixture contract must publish');
  const contract = publication.published.contract;
  const calls = {
    readiness: 0,
    worker: 0,
    verifier: 0,
    outcome: 0,
    evidence: 0,
    hitl: 0,
  };
  const defaults: CollaborationExecutionDependencies = {
    readiness: {
      check: async ({ workItem, run }) => {
        calls.readiness += 1;
        return {
          status: 'ready',
          receiptId: `readiness-${calls.readiness}`,
          inputRefs: workItem.inputRefs,
          grantedPermissions: run.contract.permissions.allowed,
          targetAvailable: true,
        };
      },
    },
    worker: {
      execute: async () => {
        calls.worker += 1;
        return workerReceipt(`worker-${calls.worker}`);
      },
    },
    verifier: {
      verify: async ({ run, workerReceipt: receipt }) => {
        calls.verifier += 1;
        return {
          status: 'passed',
          verificationMethod: 'fixture-v1',
          artifactRefs: receipt.outputRefs,
          resultRef: `verification-${calls.verifier}`,
          contentHash: `sha256:verification-${calls.verifier}`,
          contractHash: run.contract.contractHash,
        };
      },
    },
    outcome: {
      commit: async ({ workerReceipt: receipt }) => {
        calls.outcome += 1;
        return {
          receiptId: `outcome-${calls.outcome}`,
          status: 'accepted',
          operationRef: `operation:${receipt.receiptId}`,
          contentHash: `sha256:outcome-${calls.outcome}`,
        };
      },
    },
    evidenceSink: {
      record: async ({ evidenceHash }) => {
        calls.evidence += 1;
        return {
          receiptId: `evidence-${calls.evidence}`,
          status: 'accepted',
          evidenceRef: `evidence:${calls.evidence}`,
          evidenceHash,
        };
      },
    },
    hitl: {
      open: async () => {
        calls.hitl += 1;
      },
    },
    clock,
  };
  const overrides = dependenciesFactory?.(contract) ?? {};
  const dependencies = { ...defaults, ...overrides };
  const execution = new CollaborationExecutionStore(
    contractStore,
    dataRoot,
    dependencies,
  );
  const run = await execution.start(startInput(contract));
  return {
    calls,
    contract,
    contractStore,
    dataRoot,
    dependencies,
    execution,
    run,
  };
}

function prepare(run: CollaborationRunSnapshot) {
  const item = run.workItems.find((candidate) =>
    candidate.designNodeId === 'prepare'
  );
  if (!item) throw new Error('prepare WorkItem missing');
  return item;
}

function pendingHitl(snapshot: CollaborationRunSnapshot): WorkItemHitlRequest {
  const request = snapshot.workItems
    .flatMap((item) => item.attempts)
    .flatMap((attempt) => attempt.hitlRequests ?? [])
    .find((candidate) => candidate.status === 'pending');
  if (!request) throw new Error('pending HITL missing');
  return request;
}

describe('short-transaction collaboration ledger', () => {
  it('fails readiness closed before Worker, Verifier, Action, or Evidence', async () => {
    const state = await fixture(noHitlBody(), () => ({
      readiness: {
        check: async () => ({
          status: 'blocked',
          receiptId: 'readiness-blocked',
          reason: 'FACT_VERSION_MISMATCH',
        }),
      },
    }));
    const item = prepare(state.run);
    const result = await state.execution.executeWorkItem({
      runId: state.run.runId,
      workItemId: item.id,
      requestId: 'readiness-blocked',
      payloadHash: 'sha256:readiness-blocked',
    });

    expect(prepare(result)).toMatchObject({
      status: 'blocked',
      attempts: [{
        status: 'blocked',
        reason: 'FACT_VERSION_MISMATCH',
      }],
    });
    expect(state.calls).toMatchObject({
      worker: 0,
      verifier: 0,
      outcome: 0,
      evidence: 0,
    });
  });

  it('does not deadlock when Worker reconciles an accepted Action into the same Run', async () => {
    const holder: { execution?: CollaborationExecutionStore } = {};
    const state = await fixture(noHitlBody(), (contract) => ({
      worker: {
        execute: async ({ run, workItem, attempt }) => {
          const receipt = workerReceipt('nested-action');
          if (!holder.execution) throw new Error('execution host missing');
          await holder.execution.reconcileAcceptedOutput({
            projectId: run.projectId,
            runId: run.runId,
            workItemId: workItem.id,
            attemptId: attempt.attemptId,
            leaseEpoch: attempt.leaseEpoch,
            expectedWorkItemRevision: workItem.revision,
            requestId: attempt.requestId,
            payloadHash: attempt.payloadHash,
            workerReceipt: receipt,
            verifierResult: {
              status: 'passed',
              verificationMethod: 'nested-action-v1',
              artifactRefs: receipt.outputRefs,
              resultRef: 'nested-verification',
              contentHash: 'sha256:nested-verification',
              contractHash: contract.contractHash,
            },
            outcomeReceipt: {
              receiptId: 'nested-outcome',
              status: 'accepted',
              operationRef: 'ontology-operation:nested',
              contentHash: 'sha256:nested-outcome',
            },
          });
          return receipt;
        },
      },
    }));
    holder.execution = state.execution;
    const item = prepare(state.run);

    const result = await Promise.race([
      state.execution.executeWorkItem({
        runId: state.run.runId,
        workItemId: item.id,
        requestId: 'nested-action-request',
        payloadHash: 'sha256:nested-action-request',
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('nested action deadlocked')), 1_000);
      }),
    ]);

    expect(prepare(result).status).toBe('completed');
    expect(prepare(result).attempts[0]).toMatchObject({
      workerReceipt: { receiptId: 'nested-action' },
      outcomeReceipt: { receiptId: 'nested-outcome' },
      evidenceReceipt: { status: 'accepted' },
    });
  });

  it('allows only one host to own a stage and preserves CAS receipts', async () => {
    let releaseWorker: (() => void) | undefined;
    let workerStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      workerStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseWorker = resolve;
    });
    const state = await fixture(noHitlBody(), () => ({
      worker: {
        execute: async () => {
          state.calls.worker += 1;
          workerStarted?.();
          await release;
          return workerReceipt('cas-worker');
        },
      },
    }));
    const second = new CollaborationExecutionStore(
      state.contractStore,
      state.dataRoot,
      state.dependencies,
    );
    const item = prepare(state.run);
    const request = {
      runId: state.run.runId,
      workItemId: item.id,
      requestId: 'cas-request',
      payloadHash: 'sha256:cas-request',
    };

    const firstPromise = state.execution.executeWorkItem(request);
    await started;
    const competing = await second.executeWorkItem(request);
    expect(prepare(competing).attempts[0]?.stageClaim?.stage).toBe('worker');
    expect(state.calls.worker).toBe(1);
    releaseWorker?.();
    const completed = await firstPromise;

    expect(prepare(completed).status).toBe('completed');
    expect(state.calls.worker).toBe(1);
    expect((await second.inspect(state.run.runId)).revision).toBe(
      completed.revision,
    );
  });

  it('rejects one of two hosts that CAS different outputs from the same revision', async () => {
    const state = await fixture(noHitlBody());
    const second = new CollaborationExecutionStore(
      state.contractStore,
      state.dataRoot,
      state.dependencies,
    );
    const item = prepare(state.run);
    const externalInput = (suffix: string) => ({
      projectId: state.run.projectId,
      runId: state.run.runId,
      workItemId: item.id,
      attemptId: `${item.id}:external-${suffix}`,
      leaseEpoch: 1,
      expectedWorkItemRevision: 0,
      requestId: `external-${suffix}`,
      payloadHash: `sha256:external-${suffix}`,
      workerReceipt: workerReceipt(`external-${suffix}`),
      verifierResult: {
        status: 'passed' as const,
        verificationMethod: 'external-v1',
        artifactRefs: [`artifact:external-${suffix}`],
        resultRef: `verification:external-${suffix}`,
        contentHash: `sha256:verification-external-${suffix}`,
        contractHash: state.contract.contractHash,
      },
      outcomeReceipt: {
        receiptId: `outcome-external-${suffix}`,
        status: 'accepted' as const,
        operationRef: `operation:external-${suffix}`,
        contentHash: `sha256:outcome-external-${suffix}`,
      },
    });

    const settled = await Promise.allSettled([
      state.execution.reconcileAcceptedOutput(externalInput('a')),
      second.reconcileAcceptedOutput(externalInput('b')),
    ]);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'WORK_ITEM_REVISION_CONFLICT' },
    });
    expect(state.calls.evidence).toBe(1);
    const persisted = await state.execution.inspect(state.run.runId);
    expect(prepare(persisted).attempts).toHaveLength(1);
  });

  it('fences in-flight receipts across pause, resume, and cancel', async () => {
    for (const transition of ['pause', 'cancel'] as const) {
      let releaseWorker: (() => void) | undefined;
      let workerStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        workerStarted = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseWorker = resolve;
      });
      const state = await fixture(noHitlBody(), () => ({
        worker: {
          execute: async () => {
            workerStarted?.();
            await release;
            return workerReceipt(`fenced-${transition}`);
          },
        },
      }));
      const item = prepare(state.run);
      const executing = state.execution.executeWorkItem({
        runId: state.run.runId,
        workItemId: item.id,
        requestId: `fenced-${transition}`,
        payloadHash: `sha256:fenced-${transition}`,
      });
      await started;
      if (transition === 'pause') {
        await state.execution.pause(state.run.runId);
        await state.execution.resume(state.run.runId);
      } else {
        await state.execution.cancel(state.run.runId);
      }
      releaseWorker?.();
      await expect(executing).rejects.toThrow(
        transition === 'pause' ? /Stale/ : /canceled/,
      );
      const persisted = await state.execution.inspect(state.run.runId);
      expect(prepare(persisted).attempts[0]).toMatchObject({
        status: 'blocked',
        reason: transition === 'pause' ? 'RUN_PAUSED' : 'RUN_CANCELED',
      });
      expect(prepare(persisted).attempts[0]?.workerReceipt).toBeUndefined();
      if (transition === 'cancel') {
        expect(persisted.terminalStatus).toBe('canceled');
      }
    }
  });

  it('restores approve, reject, and edit HITL decisions across hosts', async () => {
    const base = body();
    const contractBody: SolutionExecutionContractBody = {
      ...base,
      topology: {
        ...base.topology,
        nodes: base.topology.nodes.map((node) =>
          node.id === 'prepare'
            ? { ...node, hitlPolicyId: 'approve-prepare' }
            : node
        ),
      },
      hitl: [
        ...base.hitl,
        {
          id: 'approve-prepare',
          nodeId: 'prepare',
          trigger: 'before_execution',
          approverRole: 'owner',
        },
      ],
    };

    for (const decision of ['approve', 'reject', 'edit'] as const) {
      const state = await fixture(contractBody);
      const item = prepare(state.run);
      const waiting = await state.execution.executeWorkItem({
        runId: state.run.runId,
        workItemId: item.id,
        requestId: `hitl-${decision}`,
        payloadHash: `sha256:hitl-${decision}`,
      });
      expect(prepare(waiting).status).toBe('waiting_hitl');
      const request = pendingHitl(waiting);
      const restarted = new CollaborationExecutionStore(
        state.contractStore,
        state.dataRoot,
        state.dependencies,
      );
      const resolved = await restarted.resolveHitl({
        runId: state.run.runId,
        requestId: request.requestId,
        attemptId: request.attemptId,
        leaseEpoch: request.leaseEpoch,
        decision,
        decisionRef: `decision-${decision}`,
        ...(decision === 'edit'
          ? { editedPayloadHash: 'sha256:edited-payload' }
          : {}),
      });
      const resolvedAttempt = prepare(resolved).attempts[0]!;
      expect(resolvedAttempt.hitlRequests?.[0]).toMatchObject({
        status: 'resolved',
        decision,
        decisionRef: `decision-${decision}`,
      });
      if (decision === 'approve') {
        expect(prepare(resolved).status).toBe('completed');
      } else if (decision === 'reject') {
        expect(prepare(resolved).status).toBe('failed');
        expect(resolved.terminalStatus).toBe('failed');
      } else {
        expect(prepare(resolved).status).toBe('revision');
        expect(resolvedAttempt.payloadHash).toBe('sha256:edited-payload');
      }
      await expect(restarted.resolveHitl({
        runId: state.run.runId,
        requestId: request.requestId,
        attemptId: request.attemptId,
        leaseEpoch: request.leaseEpoch,
        decision,
        decisionRef: `decision-${decision}`,
        ...(decision === 'edit'
          ? { editedPayloadHash: 'sha256:edited-payload' }
          : {}),
      })).resolves.toEqual(await restarted.inspect(state.run.runId));
    }
  });

  it('persists and dispatches an on-failure HITL request', async () => {
    const source = noHitlBody();
    const contractBody: SolutionExecutionContractBody = {
      ...source,
      topology: {
        ...source.topology,
        nodes: source.topology.nodes.map((node) =>
          node.id === 'prepare'
            ? { ...node, hitlPolicyId: 'recover-prepare' }
            : node
        ),
      },
      hitl: [{
        id: 'recover-prepare',
        nodeId: 'prepare',
        trigger: 'on_failure',
        approverRole: 'owner',
      }],
    };
    const state = await fixture(contractBody, () => ({
      verifier: {
        verify: async () => ({ status: 'failed', reason: 'fixture-failure' }),
      },
    }));
    const result = await state.execution.executeWorkItem({
      runId: state.run.runId,
      workItemId: prepare(state.run).id,
      requestId: 'on-failure-hitl',
      payloadHash: 'sha256:on-failure-hitl',
    });
    expect(prepare(result).status).toBe('waiting_hitl');
    expect(pendingHitl(result)).toMatchObject({
      trigger: 'on_failure',
      status: 'pending',
      options: ['approve', 'reject', 'edit'],
    });
    expect(state.calls.hitl).toBe(1);
    const restarted = new CollaborationExecutionStore(
      state.contractStore,
      state.dataRoot,
      state.dependencies,
    );
    expect(pendingHitl(await restarted.inspect(state.run.runId)).requestId).toBe(
      pendingHitl(result).requestId,
    );
  });

  it('enforces token, duration, and max-attempt budgets and aggregates terminal state', async () => {
    const tokenState = await fixture(
      noHitlBody({ budget: { ...body().budget, maxTokens: 5 } }),
      () => ({
        worker: {
          execute: async () => workerReceipt('over-token-budget', 6),
        },
      }),
    );
    await tokenState.execution.executeWorkItem({
      runId: tokenState.run.runId,
      workItemId: prepare(tokenState.run).id,
      requestId: 'token-budget',
      payloadHash: 'sha256:token-budget',
    });
    const tokenResult = await tokenState.execution.inspect(tokenState.run.runId);
    expect(prepare(tokenResult).attempts[0]?.reason).toBe('MAX_TOKENS_EXCEEDED');
    expect(tokenResult.terminalStatus).toBe('failed');

    let current = new Date('2026-09-25T00:00:00.000Z');
    const durationState = await fixture(
      noHitlBody({ budget: { ...body().budget, maxDurationMs: 10 } }),
      undefined,
      () => current,
    );
    current = new Date('2026-09-25T00:00:00.011Z');
    await expect(durationState.execution.executeWorkItem({
      runId: durationState.run.runId,
      workItemId: prepare(durationState.run).id,
      requestId: 'duration-budget',
      payloadHash: 'sha256:duration-budget',
    })).rejects.toThrow(/MAX_DURATION_EXCEEDED/);
    const durationResult = await durationState.execution.inspect(
      durationState.run.runId,
    );
    expect(durationResult.failureReason).toBe('MAX_DURATION_EXCEEDED');
    expect(durationResult.terminalStatus).toBe('failed');

    const attemptsState = await fixture(
      noHitlBody({ budget: { ...body().budget, maxAttempts: 1 } }),
      () => ({
        verifier: {
          verify: async () => ({ status: 'failed', reason: 'retry' }),
        },
      }),
    );
    await attemptsState.execution.executeWorkItem({
      runId: attemptsState.run.runId,
      workItemId: prepare(attemptsState.run).id,
      requestId: 'attempt-1',
      payloadHash: 'sha256:attempt-1',
    });
    await expect(attemptsState.execution.executeWorkItem({
      runId: attemptsState.run.runId,
      workItemId: prepare(attemptsState.run).id,
      requestId: 'attempt-2',
      payloadHash: 'sha256:attempt-2',
    })).rejects.toThrow(/MAX_ATTEMPTS_EXCEEDED/);
    const attemptsResult = await attemptsState.execution.inspect(
      attemptsState.run.runId,
    );
    expect(prepare(attemptsResult).status).toBe('failed');
    expect(attemptsResult.terminalStatus).toBe('failed');
  });

  it('marks the Run completed only after every frozen WorkItem completes', async () => {
    const state = await fixture();
    const first = prepare(state.run);
    const prepared = await state.execution.executeWorkItem({
      runId: state.run.runId,
      workItemId: first.id,
      requestId: 'complete-prepare',
      payloadHash: 'sha256:complete-prepare',
    });
    expect(prepared.terminalStatus).toBeUndefined();
    const publish = prepared.workItems.find((item) =>
      item.designNodeId === 'publish'
    )!;
    const completed = await state.execution.executeWorkItem({
      runId: state.run.runId,
      workItemId: publish.id,
      requestId: 'complete-publish',
      payloadHash: 'sha256:complete-publish',
    });
    expect(completed.terminalStatus).toBe('completed');
    expect(completed.workItems.every((item) => item.status === 'completed')).toBe(
      true,
    );
  });
});
