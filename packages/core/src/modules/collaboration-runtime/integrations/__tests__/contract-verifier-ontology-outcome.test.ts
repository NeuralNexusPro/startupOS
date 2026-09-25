import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  CanonicalOntologyOSDK,
  CanonicalOntologyStore,
  type CanonicalFactRecord,
  type CanonicalOntology,
} from '../../../../lib/features/ontology';
import {
  SolutionExecutionContractStore,
  type SolutionExecutionContract,
  type SolutionExecutionContractBody,
} from '../../../../lib/features/solution';
import {
  body,
  ontology as ontologyFixture,
} from '../../../../lib/features/solution/__tests__/execution-contract-fixtures';
import {
  CollaborationExecutionStore,
  type CollaborationExecutionDependencies,
  type CollaborationRunSnapshot,
  type EvidenceReceipt,
  type OutcomeCommitInput,
  type VerifierExecutionInput,
  type WorkerReceipt,
} from '../../facade/contract-execution';
import {
  CanonicalOntologyOutcomeAdapter,
  ContractVerifierError,
  VersionedContractVerifierRegistry,
  type FrozenOutcomeDraftPort,
  type VersionedContractVerifier,
  type VersionedEvidenceSchema,
} from '../index';

const verifierRef = 'order-verifier@1.0.0';
const schemaRef = 'order-evidence@1.0.0';

function contractBody(): SolutionExecutionContractBody {
  const source = body();
  return {
    ...source,
    topology: {
      ...source.topology,
      nodes: [source.topology.nodes[0]!],
      edges: [],
    },
    skills: [],
    verification: [{
      id: 'verify-prepare',
      nodeId: 'prepare',
      verifierRef,
      evidenceSchemaRef: schemaRef,
    }],
    hitl: [],
  };
}

function workerReceipt(): WorkerReceipt {
  return {
    receiptId: 'worker-1',
    outputRefs: ['artifact:order-ready'],
    outputHash: 'sha256:worker-1',
    usage: { durationMs: 12, tokens: 20 },
  };
}

const verifier = (
  status: 'passed' | 'failed' | 'placeholder' = 'passed',
): VersionedContractVerifier => ({
  ref: verifierRef,
  verify: async ({ workerReceipt: receipt }) => ({
    status,
    artifactRefs: receipt.outputRefs,
    resultRef: 'verification:order-ready',
    evidence: { kind: 'order-ready', valid: true },
  }),
});

const schema = (valid = true): VersionedEvidenceSchema => ({
  ref: schemaRef,
  validate: () => valid
    ? { valid: true }
    : { valid: false, reason: 'required property valid is missing' },
});

function seedFact(): CanonicalFactRecord {
  return {
    ref: {
      ontologyId: 'orders',
      ontologyVersion: '3',
      conceptId: 'order',
      factTypeId: 'order-raw',
      factId: 'input-1',
      factVersion: '1',
    },
    value: { orderId: '1' },
    source: { sourceType: 'runtime', sourceId: 'seed' },
    operationId: 'seed-operation',
    revision: 1,
    acceptedAt: new Date('2026-09-20T08:00:00.000Z'),
  };
}

function drafts(value = 'ready'): FrozenOutcomeDraftPort {
  return {
    resolve: async () => ({
      actionId: 'prepare-order',
      inputFactRefs: [seedFact().ref],
      outputs: [{
        factId: 'output-1',
        factTypeId: 'order-ready',
        value: { status: value },
        source: { sourceType: 'runtime', sourceId: 'work-item-outcome' },
      }],
      expectedRevision: 0,
    }),
  };
}

async function publishedFixture(
  ontology: CanonicalOntology = ontologyFixture(),
): Promise<{
  contract: SolutionExecutionContract;
  contractStore: SolutionExecutionContractStore;
  dataRoot: string;
  ontologyStore: CanonicalOntologyStore;
}> {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'contract-outcome-'));
  const contractStore = new SolutionExecutionContractStore(dataRoot);
  const publication = await contractStore.publishCompiled(
    ontology,
    'confirmed',
    contractBody(),
  );
  if (!publication.ok) {
    throw new Error('Contract fixture failed to publish');
  }
  const ontologyStore = new CanonicalOntologyStore(dataRoot);
  await ontologyStore.writeOntology('project-1', ontology);
  await ontologyStore.appendFact('project-1', seedFact());
  return {
    contract: publication.published.contract,
    contractStore,
    dataRoot,
    ontologyStore,
  };
}

