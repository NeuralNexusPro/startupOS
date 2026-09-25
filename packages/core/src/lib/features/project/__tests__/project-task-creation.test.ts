import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalFactRecord, CanonicalFactReference } from '../../ontology';
import type { PublishedSolutionExecutionContract, SolutionExecutionContract } from '../../solution';
import type { CollaborationRunSnapshot } from '../../../../modules/collaboration-runtime/facade';
import {
  ApprovedProjectTaskCreationService,
  ProjectTaskCreationError,
  type ApprovedProjectTaskPort,
  type ApprovedProjectTaskReceipt,
  type CreateApprovedProjectTaskInput,
} from '../project-task-creation';
import type { ProjectTaskDetail } from '../task-board';

const HASH = `sha256:${'a'.repeat(64)}`;
const roots: string[] = [];
let now: Date;

const factRef: CanonicalFactReference = {
  ontologyId: 'orders',
  ontologyVersion: '1',
  conceptId: 'order',
  factTypeId: 'order-ready',
  factId: 'order-1',
  factVersion: '1',
};

function contract(): SolutionExecutionContract {
  return {
    schemaVersion: '1.0.0',
    contractId: 'contract-1',
    contractHash: HASH,
    projectId: 'project-1',
    solutionId: 'solution-1',
    solutionVersion: '1',
    status: 'approved',
    modelingDimension: 'workflow',
    topology: {
      nodes: [{
        id: 'prepare-node',
        kind: 'agent',
        contractRef: 'preparer',
        requiresVerification: true,
      }],
      edges: [],
      externalInputs: [{
        ontologyId: 'orders',
        ontologyVersion: '1',
        conceptId: 'order',
        factTypeId: 'order-ready',
      }],
    },
    agents: [{
      agentId: 'preparer',
      ontology: { ontologyId: 'orders', ontologyVersion: '1' },
      inputs: [],
      outputs: [],
      actions: [{
        actionId: 'prepare-order',
        concept: { ontologyId: 'orders', ontologyVersion: '1', conceptId: 'order' },
      }],
      permissions: ['orders.prepare'],
    }],
    skills: [],
    semanticContext: {
      ontology: { ontologyId: 'orders', ontologyVersion: '1' },
      sourceRefs: [],
      objectSlots: [{
        id: 'order-slot',
        concept: { ontologyId: 'orders', ontologyVersion: '1', conceptId: 'order' },
        required: true,
        resolution: { status: 'confirmed', evidenceSourceRefIds: ['interview-1'] },
      }],
      factPolicies: [{
        factType: {
          ontologyId: 'orders',
          ontologyVersion: '1',
          conceptId: 'order',
          factTypeId: 'order-ready',
        },
        state: { mode: 'required', stateIds: ['ready'] },
        freshness: { mode: 'max_age', maxAgeMs: 60_000 },
      }],
      allowedActionIds: ['prepare-order'],
      taskTemplates: [{
        id: 'prepare-template',
        designNodeId: 'prepare-node',
        objective: '准备订单',
        candidateAgentIds: ['preparer'],
        candidateSkillIds: [],
      }],
    },
    verification: [{
      id: 'verify-prepare',
      nodeId: 'prepare-node',
      verifierRef: 'originos.artifact-output@1.0.0',
      evidenceSchemaRef: 'originos.artifact-evidence@1.0.0',
    }],
    hitl: [],
    permissions: { allowed: ['orders.prepare'] },
    budget: { maxAttempts: 2, maxDurationMs: 60_000, maxTokens: 1_000 },
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

function taskDetail(taskId = 'task-1'): ProjectTaskDetail {
  return {
    projectId: 'project-1',
    taskId,
    title: '准备订单',
    status: 'active',
    revision: 1,
    progress: 0,
    currentStep: 'step-1',
    blockerCount: 0,
    evidenceCount: 0,
    actions: ['stop', 'cancel'],
    runtimeStatus: 'running',
    runtimeAvailability: 'controllable',
    assignedAgentIds: [],
    workItemCount: 0,
    artifactRefs: [],
    transitions: [],
    task: {
      version: 1,
      taskId,
      title: '准备订单',
      objective: '准备订单并产出证据',
      status: 'active',
      progress: 0,
      currentStep: 'step-1',
      steps: [{
        id: 'step-1',
        text: '执行已发布模板',
        expectedOutput: '已验证产物',
        status: 'active',
        evidenceRequired: true,
        evidenceCount: 0,
      }],
      criteria: [],
      blockers: [],
      warnings: [],
      evidenceCount: 0,
      actions: ['stop', 'cancel'],
      revision: 1,
      cursor: null,
      stateHash: 'state-1',
      truncated: false,
    },
    workItems: [],
  };
}

function runFor(task: ApprovedProjectTaskReceipt): CollaborationRunSnapshot {
  const frozen = contract();
  const runId = 'run-1';
  return {
    runId,
    projectId: 'project-1',
    binding: {
      parentTaskId: task.task.taskId,
      parentStepId: task.parentStepId,
      parentSessionId: task.parentSessionId,
      runId,
      solutionId: frozen.solutionId,
      solutionVersion: frozen.solutionVersion,
      executionContractId: frozen.contractId,
      contractHash: frozen.contractHash,
      taskRevision: task.task.revision,
    },
    contract: frozen,
    workItems: [],
    status: 'running',
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function input(overrides: Partial<CreateApprovedProjectTaskInput> = {}): CreateApprovedProjectTaskInput {
  return {
    projectId: 'project-1',
    solutionId: 'solution-1',
    solutionVersion: '1',
    contractId: 'contract-1',
    contractHash: HASH,
    taskTemplateId: 'prepare-template',
    objective: '准备订单并产出证据',
    semanticInputs: [{ slotId: 'order-slot', factRef }],
    requestId: 'request-1',
    ...overrides,
  };
}

class MemoryTaskPort implements ApprovedProjectTaskPort {
  readonly receipts = new Map<string, ApprovedProjectTaskReceipt>();
  readonly create = vi.fn(async (request: { projectId: string; requestId: string }) => {
    const receipt: ApprovedProjectTaskReceipt = {
      task: taskDetail(),
      parentStepId: 'step-1',
      parentSessionId: 'session-1',
    };
    this.receipts.set(`${request.projectId}:${request.requestId}`, receipt);
    return receipt;
  });

  async findByRequest(projectId: string, requestId: string) {
    return this.receipts.get(`${projectId}:${requestId}`) ?? null;
  }
}

async function harness(options: {
  published?: PublishedSolutionExecutionContract;
  start?: (task: ApprovedProjectTaskReceipt) => Promise<CollaborationRunSnapshot>;
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-task-create-'));
  roots.push(root);
  const published = options.published ?? { contract: contract() };
  const taskPort = new MemoryTaskPort();
  let existingRun: CollaborationRunSnapshot | null = null;
  const start = vi.fn(async () => {
    const task = await taskPort.findByRequest('project-1', 'request-1');
    if (!task) throw new Error('task missing');
    const run = options.start ? await options.start(task) : runFor(task);
    existingRun = run;
    return run;
  });
  const acceptedAt = new Date(now.getTime() - 1_000);
  const queryFacts = vi.fn(async () => ({
    ok: true as const,
    facts: [{
      ref: factRef,
      value: { stateId: 'ready' },
      source: { sourceType: 'manual' as const, sourceId: 'user-1' },
      operationId: 'fact-op-1',
      revision: 1,
      acceptedAt,
    } satisfies CanonicalFactRecord],
  }));
  const service = new ApprovedProjectTaskCreationService(root, {
    contractPort: {
      load: vi.fn(async () => published),
      verifyIntegrity: vi.fn(async (candidate) => candidate.contractHash === HASH
        ? { valid: true as const }
        : { valid: false as const, code: 'HASH_MISMATCH' as const, message: 'bad hash' }),
    },
    factPort: { queryFacts },
    taskPort,
    executionPort: {
      start,
      findByTask: vi.fn(async () => existingRun),
    },
    clock: () => now,
  });
  return { root, published, taskPort, start, queryFacts, service, setRun: (run: CollaborationRunSnapshot) => { existingRun = run; } };
}

beforeEach(() => {
  now = new Date('2026-09-25T08:00:00.000Z');
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('ApprovedProjectTaskCreationService', () => {
  it('creates one Task then one contract-bound Run and replays the authoritative receipt', async () => {
    const test = await harness();
    const first = await test.service.create(input());
    const second = await test.service.create(input());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      receipt: {
        task: { taskId: 'task-1', revision: 1 },
        run: { runId: 'run-1' },
        binding: { parentTaskId: 'task-1', executionContractId: 'contract-1' },
        contractId: 'contract-1',
        contractHash: HASH,
      },
    });
    expect(test.taskPort.create).toHaveBeenCalledTimes(1);
    expect(test.start).toHaveBeenCalledTimes(1);
    const ledger = await fs.readFile(path.join(
      test.root,
      'projects/project-1/task-creation/operations.jsonl',
    ), 'utf8');
    expect(ledger.trim().split('\n').map((line) => JSON.parse(line).stage))
      .toEqual(['intent', 'task_created', 'run_created', 'completed']);
  });

  it('replays a completed frozen Run after its source contract is revoked', async () => {
    const published: {
      contract: SolutionExecutionContract;
      revocation?: { contractId: string; revokedAt: string; reason: string };
    } = { contract: contract() };
    const test = await harness({ published });
    const completed = await test.service.create(input());
    published.revocation = {
      contractId: 'contract-1',
      revokedAt: now.toISOString(),
      reason: 'superseded',
    };

    expect(await test.service.create(input())).toEqual(completed);
    expect(test.taskPort.create).toHaveBeenCalledTimes(1);
    expect(test.start).toHaveBeenCalledTimes(1);
  });

  it('rejects different input reusing a requestId without creating duplicates', async () => {
    const test = await harness();
    await test.service.create(input());
    await expect(test.service.create(input({ objective: '另一个目标' })))
      .rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' } satisfies Partial<ProjectTaskCreationError>);
    expect(test.taskPort.create).toHaveBeenCalledTimes(1);
    expect(test.start).toHaveBeenCalledTimes(1);
  });

  it('returns a DesignGap with zero Task, Run and ledger writes when semantic input is missing', async () => {
    const test = await harness();
    const result = await test.service.create(input({ semanticInputs: [] }));

    expect(result).toMatchObject({
      ok: false,
      gaps: expect.arrayContaining([
        expect.objectContaining({ code: 'REQUIRED_SEMANTIC_OBJECT_MISSING' }),
        expect.objectContaining({ code: 'EXTERNAL_FACT_INPUT_MISSING' }),
      ]),
    });
    expect(test.taskPort.create).not.toHaveBeenCalled();
    expect(test.start).not.toHaveBeenCalled();
    await expect(fs.access(path.join(test.root, 'projects')))
      .rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(test.root, '.collaboration-locks')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers a persisted Task and an unrecorded Run after interruption without duplication', async () => {
    let first = true;
    let persistedRun: CollaborationRunSnapshot | null = null;
    const test = await harness({
      start: async (task) => {
        const run = runFor(task);
        persistedRun = run;
        if (first) {
          first = false;
          throw new Error('simulated crash after Run persistence');
        }
        return run;
      },
    });
    await expect(test.service.create(input())).rejects.toThrow('simulated crash');
    expect(test.taskPort.create).toHaveBeenCalledTimes(1);
    expect(persistedRun).not.toBeNull();
    test.setRun(persistedRun!);

    const recovered = await test.service.create(input());
    expect(recovered).toMatchObject({ ok: true, receipt: { run: { runId: 'run-1' } } });
    expect(test.taskPort.create).toHaveBeenCalledTimes(1);
    expect(test.start).toHaveBeenCalledTimes(1);
  });

  it('revalidates revocation before Run recovery and never substitutes another contract', async () => {
    let fail = true;
    const published: { contract: SolutionExecutionContract; revocation?: { contractId: string; revokedAt: string; reason: string } } = {
      contract: contract(),
    };
    const test = await harness({
      published,
      start: async (task) => {
        if (fail) {
          fail = false;
          throw new Error('run unavailable');
        }
        return runFor(task);
      },
    });
    await expect(test.service.create(input())).rejects.toThrow('run unavailable');
    published.revocation = {
      contractId: 'contract-1',
      revokedAt: now.toISOString(),
      reason: 'superseded',
    };

    const result = await test.service.create(input());
    expect(result).toMatchObject({
      ok: false,
      gaps: [expect.objectContaining({ code: 'EXECUTION_CONTRACT_REVOKED' })],
    });
    expect(test.taskPort.create).toHaveBeenCalledTimes(1);
    expect(test.start).toHaveBeenCalledTimes(1);
  });

  it('fails closed on hash, state and freshness gates before creating a Task', async () => {
    const hash = await harness();
    const hashResult = await hash.service.create(input({ contractHash: `sha256:${'b'.repeat(64)}` }));
    expect(hashResult).toMatchObject({
      ok: false,
      gaps: [expect.objectContaining({ code: 'EXECUTION_CONTRACT_HASH_MISMATCH' })],
    });
    expect(hash.taskPort.create).not.toHaveBeenCalled();

    const stale = await harness();
    now = new Date('2026-09-25T10:00:00.000Z');
    const staleResult = await stale.service.create(input());
    expect(staleResult).toMatchObject({
      ok: false,
      gaps: [expect.objectContaining({ code: 'SEMANTIC_FACT_STALE' })],
    });
    expect(stale.taskPort.create).not.toHaveBeenCalled();
  });
});
