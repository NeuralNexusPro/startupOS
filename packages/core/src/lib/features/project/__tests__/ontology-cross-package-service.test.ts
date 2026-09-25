import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CanonicalOntologyOSDK,
  CanonicalOntologyStore,
  type CanonicalContextProjectionRecord,
  type CanonicalFactRecord,
} from '../../ontology';
import { SolutionExecutionContractStore } from '../../solution';
import {
  body,
  instant,
  ontology as contractOntology,
  rawFact,
  readyFact,
} from '../../solution/__tests__/execution-contract-fixtures';
import { CollaborationExecutionStore } from '../../../../modules/collaboration-runtime/facade';
import type { AgentTaskProjectionV1 } from '../../../integrations/pi-agent/task-runtime';
import {
  OntologyCrossPackageService,
  type OntologyCrossPackageServiceDeps,
} from '../ontology-cross-package-service';
import type {
  OntologyCrossPackageRequest,
  OntologyCrossPackageWorkItemRecoveryInput,
  OntologyCrossPackageWorkItemRecoveryPort,
  OntologyCrossPackageWorkItemRecoveryResult,
} from '../ontology-cross-package-contract';
import {
  ProjectTaskBoardService,
  ProjectTaskRevisionConflictError,
  ProjectTaskTransitionRejectedError,
  type ProjectTaskRecord,
  type ProjectTaskSource,
  type ProjectTaskSummary,
} from '../task-board';
import {
  ProjectTaskRuntimeRecoveryConflictError,
  ProjectTaskSourceUnavailableError,
} from '../project-task-source';

const projection: CanonicalContextProjectionRecord = {
  id: 'projection-1',
  kind: 'goal',
  context: {
    projectId: 'project-1',
    ontologyId: 'orders',
    ontologyVersion: '3',
    contextInstanceId: 'context-1',
  },
  revision: 2,
  createdAt: instant,
};

const page = { items: [], revision: 1 };

function taskProjection(revision = 1): AgentTaskProjectionV1 {
  return {
    version: 1,
    taskId: 'task-1',
    title: 'Task 1',
    objective: 'Prepare orders',
    status: 'active',
    progress: 0,
    currentStep: null,
    steps: [],
    criteria: [],
    blockers: [],
    warnings: [],
    evidenceCount: 0,
    actions: ['stop', 'cancel'],
    revision,
    cursor: null,
    stateHash: 'task-state-1',
    truncated: false,
  };
}

function osdk(): Pick<
  CanonicalOntologyOSDK,
  'queryFacts' | 'queryProjections' | 'resolveProjection' | 'submitAction'
> {
  return {
    async queryFacts() {
      return { ok: true, facts: [] };
    },
    async queryProjections() {
      return { ok: true, projections: [projection] };
    },
    async resolveProjection() {
      return { ok: true, projection, facts: [] };
    },
    async submitAction() {
      return {
        ok: false,
        issues: [{ code: 'CAPABILITY_NOT_READY', path: 'type', message: 'Not configured', severity: 'error' }],
      };
    },
  };
}

function taskBoard(): Pick<
  ProjectTaskBoardService,
  | 'listProjectTasks'
  | 'getProjectTask'
  | 'requestProjectTaskAction'
  | 'requestProjectTaskTransition'