async function startedRun(
  contract: SolutionExecutionContract,
  dataRoot: string,
): Promise<{ run: CollaborationRunSnapshot; item: CollaborationRunSnapshot['workItems'][number] }> {
  const contractStore = new SolutionExecutionContractStore(dataRoot);
  const execution = new CollaborationExecutionStore(contractStore, dataRoot);
  const run = await execution.start({
    projectId: contract.projectId,
    solutionId: contract.solutionId,
    solutionVersion: contract.solutionVersion,
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    taskRevision: 1,
    executionContractId: contract.contractId,
    contractHash: contract.contractHash,
    inputRefs: ['order-raw'],
  });
  return { run, item: run.workItems[0]! };
}

function verifierInput(
  run: CollaborationRunSnapshot,
): VerifierExecutionInput {
  const workItem = run.workItems[0]!;
  const attempt = {
    attemptId: `${workItem.id}:attempt-1`,
    leaseEpoch: 1,
    requestId: 'request-1',
    payloadHash: 'sha256:payload-1',
    status: 'worker_received' as const,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    workerReceipt: workerReceipt(),
  };
  return {
    run,
    workItem,
    attempt,
    executionKey: `${run.runId}:${workItem.id}:${attempt.attemptId}`,
    idempotencyKey: 'verifier-idempotency-1',
    workerReceipt: workerReceipt(),
  };
}

function outcomeInput(
  run: CollaborationRunSnapshot,
  verification = new VersionedContractVerifierRegistry([verifier()], [schema()]),
): Promise<OutcomeCommitInput> {
  const input = verifierInput(run);
  return verification.verify(input).then((verifierResult) => ({
    ...input,
    verifierResult,
    idempotencyKey: 'outcome-idempotency-1',
  }));
}

