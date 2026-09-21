import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  type CanonicalCheckpointReference,
  type CanonicalContextProjectionRecord,
  type CanonicalContextSnapshot,
  type CanonicalExecutionContextReference,
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

const context: CanonicalExecutionContextReference = {
  contextInstanceId: 'context-1',
  projectId: ontology.projectId,
  taskId: 'task-1',
  sessionId: 'session-1',
  branchId: 'branch-1',
  runId: 'run-1',
  workItemId: 'work-item-1',
  attemptId: 'attempt-1',
  contractId: contract.skillId,
  contractHash: 'sha256:contract',
  ontology: { ontologyId: ontology.id, ontologyVersion: ontology.version },
};

const checkpoint: CanonicalCheckpointReference = {
  contextInstanceId: context.contextInstanceId,
  attemptId: context.attemptId,
  cursor: 'event:42',
  revision: 3,
  leaseEpoch: 2,
  createdAt: now,
};

const snapshot: CanonicalContextSnapshot = {
  context,
  objectBindings: { order: 'order-42' },
  factRefs: [{
    ontologyId: ontology.id,
    ontologyVersion: ontology.version,
    conceptId: 'order',
    factTypeId: 'order-created',
    factId: 'fact-1',
    factVersion: '1',
  }],
  decisionRefs: [{
    ontologyId: ontology.id,
    ontologyVersion: ontology.version,
    decisionId: 'decision-1',
    decisionVersion: '1',
  }],
  sourceRefs: [{ sourceType: 'runtime', sourceId: 'run-1' }],
  allowedActionIds: ['submit-order'],
  revision: 3,
  checkpoint,
};

const projection: CanonicalContextProjectionRecord = {
  id: 'projection-1',
  kind: 'outcome',
  context,
  revision: snapshot.revision,
  factRefs: snapshot.factRefs,
  decisionRefs: snapshot.decisionRefs,
  sourceRefs: snapshot.sourceRefs,
  payload: { status: 'accepted' },
  createdAt: now,
};

void projection;

// @ts-expect-error execution context requires an attempt identity
const missingAttempt: CanonicalExecutionContextReference = {
  contextInstanceId: 'context-2',
  projectId: ontology.projectId,
  taskId: 'task-1',
  sessionId: 'session-1',
  branchId: 'branch-1',
  runId: 'run-1',
  workItemId: 'work-item-1',
  contractId: contract.skillId,
  contractHash: 'sha256:contract',
  ontology: { ontologyId: ontology.id, ontologyVersion: ontology.version },
};

void missingAttempt;

// @ts-expect-error execution context requires the published contract hash
const missingContractHash: CanonicalExecutionContextReference = {
  contextInstanceId: 'context-3',
  projectId: ontology.projectId,
  taskId: 'task-1',
  sessionId: 'session-1',
  branchId: 'branch-1',
  runId: 'run-1',
  workItemId: 'work-item-1',
  attemptId: 'attempt-1',
  contractId: contract.skillId,
  ontology: { ontologyId: ontology.id, ontologyVersion: ontology.version },
};

void missingContractHash;