> {
  return {
    async listProjectTasks() {
      return page;
    },
    async getProjectTask() {
      return {
        projectId: 'project-1',
        taskId: 'task-1',
        title: 'Task 1',
        status: 'active',
        revision: 1,
        progress: 0,
        blockerCount: 0,
        evidenceCount: 0,
        actions: [],
        workItemCount: 0,
        task: taskProjection(),
        workItems: [],
      };
    },
    async requestProjectTaskAction() {
      const task = taskProjection(2);
      task.status = 'blocked';
      return {
        projectId: 'project-1',
        taskId: 'task-1',
        title: 'Task 1',
        status: 'blocked',
        revision: 2,
        progress: 0,
        blockerCount: 0,
        evidenceCount: 0,
        actions: [],
        workItemCount: 0,
        task,
        workItems: [],
      };
    },
    async requestProjectTaskTransition() {
      const task = taskProjection(2);
      task.status = 'review';
      return {
        projectId: 'project-1',
        taskId: 'task-1',
        title: 'Task 1',
        status: 'review',
        revision: 2,
        progress: 0,
        blockerCount: 0,
        evidenceCount: 0,
        actions: [],
        runtimeStatus: 'running',
        runtimeAvailability: 'controllable',
        assignedAgentIds: [],
        workItemCount: 0,
        artifactRefs: [],
        transitions: [],
        task,
        workItems: [],
      };
    },
  };
}

class MemoryWorkItemRecovery implements OntologyCrossPackageWorkItemRecoveryPort {
  calls = 0;
  readonly writes: string[] = [];
  private failNext = false;
  private stale = false;
  private unknown = false;

  failOnce(): void {
    this.failNext = true;
  }

  rejectStaleLease(): void {
    this.stale = true;
  }

  returnUnknownReceipt(): void {
    this.unknown = true;
  }

  async reconcile(
    input: OntologyCrossPackageWorkItemRecoveryInput
  ): Promise<OntologyCrossPackageWorkItemRecoveryResult> {
    this.calls += 1;
    if (this.stale) {
      return { ok: false, code: 'OLD_LEASE_EPOCH', message: 'Work item lease is stale' };
    }
    if (this.unknown) {
      return { ok: false, code: 'UNKNOWN_EXTERNAL_RECEIPT', message: 'External result is unknown' };
    }
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated interruption before evidence');
    }
    if (!this.writes.includes(input.operationId)) {
      this.writes.push(input.operationId);
    }
    return {
      ok: true,
      status: this.calls === 1 ? 'accepted' : 'recovered',
      workItemRevision: input.expectedWorkItemRevision + 1,
      evidenceRevision: input.expectedWorkItemRevision + 2,
    };
  }
}

function deps(
  overrides: Partial<OntologyCrossPackageServiceDeps> = {}
): OntologyCrossPackageServiceDeps {
  return {
    projectAccess: {
      async authorize() { return { authorized: true }; },
    },
    osdk: osdk(),
    taskBoard: taskBoard(),
    contractPort: {
      async load() {
        return null;
      },
      async verifyIntegrity() {
        return { valid: true };
      },
    },
    executionPort: {
      async start() {
        throw new Error('execution start is not configured');
      },
      async inspect() {
        throw new Error('execution inspect is not configured');
      },
      async listWorkItemHandoffCandidates() {
        return [];
      },
      async handoffWorkItem() {
        throw new Error('work item handoff is not configured');
      },
    },
    workItemRecovery: new MemoryWorkItemRecovery(),
    taskPriority: {
      async updateProjectTaskPriority(input) {
        return {
          version: 1,
          projectId: input.projectId,
          sessionId: 'session-1',
          taskId: input.taskId,
          requestId: input.requestId,
          priority: input.priority,
          revisionBefore: input.expectedRevision,
          revisionAfter: input.expectedRevision + 1,
          cursorBefore: input.expectedCursor,
          cursorAfter: 'cursor-2',
          bridgeEpoch: input.bridgeEpoch,
          metadata: {
            version: 1,
            priority: input.priority,
            semanticRefs: [],
            inputVersions: [],
          },
          acceptedAt: instant.toISOString(),
        };
      },
    },
    ...overrides,
  };
}

