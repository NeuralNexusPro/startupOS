import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTHORING_REVISION_METADATA_KEY,
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  CanonicalOntologyAuthoringService,
  CanonicalOntologyStore,
  getCanonicalOntologyAuthoringRevision,
  type CanonicalInstance,
  type CanonicalOntology,
  type CanonicalOntologyAuthoringCommand,
} from '../index';

const instant = new Date('2026-10-12T08:00:00.000Z');

function ontology(): CanonicalOntology {
  return {
    id: 'orders',
    projectId: 'project-1',
    name: 'Orders',
    schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
    version: '1.0',
    domains: [
      {
        id: 'sales',
        name: 'Sales',
        description: '',
        createdAt: instant,
        updatedAt: instant,
      },
    ],
    concepts: [
      {
        id: 'order',
        domainId: 'sales',
        name: 'Order',
        type: 'aggregate',
        attributes: {},
        createdAt: instant,
        updatedAt: instant,
      },
      {
        id: 'customer',
        domainId: 'sales',
        name: 'Customer',
        type: 'entity',
        attributes: {},
        createdAt: instant,
        updatedAt: instant,
      },
    ],
    instances: [],
    properties: [],
    relations: [],
    businessStates: [
      { id: 'draft', conceptId: 'order', name: 'Draft', initial: true },
    ],
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

function command(
  value: Omit<
    CanonicalOntologyAuthoringCommand,
    keyof CanonicalOntologyAuthoringCommand &
      (
        | 'projectId'
        | 'ontologyId'
        | 'ontologyVersion'
        | 'expectedRevision'
        | 'operationId'
        | 'permissions'
      )
  >,
  operationId: string,
  expectedRevision = 0
): CanonicalOntologyAuthoringCommand {
  return {
    projectId: 'project-1',
    ontologyId: 'orders',
    ontologyVersion: '1.0',
    expectedRevision,
    operationId,
    permissions: ['ontology:author'],
    ...value,
  } as CanonicalOntologyAuthoringCommand;
}

function instance(overrides: Partial<CanonicalInstance> = {}): CanonicalInstance {
  return {
    id: 'order-1',
    conceptId: 'order',
    data: { number: 'A-001' },
    createdAt: instant,
    updatedAt: instant,
    ...overrides,
  };
}

describe('CanonicalOntologyAuthoringService instance commands', () => {
  let root: string;
  let store: CanonicalOntologyStore;
  let service: CanonicalOntologyAuthoringService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-authoring-instance-'));
    store = new CanonicalOntologyStore(root);
    service = new CanonicalOntologyAuthoringService(store);
    await store.writeOntology('project-1', ontology(), { createOnly: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('creates an instance with revision increment and timestamps', async () => {
    const result = await service.execute(
      command({ type: 'instance.create', value: instance() }, 'instance-create-1')
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.receipt).toMatchObject({
      beforeRevision: 0,
      afterRevision: 1,
      status: 'accepted',
      commandType: 'instance.create',
    });
    expect(result.ontology.instances).toHaveLength(1);
    const created = result.ontology.instances[0]!;
    expect(created).toMatchObject({ id: 'order-1', conceptId: 'order' });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
    expect(
      result.ontology.metadata?.[AUTHORING_REVISION_METADATA_KEY]
    ).toBe(1);

    const loaded = (await store.readOntology('project-1'))!.data;
    expect(loaded.instances).toHaveLength(1);
    expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(1);
  });

  it('rejects a create referencing an unknown concept without writing', async () => {
    const result = await service.execute(
      command(
        { type: 'instance.create', value: instance({ conceptId: 'missing' }) },
        'instance-create-unknown-concept'
      )
    );

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_REFERENCE',
          path: 'value.conceptId',
        }),
      ]),
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(0);
    expect(await store.readAuthoringReceipts('project-1')).toEqual([]);
  });

  it('rejects a create with a duplicate instance id', async () => {
    const first = await service.execute(
      command({ type: 'instance.create', value: instance() }, 'instance-create-first')
    );
    expect(first.ok).toBe(true);

    const duplicate = await service.execute(
      command(
        { type: 'instance.create', value: instance({ data: { number: 'A-002' } }) },
        'instance-create-duplicate',
        1
      )
    );

    expect(duplicate).toMatchObject({
      ok: false,
      issues: [{ code: 'DUPLICATE_ID' }],
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(1);
    expect((await store.readOntology('project-1'))!.data.instances).toHaveLength(
      1
    );
  });

  it('rejects a create whose data is not a plain object', async () => {
    const result = await service.execute(
      command(
        {
          type: 'instance.create',
          value: instance({ data: 'not-an-object' as unknown as Record<string, unknown> }),
        },
        'instance-create-bad-data'
      )
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'INVALID_INSTANCE_DATA',
          path: 'value.data',
        }),
      ],
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(0);
  });

  it('replays an identical operationId without incrementing the revision', async () => {
    const original = command(
      { type: 'instance.create', value: instance() },
      'stable-instance-operation'
    );
    const first = await service.execute(original);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const restarted = new CanonicalOntologyAuthoringService(
      new CanonicalOntologyStore(root)
    );
    const retry = await restarted.execute(original);
    expect(retry).toEqual(first);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.receipt.afterRevision).toBe(1);

    const conflict = await restarted.execute(
      command(
        {
          type: 'instance.create',
          value: instance({ id: 'order-2' }),
        },
        'stable-instance-operation'
      )
    );
    expect(conflict).toMatchObject({
      ok: false,
      issues: [{ code: 'OPERATION_CONFLICT' }],
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(1);
    expect((await store.readOntology('project-1'))!.data.instances).toHaveLength(
      1
    );
  });

  it('returns REVISION_CONFLICT for a stale expectedRevision', async () => {
    const first = await service.execute(
      command({ type: 'instance.create', value: instance() }, 'instance-create-cas')
    );
    expect(first.ok).toBe(true);

    const stale = await service.execute(
      command(
        { type: 'instance.create', value: instance({ id: 'order-2' }) },
        'instance-create-stale',
        0
      )
    );
    expect(stale).toMatchObject({
      ok: false,
      issues: [{ code: 'REVISION_CONFLICT' }],
    });
    expect((await store.readOntology('project-1'))!.data.instances).toHaveLength(
      1
    );
  });

  it('replaces data wholesale and refreshes updatedAt on update', async () => {
    await service.execute(
      command({ type: 'instance.create', value: instance() }, 'instance-create-update')
    );

    const result = await service.execute(
      command(
        {
          type: 'instance.update',
          instanceId: 'order-1',
          patch: { data: { number: 'B-002', extra: true } },
        },
        'instance-update-data',
        1
      )
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const updated = result.ontology.instances[0]!;
    expect(updated.data).toEqual({ number: 'B-002', extra: true });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(instant.getTime());
    expect(updated.createdAt).toEqual(instant);
    expect(result.receipt.afterRevision).toBe(2);
  });

  it('updates stateId and sourceRefs on patch', async () => {
    await service.execute(
      command({ type: 'instance.create', value: instance() }, 'instance-create-state')
    );

    const result = await service.execute(
      command(
        {
          type: 'instance.update',
          instanceId: 'order-1',
          patch: {
            stateId: 'draft',
            sourceRefs: [
              { sourceType: 'manual', sourceId: 'seed-1' },
            ],
          },
        },
        'instance-update-state',
        1
      )
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const updated = result.ontology.instances[0]!;
    expect(updated.stateId).toBe('draft');
    expect(updated.sourceRefs).toEqual([{ sourceType: 'manual', sourceId: 'seed-1' }]);
    expect(updated.data).toEqual({ number: 'A-001' });
  });

  it('rejects a patch that mutates conceptId, id or createdAt', async () => {
    await service.execute(
      command({ type: 'instance.create', value: instance() }, 'instance-create-immutable')
    );

    for (const [index, patch] of [
      { conceptId: 'customer' },
      { id: 'order-9' },
      { createdAt: new Date() },
    ].entries()) {
      const result = await service.execute(
        command(
          {
            type: 'instance.update',
            instanceId: 'order-1',
            patch,
          },
          `instance-update-immutable-${index}`,
          1
        )
      );
      expect(result, JSON.stringify(patch)).toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code: 'IMMUTABLE_FIELD' })],
      });
    }

    const loaded = (await store.readOntology('project-1'))!.data;
    expect(loaded.instances[0]).toMatchObject({
      id: 'order-1',
      conceptId: 'order',
      createdAt: instant,
    });
    expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(1);
  });

  it('rejects an update for a missing instance', async () => {
    const result = await service.execute(
      command(
        {
          type: 'instance.update',
          instanceId: 'missing',
          patch: { data: { number: 'X' } },
        },
        'instance-update-missing'
      )
    );

    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'AUTHORING_TARGET_NOT_FOUND',
          path: 'instanceId',
        }),
      ],
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(0);
  });

  it('deletes an instance without relations', async () => {
    await service.execute(
      command({ type: 'instance.create', value: instance() }, 'instance-create-delete')
    );

    const result = await service.execute(
      command({ type: 'instance.delete', instanceId: 'order-1' }, 'instance-delete', 1)
    );

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.ontology.instances).toHaveLength(0);
    expect(result.receipt).toMatchObject({
      beforeRevision: 1,
      afterRevision: 2,
      commandType: 'instance.delete',
    });

    const loaded = (await store.readOntology('project-1'))!.data;
    expect(loaded.instances).toHaveLength(0);
    expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(2);
  });

  it('rejects deleting an instance referenced by an instance relation', async () => {
    const referenced = instance({
      data: {
        number: 'A-001',
        relations: [
          {
            id: 'irel-1',
            sourceInstanceId: 'order-1',
            targetInstanceId: 'order-2',
            type: 'belongs_to',
          },
        ],
      },
    });
    await service.execute(
      command({ type: 'instance.create', value: referenced }, 'instance-create-referenced')
    );
    await service.execute(
      command(
        {
          type: 'instance.create',
          value: instance({ id: 'order-2', data: {} }),
        },
        'instance-create-referenced-target',
        1
      )
    );

    const before = (await store.readOntology('project-1'))!.data;
    const result = await service.execute(
      command(
        { type: 'instance.delete', instanceId: 'order-1' },
        'instance-delete-referenced',
        2
      )
    );

    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'INSTANCE_REFERENCED' })],
    });

    const after = (await store.readOntology('project-1'))!.data;
    expect(after.instances).toHaveLength(2);
    expect(after.instances).toEqual(before.instances);
    expect(getCanonicalOntologyAuthoringRevision(after)).toBe(2);
    expect(await store.readAuthoringReceipts('project-1')).toHaveLength(2);
  });

  it('rejects deleting a missing instance', async () => {
    const result = await service.execute(
      command(
        { type: 'instance.delete', instanceId: 'missing' },
        'instance-delete-missing'
      )
    );

    expect(result).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'AUTHORING_TARGET_NOT_FOUND',
          path: 'instanceId',
        }),
      ],
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(0);
  });
});