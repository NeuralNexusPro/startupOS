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
      command(
        {
          type: 'concept.update',
          conceptId: 'order',
          patch: { semanticKind: 'person' as 'activity' },
        },
        'invalid'
      )
    );
    expect(invalid).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_SEMANTIC_KIND' }),
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
          {
            type: 'concept.update',
            conceptId: 'order',
            patch: { semanticKind: 'role' },
          },
          'left'
        )
      ),
      otherService.execute(
        command(
          {
            type: 'concept.update',
            conceptId: 'order',
            patch: { semanticKind: 'activity' },
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
    expect(['role', 'activity']).toContain(
      (await store.readOntology('project-1'))!.data.concepts[0]?.semanticKind
    );
  });

  it('returns the persisted receipt after restart and rejects operationId reuse', async () => {
    const original = command(
      {
        type: 'concept.update',
        conceptId: 'order',
        patch: {
          semanticKind: 'organization',
          classificationSource: {
            sourceRef: { sourceType: 'interview', sourceId: 'interview-1' },
            classifiedBy: 'user',
            userConfirmed: true,
          },
        },
      },
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
            type: 'concept.update',
            conceptId: 'order',
            patch: { semanticKind: 'standard' },
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
    const loaded = (await store.readOntology('project-1'))!.data.concepts[0]!;
    expect(loaded.semanticKind).toBe('organization');
    expect(loaded.classificationSource?.userConfirmed).toBe(true);
  });

  it('recovers an accepted snapshot when receipt append failed', async () => {
    const originalAppend = fs.appendFile.bind(fs);
    vi.spyOn(fs, 'appendFile').mockRejectedValueOnce(
      new Error('receipt unavailable')
    );
    const original = command(
      {
        type: 'concept.update',
        conceptId: 'order',
        patch: { semanticKind: 'document' },
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
    expect((await store.readOntology('project-1'))!.data.concepts[0]?.semanticKind).toBe('document');
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

  it('authors fact types, rules, transitions and relation constraints in one atomic batch', async () => {
    const result = await service.execute(command({
      type: 'batch',
      // Definitions may refer to another definition that appears later in this batch.
      commands: [
        {
          type: 'relation.create',
          value: {
            id: 'order-approval', name: 'has approval', sourceConceptId: 'order',
            targetConceptId: 'order', cardinality: 'one-to-one', ruleIds: ['approved-before-submit'],
          },
        },
        {
          type: 'transition.create',
          value: {
            id: 'submit-transition', conceptId: 'order', name: 'Submit', fromStateId: 'draft',
            toStateId: 'draft', actionId: 'submit-order', ruleIds: ['approved-before-submit'],
          },
        },
        {
          type: 'action.update', actionId: 'submit-order',
          patch: { inputFactTypeIds: ['approval-fact'], ruleIds: ['approved-before-submit'] },
        },
        {
          type: 'rule.create',
          value: {
            id: 'approved-before-submit', name: 'Approval required', kind: 'precondition',
            expression: { factType: 'approval-fact' }, severity: 'error',
          },
        },
        {
          type: 'factType.create',
          value: { id: 'approval-fact', conceptId: 'order', name: 'Approval', propertyIds: ['order-number'] },
        },
      ],
    }, 'behavior-batch'));

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.receipt).toMatchObject({ beforeRevision: 0, afterRevision: 1, commandType: 'batch' });
    expect(result.ontology.factTypes.map(({ id }) => id)).toContain('approval-fact');
    expect(result.ontology.rules.map(({ id }) => id)).toContain('approved-before-submit');
    expect(result.ontology.transitions.map(({ id }) => id)).toContain('submit-transition');
    expect(result.ontology.relations.find(({ id }) => id === 'order-approval')?.ruleIds).toEqual(['approved-before-submit']);
    expect(await store.readAuthoringReceipts('project-1')).toHaveLength(1);

    const retry = await new CanonicalOntologyAuthoringService(
      new CanonicalOntologyStore(root)
    ).execute(command({
      type: 'batch',
      commands: [
        { type: 'rule.create', value: { id: 'approved-before-submit', name: 'Approval required', kind: 'precondition', expression: { factType: 'approval-fact' }, severity: 'error' } },
      ],
    }, 'behavior-batch'));
    expect(retry).toMatchObject({ ok: false, issues: [{ code: 'OPERATION_CONFLICT' }] });
  });

  it('supports create, update and delete for each behavior contract definition', async () => {
    const commands: CanonicalOntologyAuthoringCommand[] = [
      command({ type: 'factType.create', value: { id: 'draft-fact', conceptId: 'order', name: 'Draft fact', propertyIds: [] } }, 'fact-create', 0),
      command({ type: 'factType.update', factTypeId: 'draft-fact', patch: { name: 'Updated fact' } }, 'fact-update', 1),
      command({ type: 'factType.delete', factTypeId: 'draft-fact' }, 'fact-delete', 2),
      command({ type: 'rule.create', value: { id: 'draft-rule', name: 'Draft rule', kind: 'invariant', expression: true, severity: 'warning' } }, 'rule-create', 3),
      command({ type: 'rule.update', ruleId: 'draft-rule', patch: { severity: 'info' } }, 'rule-update', 4),
      command({ type: 'rule.delete', ruleId: 'draft-rule' }, 'rule-delete', 5),
      command({ type: 'transition.create', value: { id: 'draft-transition', conceptId: 'order', name: 'Draft transition', fromStateId: 'draft', toStateId: 'draft' } }, 'transition-create', 6),
      command({ type: 'transition.update', transitionId: 'draft-transition', patch: { name: 'Updated transition' } }, 'transition-update', 7),
      command({ type: 'transition.delete', transitionId: 'draft-transition' }, 'transition-delete', 8),
    ];
    for (const entry of commands) {
      expect(await service.execute(entry), JSON.stringify(entry)).toMatchObject({ ok: true });
    }
    const loaded = (await store.readOntology('project-1'))!.data;
    expect(loaded.factTypes.map(({ id }) => id)).not.toContain('draft-fact');
    expect(loaded.rules.map(({ id }) => id)).not.toContain('draft-rule');
    expect(loaded.transitions.map(({ id }) => id)).not.toContain('draft-transition');
    expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(9);
  });

  it('rejects an invalid behavior batch without changing the snapshot or revision', async () => {
    const before = (await store.readOntology('project-1'))!.data;
    const invalid = await service.execute(command({
      type: 'batch',
      commands: [
        {
          type: 'transition.create',
          value: { id: 'invalid-transition', conceptId: 'order', name: 'Invalid', fromStateId: 'draft', toStateId: 'missing-state' },
        },
        {
          type: 'rule.create',
          value: { id: 'candidate-rule', name: 'Candidate', kind: 'invariant', expression: true, severity: 'error' },
        },
      ],
    }, 'invalid-behavior-batch'));
    expect(invalid).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: 'MISSING_REFERENCE' })]) });
    const after = (await store.readOntology('project-1'))!.data;
    expect(after.rules).toEqual(before.rules);
    expect(after.transitions).toEqual(before.transitions);
    expect(getCanonicalOntologyAuthoringRevision(after)).toBe(0);
    expect(await store.readAuthoringReceipts('project-1')).toEqual([]);
  });

  it('rejects a batch above 100 commands before mutation', async () => {
    const result = await service.execute(command({
      type: 'batch',
      commands: Array.from({ length: 101 }, (_, index) => ({
        type: 'rule.create' as const,
        value: { id: `rule-${index}`, name: `Rule ${index}`, kind: 'invariant' as const, expression: true, severity: 'error' as const },
      })),
    }, 'oversized-batch'));
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'AUTHORING_BATCH_TOO_LARGE' }] });
    expect(getCanonicalOntologyAuthoringRevision((await store.readOntology('project-1'))!.data)).toBe(0);
  });
});