describe('OntologyCrossPackageService approved task creation transport', () => {
  it('returns only safe summaries for valid, active published templates', async () => {
    const validContract = {
      ...body(),
      contractHash: `sha256:${'a'.repeat(64)}`,
    };
    const service = new OntologyCrossPackageService(deps({
      contractPort: {
        async load() { return null; },
        async verifyIntegrity() { return { valid: true }; },
      },
      contractCatalog: {
        async listProject() {
          return [
            { contract: validContract },
            { contract: { ...validContract, contractId: 'revoked-contract' }, revocation: {
              contractId: 'revoked-contract', revokedAt: instant.toISOString(), reason: 'superseded',
            } },
          ];
        },
      },
    }));

    const response = await service.invoke({
      contractVersion: '1', requestId: 'catalog-1', actorId: 'actor-1',
      projectId: validContract.projectId, type: 'list_approved_task_templates',
    });

    expect(response).toMatchObject({
      ok: true,
      data: { contracts: [{
        contractId: validContract.contractId,
        contractHash: validContract.contractHash,
        taskTemplates: validContract.semanticContext.taskTemplates,
      }] },
    });
    expect(JSON.stringify(response)).not.toContain('permissions');
    expect(JSON.stringify(response)).not.toContain('createdAt');
  });

  it('passes an exact create request and preserves every DesignGap', async () => {
    const designGap = {
      code: 'REQUIRED_SEMANTIC_OBJECT_MISSING', severity: 'error' as const,
      scope: 'contract' as const, path: 'semanticInputs.order', refId: 'order',
      message: '缺少订单', remediation: '绑定订单事实',
    };
    const create = vi.fn(async () => ({ ok: false as const, gaps: [designGap] }));
    const service = new OntologyCrossPackageService(deps({ taskCreation: { create } }));
    const request: OntologyCrossPackageRequest = {
      contractVersion: '1', requestId: 'create-1', actorId: 'actor-1', projectId: 'project-1',
      type: 'create_approved_project_task', solutionId: 'solution-1', solutionVersion: '1',
      contractId: 'contract-1', contractHash: `sha256:${'b'.repeat(64)}`,
      taskTemplateId: 'template-1', objective: '处理订单', semanticInputs: [],
    };

    const response = await service.invoke(request);

    expect(create).toHaveBeenCalledWith({
      projectId: 'project-1', requestId: 'create-1', solutionId: 'solution-1',
      solutionVersion: '1', contractId: 'contract-1', contractHash: request.contractHash,
      taskTemplateId: 'template-1', objective: '处理订单', semanticInputs: [],
    });
    expect(response).toEqual({
      ok: false,
      requestId: 'create-1',
      error: {
        category: 'validation', code: 'PROJECT_TASK_DESIGN_GAP', retryable: false,
        remediation: 'Resolve the reported solution design gaps before creating the task.',
        issues: [{ code: designGap.code, message: designGap.message, field: designGap.path }],
        designGaps: [designGap],
      },
    });
  });
});

class MemoryTaskSource implements ProjectTaskSource {
  private record: ProjectTaskRecord;

  constructor(record: ProjectTaskRecord) {
    this.record = record;
  }

  attachRun(runId: string): void {
    this.record = { ...this.record, runId };
  }

  async list(input: { projectId: string }) {
    return {
      items: this.record.projectId === input.projectId ? [this.record] : [],
    };
  }

  async get(projectId: string, taskId: string) {
    return this.record.projectId === projectId && this.record.taskId === taskId
      ? this.record
      : null;
  }

  async control(input: { action: 'pause' | 'resume' | 'retry' | 'cancel' }) {
    const task = taskProjection(this.record.task.revision + 1);
    if (input.action === 'pause') {
      task.status = 'blocked';
    } else if (input.action === 'cancel') {
      task.status = 'cancelled';
    }
    this.record = { ...this.record, task };
    return this.record;
  }
}

function seedFact(): CanonicalFactRecord {
  return {
    ref: { ...rawFact, factId: 'raw-1', factVersion: '1' },
    value: { order: 'confirmed' },
    source: { sourceType: 'runtime', sourceId: 'seed' },
    operationId: 'seed',
    revision: 0,
    acceptedAt: instant,
  };
}

