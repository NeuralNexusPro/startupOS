import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  type CanonicalAgentContract,
  type CanonicalOntology,
  type CanonicalSkillContract,
} from '../../ontology';
import {
  SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION,
  compileSolutionExecutionContract,
  type SolutionExecutionContractBody,
  verifySolutionExecutionContractIntegrity,
} from '../index';

const instant = new Date('2026-09-20T08:00:00.000Z');
const rawFact = {
  ontologyId: 'orders',
  ontologyVersion: '3',
  conceptId: 'order',
  factTypeId: 'order-raw',
};
const readyFact = {
  ontologyId: 'orders',
  ontologyVersion: '3',
  conceptId: 'order',
  factTypeId: 'order-ready',
};

function ontology(): CanonicalOntology {
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
      {
        id: 'order-raw',
        conceptId: 'order',
        name: 'Raw order',
        propertyIds: [],
      },
      {
        id: 'order-ready',
        conceptId: 'order',
        name: 'Ready order',
        propertyIds: [],
      },
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

function body(): SolutionExecutionContractBody {
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
      edges: [
        { fromNodeId: 'prepare', toNodeId: 'publish', factType: readyFact },
      ],
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

describe('solution execution contract', () => {
  it('compiles the same confirmed design to one immutable contract and hash', () => {
    const first = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      body()
    );
    const second = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      body()
    );

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.contract.contractHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(first.contract)).toBe(true);
    expect(Object.isFrozen(first.contract.topology.nodes)).toBe(true);
    expect(verifySolutionExecutionContractIntegrity(first.contract)).toEqual({
      valid: true,
    });
  });

  it('rejects an unconfirmed solution without returning a partial contract', () => {
    const result = compileSolutionExecutionContract(
      ontology(),
      'draft',
      body()
    );

    expect(result).toEqual({
      ok: false,
      gaps: [
        expect.objectContaining({
          code: 'SOLUTION_NOT_CONFIRMED',
          scope: 'solution',
        }),
      ],
    });
    expect('contract' in result).toBe(false);
  });

  it('reports topology, verifier, I/O, permission, budget and semantic gaps', () => {
    const valid = body();
    const invalid: SolutionExecutionContractBody = {
      ...valid,
      topology: {
        ...valid.topology,
        nodes: [
          { ...valid.topology.nodes[0]!, contractRef: 'missing-agent' },
          valid.topology.nodes[1]!,
        ],
        edges: [
          ...valid.topology.edges,
          { fromNodeId: 'publish', toNodeId: 'prepare', factType: readyFact },
        ],
      },
      verification: [{ ...valid.verification[0]!, verifierRef: '' }],
      permissions: { allowed: [] },
      budget: { ...valid.budget, maxAttempts: 0 },
      semanticContext: { ...valid.semanticContext, sourceRefs: [] },
    };

    const result = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      invalid
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_CONTRACT', scope: 'node' }),
        expect.objectContaining({ code: 'CYCLIC_TOPOLOGY', scope: 'solution' }),
        expect.objectContaining({ code: 'MISSING_VERIFIER', scope: 'node' }),
        expect.objectContaining({
          code: 'INCOMPLETE_VERIFIER',
          scope: 'policy',
        }),
        expect.objectContaining({ code: 'PERMISSION_DENIED', scope: 'policy' }),
        expect.objectContaining({ code: 'INVALID_BUDGET', scope: 'policy' }),
        expect.objectContaining({
          code: 'MISSING_SOURCE_EVIDENCE',
          scope: 'contract',
        }),
      ])
    );
  });

  it('rejects incompatible data flow through the ontology public validator', () => {
    const valid = body();
    const invalid: SolutionExecutionContractBody = {
      ...valid,
      topology: {
        ...valid.topology,
        edges: [{ ...valid.topology.edges[0]!, factType: rawFact }],
      },
    };

    const result = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      invalid
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OUTPUT_NOT_PRODUCED', scope: 'edge' }),
        expect.objectContaining({ code: 'INPUT_NOT_CONSUMED', scope: 'edge' }),
      ])
    );
  });

  it('detects tampering without mutating the published contract', () => {
    const result = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      body()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tampered = JSON.parse(JSON.stringify(result.contract));
    tampered.solutionVersion = '1.1';

    expect(verifySolutionExecutionContractIntegrity(tampered)).toEqual(
      expect.objectContaining({
        valid: false,
        code: 'HASH_MISMATCH',
      })
    );
    expect(result.contract.solutionVersion).toBe('1.0');
  });
});