describe('VersionedContractVerifierRegistry', () => {
  it('resolves exact frozen references and produces a stable bound result', async () => {
    const state = await publishedFixture();
    const { run } = await startedRun(state.contract, state.dataRoot);
    const registry = new VersionedContractVerifierRegistry([verifier()], [schema()]);

    const first = await registry.verify(verifierInput(run));
    const second = await registry.verify(verifierInput(run));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'passed',
      verificationMethod: verifierRef,
      artifactRefs: ['artifact:order-ready'],
      contractHash: state.contract.contractHash,
    });
    expect(first.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('fails closed for unknown, placeholder, and schema-mismatched verification', async () => {
    const state = await publishedFixture();
    const { run } = await startedRun(state.contract, state.dataRoot);
    const input = verifierInput(run);

    await expect(
      new VersionedContractVerifierRegistry([], [schema()]).verify(input),
    ).rejects.toMatchObject({ code: 'VERIFIER_UNKNOWN' });
    await expect(
      new VersionedContractVerifierRegistry([verifier('placeholder')], [schema()])
        .verify(input),
    ).rejects.toMatchObject({ code: 'VERIFIER_PLACEHOLDER' });
    await expect(
      new VersionedContractVerifierRegistry([verifier()], [schema(false)])
        .verify(input),
    ).rejects.toMatchObject({ code: 'EVIDENCE_SCHEMA_MISMATCH' });
  });

  it('requires immutable version refs and exposes no heuristic fallback', () => {
    expect(() => new VersionedContractVerifierRegistry([
      { ...verifier(), ref: 'order-verifier' },
    ], [schema()])).toThrow(/immutable numeric version/);
    const error = new ContractVerifierError('VERIFIER_UNKNOWN', 'missing');
    expect(error.code).toBe('VERIFIER_UNKNOWN');
    expect('fallback' in new VersionedContractVerifierRegistry([], [])).toBe(false);
  });
});

describe('CanonicalOntologyOutcomeAdapter', () => {
  it('submits through canonical OSDK and recovers duplicate receipts idempotently', async () => {
    const state = await publishedFixture();
    const { run } = await startedRun(state.contract, state.dataRoot);
    const osdk = new CanonicalOntologyOSDK(state.ontologyStore);
    const submitAction = vi.spyOn(osdk, 'submitAction');
    const adapter = new CanonicalOntologyOutcomeAdapter(osdk, drafts());
    const input = await outcomeInput(run);

    const first = await adapter.commit(input);
    const duplicate = await adapter.commit(input);

    expect(first).toEqual(duplicate);
    expect(first).toMatchObject({
      status: 'accepted',
      factRefs: ['orders@3/order/order-ready/output-1@1'],
    });
    expect(first.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(submitAction).toHaveBeenCalledTimes(2);
    expect(await state.ontologyStore.readFacts('project-1')).toHaveLength(2);
  });

  it('rejects a different payload that reuses the same operation ID', async () => {
    const state = await publishedFixture();
    const { run } = await startedRun(state.contract, state.dataRoot);
    const osdk = new CanonicalOntologyOSDK(state.ontologyStore);
    const input = await outcomeInput(run);

    expect(await new CanonicalOntologyOutcomeAdapter(osdk, drafts('ready')).commit(input))
      .toMatchObject({ status: 'accepted' });
    expect(await new CanonicalOntologyOutcomeAdapter(osdk, drafts('changed')).commit(input))
      .toMatchObject({ status: 'rejected', reason: 'OPERATION_CONFLICT' });
    expect(await state.ontologyStore.readFacts('project-1')).toHaveLength(2);
  });

  it('rejects an Action with rules when no deterministic evaluator exists', async () => {
    const guarded = ontologyFixture();
    guarded.rules = [{
      id: 'must-approve',
      name: 'Must approve',
      kind: 'precondition',
      expression: { approved: true },
      severity: 'error',
    }];
    guarded.actions[0] = { ...guarded.actions[0]!, ruleIds: ['must-approve'] };
    const state = await publishedFixture(guarded);
    const { run } = await startedRun(state.contract, state.dataRoot);
    const adapter = new CanonicalOntologyOutcomeAdapter(
      new CanonicalOntologyOSDK(state.ontologyStore),
      drafts(),
    );

    expect(await adapter.commit(await outcomeInput(run))).toMatchObject({
      status: 'rejected',
      reason: 'RULE_EVALUATION_UNAVAILABLE',
    });
    expect(await state.ontologyStore.readFacts('project-1')).toHaveLength(1);
  });

  it('resumes after an accepted Action and records Evidence without repeating Action', async () => {
    const state = await publishedFixture();
    const osdk = new CanonicalOntologyOSDK(state.ontologyStore);
    const submitAction = vi.spyOn(osdk, 'submitAction');
    const outcome = new CanonicalOntologyOutcomeAdapter(osdk, drafts());
    const verification = new VersionedContractVerifierRegistry([verifier()], [schema()]);
    const shared: CollaborationExecutionDependencies = {
      readiness: {
        check: async ({ workItem, run }) => ({
          status: 'ready' as const,
          receiptId: 'readiness-1',
          inputRefs: workItem.inputRefs,
          grantedPermissions: run.contract.permissions.allowed,
          targetAvailable: true as const,
        }),
      },
      worker: { execute: async () => workerReceipt() },
      verifier: verification,
      outcome,
    };
    const firstHost = new CollaborationExecutionStore(
      state.contractStore,
      state.dataRoot,
      shared,
    );
    const run = await firstHost.start({
      projectId: state.contract.projectId,
      solutionId: state.contract.solutionId,
      solutionVersion: state.contract.solutionVersion,
      parentTaskId: 'task-recovery',
      parentStepId: 'step-1',
      taskRevision: 1,
      executionContractId: state.contract.contractId,
      contractHash: state.contract.contractHash,
      inputRefs: ['order-raw'],
    });
    const interrupted = await firstHost.executeWorkItem({
      runId: run.runId,
      workItemId: run.workItems[0]!.id,
      requestId: 'recovery-request',
      payloadHash: 'sha256:recovery-request',
    });
    expect(interrupted.workItems[0]!.attempts[0]).toMatchObject({
      status: 'evidence_pending',
      outcomeReceipt: { status: 'accepted' },
    });
    expect(submitAction).toHaveBeenCalledTimes(1);

    const evidenceHashes: string[] = [];
    const restarted = new CollaborationExecutionStore(
      state.contractStore,
      state.dataRoot,
      {
        ...shared,
        evidenceSink: {
          record: async ({ evidenceHash }): Promise<EvidenceReceipt> => {
            evidenceHashes.push(evidenceHash);
            return {
              receiptId: 'evidence-1',
              status: 'accepted',
              evidenceRef: 'evidence:1',
              evidenceHash,
            };
          },
        },
      },
    );
    const completed = await restarted.recover(run.runId);

    expect(completed.workItems[0]).toMatchObject({
      status: 'completed',
      attempts: [{
        status: 'completed',
        outcomeReceipt: { status: 'accepted' },
        evidenceReceipt: { status: 'accepted' },
      }],
    });
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(evidenceHashes).toHaveLength(1);
    expect(evidenceHashes[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
    await restarted.recover(run.runId);
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(evidenceHashes).toHaveLength(1);
  });
});
