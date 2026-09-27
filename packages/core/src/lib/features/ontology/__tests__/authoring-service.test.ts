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
  type CanonicalOntology,
  type CanonicalOntologyAuthoringCommand,
} from '../index';

const instant = new Date('2026-09-27T08:00:00.000Z');

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
        propertyIds: ['order-number'],
        createdAt: instant,
        updatedAt: instant,
      },
    ],
    instances: [],
    properties: [
      {
        id: 'order-number',
        conceptId: 'order',
        name: 'Number',
        valueType: 'string',
        required: true,
      },
    ],
    relations: [],
    businessStates: [
      { id: 'draft', conceptId: 'order', name: 'Draft', initial: true },
    ],
    transitions: [],
    factTypes: [
      {
        id: 'order-fact',
        conceptId: 'order',
        name: 'Order fact',
        propertyIds: ['order-number'],
      },
    ],
    rules: [],
    actions: [
      {
        id: 'submit-order',
        name: 'Submit order',
        conceptId: 'order',
        inputFactTypeIds: ['order-fact'],
        outputFactTypeIds: ['order-fact'],
        fromStateIds: ['draft'],
        permissions: ['orders:write'],
      },
    ],
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

describe('CanonicalOntologyAuthoringService', () => {
  let root: string;
  let store: CanonicalOntologyStore;
  let service: CanonicalOntologyAuthoringService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-authoring-'));
    store = new CanonicalOntologyStore(root);
    service = new CanonicalOntologyAuthoringService(store);
    await store.writeOntology('project-1', ontology(), { createOnly: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('treats an existing snapshot without metadata revision as revision zero', async () => {
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(0);
    const result = await service.execute(
      command(
        {
          type: 'domain.update',
          domainId: 'sales',
          patch: { description: 'Revenue operations' },
        },
        'operation-1'
      )
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt).toMatchObject({
      beforeRevision: 0,
      afterRevision: 1,
      status: 'accepted',
    });
    expect(result.ontology.domains[0]?.description).toBe('Revenue operations');
    expect(result.ontology.metadata?.[AUTHORING_REVISION_METADATA_KEY]).toBe(1);
  });

  it('supports create, update and delete for every authoring collection', async () => {
    const commands: Array<
      Omit<
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
      >
    > = [
      {
        type: 'domain.create',
        value: {
          id: 'support',
          name: 'Support',
          description: '',
          createdAt: instant,
          updatedAt: instant,
        },
      },
      {
        type: 'domain.update',
        domainId: 'support',
        patch: { name: 'Customer support' },
      },
      {
        type: 'concept.create',
        value: {
          id: 'ticket',
          domainId: 'support',
          name: 'Ticket',
          type: 'entity',
          attributes: {},
          createdAt: instant,
          updatedAt: instant,
        },
      },
      {
        type: 'concept.update',
        conceptId: 'ticket',
        patch: { description: 'Customer request' },
      },
      {
        type: 'property.create',
        value: {
          id: 'ticket-title',
          conceptId: 'ticket',
          name: 'Title',
          valueType: 'string',
          required: true,
        },
      },
      {
        type: 'property.update',
        propertyId: 'ticket-title',
        patch: { required: false },
      },
      {
        type: 'relation.create',
        value: {
          id: 'order-ticket',
          name: 'Order tickets',
          sourceConceptId: 'order',
          targetConceptId: 'ticket',
          cardinality: 'one-to-many',
        },
      },
      {
        type: 'relation.update',
        relationId: 'order-ticket',
        patch: { description: 'Related tickets' },
      },
      {
        type: 'businessState.create',
        value: {
          id: 'ticket-open',
          conceptId: 'ticket',
          name: 'Open',
          initial: true,
        },
      },
      {
        type: 'businessState.update',
        businessStateId: 'ticket-open',
        patch: { description: 'Needs attention' },
      },
      {
        type: 'action.create',
        value: {
          id: 'inspect-ticket',
          name: 'Inspect',
          conceptId: 'ticket',
          inputFactTypeIds: [],
          outputFactTypeIds: [],
        },
      },
      {
        type: 'action.update',
        actionId: 'inspect-ticket',
        patch: { name: 'Review ticket' },
      },
      { type: 'action.delete', actionId: 'inspect-ticket' },
      { type: 'businessState.delete', businessStateId: 'ticket-open' },
      { type: 'relation.delete', relationId: 'order-ticket' },
      { type: 'property.delete', propertyId: 'ticket-title' },
      { type: 'concept.delete', conceptId: 'ticket' },
      { type: 'domain.delete', domainId: 'support' },
    ];

    for (const [index, value] of commands.entries()) {
      const result = await service.execute(
        command(value, `operation-${index}`, index)
      );
      expect(result.ok, JSON.stringify(result)).toBe(true);
    }
    const loaded = (await store.readOntology('project-1'))!.data;
    expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(commands.length);
    expect(loaded.domains.map(({ id }) => id)).toEqual(['sales']);
    expect(await store.readAuthoringReceipts('project-1')).toHaveLength(
      commands.length
    );
  });

  it('rejects missing permission and invalid snapshots without writing a receipt or revision', async () => {
    const snapshotPath = path.join(root, 'ontology', 'project-1-ontology.json');
    const before = await fs.readFile(snapshotPath, 'utf8');
    const denied = command(
      { type: 'domain.update', domainId: 'sales', patch: { name: 'Denied' } },
      'denied'
    );
    denied.permissions = [];
    expect(await service.execute(denied)).toMatchObject({
      ok: false,
      issues: [{ code: 'PERMISSION_DENIED' }],
    });

    const invalid = await service.execute(
      command({ type: 'domain.delete', domainId: 'sales' }, 'invalid')
    );
    expect(invalid).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_REFERENCE' }),
      ]),
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(0);
    expect(await store.readAuthoringReceipts('project-1')).toEqual([]);
    expect(await fs.readFile(snapshotPath, 'utf8')).toBe(before);
  });

  it('accepts only one concurrent command for the same revision across store instances', async () => {
    const otherService = new CanonicalOntologyAuthoringService(
      new CanonicalOntologyStore(root)
    );
    const [left, right] = await Promise.all([
      service.execute(
        command(
          { type: 'domain.update', domainId: 'sales', patch: { name: 'Left' } },
          'left'
        )
      ),
      otherService.execute(
        command(
          {
            type: 'domain.update',
            domainId: 'sales',
            patch: { name: 'Right' },
          },
          'right'
        )
      ),
    ]);

    expect([left.ok, right.ok].filter(Boolean)).toHaveLength(1);
    expect([left, right].find((result) => !result.ok)).toMatchObject({
      ok: false,
      issues: [{ code: 'REVISION_CONFLICT' }],
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(1);
    expect(await store.readAuthoringReceipts('project-1')).toHaveLength(1);
  });

  it('returns the persisted receipt after restart and rejects operationId reuse', async () => {
    const original = command(
      { type: 'domain.update', domainId: 'sales', patch: { name: 'Revenue' } },
      'stable-operation'
    );
    const first = await service.execute(original);
    const restarted = new CanonicalOntologyAuthoringService(
      new CanonicalOntologyStore(root)
    );
    const retry = await restarted.execute(original);
    const conflict = await restarted.execute(
      command(
        {
          type: 'domain.update',
          domainId: 'sales',
          patch: { name: 'Different' },
        },
        'stable-operation'
      )
    );

    expect(first.ok).toBe(true);
    expect(retry).toEqual(first);
    expect(conflict).toMatchObject({
      ok: false,
      issues: [{ code: 'OPERATION_CONFLICT' }],
    });
    expect(
      getCanonicalOntologyAuthoringRevision(
        (await store.readOntology('project-1'))!.data
      )
    ).toBe(1);
    expect(await store.readAuthoringReceipts('project-1')).toHaveLength(1);
  });

  it('recovers an accepted snapshot when receipt append failed', async () => {
    const originalAppend = fs.appendFile.bind(fs);
    vi.spyOn(fs, 'appendFile').mockRejectedValueOnce(
      new Error('receipt unavailable')
    );
    const original = command(
      {
        type: 'domain.update',
        domainId: 'sales',
        patch: { name: 'Recovered' },
      },
      'recover-operation'
    );

    await expect(service.execute(original)).rejects.toThrow(
      'receipt unavailable'
    );
    vi.mocked(fs.appendFile).mockImplementation(originalAppend);
    const retry = await new CanonicalOntologyAuthoringService(
      new CanonicalOntologyStore(root)
    ).execute(original);

    expect(retry).toMatchObject({
      ok: true,
      receipt: { beforeRevision: 0, afterRevision: 1 },
    });
    expect((await store.readOntology('project-1'))!.data.domains[0]?.name).toBe(
      'Recovered'
    );
    expect(await store.readAuthoringReceipts('project-1')).toHaveLength(1);
  });

  it('ignores a truncated final receipt and rejects corruption before the tail', async () => {
    await service.execute(
      command(
        {
          type: 'domain.update',
          domainId: 'sales',
          patch: { name: 'Revenue' },
        },
        'receipt-1'
      )
    );
    const receiptPath = path.join(
      root,
      'ontology',
      'project-1-authoring.jsonl'
    );
    await fs.appendFile(receiptPath, '{"truncated":', 'utf8');
    expect(await store.readAuthoringReceipts('project-1')).toHaveLength(1);

    const content = await fs.readFile(receiptPath, 'utf8');
    await fs.writeFile(receiptPath, `{"bad":\n${content}`, 'utf8');
    await expect(store.readAuthoringReceipts('project-1')).rejects.toThrow(
      `${receiptPath}:1`
    );
  });

  it('rejects ontology identity and version mismatches without mutation', async () => {
    const wrongId = command(
      { type: 'domain.update', domainId: 'sales', patch: { name: 'Wrong' } },
      'wrong-id'
    );
    wrongId.ontologyId = 'other';
    const wrongVersion = command(
      { type: 'domain.update', domainId: 'sales', patch: { name: 'Wrong' } },
      'wrong-version'
    );
    wrongVersion.ontologyVersion = '2.0';

    expect(await service.execute(wrongId)).toMatchObject({
      ok: false,
      issues: [{ code: 'ONTOLOGY_ID_MISMATCH' }],
    });
    expect(await service.execute(wrongVersion)).toMatchObject({
      ok: false,
      issues: [{ code: 'ONTOLOGY_VERSION_MISMATCH' }],
    });
    expect((await store.readOntology('project-1'))!.data.domains[0]?.name).toBe(
      'Sales'
    );
  });
});
