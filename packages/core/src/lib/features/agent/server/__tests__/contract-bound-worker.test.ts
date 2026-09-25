import { describe, expect, it, vi } from 'vitest';

import {
  ContractBoundAgentSkillWorker,
  ContractBoundWorkerError,
  type ContractBoundAgentSkillRuntimePort,
  type ContractBoundRuntimeRequest,
  type ContractBoundRuntimeResult,
} from '../contract-bound-worker';

import type {
  CollaborationRunSnapshot,
  CollaborationWorkItem,
  WorkerExecutionInput,
  WorkItemAttempt,
} from '../../../../../modules/collaboration-runtime/facade';
import type {
  SolutionExecutionContract,
  SolutionContractNode,
} from '../../../solution';

const HASH = `sha256:${'a'.repeat(64)}`;
const OUTPUT_HASH = `sha256:${'b'.repeat(64)}`;

function contract(nodes: readonly SolutionContractNode[]): SolutionExecutionContract {
  return {
    schemaVersion: '1.0.0',
    contractId: 'solution@1',
    contractHash: HASH,
    projectId: 'project-1',
    solutionId: 'solution',
    solutionVersion: '1',
    status: 'approved',
    modelingDimension: 'workflow',
    topology: { nodes, edges: [], externalInputs: [] },
    agents: [{
      agentId: 'writer',
      ontology: { ontologyId: 'docs', ontologyVersion: '2' },
      inputs: [],
      outputs: [{
        factType: {
          ontologyId: 'docs',
          ontologyVersion: '2',
          conceptId: 'document',
          factTypeId: 'draft',
        },
        required: true,
      }],
      actions: [],
      permissions: ['document.write'],
    }],
    skills: [{
      skillId: 'summarize',
      ontology: { ontologyId: 'docs', ontologyVersion: '2' },
      inputs: [],
      outputs: [],
      actions: [],
      permissions: [],
    }],
    semanticContext: {
      ontology: { ontologyId: 'docs', ontologyVersion: '2' },
      sourceRefs: [{
        sourceType: 'interview',
        sourceId: 'source-1',
        sourceVersion: '1',
      }],
      objectSlots: [{
        id: 'document',
        concept: {
          ontologyId: 'docs',
          ontologyVersion: '2',
          conceptId: 'document',
        },
        required: true,
      }],
      allowedActionIds: ['write-document'],
      taskTemplates: [{
        id: 'write',
        designNodeId: 'write',
        objective: 'Write the approved document',
        candidateAgentIds: ['writer'],
        candidateSkillIds: [],
      }],
    },
    verification: [],
    hitl: [],
    permissions: { allowed: ['document.write'] },
    budget: {
      maxAttempts: 3,
      maxDurationMs: 60_000,
      maxTokens: 10_000,
    },
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

function executionInput(
  options: {
    runId?: string;
    node?: SolutionContractNode;
    attemptNumber?: number;
    priorCheckpoint?: string;
    inputRefs?: readonly string[];
  } = {},
): WorkerExecutionInput {
  const node = options.node ?? {
    id: 'write',
    kind: 'agent',
    contractRef: 'writer',
    requiresVerification: true,
  };
  const runId = options.runId ?? 'run-1';
  const attemptNumber = options.attemptNumber ?? 1;
  const workItemId = `${runId}:${node.id}`;
  const attemptId = `${workItemId}:attempt-${attemptNumber}`;
  const attempts: WorkItemAttempt[] = [];
  if (options.priorCheckpoint) {
    attempts.push({
      attemptId: `${workItemId}:attempt-${attemptNumber - 1}`,
      leaseEpoch: attemptNumber - 1,
      requestId: 'prior',
      payloadHash: HASH,
      status: 'failed',
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
      workerReceipt: {
        receiptId: 'prior',
        outputRefs: ['artifact://prior/output'],
        outputHash: OUTPUT_HASH,
        checkpointRef: options.priorCheckpoint,
        usage: { durationMs: 1, tokens: 1 },
      },
    });
  }
  const attempt: WorkItemAttempt = {
    attemptId,
    leaseEpoch: attemptNumber,
    requestId: `request-${attemptNumber}`,
    payloadHash: HASH,
    status: 'ready',
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
  };
  attempts.push(attempt);
  const workItem: CollaborationWorkItem = {
    id: workItemId,
    binding: {
      parentTaskId: 'task-1',
      parentStepId: 'step-1',
      runId,
      solutionId: 'solution',
      solutionVersion: '1',
      executionContractId: 'solution@1',
      contractHash: HASH,
      taskRevision: 1,
    },
    designNodeId: node.id,
    assignedAgentId: node.kind === 'agent' ? node.contractRef : '',
    skillRefs: node.kind === 'skill' ? [node.contractRef] : [],
    dependsOn: [],
    inputRefs: options.inputRefs ?? [
      'artifact://session/brief',
      'ontology-fact:docs:2:document:source:fact-1:1',
      'draft',
    ],
    outputRefs: ['draft'],
    status: 'running',
    revision: 2,
    leaseEpoch: attemptNumber,
    attempts,
  };
  const run: CollaborationRunSnapshot = {
    runId,
    projectId: 'project-1',
    binding: workItem.binding,
    contract: contract([node]),
    workItems: [workItem],
    status: 'running',
    revision: 2,
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
  };
  return {
    run,
    workItem,
    attempt,
    executionKey: `${runId}:${workItemId}:${attemptId}`,
    idempotencyKey: `worker:${runId}:${attemptId}`,
  };
}

function success(id: string): ContractBoundRuntimeResult {
  return {
    receiptId: `receipt-${id}`,
    outputRefs: [`artifact://outputs/${id}`],
    outputHash: OUTPUT_HASH,
    usage: { durationMs: 25, tokens: 18 },
    checkpointRef: `checkpoint://${id}`,
  };
}

describe('ContractBoundAgentSkillWorker', () => {
  it('resolves the exact frozen agent and carries semantic and typed input context', async () => {
    let observed: ContractBoundRuntimeRequest | undefined;
    const runtime: ContractBoundAgentSkillRuntimePort = {
      execute: async (request) => {
        observed = request;
        return success('agent');
      },
    };
    const worker = new ContractBoundAgentSkillWorker(runtime);
    const receipt = await worker.execute(executionInput());

    expect(receipt).toEqual(success('agent'));
    expect(observed).toMatchObject({
      target: { kind: 'agent', targetId: 'writer' },
      objective: 'Write the approved document',
      requestId: 'request-1',
      payloadHash: HASH,
      parentTaskId: 'task-1',
      parentStepId: 'step-1',
      contractHash: HASH,
      requiredPermissions: ['document.write'],
      semanticContext: {
        ontology: { ontologyId: 'docs', ontologyVersion: '2' },
        allowedActionIds: ['write-document'],
      },
      inputRefs: {
        artifactRefs: ['artifact://session/brief'],
        factRefs: ['ontology-fact:docs:2:document:source:fact-1:1'],
        unresolvedRefs: ['draft'],
      },
    });
  });

  it('resolves a frozen skill without falling back to an agent or latest manifest', async () => {
    const skillNode: SolutionContractNode = {
      id: 'summarize',
      kind: 'skill',
      contractRef: 'summarize',
      requiresVerification: true,
    };
    const execute = vi.fn(async () => success('skill'));
    const worker = new ContractBoundAgentSkillWorker({ execute });

    await worker.execute(executionInput({ node: skillNode }));

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      designNodeId: 'summarize',
      target: { kind: 'skill', targetId: 'summarize' },
    });
  });

  it('keeps concurrent executions of the same logical agent isolated by run/workItem/attempt', async () => {
    const releases = new Map<string, () => void>();
    const requests: ContractBoundRuntimeRequest[] = [];
    const runtime: ContractBoundAgentSkillRuntimePort = {
      execute: async (request) => {
        requests.push(request);
        await new Promise<void>((resolve) => {
          releases.set(request.executionKey, resolve);
        });
        return success(request.runId);
      },
    };
    const worker = new ContractBoundAgentSkillWorker(runtime);
    const firstInput = executionInput({ runId: 'run-a' });
    const secondInput = executionInput({ runId: 'run-b' });
    const first = worker.execute(firstInput);
    const second = worker.execute(secondInput);

    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(worker.activeExecutionKeys()).toEqual(expect.arrayContaining([
      firstInput.executionKey,
      secondInput.executionKey,
    ]));
    expect(requests[0]?.target.targetId).toBe('writer');
    expect(requests[1]?.target.targetId).toBe('writer');
    expect(requests[0]?.executionKey).not.toBe(requests[1]?.executionKey);

    releases.get(firstInput.executionKey)?.();
    releases.get(secondInput.executionKey)?.();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(worker.activeExecutionKeys()).toEqual([]);
  });

  it('passes the last persisted checkpoint into a retried isolated attempt', async () => {
    const execute = vi.fn(async () => success('retry'));
    const worker = new ContractBoundAgentSkillWorker({ execute });
    await worker.execute(executionInput({
      attemptNumber: 2,
      priorCheckpoint: 'checkpoint://attempt-1',
    }));
    expect(execute.mock.calls[0]?.[0].checkpointRef)
      .toBe('checkpoint://attempt-1');
  });

  it('rejects a late result after abort even when the runtime ignores the signal', async () => {
    let release: (() => void) | undefined;
    const runtime: ContractBoundAgentSkillRuntimePort = {
      execute: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return success('late');
      },
    };
    const worker = new ContractBoundAgentSkillWorker(runtime);
    const input = executionInput();
    const pending = worker.execute(input);
    await vi.waitFor(() => expect(worker.activeExecutionKeys()).toContain(
      input.executionKey,
    ));
    expect(worker.abort(input.executionKey)).toBe(true);
    release?.();
    await expect(pending).rejects.toMatchObject({
      code: 'WORKER_ABORTED',
    });
  });

  it('fails closed when a WorkItem target differs from the frozen node', async () => {
    const input = executionInput();
    const mismatched: WorkerExecutionInput = {
      ...input,
      workItem: {
        ...input.workItem,
        assignedAgentId: 'another-agent',
      },
    };
    const runtime: ContractBoundAgentSkillRuntimePort = {
      execute: async () => success('never'),
    };
    const worker = new ContractBoundAgentSkillWorker(runtime);
    await expect(worker.execute(mismatched)).rejects.toEqual(
      expect.objectContaining<Partial<ContractBoundWorkerError>>({
        code: 'WORKER_TARGET_MISMATCH',
      }),
    );
  });

  it('deduplicates the same idempotent execution and rejects an execution-key conflict', async () => {
    let release: (() => void) | undefined;
    const execute = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return success('once');
    });
    const worker = new ContractBoundAgentSkillWorker({ execute });
    const input = executionInput();
    const first = worker.execute(input);
    const replay = worker.execute(input);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    await expect(worker.execute({
      ...input,
      idempotencyKey: 'different',
    })).rejects.toMatchObject({ code: 'WORKER_EXECUTION_CONFLICT' });
    release?.();
    await expect(Promise.all([first, replay])).resolves.toHaveLength(2);
    expect(execute).toHaveBeenCalledOnce();
  });
});
