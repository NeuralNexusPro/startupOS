import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  CanonicalOntologyOSDK,
  CanonicalOntologyStore,
  type CanonicalActionSubmission,
  type CanonicalContextProjectionRecord,
  type CanonicalFactRecord,
  type CanonicalOntology,
} from '../index';

const instant = new Date('2026-09-18T08:00:00.000Z');

function ontology(): CanonicalOntology {
  return {
    id: 'orders',
    projectId: 'project-1',
    name: 'Orders',
    schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
    version: '3',
    domains: [{ id: 'sales', name: 'Sales', description: '', createdAt: instant, updatedAt: instant }],
    concepts: [{ id: 'order', domainId: 'sales', name: 'Order', type: 'aggregate', attributes: {}, createdAt: instant, updatedAt: instant }],
    instances: [],
    properties: [],
    relations: [],
    businessStates: [
      { id: 'draft', conceptId: 'order', name: 'Draft', initial: true },
      { id: 'submitted', conceptId: 'order', name: 'Submitted', terminal: true },
    ],
    transitions: [],
    factTypes: [
      { id: 'order-input', conceptId: 'order', name: 'Order input', propertyIds: [] },
      { id: 'order-output', conceptId: 'order', name: 'Order output', propertyIds: [] },
    ],
    rules: [{ id: 'approval-rule', name: 'Approval', kind: 'precondition', expression: { approved: true }, severity: 'error' }],
    actions: [
      {
        id: 'submit-order',
        name: 'Submit order',
        conceptId: 'order',
        inputFactTypeIds: ['order-input'],
        outputFactTypeIds: ['order-output'],
        fromStateIds: ['draft'],
        toStateId: 'submitted',
        permissions: ['order.submit'],
      },
      {
        id: 'guarded-order',
        name: 'Guarded order',
        conceptId: 'order',
        inputFactTypeIds: ['order-input'],
        outputFactTypeIds: ['order-output'],
        ruleIds: ['approval-rule'],
        permissions: ['order.submit'],
      },
    ],
    events: [],
    projections: [],
    createdAt: instant,
    updatedAt: instant,
  };
}

function fact(overrides: Partial<CanonicalFactRecord> = {}): CanonicalFactRecord {
  return {
    ref: {
      ontologyId: 'orders',
      ontologyVersion: '3',
      conceptId: 'order',
      factTypeId: 'order-input',
      factId: 'input-1',
      factVersion: '1',
    },
    value: { total: 42 },
    source: { sourceType: 'runtime', sourceId: 'seed' },
    operationId: 'seed-operation',
    revision: 1,
    acceptedAt: instant,
    ...overrides,
  };
}

function submission(overrides: Partial<CanonicalActionSubmission> = {}): CanonicalActionSubmission {
  return {
    projectId: 'project-1',
    ontologyId: 'orders',
    ontologyVersion: '3',
    operationId: 'operation-1',
    actionId: 'submit-order',
    conceptId: 'order',
    currentStateId: 'draft',
    permissions: ['order.submit'],
    inputFactRefs: [fact().ref],
    outputs: [{
      factId: 'output-1',
      factTypeId: 'order-output',
      value: { status: 'submitted' },
      source: { sourceType: 'runtime', sourceId: 'run-1' },
    }],
    expectedRevision: 0,
    audit: { actorId: 'actor-1', runId: 'run-1', workItemId: 'work-1' },
    ...overrides,
  };
}

function projection(overrides: Partial<CanonicalContextProjectionRecord> = {}): CanonicalContextProjectionRecord {
  return {
    id: 'projection-1',
    kind: 'outcome',
    context: {
      contextInstanceId: 'context-1',
      projectId: 'project-1',
      taskId: 'task-1',
      sessionId: 'session-1',
      branchId: 'branch-1',
      runId: 'run-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      contractId: 'contract-1',
      contractHash: 'sha256:contract-1',
      ontology: { ontologyId: 'orders', ontologyVersion: '3' },
    },
    revision: 1,
    factRefs: [fact().ref],
    createdAt: instant,
    ...overrides,
  };
}

