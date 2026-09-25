import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  compileSolutionExecutionContract,
  type SolutionExecutionContractBody,
} from '../index';
import { body, ontology, readyFact } from './execution-contract-fixtures';

function mediumDesign(nodeCount: number): SolutionExecutionContractBody {
  const source = body();
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `stage-${index}`,
    kind: 'skill' as const,
    contractRef: 'processor',
    requiresVerification: true,
  }));

  return {
    ...source,
    topology: {
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        fromNodeId: nodes[index]!.id,
        toNodeId: node.id,
        factType: readyFact,
      })),
      externalInputs: [readyFact],
    },
    agents: [],
    skills: [
      {
        skillId: 'processor',
        ontology: { ontologyId: 'orders', ontologyVersion: '3' },
        inputs: [{ factType: readyFact, required: true }],
        outputs: [{ factType: readyFact, required: true }],
        actions: [],
        permissions: [],
      },
    ],
    semanticContext: {
      ...source.semanticContext,
      allowedActionIds: [],
      taskTemplates: nodes.map((node) => ({
        id: `template-${node.id}`,
        designNodeId: node.id,
        objective: `执行 ${node.id}`,
        candidateAgentIds: [],
        candidateSkillIds: ['processor'],
      })),
    },
    verification: nodes.map((node) => ({
      id: `verify-${node.id}`,
      nodeId: node.id,
      verifierRef: 'deterministic-verifier',
      evidenceSchemaRef: 'evidence-v1',
    })),
    hitl: [],
    permissions: { allowed: [] },
  };
}

describe('solution execution contract integration acceptance', () => {
  it('compiles a 200-node design in less than five seconds', () => {
    const startedAt = performance.now();
    const result = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      mediumDesign(200)
    );
    const elapsedMs = performance.now() - startedAt;

    expect(result.ok).toBe(true);
    expect(elapsedMs).toBeLessThan(5_000);
  });

  it('keeps semantic evidence and task-template references inside the hash', () => {
    const first = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      body()
    );
    const changedBody = body();
    const second = compileSolutionExecutionContract(ontology(), 'confirmed', {
      ...changedBody,
      contractId: 'orders-solution@1.1',
      solutionVersion: '1.1',
      semanticContext: {
        ...changedBody.semanticContext,
        sourceRefs: [
          {
            sourceType: 'interview',
            sourceId: 'interview-1',
            sourceVersion: '2',
          },
        ],
      },
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.contract.semanticContext.sourceRefs[0]?.sourceVersion).toBe(
      '2'
    );
    expect(second.contract.semanticContext.taskTemplates).toEqual(
      changedBody.semanticContext.taskTemplates
    );
    expect(second.contract.contractHash).not.toBe(first.contract.contractHash);
  });
});
