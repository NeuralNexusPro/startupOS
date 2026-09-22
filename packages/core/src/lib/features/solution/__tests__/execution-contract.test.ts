import { describe, expect, it } from 'vitest';

import {
  compileSolutionExecutionContract,
  verifySolutionExecutionContractIntegrity,
} from '../index';
import { body, ontology, rawFact, readyFact } from './execution-contract-fixtures';

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
