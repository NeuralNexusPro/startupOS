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
});