describe('CanonicalOntologyOSDK', () => {
  let root: string;
  let store: CanonicalOntologyStore;
  let osdk: CanonicalOntologyOSDK;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-osdk-'));
    store = new CanonicalOntologyStore(root);
    osdk = new CanonicalOntologyOSDK(store);
    await store.writeOntology('project-1', ontology());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('binds queries to current ontology references and filters by type', async () => {
    await store.appendFact('project-1', fact());
    await store.appendFact('project-1', fact({
      ref: { ...fact().ref, factTypeId: 'order-output', factId: 'output-1' },
    }));

    const stale = await osdk.queryFacts({ projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '2' });
    expect(stale).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'ONTOLOGY_VERSION_MISMATCH' })] });
    const missing = await osdk.queryFacts({ projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '3', factTypeId: 'missing' });
    expect(missing).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'MISSING_REFERENCE' })] });

    const filtered = await osdk.queryFacts({
      projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '3', conceptId: 'order', factTypeId: 'order-output',
    });
    expect(filtered.ok && filtered.facts.map(({ ref }) => ref.factId)).toEqual(['output-1']);
  });

  it('selects the highest revision and later appended fact on ties in stable order', async () => {
    await store.appendFact('project-1', fact({ acceptedAt: new Date('2026-09-18T08:02:00Z') }));
    await store.appendFact('project-1', fact({ revision: 2, value: { marker: 'earlier tie' }, acceptedAt: new Date('2026-09-18T08:03:00Z') }));
    await store.appendFact('project-1', fact({ revision: 2, value: { marker: 'later tie' }, acceptedAt: new Date('2026-09-18T08:01:00Z') }));
    await store.appendFact('project-1', fact({
      ref: { ...fact().ref, factId: 'input-2' },
      acceptedAt: new Date('2026-09-18T08:00:00Z'),
    }));

    const result = await osdk.queryFacts({ projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '3', latestOnly: true });
    expect(result.ok && result.facts.map(({ ref }) => ref.factId)).toEqual(['input-2', 'input-1']);
    expect(result.ok && result.facts[1]?.value).toEqual({ marker: 'later tie' });
  });

  it('filters projections by exact execution identity and selects deterministic latest records', async () => {
    await store.appendProjection('project-1', projection({ id: 'projection-2' }));
    await store.appendProjection('project-1', projection({
      id: 'projection-1',
      revision: 2,
      payload: { marker: 'earlier tie' },
    }));
    await store.appendProjection('project-1', projection({
      id: 'projection-1',
      revision: 2,
      payload: { marker: 'later tie' },
    }));
    await store.appendProjection('project-1', projection({
      id: 'other-work-item',
      context: { ...projection().context, workItemId: 'work-2' },
    }));
    await store.appendProjection('project-1', projection({
      id: 'other-attempt',
      context: { ...projection().context, attemptId: 'attempt-2' },
    }));

    const result = await osdk.queryProjections({
      projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '3',
      taskId: 'task-1', sessionId: 'session-1', branchId: 'branch-1', runId: 'run-1',
      workItemId: 'work-1', attemptId: 'attempt-1', kind: 'outcome', latestOnly: true,
    });
    expect(result.ok && result.projections.map(({ id }) => id)).toEqual(['projection-2', 'projection-1']);
    expect(result.ok && result.projections[1]?.payload).toEqual({ marker: 'later tie' });

    const stale = await osdk.queryProjections({ projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '2' });
    expect(stale).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'ONTOLOGY_VERSION_MISMATCH' })] });
  });

  it('resolves only exact canonical facts and fails closed without changing JSONL', async () => {
    await store.appendFact('project-1', fact());
    const valid = projection();
    const resolved = await osdk.resolveProjection({
      projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '3', projection: valid,
    });
    expect(resolved.ok && resolved.facts).toEqual([fact()]);

    const factsPath = path.join(root, 'ontology', 'project-1-facts.jsonl');
    const projectionsPath = path.join(root, 'ontology', 'project-1-projections.jsonl');
    const before = await Promise.all([fs.readFile(factsPath, 'utf8'), fs.readFile(projectionsPath, 'utf8').catch(() => '')]);
    const rejected = await osdk.resolveProjection({
      projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '3',
      projection: projection({ factRefs: [{ ...fact().ref, ontologyVersion: '2' }] }),
    });
    expect(rejected).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'ONTOLOGY_REFERENCE_MISMATCH' })] });
    expect(await Promise.all([fs.readFile(factsPath, 'utf8'), fs.readFile(projectionsPath, 'utf8').catch(() => '')])).toEqual(before);

    const wrongOwner = await osdk.resolveProjection({
      projectId: 'project-1', ontologyId: 'orders', ontologyVersion: '3',
      projection: projection({ factRefs: [{ ...fact().ref, conceptId: 'other-concept' }] }),
    });
    expect(wrongOwner).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'INVALID_CONCEPT_BINDING' })] });
  });

  it('rejects gate, input, output and revision failures before writing operations', async () => {
    await store.appendFact('project-1', fact());
    const cases: Array<[CanonicalActionSubmission, string]> = [
      [submission({ permissions: [] }), 'PERMISSION_DENIED'],
      [submission({ inputFactRefs: [] }), 'INPUT_FACT_REQUIRED'],
      [submission({ inputFactRefs: [{ ...fact().ref, factId: 'missing' }] }), 'INPUT_FACT_NOT_FOUND'],
      [submission({ outputs: [{ ...submission().outputs[0]!, factTypeId: 'order-input' }] }), 'OUTPUT_FACT_TYPE_NOT_ALLOWED'],
      [submission({ expectedRevision: 1 }), 'REVISION_CONFLICT'],
    ];
    for (const [request, code] of cases) {
      const result = await osdk.submitAction(request);
      expect(result).toEqual({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
    }
    expect(await store.readOperations('project-1')).toEqual([]);
    expect(await store.readFacts('project-1')).toHaveLength(1);
  });

  it('writes intent, generated facts and an accepted audited receipt', async () => {
    await store.appendFact('project-1', fact());
    const result = await osdk.submitAction(submission());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt).toMatchObject({
      operationId: 'operation-1',
      actionId: 'submit-order',
      status: 'accepted',
      expectedRevision: 0,
      metadata: { actorId: 'actor-1', runId: 'run-1', workItemId: 'work-1', requestFingerprint: expect.any(String) },
    });
    const written = (await store.readFacts('project-1')).find(({ operationId }) => operationId === 'operation-1');
    expect(written).toMatchObject({
      ref: { conceptId: 'order', factTypeId: 'order-output', factId: 'output-1', factVersion: '1' },
      revision: 1,
    });
    expect((await store.readOperations('project-1')).map(({ status }) => status)).toEqual(['intent', 'accepted']);
  });

  it('returns the existing receipt for an identical retry and rejects operation reuse', async () => {
    await store.appendFact('project-1', fact());
    const request = submission();
    const [first, retried] = await Promise.all([osdk.submitAction(request), osdk.submitAction(request)]);
    const conflict = await osdk.submitAction({ ...request, outputs: [{ ...request.outputs[0]!, value: { status: 'changed' } }] });

    expect(retried).toEqual(first);
    expect(conflict).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'OPERATION_CONFLICT' })] });
    expect((await store.readFacts('project-1')).filter(({ operationId }) => operationId === request.operationId)).toHaveLength(1);
    expect(await store.readOperations('project-1')).toHaveLength(2);
  });

  it('serializes submissions and recovers an intent with a partially written output set', async () => {
    await store.appendFact('project-1', fact());
    const request = submission({
      outputs: [
        submission().outputs[0]!,
        { ...submission().outputs[0]!, factId: 'output-2' },
      ],
    });
    const appendFact = store.appendFact.bind(store);
    let calls = 0;
    vi.spyOn(store, 'appendFact').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('simulated interruption');
      return appendFact(...args);
    });

    await expect(osdk.submitAction(request)).rejects.toThrow('simulated interruption');
    vi.mocked(store.appendFact).mockRestore();
    const recovered = await new CanonicalOntologyOSDK(store).submitAction(request);

    expect(recovered.ok).toBe(true);
    expect((await store.readFacts('project-1')).filter(({ operationId }) => operationId === request.operationId)).toHaveLength(2);
    expect((await store.readOperations('project-1')).map(({ status }) => status)).toEqual(['intent', 'accepted']);
  });

  it('rejects unavailable Rule evaluation without writing', async () => {
    await store.appendFact('project-1', fact());
    const result = await osdk.submitAction(submission({ actionId: 'guarded-order', currentStateId: undefined }));

    expect(result).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'RULE_EVALUATION_UNAVAILABLE' })] });
    expect(await store.readOperations('project-1')).toEqual([]);
    expect(await store.readFacts('project-1')).toHaveLength(1);
  });
});
