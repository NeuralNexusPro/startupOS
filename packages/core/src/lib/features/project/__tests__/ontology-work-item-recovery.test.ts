import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CanonicalOntologyOSDK, CanonicalOntologyStore } from '../../ontology';
import { SolutionExecutionContractStore } from '../../solution';
import {
  body,
  instant,
  ontology,
  rawFact,
  readyFact,
} from '../../solution/__tests__/execution-contract-fixtures';
import { CollaborationExecutionStore } from '../../../../modules/collaboration-runtime/facade';
import { OntologyWorkItemRecovery } from '../ontology-work-item-recovery';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(failEvidenceOnce = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ontology-workitem-recovery-'));
  roots.push(root);
  const ontologyStore = new CanonicalOntologyStore(root);
  await ontologyStore.writeOntology('project-1', ontology());
  await ontologyStore.appendFact('project-1', {
    ref: { ...rawFact, factId: 'raw-1', factVersion: '1' },
    value: { order: 'confirmed' },
    source: { sourceType: 'runtime', sourceId: 'seed' },
    operationId: 'seed',
    revision: 0,
    acceptedAt: instant,
  });
  const osdk = new CanonicalOntologyOSDK(ontologyStore);
  const contracts = new SolutionExecutionContractStore(root);
  const publication = await contracts.publishCompiled(ontology(), 'confirmed', body());
  if (!publication.ok) throw new Error('Fixture contract must publish');
  let calls = 0;
  const dependencies = {
    evidenceSink: {
      record: async () => {
        calls += 1;
        if (failEvidenceOnce && calls === 1) throw new Error('simulated evidence boundary exit');
        return {
          receiptId: 'task-evidence-1',
          status: 'accepted' as const,
          evidenceRef: 'pi-task-event:task-evidence-1',
          revision: 7,
        };
      },
    },
  };
  const execution = new CollaborationExecutionStore(contracts, root, dependencies);
  const contract = publication.published.contract;
  const run = await execution.start({
    projectId: contract.projectId,
    solutionId: contract.solutionId,
    solutionVersion: contract.solutionVersion,
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    taskRevision: 1,
    executionContractId: contract.contractId,
    contractHash: contract.contractHash,
    inputRefs: ['raw-1'],
  });
  const item = run.workItems[0]!;
  const action = await osdk.submitAction({
    projectId: 'project-1',
    ontologyId: 'orders',
    ontologyVersion: '3',
    operationId: 'operation-1',
    actionId: 'prepare-order',
    conceptId: 'order',
    permissions: ['order.prepare'],
    inputFactRefs: [{ ...rawFact, factId: 'raw-1', factVersion: '1' }],
    outputs: [{
      factId: 'ready-1',
      factTypeId: readyFact.factTypeId,
      value: { prepared: true },
      source: { sourceType: 'runtime', sourceId: run.runId },
    }],
    expectedRevision: 0,
    audit: {
      actorId: 'actor-1',
      requestId: 'request-1',
      runId: run.runId,
      workItemId: item.id,
      attemptId: `${item.id}:external-1`,
      leaseEpoch: 1,
    },
  });
  if (!action.ok) throw new Error('Fixture action must be accepted');
  const input = {
    projectId: 'project-1',
    requestId: 'request-1',
    operationId: 'operation-1',
    receipt: action.receipt,
    runId: run.runId,
    workItemId: item.id,
    attemptId: `${item.id}:external-1`,
    leaseEpoch: 1,
    expectedWorkItemRevision: 0,
  };
  return { root, contracts, dependencies, execution, ontologyStore, run, item, input, calls: () => calls };
}

describe('OntologyWorkItemRecovery', () => {
  it('reconciles the accepted Action into the authoritative WorkItem and Evidence ledgers', async () => {
    const test = await fixture();
    const first = await new OntologyWorkItemRecovery(test.execution).reconcile(test.input);
    expect(first).toEqual({
      ok: true,
      status: 'accepted',
      workItemRevision: 2,
      evidenceRevision: 7,
    });

    const restartedExecution = new CollaborationExecutionStore(
      test.contracts,
      test.root,
      test.dependencies,
    );
    const replay = await new OntologyWorkItemRecovery(restartedExecution).reconcile(test.input);
    expect(replay).toMatchObject({ ok: true, status: 'recovered' });
    expect(test.calls()).toBe(1);
    const snapshot = await restartedExecution.inspect(test.run.runId);
    expect(snapshot.workItems[0]).toMatchObject({ status: 'completed', leaseEpoch: 1 });
    expect(snapshot.workItems[0]?.attempts).toHaveLength(1);
    expect((await test.ontologyStore.readFacts('project-1')).filter(
      ({ operationId }) => operationId === 'operation-1',
    )).toHaveLength(1);
  });

  it('recovers after Action acceptance and an Evidence-boundary interruption', async () => {
    const test = await fixture(true);
    const first = await new OntologyWorkItemRecovery(test.execution).reconcile(test.input);
    expect(first).toMatchObject({
      ok: false,
      code: 'UNKNOWN_EXTERNAL_RECEIPT',
    });
    const interrupted = await test.execution.inspect(test.run.runId);
    expect(interrupted.workItems[0]).toMatchObject({ status: 'verifying' });
    expect(interrupted.workItems[0]?.attempts[0]?.evidenceReceipt).toBeUndefined();

    const restartedExecution = new CollaborationExecutionStore(
      test.contracts,
      test.root,
      test.dependencies,
    );
    const recovered = await new OntologyWorkItemRecovery(restartedExecution).reconcile(test.input);
    expect(recovered).toMatchObject({ ok: true, status: 'recovered', evidenceRevision: 7 });
    expect(test.calls()).toBe(2);
    const final = await restartedExecution.inspect(test.run.runId);
    expect(final.workItems[0]?.attempts[0]?.evidenceReceipt).toMatchObject({
      receiptId: 'task-evidence-1',
      revision: 7,
    });
  });
});
