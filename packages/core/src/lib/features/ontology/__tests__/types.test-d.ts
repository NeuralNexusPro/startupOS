import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  type CanonicalOntology,
  type CanonicalSkillContract,
} from '../index';

const now = new Date();

const ontology: CanonicalOntology = {
  id: 'ontology-orders',
  projectId: 'project-shop',
  name: 'Orders',
  schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  version: '3',
  domains: [{ id: 'commerce', name: 'Commerce', description: '', createdAt: now, updatedAt: now }],
  concepts: [{
    id: 'order',
    domainId: 'commerce',
    name: 'Order',
    type: 'aggregate',
    attributes: { owner: 'customer' },
    createdAt: now,
    updatedAt: now,
  }],
  instances: [],
  properties: [],
  relations: [],
  businessStates: [{ id: 'draft', conceptId: 'order', name: 'Draft', initial: true }],
  transitions: [],
  factTypes: [{ id: 'order-created', conceptId: 'order', name: 'Order created', propertyIds: [] }],
  rules: [],
  actions: [],
  events: [],
  projections: [],
  createdAt: now,
  updatedAt: now,
};

const contract: CanonicalSkillContract = {
  skillId: 'create-order',
  ontology: { ontologyId: ontology.id, ontologyVersion: ontology.version },
  inputs: [],
  outputs: [{
    required: true,
    factType: {
      ontologyId: ontology.id,
      ontologyVersion: ontology.version,
      conceptId: 'order',
      factTypeId: 'order-created',
    },
  }],
  actions: [{
    actionId: 'submit-order',
    concept: {
      ontologyId: ontology.id,
      ontologyVersion: ontology.version,
      conceptId: 'order',
    },
  }],
  permissions: ['order.submit'],
};

void contract;

const invalidConceptReference: CanonicalSkillContract = {
  skillId: 'invalid',
  ontology: { ontologyId: ontology.id, ontologyVersion: ontology.version },
  inputs: [],
  outputs: [],
  actions: [{
    actionId: 'submit-order',
    // @ts-expect-error stable concept references require conceptId
    concept: { ontologyId: ontology.id, ontologyVersion: ontology.version },
  }],
  permissions: [],
};

void invalidConceptReference;
