import { describe, expect, it } from 'vitest';

import { parseCanonicalOntologyAuthoringCommand } from '../authoring-transport';

describe('parseCanonicalOntologyAuthoringCommand', () => {
  it('restores Date fields in a JSON transport command', () => {
    const result = parseCanonicalOntologyAuthoringCommand({
      projectId: 'project-1', ontologyId: 'ontology-project-1', ontologyVersion: '1.0.0',
      expectedRevision: 0, operationId: 'operation-1', permissions: ['ontology:author'],
      type: 'concept.create',
      value: {
        id: 'concept-1', domainId: 'domain-1', name: '需求', type: 'entity', attributes: {},
        semanticKind: 'activity',
        classificationSource: {
          sourceRef: { sourceType: 'interview', sourceId: 'interview-1' },
          classifiedBy: 'user',
          userConfirmed: true,
        },
        createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.command.type === 'concept.create') {
      expect(result.command.value.createdAt).toBeInstanceOf(Date);
      expect(result.command.value.semanticKind).toBe('activity');
      expect(result.command.value.classificationSource).toEqual({
        sourceRef: { sourceType: 'interview', sourceId: 'interview-1' },
        classifiedBy: 'user',
        userConfirmed: true,
      });
    }
  });

  it('returns field-addressed issues for unsupported commands', () => {
    const result = parseCanonicalOntologyAuthoringCommand({
      projectId: 'project-1', type: 'instance.create', value: {},
    });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_AUTHORING_COMMAND', path: 'type' }),
      ]),
    });
  });

  it('rejects invalid semantic kinds before authoring', () => {
    const result = parseCanonicalOntologyAuthoringCommand({
      projectId: 'project-1', ontologyId: 'ontology-project-1', ontologyVersion: '1.0.0',
      expectedRevision: 0, operationId: 'operation-1', permissions: ['ontology:author'],
      type: 'concept.update',
      conceptId: 'concept-1',
      patch: { semanticKind: 'person' },
    });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_AUTHORING_COMMAND', path: 'patch.semanticKind' }),
      ]),
    });
  });

  it('parses behavior contract definitions and rejects an oversized atomic batch', () => {
    const valid = parseCanonicalOntologyAuthoringCommand({
      projectId: 'project-1', ontologyId: 'ontology-project-1', ontologyVersion: '1.0.0',
      expectedRevision: 0, operationId: 'behavior-batch', permissions: ['ontology:author'],
      type: 'batch',
      commands: [
        {
          type: 'rule.create',
          value: {
            id: 'approved-before-ship', name: 'Approved before shipment',
            kind: 'precondition', expression: { all: ['approved'] }, severity: 'error',
          },
        },
        {
          type: 'factType.create',
          value: { id: 'approval-fact', conceptId: 'order', name: 'Approval', propertyIds: [] },
        },
        {
          type: 'relation.create',
          value: {
            id: 'order-approval', name: 'has approval', sourceConceptId: 'order',
            targetConceptId: 'approval', cardinality: 'one-to-one', ruleIds: ['approved-before-ship'],
          },
        },
      ],
    });
    expect(valid.ok).toBe(true);

    const oversized = parseCanonicalOntologyAuthoringCommand({
      projectId: 'project-1', ontologyId: 'ontology-project-1', ontologyVersion: '1.0.0',
      expectedRevision: 0, operationId: 'too-many', permissions: ['ontology:author'],
      type: 'batch',
      commands: Array.from({ length: 101 }, (_, index) => ({
        type: 'rule.create',
        value: { id: `rule-${index}`, name: `Rule ${index}`, kind: 'invariant', expression: true, severity: 'error' },
      })),
    });
    expect(oversized).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_AUTHORING_COMMAND', path: 'commands' }),
      ]),
    });
  });
});
