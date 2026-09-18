import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  type CanonicalAgentContract,
  type CanonicalContractFlow,
  type CanonicalOntology,
  type CanonicalSkillContract,
  validateCanonicalContract,
  validateCanonicalContractFlow,
} from '../index';

const instant = new Date('2026-09-18T08:00:00.000Z');
const rawFact = { ontologyId: 'orders', ontologyVersion: '3', conceptId: 'order', factTypeId: 'order-raw' };
const readyFact = { ontologyId: 'orders', ontologyVersion: '3', conceptId: 'order', factTypeId: 'order-ready' };

function ontology(): CanonicalOntology {
  return {
    id: 'orders',
    projectId: 'project-1',
    name: 'Orders',
    schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
    version: '3',
    domains: [{ id: 'sales', name: 'Sales', description: '', createdAt: instant, updatedAt: instant }],
    concepts: [
      { id: 'order', domainId: 'sales', name: 'Order', type: 'aggregate', attributes: {}, createdAt: instant, updatedAt: instant },
      { id: 'customer', domainId: 'sales', name: 'Customer', type: 'entity', attributes: {}, createdAt: instant, updatedAt: instant },
    ],
    instances: [],
    properties: [],
    relations: [],
    businessStates: [],
    transitions: [],
    factTypes: [
      { id: 'order-raw', conceptId: 'order', name: 'Raw order', propertyIds: [] },
      { id: 'order-ready', conceptId: 'order', name: 'Ready order', propertyIds: [] },
      { id: 'customer-profile', conceptId: 'customer', name: 'Customer profile', propertyIds: [] },
    ],
    rules: [],
    actions: [{
      id: 'prepare-order',
      name: 'Prepare order',
      conceptId: 'order',
      inputFactTypeIds: ['order-raw'],
      outputFactTypeIds: ['order-ready'],
      permissions: ['order.prepare'],
    }],
    events: [],
    projections: [],
    createdAt: instant,
    updatedAt: instant,
  };
}

function agent(): CanonicalAgentContract {
  return {
    agentId: 'preparer',
    ontology: { ontologyId: 'orders', ontologyVersion: '3' },
    inputs: [{ factType: rawFact, required: true }],
    outputs: [{ factType: readyFact, required: true }],
    actions: [{
      actionId: 'prepare-order',
      concept: { ontologyId: 'orders', ontologyVersion: '3', conceptId: 'order' },
    }],
    permissions: ['order.prepare'],
  };
}

function skill(): CanonicalSkillContract {
  return {
    skillId: 'publisher',
    ontology: { ontologyId: 'orders', ontologyVersion: '3' },
    inputs: [{ factType: readyFact, required: true }],
    outputs: [],
    actions: [],
    permissions: [],
  };
}

function flow(): CanonicalContractFlow {
  return {
    nodes: [
      { id: 'prepare', kind: 'agent', contract: agent() },
      { id: 'publish', kind: 'skill', contract: skill() },
    ],
    edges: [{ fromNodeId: 'prepare', toNodeId: 'publish', factType: readyFact }],
    externalInputs: [rawFact],
  };
}

