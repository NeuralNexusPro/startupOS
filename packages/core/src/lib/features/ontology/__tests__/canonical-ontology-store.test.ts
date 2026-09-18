import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  CanonicalOntologyStore,
  type CanonicalFactRecord,
  type CanonicalOntology,
  type CanonicalOperationRecord,
} from '../index';

const instant = new Date('2026-09-18T08:00:00.000Z');

function ontology(version: string): CanonicalOntology {
  return {
    id: 'orders',
    projectId: 'project-1',
    name: 'Orders',
    schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
    version,
    domains: [{ id: 'sales', name: 'Sales', description: '', createdAt: instant, updatedAt: instant }],
    concepts: [{
      id: 'order',
      domainId: 'sales',
      name: 'Order',
      type: 'aggregate',
      attributes: {},
      createdAt: instant,
      updatedAt: instant,
    }],
    instances: [{ id: 'order-1', conceptId: 'order', data: {}, createdAt: instant, updatedAt: instant }],
    properties: [],
    relations: [],
    businessStates: [],
    transitions: [],
    factTypes: [],
    rules: [],
    actions: [],
    events: [],
    projections: [],
    createdAt: instant,
    updatedAt: instant,
  };
}

function fact(index: number): CanonicalFactRecord {
  return {
    ref: {
      ontologyId: 'orders',
      ontologyVersion: '2',
      conceptId: 'order',
      factTypeId: 'order-updated',
      factId: `fact-${index}`,
      factVersion: '1',
    },
    value: { index },
    source: { sourceType: 'runtime', sourceId: 'run-1' },
    operationId: `operation-${index}`,
    revision: index,
    acceptedAt: instant,
  };
}

function operation(status: CanonicalOperationRecord['status']): CanonicalOperationRecord {
  return {
    operationId: 'operation-shared',
    actionId: 'update-order',
    status,
    expectedRevision: 1,
    factRefs: [],
    recordedAt: instant,
  };
}

describe('CanonicalOntologyStore', () => {
  let root: string;
  let store: CanonicalOntologyStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-ontology-'));
    store = new CanonicalOntologyStore(root);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('atomically replaces snapshots, preserves DataFile creation time, and restores Dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-18T08:01:00.000Z');
    const first = await store.writeOntology('project-1', ontology('1'));
    vi.setSystemTime('2026-09-18T08:02:00.000Z');
    const second = await store.writeOntology('project-1', ontology('2'));
    const loaded = await store.readOntology('project-1');

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(loaded?.data.version).toBe('2');
    expect(loaded?.data.createdAt).toEqual(instant);
    expect(loaded?.data.domains[0]?.createdAt).toEqual(instant);
    expect(loaded?.data.concepts[0]?.updatedAt).toEqual(instant);
    expect(loaded?.data.instances[0]?.createdAt).toEqual(instant);
    expect((await fs.readdir(path.join(root, 'ontology'))).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('removes the temporary snapshot after a failed rename', async () => {
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('rename failed'));
    await expect(store.writeOntology('project-1', ontology('1'))).rejects.toThrow('rename failed');
    expect((await fs.readdir(path.join(root, 'ontology'))).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('serializes concurrent facts and recovers only a truncated final line', async () => {
    await Promise.all(Array.from({ length: 40 }, (_, index) => store.appendFact('project-1', fact(index))));
    const factsPath = path.join(root, 'ontology', 'project-1-facts.jsonl');
    await fs.appendFile(factsPath, '{"truncated":', 'utf8');
    const records = await store.readFacts('project-1');

    expect(records).toHaveLength(40);
    expect(new Set(records.map((record) => record.ref.factId)).size).toBe(40);
    expect(records[0]?.acceptedAt).toBeInstanceOf(Date);

    const brokenPath = path.join(root, 'ontology', 'broken-facts.jsonl');
    await fs.writeFile(brokenPath, `${JSON.stringify(fact(1))}\n{"bad":\n${JSON.stringify(fact(2))}\n`, 'utf8');
    await expect(store.readFacts('broken')).rejects.toThrow(`${brokenPath}:2`);
  });

  it('returns the last operation receipt and round-trips the remaining logs', async () => {
    await store.appendOperation('project-1', operation('intent'));
    await store.appendOperation('project-1', operation('accepted'));
    await store.appendProjection('project-1', {
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
        contractHash: 'sha256:contract',
        ontology: { ontologyId: 'orders', ontologyVersion: '2' },
      },
      revision: 2,
      createdAt: instant,
    });
    await store.appendMigration('project-1', {
      migrationId: 'migration-1',
      projectId: 'project-1',
      fromVersion: '1',
      toVersion: '2',
      status: 'completed',
      recordedAt: instant,
    });

    expect((await store.getLatestOperation('project-1', 'operation-shared'))?.status).toBe('accepted');
    expect(await store.readOperations('project-1')).toHaveLength(2);
    expect((await store.readProjections('project-1'))[0]?.createdAt).toEqual(instant);
    expect((await store.readMigrations('project-1'))[0]?.recordedAt).toEqual(instant);
  });

  it('rejects unsafe project identifiers before touching disk', async () => {
    await expect(store.readFacts('../other')).rejects.toThrow('Invalid projectId');
    await expect(store.writeOntology('project-2', ontology('1'))).rejects.toThrow('does not match');
    await expect(fs.access(path.join(root, 'ontology'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
