import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF,
  ORIGINOS_ARTIFACT_VERIFIER_REF,
  createProjectContractRuntimeComposition,
  type ProjectContractRuntimeHostCapabilities,
} from '../contract-bound-runtime-composition';

import type { SolutionExecutionContract } from '../../solution';

const HASH = `sha256:${'a'.repeat(64)}`;
const roots: string[] = [];

function contract(): SolutionExecutionContract {
  return {
    schemaVersion: '1.0.0',
    contractId: 'solution@1',
    contractHash: HASH,
    projectId: 'project-1',
    solutionId: 'solution',
    solutionVersion: '1',
    status: 'approved',
    modelingDimension: 'workflow',
    topology: {
      nodes: [{
        id: 'prepare',
        kind: 'agent',
        contractRef: 'preparer',
        requiresVerification: true,
      }],
      edges: [],
      externalInputs: [],
    },
    agents: [{
      agentId: 'preparer',
      ontology: { ontologyId: 'orders', ontologyVersion: '1' },
      inputs: [],
      outputs: [{
        factType: {
          ontologyId: 'orders',
          ontologyVersion: '1',
          conceptId: 'order',
          factTypeId: 'ready',
        },
        required: true,
      }],
      actions: [{
        actionId: 'prepare-order',
        concept: {
          ontologyId: 'orders',
          ontologyVersion: '1',
          conceptId: 'order',
        },
      }],
      permissions: ['order.prepare'],
    }],
    skills: [],
    semanticContext: {
      ontology: { ontologyId: 'orders', ontologyVersion: '1' },
      sourceRefs: [],
      objectSlots: [],
      allowedActionIds: ['prepare-order'],
      taskTemplates: [{
        id: 'prepare-template',
        designNodeId: 'prepare',
        objective: 'Prepare the order',
        candidateAgentIds: ['preparer'],
        candidateSkillIds: [],
      }],
    },
    verification: [{
      id: 'verify-prepare',
      nodeId: 'prepare',
      verifierRef: ORIGINOS_ARTIFACT_VERIFIER_REF,
      evidenceSchemaRef: ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF,
    }],
    hitl: [],
    permissions: { allowed: ['order.prepare'] },
    budget: { maxAttempts: 2, maxDurationMs: 60_000, maxTokens: 1_000 },
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

function host(): ProjectContractRuntimeHostCapabilities {
  const content = JSON.stringify({
    outcome: {
      actionId: 'prepare-order',
      inputFactRefs: [],
      outputs: [{
        factId: 'order-1',
        factTypeId: 'ready',
        value: { ready: true },
        source: { sourceType: 'runtime', sourceId: 'worker' },
      }],
      expectedRevision: 0,
    },
  });
  const agent = {
    abort: vi.fn(),
    prompt: vi.fn(async () => undefined),
    getSessionState: vi.fn(async () => ({
      sessionId: 'run',
      messages: [{
        id: 'assistant-1',
        role: 'assistant' as const,
        content,
        timestamp: Date.now(),
        usage: {
          input: 3,
          output: 4,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 7,
        },
      }],
      systemPrompt: '',
      model: { provider: 'test', id: 'test' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
  };
  const sessions = {
    listTaskRuntimeSessions: vi.fn(async () => []),
    getSession: vi.fn(async () => null),
    updateSession: vi.fn(async () => null),
    addMessage: vi.fn(async () => null),
  };
  const agents = {
    getOrCreateAgent: vi.fn(async () => agent),
    getOrCreateTaskRuntime: vi.fn(async () => {
      throw new Error('not reached');
    }),
    removeAgent: vi.fn(() => true),
    getTaskRuntimeSnapshot: vi.fn(() => null),
    controlTaskRuntime: vi.fn(async () => {
      throw new Error('not reached');
    }),
  };
  return { sessions, agents } as unknown as ProjectContractRuntimeHostCapabilities;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('createProjectContractRuntimeComposition', () => {
  it.each(['web', 'desktop'])('injects the same real Worker pipeline for the %s host', async (hostId) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `originos-${hostId}-composition-`));
    roots.push(root);
    await fs.mkdir(path.join(root, 'projects', 'project-1', 'agents', 'preparer'), {
      recursive: true,
    });
    const frozen = contract();
    const composition = createProjectContractRuntimeComposition({
      dataRoot: root,
      host: host(),
      hostId,
      contractPort: {
        load: async () => ({ contract: frozen }),
        verifyIntegrity: async () => ({ valid: true }),
      },
    });
    const run = await composition.executionPort.start({
      projectId: 'project-1',
      solutionId: 'solution',
      solutionVersion: '1',
      parentTaskId: 'task-1',
      parentStepId: 'step-1',
      taskRevision: 1,
      executionContractId: 'solution@1',
      contractHash: HASH,
      inputRefs: [],
    });
    const executed = await composition.executionPort.executeWorkItem({
      runId: run.runId,
      workItemId: run.workItems[0]!.id,
      requestId: 'request-1',
      payloadHash: HASH,
    });
    const attempt = executed.workItems[0]!.attempts[0]!;

    expect(attempt.workerReceipt).toMatchObject({
      outputRefs: [expect.stringMatching(/^artifact:\/\/collaboration\//)],
      usage: { tokens: 7 },
    });
    expect(attempt.reason).not.toContain('WORKER_UNAVAILABLE');
    expect(attempt.verifierResult).toMatchObject({
      status: 'passed',
      verificationMethod: ORIGINOS_ARTIFACT_VERIFIER_REF,
    });
  });

  it('blocks missing versioned facts before the production Worker is called', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-readiness-'));
    roots.push(root);
    await fs.mkdir(path.join(root, 'projects', 'project-1', 'agents', 'preparer'), {
      recursive: true,
    });
    const frozen = contract();
    const composition = createProjectContractRuntimeComposition({
      dataRoot: root,
      host: host(),
      contractPort: {
        load: async () => ({ contract: frozen }),
        verifyIntegrity: async () => ({ valid: true }),
      },
    });
    const run = await composition.executionPort.start({
      projectId: 'project-1',
      solutionId: 'solution',
      solutionVersion: '1',
      parentTaskId: 'task-1',
      parentStepId: 'step-1',
      taskRevision: 1,
      executionContractId: 'solution@1',
      contractHash: HASH,
      inputRefs: ['ontology-fact:orders:1:order:ready:missing:1'],
    });
    const executed = await composition.executionPort.executeWorkItem({
      runId: run.runId,
      workItemId: run.workItems[0]!.id,
      requestId: 'request-missing-fact',
      payloadHash: HASH,
    });
    const attempt = executed.workItems[0]!.attempts[0]!;

    expect(attempt.readinessReceipt).toMatchObject({ status: 'blocked' });
    expect(attempt.reason).toBe('INPUT_FACT_QUERY_REJECTED');
    expect(attempt.workerReceipt).toBeUndefined();
  });

  it('does not expose host-specific composition branches', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-composition-shape-'));
    roots.push(root);
    const composition = createProjectContractRuntimeComposition({
      dataRoot: root,
      host: host(),
      hostId: 'host',
      contractPort: {
        load: async () => null,
        verifyIntegrity: async () => ({ valid: true }),
      },
    });
    expect(Object.keys(composition).sort()).toEqual([
      'contractPort',
      'executionPort',
      'service',
      'taskBoard',
      'taskCreation',
      'taskSubscriptions',
    ]);
  });
});