function actionRequest(
  overrides: Partial<Extract<OntologyCrossPackageRequest, { type: 'submit_action' }>> = {}
): Extract<OntologyCrossPackageRequest, { type: 'submit_action' }> {
  return {
    contractVersion: '1',
    requestId: 'request-1',
    actorId: 'actor-1',
    projectId: 'project-1',
    type: 'submit_action',
    ontologyId: 'orders',
    ontologyVersion: '3',
    operationId: 'operation-1',
    actionId: 'prepare-order',
    conceptId: 'order',
    permissions: ['order.prepare'],
    inputFactRefs: [seedFact().ref],
    outputs: [{
      factId: 'ready-1',
      factTypeId: readyFact.factTypeId,
      value: { prepared: true },
      source: { sourceType: 'runtime', sourceId: 'run-1' },
    }],
    expectedRevision: 0,
    runId: 'run-1',
    workItemId: 'run-1:prepare',
    attemptId: 'attempt-1',
    leaseEpoch: 1,
    expectedWorkItemRevision: 1,
    ...overrides,
  };
}

function startRequest(
  contractId: string,
  contractHash: string,
  overrides: Partial<Extract<OntologyCrossPackageRequest, { type: 'start_bound_task' }>> = {}
): Extract<OntologyCrossPackageRequest, { type: 'start_bound_task' }> {
  return {
    contractVersion: '1',
    requestId: 'start-1',
    actorId: 'actor-1',
    projectId: 'project-1',
    type: 'start_bound_task',
    ontologyId: 'orders',
    ontologyVersion: '3',
    solutionId: 'orders-solution',
    solutionVersion: '1.0',
    executionContractId: contractId,
    contractHash,
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    taskRevision: 1,
    inputRefs: ['raw-1'],
    ...overrides,
  };
}

function handoffContractBody() {
  const source = body();
  const primary = source.agents[0]!;
  const reviewer = { ...structuredClone(primary), agentId: 'reviewer' };
  return {
    ...source,
    agents: [primary, reviewer],
    semanticContext: {
      ...source.semanticContext,
      taskTemplates: source.semanticContext.taskTemplates.map((template) => ({
        ...template,
        candidateAgentIds: [primary.agentId, reviewer.agentId],
      })),
    },
  };
}

function authoritativeTask(): ProjectTaskSummary {
  return {
    projectId: 'project-1',
    taskId: 'task-1',
    title: 'Task 1',
    status: 'review',
    revision: 7,
    progress: 100,
    blockerCount: 1,
    evidenceCount: 0,
    actions: [],
    runtimeStatus: 'running',
    runtimeAvailability: 'controllable',
    assignedAgentIds: [],
    workItemCount: 1,
    artifactRefs: [],
    leaseEpoch: 4,
    transitions: [{ capability: 'approve_completion', targetStatus: 'done' }],
  };
}

