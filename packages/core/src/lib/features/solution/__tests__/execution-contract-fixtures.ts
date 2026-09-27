import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  type CanonicalAgentContract,
  type CanonicalOntology,
  type CanonicalSkillContract,
} from '../../ontology';
import {
  SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION,
  type SolutionExecutionContractBody,
} from '../index';

export const instant = new Date('2026-09-20T08:00:00.000Z');

export const rawFact = {
  ontologyId: 'orders',
  ontologyVersion: '3',
  conceptId: 'order',
  factTypeId: 'order-raw',
};
export const readyFact = {
  ontologyId: 'orders',
  ontologyVersion: '3',
  conceptId: 'order',
  factTypeId: 'order-ready',
};

export function ontology(): CanonicalOntology {
  return {
    id: 'orders',
    projectId: 'project-1',
    name: 'Orders',
    schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
    version: '3',
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
    ],
    instances: [],
    properties: [],
    relations: [],
    businessStates: [],
    transitions: [],
    factTypes: [
      { id: 'order-raw', conceptId: 'order', name: 'Raw order', propertyIds: [] },
      { id: 'order-ready', conceptId: 'order', name: 'Ready order', propertyIds: [] },
    ],
    rules: [],
    actions: [
      {
        id: 'prepare-order',
        name: 'Prepare order',
        conceptId: 'order',
        inputFactTypeIds: ['order-raw'],
        outputFactTypeIds: ['order-ready'],
        permissions: ['order.prepare'],
      },
    ],
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
    actions: [
      {
        actionId: 'prepare-order',
        concept: {
          ontologyId: 'orders',
          ontologyVersion: '3',
          conceptId: 'order',
        },
      },
    ],
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

export function body(): SolutionExecutionContractBody {
  return {
    schemaVersion: SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION,
    contractId: 'orders-solution@1.0',
    projectId: 'project-1',
    solutionId: 'orders-solution',
    solutionVersion: '1.0',
    status: 'approved',
    modelingDimension: 'workflow',
    topology: {
      nodes: [
        {
          id: 'prepare',
          kind: 'agent',
          contractRef: 'preparer',
          requiresVerification: true,
        },
        {
          id: 'publish',
          kind: 'skill',
          contractRef: 'publisher',
          requiresVerification: true,
          hitlPolicyId: 'approve-publication',
        },
      ],
      edges: [{ fromNodeId: 'prepare', toNodeId: 'publish', factType: readyFact }],
      externalInputs: [rawFact],
    },
    agents: [agent()],
    skills: [skill()],
    semanticContext: {
      ontology: { ontologyId: 'orders', ontologyVersion: '3' },
      sourceRefs: [
        {
          sourceType: 'interview',
          sourceId: 'interview-1',
          sourceVersion: '1',
        },
      ],
      objectSlots: [
        {
          id: 'order',
          concept: {
            ontologyId: 'orders',
            ontologyVersion: '3',
            conceptId: 'order',
          },
          required: true,
        },
      ],
      allowedActionIds: ['prepare-order'],
      taskTemplates: [
        {
          id: 'prepare-template',
          designNodeId: 'prepare',
          objective: 'Prepare the order',
          candidateAgentIds: ['preparer'],
          candidateSkillIds: [],
        },
      ],
    },
    verification: [
      {
        id: 'verify-prepare',
        nodeId: 'prepare',
        verifierRef: 'order-verifier',
        evidenceSchemaRef: 'order-evidence-v1',
      },
      {
        id: 'verify-publish',
        nodeId: 'publish',
        verifierRef: 'publication-verifier',
        evidenceSchemaRef: 'publication-evidence-v1',
      },
    ],
    hitl: [
      {
        id: 'approve-publication',
        nodeId: 'publish',
        trigger: 'after_verification',
        approverRole: 'owner',
      },
    ],
    permissions: { allowed: ['order.prepare'] },
    budget: { maxAttempts: 2, maxDurationMs: 60_000, maxTokens: 10_000 },
    createdAt: instant.toISOString(),
  };
}
