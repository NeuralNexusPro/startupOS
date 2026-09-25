import { describe, expect, it } from 'vitest';

import {
  compileSolutionExecutionContract,
  verifySolutionExecutionContractIntegrity,
  type SolutionExecutionContractBody,
} from '../index';
import {
  body,
  ontology,
  rawFact,
  readyFact,
} from './execution-contract-fixtures';

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

  it('blocks ambiguous concepts and requires traceable confirmation evidence', () => {
    const valid = body();
    const ambiguous: SolutionExecutionContractBody = {
      ...valid,
      semanticContext: {
        ...valid.semanticContext,
        objectSlots: [
          {
            ...valid.semanticContext.objectSlots[0]!,
            resolution: {
              status: 'ambiguous',
              candidateConceptIds: ['order', 'purchase-order'],
              reason: '访谈中的订单指代尚未澄清',
            },
          },
        ],
      },
    };
    const unknownEvidence: SolutionExecutionContractBody = {
      ...valid,
      semanticContext: {
        ...valid.semanticContext,
        objectSlots: [
          {
            ...valid.semanticContext.objectSlots[0]!,
            resolution: {
              status: 'confirmed',
              evidenceSourceRefIds: ['missing-interview'],
            },
          },
        ],
      },
    };

    const ambiguousResult = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      ambiguous
    );
    const evidenceResult = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      unknownEvidence
    );

    expect(ambiguousResult).toMatchObject({
      ok: false,
      gaps: [expect.objectContaining({ code: 'SEMANTIC_CONCEPT_AMBIGUOUS' })],
    });
    expect(evidenceResult).toMatchObject({
      ok: false,
      gaps: [expect.objectContaining({ code: 'MISSING_REFERENCE' })],
    });
  });

  it('requires explicit fact state and freshness policies and validates their references', () => {
    const valid = body();
    const missingPolicy: SolutionExecutionContractBody = {
      ...valid,
      semanticContext: { ...valid.semanticContext, factPolicies: [] },
    };
    const invalidPolicy: SolutionExecutionContractBody = {
      ...valid,
      semanticContext: {
        ...valid.semanticContext,
        factPolicies: [
          {
            factType: rawFact,
            state: { mode: 'required', stateIds: ['missing-state'] },
            freshness: { mode: 'max_age', maxAgeMs: 0 },
          },
          valid.semanticContext.factPolicies[1]!,
        ],
      },
    };

    const missing = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      missingPolicy
    );
    const invalid = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      invalidPolicy
    );

    expect(missing).toMatchObject({
      ok: false,
      gaps: expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_FACT_POLICY' }),
      ]),
    });
    expect(invalid).toMatchObject({
      ok: false,
      gaps: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_FACT_STATE_POLICY' }),
        expect.objectContaining({ code: 'INVALID_FACT_FRESHNESS_POLICY' }),
      ]),
    });
  });

  it('changes the immutable contract hash when an explicit freshness policy changes', () => {
    const firstBody = body();
    const secondBody: SolutionExecutionContractBody = {
      ...firstBody,
      semanticContext: {
        ...firstBody.semanticContext,
        factPolicies: firstBody.semanticContext.factPolicies.map((policy) =>
          policy.factType.factTypeId === rawFact.factTypeId
            ? {
                ...policy,
                freshness: { mode: 'max_age', maxAgeMs: 600_000 },
              }
            : policy
        ),
      },
    };

    const first = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      firstBody
    );
    const second = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      secondBody
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.contract.contractHash).not.toBe(
        second.contract.contractHash
      );
    }
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

  it('rejects malformed structural, policy, and semantic references as one complete gate', () => {
    const valid = body();
    const malformed = {
      ...valid,
      schemaVersion: '0.0.0',
      contractId: ' ',
      projectId: '',
      solutionId: ' ',
      solutionVersion: '',
      topology: {
        ...valid.topology,
        nodes: [
          { ...valid.topology.nodes[0], hitlPolicyId: 'missing-hitl' },
          valid.topology.nodes[0],
          { ...valid.topology.nodes[1], id: 'isolated' },
        ],
        edges: [
          { fromNodeId: 'prepare', toNodeId: 'prepare', factType: rawFact },
          { fromNodeId: 'missing', toNodeId: 'prepare', factType: rawFact },
        ],
      },
      agents: [...valid.agents, valid.agents[0]],
      skills: [...valid.skills, valid.skills[0]],
      verification: [
        valid.verification[0],
        valid.verification[0],
        {
          id: 'orphan-verifier',
          nodeId: 'missing',
          verifierRef: '',
          evidenceSchemaRef: '',
        },
      ],
      hitl: [
        valid.hitl[0],
        valid.hitl[0],
        {
          id: 'orphan-hitl',
          nodeId: 'missing',
          trigger: 'before_execution',
          approverRole: '',
        },
      ],
      semanticContext: {
        ...valid.semanticContext,
        ontology: { ontologyId: 'other', ontologyVersion: '99' },
        objectSlots: [
          {
            ...valid.semanticContext.objectSlots[0],
            concept: {
              ontologyId: 'orders',
              ontologyVersion: '3',
              conceptId: 'missing-concept',
            },
            resolution: {
              status: 'confirmed',
              evidenceSourceRefIds: [],
            },
          },
        ],
        factPolicies: [
          valid.semanticContext.factPolicies[0],
          valid.semanticContext.factPolicies[0],
          {
            factType: {
              ontologyId: 'orders',
              ontologyVersion: '3',
              conceptId: 'order',
              factTypeId: 'missing-fact',
            },
            state: { mode: 'required', stateIds: [] },
            freshness: { mode: 'any' },
          },
        ],
        allowedActionIds: ['missing-action'],
        taskTemplates: [
          {
            id: 'orphan-template',
            designNodeId: 'missing-node',
            objective: 'Must never execute',
            candidateAgentIds: ['missing-agent'],
            candidateSkillIds: ['missing-skill'],
          },
        ],
      },
    } as unknown as SolutionExecutionContractBody;

    const result = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      malformed
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = new Set(result.gaps.map(({ code }) => code));
    expect([...codes]).toEqual(expect.arrayContaining([
      'SCHEMA_MISMATCH',
      'REQUIRED_FIELD',
      'DUPLICATE_ID',
      'MISSING_HITL_POLICY',
      'MISSING_REFERENCE',
      'SELF_DEPENDENCY',
      'ISOLATED_NODE',
      'INCOMPLETE_VERIFIER',
      'INCOMPLETE_HITL_POLICY',
      'ONTOLOGY_VERSION_MISMATCH',
      'CONCEPT_CONFIRMATION_REQUIRED',
      'DUPLICATE_FACT_POLICY',
      'INVALID_FACT_STATE_POLICY',
    ]));
  });

  it('rejects an empty design and an unsupported published schema', () => {
    const valid = body();
    const empty = compileSolutionExecutionContract(ontology(), 'confirmed', {
      ...valid,
      topology: { nodes: [], edges: [], externalInputs: [] },
      agents: [],
      skills: [],
      verification: [],
      hitl: [],
      semanticContext: {
        ...valid.semanticContext,
        objectSlots: [],
        factPolicies: [],
        allowedActionIds: [],
        taskTemplates: [],
      },
      permissions: { allowed: [] },
    });
    expect(empty).toMatchObject({
      ok: false,
      gaps: expect.arrayContaining([
        expect.objectContaining({ code: 'EMPTY_TOPOLOGY' }),
      ]),
    });

    const compiled = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      valid
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(verifySolutionExecutionContractIntegrity({
      ...compiled.contract,
      schemaVersion: '0.0.0',
    } as unknown as typeof compiled.contract)).toMatchObject({
      valid: false,
      code: 'SCHEMA_MISMATCH',
    });
  });
});
