import { describe, expect, it } from 'vitest';

import type { CanonicalOntology } from '@originos/core/lib/features/ontology/types';
import {
  isCanonicalInterviewComplete,
  isInterviewBehaviorModelingRequired,
} from '../interview-completion';

const now = new Date('2026-10-15T00:00:00.000Z');

function createCompleteOntology(): CanonicalOntology {
  return {
    id: 'ontology-test',
    projectId: 'project-test',
    name: '供应商管理',
    schemaVersion: '1.0.0',
    version: '1.0.0',
    domains: [{ id: 'domain-1', name: '供应商管理', description: '', createdAt: now, updatedAt: now }],
    concepts: [
      {
        id: 'concept-supplier',
        domainId: 'domain-1',
        name: '供应商',
        type: 'entity',
        semanticKind: 'object',
        attributes: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'concept-review-form',
        domainId: 'domain-1',
        name: '审核单',
        type: 'entity',
        semanticKind: 'document',
        attributes: {},
        propertyIds: ['property-review-result'],
        createdAt: now,
        updatedAt: now,
      },
    ],
    instances: [],
    properties: [
      {
        id: 'property-review-result',
        conceptId: 'concept-review-form',
        name: '审核结果',
        valueType: 'string',
        required: true,
      },
    ],
    relations: [
      {
        id: 'relation-review',
        name: '接受审核',
        sourceConceptId: 'concept-supplier',
        targetConceptId: 'concept-review-form',
        cardinality: 'one-to-many',
      },
    ],
    businessStates: [],
    transitions: [],
    factTypes: [
      {
        id: 'fact-supplier',
        conceptId: 'concept-supplier',
        name: '供应商资料',
        propertyIds: [],
      },
      {
        id: 'fact-review',
        conceptId: 'concept-review-form',
        name: '审核结论',
        propertyIds: ['property-review-result'],
      },
    ],
    rules: [
      {
        id: 'rule-review',
        name: '审核通过后准入',
        kind: 'precondition',
        expression: { field: '审核结果', equals: '通过' },
        severity: 'error',
      },
    ],
    actions: [
      {
        id: 'action-review',
        name: '确认审核',
        conceptId: 'concept-review-form',
        inputFactTypeIds: ['fact-review'],
        outputFactTypeIds: ['fact-review'],
        ruleIds: ['rule-review'],
      },
    ],
    events: [],
    projections: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('isCanonicalInterviewComplete', () => {
  it('only accepts a canonical ontology with every structured section populated', () => {
    expect(isCanonicalInterviewComplete(createCompleteOntology())).toBe(true);
  });

  it.each(['concepts', 'relations', 'factTypes', 'actions', 'rules'] as const)(
    'rejects a canonical ontology with no %s',
    (section) => {
      const ontology = createCompleteOntology();
      ontology[section] = [];
      expect(isCanonicalInterviewComplete(ontology)).toBe(false);
    }
  );

  it('rejects document concepts without a complete canonical field contract', () => {
    const withoutFields = createCompleteOntology();
    withoutFields.concepts[1]!.propertyIds = [];
    expect(isCanonicalInterviewComplete(withoutFields)).toBe(false);

    const missingField = createCompleteOntology();
    missingField.concepts[1]!.propertyIds = ['property-missing'];
    expect(isCanonicalInterviewComplete(missingField)).toBe(false);

    const fieldFromAnotherConcept = createCompleteOntology();
    fieldFromAnotherConcept.properties[0]!.conceptId = 'concept-supplier';
    expect(isCanonicalInterviewComplete(fieldFromAnotherConcept)).toBe(false);
  });

  it('rejects partial FactType coverage even when the ontology has FactTypes', () => {
    const ontology = createCompleteOntology();
    ontology.factTypes = ontology.factTypes.filter(
      (factType) => factType.conceptId !== 'concept-supplier'
    );

    expect(ontology.factTypes.length).toBeGreaterThan(0);
    expect(isCanonicalInterviewComplete(ontology)).toBe(false);
    expect(isInterviewBehaviorModelingRequired(ontology)).toBe(true);
  });
});

describe('isInterviewBehaviorModelingRequired', () => {
  it('requires modeling only between structural and executable completion', () => {
    const ontology = createCompleteOntology();

    expect(isInterviewBehaviorModelingRequired({
      ...ontology,
      factTypes: [],
      actions: [],
      rules: [],
    })).toBe(true);
    expect(isInterviewBehaviorModelingRequired(ontology)).toBe(false);
    expect(isInterviewBehaviorModelingRequired(undefined)).toBe(false);
  });
});
