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
    kind: 'task',
    context: {
      contextInstanceId: 'context-1', projectId: 'project-1', taskId: 'task-1', sessionId: 'session-1', branchId: 'branch-1',
      runId: 'run-1', workItemId: 'work-1', attemptId: 'attempt-1', contractId: 'contract-1', contractHash: 'sha256:contract',
      ontology: { ontologyId: 'orders', ontologyVersion: '3' },
    },
    revision: 1,
    factRefs: [fact().ref],
    decisionRefs: [{ ontologyId: 'orders', ontologyVersion: '3', decisionId: 'decision-1', decisionVersion: '1' }],
    sourceRefs: [{ sourceType: 'runtime', sourceId: 'run-1' }],
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

  it('appends, filters and resolves context projections without changing references', async () => {
    await store.appendFact('project-1', fact());
    const record = projection();
    expect(await osdk.appendContextProjection({ projectId: 'project-1', projection: record })).toEqual({ ok: true, projection: record });
    await osdk.appendContextProjection({
      projectId: 'project-1',
      projection: projection({
        id: 'projection-2',
        context: { ...record.context, contextInstanceId: 'context-2', attemptId: 'attempt-2' },
      }),
    });
    const filtered = await osdk.queryContextProjections({ projectId: 'project-1', contextInstanceId: 'context-1', attemptId: 'attempt-1', kind: 'task', revision: 1 });
    expect(filtered.ok && filtered.projections).toEqual([record]);
    const resolved = await osdk.resolveContextProjection({ projectId: 'project-1', projection: record });
    expect(resolved.ok && resolved.facts).toEqual([fact()]);
    expect(resolved.ok && resolved.projection.decisionRefs).toEqual(record.decisionRefs);
    expect((await store.readProjections('project-1'))[0]?.createdAt).toEqual(instant);
  });

  it('keeps historical projections queryable after an ontology upgrade', async () => {
    await store.appendFact('project-1', fact());
    const record = projection();
    await osdk.appendContextProjection({ projectId: 'project-1', projection: record });
    await store.writeOntology('project-1', { ...ontology(), version: '4' });

    const result = await osdk.queryContextProjections({
      projectId: 'project-1', contextInstanceId: 'context-1', attemptId: 'attempt-1',
    });
    expect(result.ok && result.projections).toEqual([record]);
  });

  it('rejects invalid projection writes and handles idempotent projection ids', async () => {
    await store.appendFact('project-1', fact());
    const record = projection();
    const invalid = await osdk.appendContextProjection({ projectId: 'project-1', projection: projection({ revision: -1 }) });
    const missing = await osdk.appendContextProjection({ projectId: 'project-1', projection: projection({ factRefs: [{ ...fact().ref, factVersion: 'missing' }] }) });
    expect(invalid).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'INVALID_REVISION' })] });
    expect(missing).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'FACT_REFERENCE_NOT_FOUND' })] });
    expect(await store.readProjections('project-1')).toEqual([]);
    expect(await osdk.appendContextProjection({ projectId: 'project-1', projection: record })).toEqual({ ok: true, projection: record });
    expect(await osdk.appendContextProjection({ projectId: 'project-1', projection: record })).toEqual({ ok: true, projection: record });
    const conflict = await osdk.appendContextProjection({ projectId: 'project-1', projection: projection({ payload: { changed: true } }) });
    expect(conflict).toEqual({ ok: false, issues: [expect.objectContaining({ code: 'PROJECTION_CONFLICT' })] });
    expect(await store.readProjections('project-1')).toHaveLength(1);
  });

  it('resolves only the exact historical fact and never writes a missing reference', async () => {
    await store.appendFact('project-1', fact());
    await store.appendFact('project-1', fact({ ref: { ...fact().ref, factVersion: '2' }, revision: 2, value: { total: 99 } }));
    const result = await osdk.resolveContextProjection({
      projectId: 'project-1', projection: projection({ factRefs: [{ ...fact().ref, factVersion: '2' }, { ...fact().ref, factId: 'missing' }] }),
    });
    expect(result.ok && result.facts).toEqual([fact({ ref: { ...fact().ref, factVersion: '2' }, revision: 2, value: { total: 99 } })]);
    expect(await store.readFacts('project-1')).toHaveLength(2);
    expect(await store.readProjections('project-1')).toEqual([]);
  });
});