describe('canonical contract validator', () => {
  it('accepts Agent and Skill contracts', () => {
    expect(validateCanonicalContract(ontology(), agent())).toEqual({ valid: true, issues: [] });
    expect(validateCanonicalContract(ontology(), skill())).toEqual({ valid: true, issues: [] });
  });

  it('rejects stale, missing, wrongly bound and duplicate facts', () => {
    const contract = agent();
    contract.ontology.ontologyVersion = '2';
    contract.inputs.push({
      factType: { ...rawFact, conceptId: 'customer' },
      required: false,
    });
    contract.outputs.push({ factType: readyFact, required: false });
    contract.outputs.push({
      factType: { ...readyFact, factTypeId: 'missing' },
      required: false,
    });

    expect(validateCanonicalContract(ontology(), contract).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ONTOLOGY_VERSION_MISMATCH', path: 'ontology.ontologyVersion' }),
      expect.objectContaining({ code: 'INVALID_CONCEPT_BINDING', path: 'inputs[1].factType.conceptId' }),
      expect.objectContaining({ code: 'DUPLICATE_REFERENCE', path: 'outputs[1].factType' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'outputs[2].factType.factTypeId' }),
    ]));
  });

  it('rejects unknown or wrongly bound actions and missing permissions', () => {
    const contract = agent();
    contract.permissions = [];
    contract.actions.push({
      actionId: 'prepare-order',
      concept: { ontologyId: 'orders', ontologyVersion: '3', conceptId: 'customer' },
    });
    contract.actions.push({
      actionId: 'missing',
      concept: { ontologyId: 'orders', ontologyVersion: '3', conceptId: 'order' },
    });

    expect(validateCanonicalContract(ontology(), contract).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PERMISSION_DENIED', path: 'permissions' }),
      expect.objectContaining({ code: 'ACTION_CONCEPT_MISMATCH', path: 'actions[1].concept.conceptId' }),
      expect.objectContaining({ code: 'ACTION_NOT_FOUND', path: 'actions[2].actionId' }),
    ]));
  });

  it('accepts a connected flow and does not modify its inputs', () => {
    const model = ontology();
    const value = flow();
    const before = JSON.stringify({ model, value });
    const first = validateCanonicalContractFlow(model, value);

    expect(first).toEqual({ valid: true, issues: [] });
    expect(validateCanonicalContractFlow(model, value)).toEqual(first);
    expect(JSON.stringify({ model, value })).toBe(before);
  });

  it('rejects duplicate nodes and unknown edge endpoints', () => {
    const value = flow();
    value.nodes.push({ id: 'prepare', kind: 'skill', contract: skill() });
    value.edges.push({ fromNodeId: 'missing-from', toNodeId: 'missing-to', factType: readyFact });

    expect(validateCanonicalContractFlow(ontology(), value).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_ID', path: 'nodes[2].id' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'edges[1].fromNodeId' }),
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: 'edges[1].toNodeId' }),
    ]));
  });

  it('requires each edge fact at both producer and consumer', () => {
    const value = flow();
    value.edges[0]!.factType = rawFact;

    expect(validateCanonicalContractFlow(ontology(), value).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'OUTPUT_NOT_PRODUCED', path: 'edges[0].factType' }),
      expect.objectContaining({ code: 'INPUT_NOT_CONSUMED', path: 'edges[0].factType' }),
    ]));
  });

  it('requires sources only for required inputs', () => {
    const value = flow();
    value.externalInputs = [];
    value.nodes[1]!.contract.inputs.push({
      factType: { ontologyId: 'orders', ontologyVersion: '3', conceptId: 'customer', factTypeId: 'customer-profile' },
      required: false,
    });

    expect(validateCanonicalContractFlow(ontology(), value).issues).toEqual([
      expect.objectContaining({ code: 'REQUIRED_INPUT_UNBOUND', path: 'nodes[0].contract.inputs[0]' }),
    ]);
  });

  it('keeps NUL-containing reference fields distinct', () => {
    const model = ontology();
    model.concepts.push({
      id: 'order\0part',
      domainId: 'sales',
      name: 'Order part',
      type: 'entity',
      attributes: {},
      createdAt: instant,
      updatedAt: instant,
    });
    model.factTypes.push(
      { id: 'part\0tail', conceptId: 'order', name: 'Part tail', propertyIds: [] },
      { id: 'tail', conceptId: 'order\0part', name: 'Tail', propertyIds: [] },
    );
    const first = { ontologyId: 'orders', ontologyVersion: '3', conceptId: 'order', factTypeId: 'part\0tail' };
    const second = { ontologyId: 'orders', ontologyVersion: '3', conceptId: 'order\0part', factTypeId: 'tail' };
    const contract = skill();
    contract.inputs = [
      { factType: first, required: true },
      { factType: second, required: false },
    ];
    expect(validateCanonicalContract(model, contract).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_REFERENCE' }),
    ]));

    const value: CanonicalContractFlow = {
      nodes: [
        { id: 'source', kind: 'skill', contract: { ...skill(), inputs: [], outputs: [{ factType: second, required: true }] } },
        { id: 'target', kind: 'skill', contract },
      ],
      edges: [{ fromNodeId: 'source', toNodeId: 'target', factType: first }],
      externalInputs: [second],
    };
    expect(validateCanonicalContractFlow(model, value).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'OUTPUT_NOT_PRODUCED', path: 'edges[0].factType' }),
      expect.objectContaining({ code: 'REQUIRED_INPUT_UNBOUND', path: 'nodes[1].contract.inputs[0]' }),
    ]));
  });
});