describe('OntologyCrossPackageService', () => {
  it('reads semantic context with projections and task board', async () => {
    const service = new OntologyCrossPackageService(deps());
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'read_semantic_context',
      ontologyId: 'orders',
      ontologyVersion: '3',
    });
    expect(response).toMatchObject({
      ok: true,
      requestId: 'request-1',
      revision: 1,
      data: {
        ontologyId: 'orders',
        ontologyVersion: '3',
        projections: [projection],
        projectTasks: page,
      },
    });
  });

  it('returns unavailable when projections are missing', async () => {
    const service = new OntologyCrossPackageService(deps({
      osdk: {
        ...osdk(),
        async queryProjections() {
          return { ok: false, issues: [{ code: 'ONTOLOGY_NOT_FOUND', path: 'projectId', message: 'Missing', severity: 'error' }] };
        },
      },
    }));
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'read_semantic_context',
      ontologyId: 'orders',
      ontologyVersion: '3',
    });
    expect(response).toMatchObject({
      ok: false,
      error: { category: 'unavailable', code: 'ONTOLOGY_PROJECTION_UNAVAILABLE' },
    });
  });

  it('inspects a bound task through the public project board boundary', async () => {
    const service = new OntologyCrossPackageService(deps());
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'inspect_bound_task',
      taskId: 'task-1',
    });
    expect(response).toMatchObject({
      ok: true,
      revision: 1,
      data: { taskId: 'task-1', task: { revision: 1 } },
    });
  });

  it('lists project tasks without requiring an ontology version', async () => {
    let listInput: unknown;
    const service = new OntologyCrossPackageService(deps({
      taskBoard: {
        ...taskBoard(),
        async listProjectTasks(input) {
          listInput = input;
          return page;
        },
      },
    }));

    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'list_project_tasks',
      cursor: 'cursor-1',
      limit: 20,
    });

    expect(listInput).toEqual({ projectId: 'project-1', cursor: 'cursor-1', limit: 20 });
    expect(response).toMatchObject({
      ok: true,
      requestId: 'request-1',
      revision: 1,
      data: page,
    });
  });

  it('controls a bound task through the public project board boundary', async () => {
    const service = new OntologyCrossPackageService(deps());
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'request-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'control_bound_task',
      taskId: 'task-1',
      action: 'pause',
      expectedRevision: 1,
    });
    expect(response).toMatchObject({
      ok: true,
      revision: 2,
      data: { taskId: 'task-1', status: 'blocked' },
    });
  });

  it('preserves stable recovery conflict and unavailable errors across the public boundary', async () => {
    const request = {
      contractVersion: '1' as const,
      requestId: 'recovery-control-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'control_bound_task' as const,
      taskId: 'task-1',
      action: 'resume' as const,
      expectedRevision: 1,
    };
    const stale = new OntologyCrossPackageService(deps({
      taskBoard: {
        ...taskBoard(),
        async requestProjectTaskAction() {
          throw new ProjectTaskRuntimeRecoveryConflictError('stale recovery authority');
        },
      },
    }));
    const unavailable = new OntologyCrossPackageService(deps({
      taskBoard: {
        ...taskBoard(),
        async requestProjectTaskAction() {
          throw new ProjectTaskSourceUnavailableError(new Error('SESSION_NOT_FOUND'));
        },
      },
    }));

    await expect(stale.invoke(request)).resolves.toMatchObject({
      ok: false,
      error: {
        category: 'conflict',
        code: 'PROJECT_TASK_RUNTIME_STALE',
        retryable: true,
        issues: [{
          code: 'PROJECT_TASK_RUNTIME_STALE',
          field: 'taskId',
        }],
      },
    });
    await expect(unavailable.invoke(request)).resolves.toMatchObject({
      ok: false,
      error: {
        category: 'unavailable',
        code: 'PROJECT_TASK_SOURCE_UNAVAILABLE',
        retryable: true,
        issues: [{
          code: 'PROJECT_TASK_SOURCE_UNAVAILABLE',
          field: 'taskId',
        }],
      },
    });
  });


  it('passes target transition intent and CAS fields to the task board unchanged', async () => {
    let received: unknown;
    const service = new OntologyCrossPackageService(deps({
      taskBoard: {
        ...taskBoard(),
        async requestProjectTaskTransition(input) {
          received = input;
          return taskBoard().requestProjectTaskTransition(input);
        },
      },
    }));
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'transition-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'transition_project_task',
      taskId: 'task-1',
      targetStatus: 'review',
      expectedRevision: 1,
      expectedLeaseEpoch: 4,
      reason: 'Ready for review',
    });

    expect(received).toEqual({
      projectId: 'project-1',
      taskId: 'task-1',
      targetStatus: 'review',
      requestId: 'transition-1',
      expectedRevision: 1,
      expectedLeaseEpoch: 4,
      reason: 'Ready for review',
    });
    expect(response).toMatchObject({ ok: true, revision: 2, data: { status: 'review' } });
  });

  it('preserves stable transition conflicts, authoritative state, and evidence gaps', async () => {
    const authoritative = authoritativeTask();
    const gap = {
      kind: 'criterion_evidence' as const,
      id: 'criterion-1',
      message: 'Criterion Evidence is missing',
    };
    const rejectedService = new OntologyCrossPackageService(deps({
      taskBoard: {
        ...taskBoard(),
        async requestProjectTaskTransition() {
          throw new ProjectTaskTransitionRejectedError(
            'EVIDENCE_GATE_FAILED',
            'Task completion Evidence Gate failed',
            authoritative,
            [gap],
          );
        },
      },
    }));
    const staleService = new OntologyCrossPackageService(deps({
      taskBoard: {
        ...taskBoard(),
        async requestProjectTaskTransition() {
          throw new ProjectTaskRevisionConflictError('stale revision', authoritative);
        },
      },
    }));
    const request = {
      contractVersion: '1' as const,
      requestId: 'transition-2',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'transition_project_task' as const,
      taskId: 'task-1',
      targetStatus: 'done' as const,
      expectedRevision: 7,
    };

    await expect(rejectedService.invoke(request)).resolves.toMatchObject({
      ok: false,
      error: {
        category: 'validation',
        code: 'EVIDENCE_GATE_FAILED',
        authoritative,
        gaps: [gap],
        issues: [{
          code: 'PROJECT_TASK_CRITERION_EVIDENCE_GAP',
          field: 'task.criterion_evidence.criterion-1',
        }],
      },
    });
    await expect(staleService.invoke(request)).resolves.toMatchObject({
      ok: false,
      error: {
        category: 'conflict',
        code: 'REVISION_CONFLICT',
        authoritative,
      },
    });
  });

  it('passes priority revision, cursor, and epoch to Task Runtime and returns authority', async () => {
    let received: unknown;
    const service = new OntologyCrossPackageService(deps({
      taskPriority: {
        async updateProjectTaskPriority(input) {
          received = input;
          return deps().taskPriority.updateProjectTaskPriority(input);
        },
      },
    }));
    const response = await service.invoke({
      contractVersion: '1',
      requestId: 'priority-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'update_project_task_priority',
      taskId: 'task-1',
      priority: 'urgent',
      expectedRevision: 1,
      expectedCursor: null,
      bridgeEpoch: 4,
    });

    expect(received).toEqual({
      projectId: 'project-1',
      taskId: 'task-1',
      requestId: 'priority-1',
      priority: 'urgent',
      expectedRevision: 1,
      expectedCursor: null,
      bridgeEpoch: 4,
    });
    expect(response).toMatchObject({
      ok: true,
      revision: 1,
      receiptRef: 'priority-1',
      data: {
        receipt: { priority: 'urgent', revisionBefore: 1, revisionAfter: 2 },
        task: { taskId: 'task-1' },
      },
    });
  });
});

