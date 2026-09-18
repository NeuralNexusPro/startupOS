import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  type CanonicalActionValidationInput,
  type CanonicalOntology,
  validateCanonicalAction,
  validateCanonicalOntology,
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
    concepts: [
      { id: 'order', domainId: 'sales', name: 'Order', type: 'aggregate', attributes: {}, propertyIds: ['order-total'], createdAt: instant, updatedAt: instant },
      { id: 'customer', domainId: 'sales', name: 'Customer', type: 'entity', attributes: {}, propertyIds: ['customer-name'], createdAt: instant, updatedAt: instant },
    ],
    instances: [{ id: 'order-1', conceptId: 'order', data: {}, stateId: 'draft', createdAt: instant, updatedAt: instant }],
    properties: [
      { id: 'order-total', conceptId: 'order', name: 'Total', valueType: 'number', required: true },
      { id: 'customer-name', conceptId: 'customer', name: 'Name', valueType: 'string', required: true },
      { id: 'order-customer', conceptId: 'order', name: 'Customer', valueType: 'reference', required: true, referenceConceptId: 'customer' },
    ],
    relations: [{ id: 'order-owner', name: 'Owner', sourceConceptId: 'order', targetConceptId: 'customer', cardinality: 'many-to-one' }],
    businessStates: [
      { id: 'draft', conceptId: 'order', name: 'Draft', initial: true },
      { id: 'submitted', conceptId: 'order', name: 'Submitted', terminal: true },
      { id: 'active-customer', conceptId: 'customer', name: 'Active' },
    ],
    transitions: [{ id: 'submit-transition', conceptId: 'order', name: 'Submit', fromStateId: 'draft', toStateId: 'submitted', actionId: 'submit-order', ruleIds: ['positive-total'] }],
    factTypes: [
      { id: 'order-input', conceptId: 'order', name: 'Order input', propertyIds: ['order-total'] },
      { id: 'order-submitted', conceptId: 'order', name: 'Order submitted', propertyIds: ['order-total'] },
    ],
    rules: [{ id: 'positive-total', name: 'Positive total', kind: 'precondition', expression: { gt: 0 }, severity: 'error' }],
    actions: [{
      id: 'submit-order',
      name: 'Submit order',
      conceptId: 'order',
      inputFactTypeIds: ['order-input'],
      outputFactTypeIds: ['order-submitted'],
      fromStateIds: ['draft'],
      toStateId: 'submitted',
      ruleIds: ['positive-total'],
      permissions: ['order.read', 'order.submit'],
    }],
    events: [{ id: 'order-submitted-event', name: 'Order submitted', conceptId: 'order', factTypeId: 'order-submitted', actionId: 'submit-order' }],
    projections: [{ id: 'order-summary', name: 'Order summary', sourceFactTypeIds: ['order-submitted'], targetConceptId: 'order', propertyMappings: { total: 'order-total' } }],
    createdAt: instant,
    updatedAt: instant,
  };
}

function actionInput(overrides: Partial<Omit<CanonicalActionValidationInput, 'ontology'>> = {}): CanonicalActionValidationInput {
  return {
    ontology: ontology(),
    ontologyId: 'orders',
    ontologyVersion: '3',
    actionId: 'submit-order',
    conceptId: 'order',
    currentStateId: 'draft',
    permissions: ['order.read', 'order.submit'],
    ...overrides,
  };
}

describe('canonical ontology validator', () => {
  it('accepts a complete ontology and action request without modifying either input', () => {
    const model = ontology();
    const input = { ...actionInput(), ontology: model };
    const before = JSON.stringify(input);

    expect(validateCanonicalOntology(model)).toEqual({ valid: true, issues: [] });
    const first = validateCanonicalAction(input);
    expect(first).toEqual({ valid: true, issues: [] });
    expect(validateCanonicalAction(input)).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('reports duplicate ids at the second item and missing references at their fields', () => {
    const model = ontology();
    model.concepts.push({ ...model.concepts[0]! });
    model.concepts[0]!.domainId = 'missing-domain';
    model.properties[2]!.referenceConceptId = 'missing-concept';
    model.relations[0]!.targetConceptId = 'missing-concept';
    model.factTypes[0]!.propertyIds = ['missing-property'];
    model.transitions[0]!.actionId = 'missing-action';
    model.transitions[0]!.ruleIds = ['missing-rule'];
    model.projections[0]!.sourceFactTypeIds = ['missing-fact-type'];
    model.instances[0]!.stateId = 'missing-state';

    const issues = validateCanonicalOntology(model).issues;
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_ID', path: 'concepts[2].id' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'concepts[0].domainId' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'properties[2].referenceConceptId' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'relations[0].targetConceptId' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'factTypes[0].propertyIds[0]' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'transitions[0].actionId' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'transitions[0].ruleIds[0]' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'projections[0].sourceFactTypeIds[0]' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'instances[0].stateId' }),
    ]));
  });

  it('rejects states and other typed references bound to the wrong concept', () => {
    const model = ontology();
    model.actions[0]!.fromStateIds = ['active-customer'];
    model.transitions[0]!.toStateId = 'active-customer';
    model.factTypes[0]!.propertyIds = ['customer-name'];

    expect(validateCanonicalOntology(model).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_STATE_BINDING', path: 'actions[0].fromStateIds[0]' }),
      expect.objectContaining({ code: 'INVALID_STATE_BINDING', path: 'transitions[0].toStateId' }),
      expect.objectContaining({ code: 'INVALID_CONCEPT_BINDING', path: 'factTypes[0].propertyIds[0]' }),
    ]));
  });

  it('allows an action to consume a fact type from another concept', () => {
    const model = ontology();
    model.factTypes.push({ id: 'customer-profile', conceptId: 'customer', name: 'Customer profile', propertyIds: ['customer-name'] });
    model.actions[0]!.inputFactTypeIds = ['customer-profile'];
    expect(validateCanonicalOntology(model)).toEqual({ valid: true, issues: [] });
  });

  it.each([
    [{ ontologyId: 'other' }, 'ONTOLOGY_ID_MISMATCH'],
    [{ ontologyVersion: '2' }, 'ONTOLOGY_VERSION_MISMATCH'],
    [{ actionId: 'missing' }, 'ACTION_NOT_FOUND'],
    [{ conceptId: 'customer' }, 'ACTION_CONCEPT_MISMATCH'],
    [{ currentStateId: undefined }, 'STATE_REQUIRED'],
    [{ currentStateId: 'missing' }, 'MISSING_REFERENCE'],
    [{ currentStateId: 'active-customer' }, 'INVALID_STATE_BINDING'],
    [{ currentStateId: 'submitted' }, 'STATE_NOT_ALLOWED'],
  ] as const)('rejects %o with %s', (overrides, code) => {
    expect(validateCanonicalAction(actionInput(overrides)).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it('reports every missing permission and short-circuits on an invalid ontology', () => {
    const denied = validateCanonicalAction(actionInput({ permissions: [] }));
    expect(denied.issues.map(({ code }) => code)).toEqual(['PERMISSION_DENIED', 'PERMISSION_DENIED']);

    const input = actionInput({ actionId: 'missing' });
    input.ontology.concepts[0]!.domainId = 'missing-domain';
    expect(validateCanonicalAction(input).issues).toEqual([
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'concepts[0].domainId' }),
    ]);
  });
});