describe('OntologyCrossPackageService mutations', () => {
  let root: string;
  let store: CanonicalOntologyStore;
  let osdkInstance: CanonicalOntologyOSDK;
  let recovery: MemoryWorkItemRecovery;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ontology-cross-package-'));
    store = new CanonicalOntologyStore(root);
    osdkInstance = new CanonicalOntologyOSDK(store);
    recovery = new MemoryWorkItemRecovery();
    await store.writeOntology('project-1', contractOntology());
    await store.appendFact('project-1', seedFact());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('submits an action idempotently and reconciles evidence once', async () => {
    const service = new OntologyCrossPackageService(deps({
      osdk: osdkInstance,
      workItemRecovery: recovery,
    }));
    const first = await service.invoke(actionRequest());
    const retry = await service.invoke(actionRequest());

    expect(first).toMatchObject({
      ok: true,
      requestId: 'request-1',
      revision: 2,
      receiptRef: 'operation-1',
      data: {
        operationId: 'operation-1',
        status: 'accepted',
        workItemRevision: 2,
        evidenceRevision: 3,
      },
    });
    expect(retry).toEqual(first);
    expect(recovery.calls).toBe(2);
    expect(recovery.writes).toEqual(['operation-1']);
    expect((await store.readFacts('project-1')).filter(({ operationId }) => operationId === 'operation-1')).toHaveLength(1);
    expect((await store.readOperations('project-1')).map(({ status }) => status)).toEqual(['intent', 'accepted']);
  });

  it('rejects reuse of an operation ID with different content', async () => {
    const service = new OntologyCrossPackageService(deps({
      osdk: osdkInstance,
      workItemRecovery: recovery,
    }));
    await service.invoke(actionRequest());
    const conflict = await service.invoke(actionRequest({
      outputs: [{
        factId: 'ready-2',
        factTypeId: readyFact.factTypeId,
        value: { prepared: false },
        source: { sourceType: 'runtime', sourceId: 'run-1' },
      }],
    }));

    expect(conflict).toMatchObject({
      ok: false,
      error: { category: 'conflict', code: 'OPERATION_CONFLICT', retryable: true },
    });
    expect(recovery.writes).toEqual(['operation-1']);
  });

  it('recovers an accepted action after an interruption before evidence', async () => {
    const service = new OntologyCrossPackageService(deps({
      osdk: osdkInstance,
      workItemRecovery: recovery,
    }));
    recovery.failOnce();
    await expect(service.invoke(actionRequest())).rejects.toThrow('simulated interruption before evidence');

    const recovered = await service.invoke(actionRequest());
    expect(recovered).toMatchObject({ ok: true, receiptRef: 'operation-1' });
    expect(recovery.writes).toEqual(['operation-1']);
    expect((await store.readFacts('project-1')).filter(({ operationId }) => operationId === 'operation-1')).toHaveLength(1);
    expect((await store.readOperations('project-1')).map(({ status }) => status)).toEqual(['intent', 'accepted']);
  });

  it('rejects a stale lease epoch without writing evidence', async () => {
    recovery.rejectStaleLease();
    const service = new OntologyCrossPackageService(deps({
      osdk: osdkInstance,
      workItemRecovery: recovery,
    }));
    const response = await service.invoke(actionRequest());
    expect(response).toMatchObject({
      ok: false,
      error: { category: 'conflict', code: 'OLD_LEASE_EPOCH', retryable: false },
    });
    expect(recovery.writes).toEqual([]);
  });

  it('requires manual reconciliation for an unknown external receipt', async () => {
    recovery.returnUnknownReceipt();
    const service = new OntologyCrossPackageService(deps({
      osdk: osdkInstance,
      workItemRecovery: recovery,
    }));
    const response = await service.invoke(actionRequest());
    expect(response).toMatchObject({
      ok: false,
      error: {
        category: 'unavailable',
        code: 'MANUAL_RECONCILIATION_REQUIRED',
        retryable: false,
      },
    });
    expect(recovery.writes).toEqual([]);
  });
});

describe('OntologyCrossPackageService bound task starts', () => {
  let root: string;
  let contractStore: SolutionExecutionContractStore;
  let execution: CollaborationExecutionStore;
  let source: MemoryTaskSource;
  let board: ProjectTaskBoardService;
  let contractId: string;
  let contractHash: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ontology-cross-package-start-'));
    contractStore = new SolutionExecutionContractStore(root);
    const publication = await contractStore.publishCompiled(
      contractOntology(),
      'confirmed',
      handoffContractBody(),
    );
    expect(publication.ok).toBe(true);
    if (!publication.ok) throw new Error('Fixture contract must publish');
    contractId = publication.published.contract.contractId;
    contractHash = publication.published.contract.contractHash;
    execution = new CollaborationExecutionStore(contractStore, root);
    source = new MemoryTaskSource({
      projectId: 'project-1',
      taskId: 'task-1',
      updatedAt: instant.toISOString(),
      task: taskProjection(),
    });
    board = new ProjectTaskBoardService(source, execution);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function service(): OntologyCrossPackageService {
    return new OntologyCrossPackageService(deps({
      contractPort: contractStore,
      executionPort: execution,
      taskBoard: board,
    }));
  }

  it('starts a run from the exact contract and replays the same request', async () => {
    const instance = service();
    const first = await instance.invoke(startRequest(contractId, contractHash));
    const retry = await instance.invoke(startRequest(contractId, contractHash));

    expect(first).toMatchObject({
      ok: true,
      revision: 1,
      data: { status: 'running', workItemCount: 2 },
    });
    expect(retry).toEqual(first);
    const conflict = await instance.invoke(startRequest(contractId, contractHash, {
      inputRefs: ['other-input'],
    }));
    expect(conflict).toMatchObject({
      ok: false,
      error: { category: 'conflict', code: 'REQUEST_ID_CONFLICT' },
    });
  });

  it('returns the existing run after a restart-like projection reload', async () => {
    const first = await service().invoke(startRequest(contractId, contractHash));
    if (!first.ok) throw new Error('Start request must succeed');
    const runId = first.data.runId;
    source.attachRun(runId);

    const restarted = service().invoke(startRequest(contractId, contractHash));
    await expect(restarted).resolves.toMatchObject({
      ok: true,
      receiptRef: runId,
      data: { runId, status: 'running', workItemCount: 2 },
    });
  });

  it('fails closed before starting when the contract hash is wrong', async () => {
    const response = await service().invoke(startRequest(contractId, 'sha256:wrong'));
    expect(response).toMatchObject({
      ok: false,
      error: { category: 'validation', code: 'CONTRACT_SCOPE_MISMATCH' },
    });
  });

  it('fails closed when the parent task revision is stale', async () => {
    const response = await service().invoke(startRequest(contractId, contractHash, {
      taskRevision: 2,
    }));
    expect(response).toMatchObject({
      ok: false,
      error: { category: 'conflict', code: 'TASK_REVISION_CONFLICT', retryable: true },
    });
  });

  it('passes frozen handoff candidates and both Run/WorkItem CAS scopes', async () => {
    const instance = service();
    const started = await instance.invoke(startRequest(contractId, contractHash));
    if (!started.ok) throw new Error('Start request must succeed');
    const runId = (started.data as { runId: string }).runId;
    source.attachRun(runId);
    const run = await execution.inspect(runId);
    const item = run.workItems[0]!;

    const candidates = await instance.invoke({
      contractVersion: '1',
      requestId: 'candidates-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'list_work_item_handoff_candidates',
      runId,
      workItemId: item.id,
    });
    expect(candidates).toMatchObject({
      ok: true,
      data: {
        candidates: expect.arrayContaining([
          expect.objectContaining({ agentId: 'reviewer' }),
        ]),
        authority: {
          runRevision: run.revision,
          workItemRevision: item.revision,
          leaseEpoch: item.leaseEpoch,
          assignedAgentId: item.assignedAgentId,
        },
      },
    });

    const handed = await instance.invoke({
      contractVersion: '1',
      requestId: 'handoff-1',
      actorId: 'actor-1',
      projectId: 'project-1',
      type: 'handoff_work_item',
      runId,
      workItemId: item.id,
      targetAgentId: 'reviewer',
      expectedRunRevision: run.revision,
      expectedWorkItemRevision: item.revision,
      expectedLeaseEpoch: item.leaseEpoch,
    });
    expect(handed).toMatchObject({
      ok: true,
      receiptRef: expect.any(String),
      data: {
        receipt: {
          assignedAgentId: 'reviewer',
          runRevisionBefore: run.revision,
          workItemRevisionBefore: item.revision,
          leaseEpochBefore: item.leaseEpoch,
          leaseEpochAfter: item.leaseEpoch + 1,
        },
        task: { assignedAgentIds: expect.arrayContaining(['reviewer']) },
      },
    });
  });
});
