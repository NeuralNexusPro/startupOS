import { describe, expect, it, vi } from 'vitest';

import type {
  CollaborationRunSnapshot,
  CollaborationWorkItem,
} from '../../../../modules/collaboration-runtime/facade';
import type {
  PublishedSolutionExecutionContract,
  SolutionExecutionContract,
} from '../../solution';
import type { ApprovedProjectTaskCreationReceipt } from '../project-task-creation';
import { ProjectSupervisorWorkItemRuntime } from '../supervisor-workitem-runtime';

const HASH = `sha256:${'a'.repeat(64)}`;

function contract(templateIds: readonly string[] = ['template-1']): SolutionExecutionContract {
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
      nodes: templateIds.map((id, index) => ({
        id: `node-${index + 1}`,
        kind: 'agent' as const,
        contractRef: `agent-${index + 1}`,
        requiresVerification: true,
      })),
      edges: [],
      externalInputs: [],
    },
    agents: templateIds.map((_id, index) => ({
      agentId: `agent-${index + 1}`,
      ontology: { ontologyId: 'ontology-1', ontologyVersion: '1' },
      inputs: [],
      outputs: [],
      actions: [{
        actionId: `action-${index + 1}`,
        concept: { ontologyId: 'ontology-1', ontologyVersion: '1', conceptId: 'concept-1' },
      }],
      permissions: [],
    })),
    skills: [],
    semanticContext: {
      ontology: { ontologyId: 'ontology-1', ontologyVersion: '1' },
      sourceRefs: [],
      objectSlots: [],
      factPolicies: [],
      allowedActionIds: templateIds.map((_id, index) => `action-${index + 1}`),
      taskTemplates: templateIds.map((id, index) => ({
        id,
        designNodeId: `node-${index + 1}`,
        objective: `目标 ${index + 1}`,
        candidateAgentIds: [`agent-${index + 1}`],
        candidateSkillIds: [],
      })),
    },
    verification: templateIds.map((_id, index) => ({
      id: `verify-${index + 1}`,
      nodeId: `node-${index + 1}`,
      verifierRef: 'originos.artifact-output@1.0.0',
      evidenceSchemaRef: 'originos.artifact-evidence@1.0.0',
    })),
    hitl: [],
    permissions: { allowed: [] },
    budget: { maxAttempts: 2, maxDurationMs: 60_000, maxTokens: 10_000 },
    createdAt: '2026-10-16T00:00:00.000Z',
  };
}

function workItem(
  run: CollaborationRunSnapshot['binding'],
  id: string,
  designNodeId: string,
  dependsOn: readonly string[] = [],
): CollaborationWorkItem {
  return {
    id,
    binding: run,
    designNodeId,
    assignedAgentId: designNodeId.replace('node', 'agent'),
    skillRefs: [],
    dependsOn,
    inputRefs: [],
    outputRefs: [],
    status: 'pending',
    revision: 0,
    leaseEpoch: 0,
    attempts: [],
  };
}

function run(frozen = contract()): CollaborationRunSnapshot {
  const binding = {
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    parentSessionId: 'session-1',
    runId: 'run-1',
    solutionId: frozen.solutionId,
    solutionVersion: frozen.solutionVersion,
    executionContractId: frozen.contractId,
    contractHash: frozen.contractHash,
    taskRevision: 1,
  };
  return {
    runId: 'run-1',
    projectId: 'project-1',
    binding,
    contract: frozen,
    workItems: [workItem(binding, 'wi-1', 'node-1')],
    status: 'running',
    revision: 1,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
  };
}

function receipt(snapshot = run()): ApprovedProjectTaskCreationReceipt {
  return {
    requestId: 'request-1',
    inputHash: HASH,
    task: {
      projectId: 'project-1', taskId: 'task-1', title: '目标 1', status: 'active', revision: 1,
      progress: 0, currentStep: 'step-1', blockerCount: 0, evidenceCount: 0,
      actions: ['stop'], runtimeStatus: 'running', runtimeAvailability: 'controllable',
      assignedAgentIds: [], workItemCount: 0, artifactRefs: [], transitions: [],
      task: {
        version: 1, taskId: 'task-1', title: '目标 1', objective: '目标 1', status: 'active',
        progress: 0, currentStep: 'step-1', steps: [], criteria: [], blockers: [], warnings: [],
        evidenceCount: 0, actions: ['stop'], revision: 1, cursor: null,
        stateHash: 'state-1', truncated: false,
      },
      workItems: [],
    },
    run: snapshot,
    binding: snapshot.binding,
    contractId: snapshot.contract.contractId,
    contractHash: snapshot.contract.contractHash,
    taskTemplateId: 'template-1',
  };
}

function input(objective = '目标 1') {
  return {
    projectId: 'project-1',
    collaborationSessionId: 'cs-1',
    requestId: 'request-1',
    objective,
  };
}

describe('ProjectSupervisorWorkItemRuntime', () => {
  it('returns a design gap instead of falling back to Blackboard when no template exists', async () => {
    const runtime = new ProjectSupervisorWorkItemRuntime({
      contractCatalog: { listProject: async () => [] },
      contractPort: { verifyIntegrity: async () => ({ valid: true }) },
      taskCreation: { create: vi.fn() },
      executionPort: { executeWorkItem: vi.fn(), inspect: vi.fn(), recover: vi.fn() },
    });

    const result = await runtime.bind(input());

    expect(result).toEqual({ ok: false, gaps: [expect.objectContaining({
      code: 'SUPERVISOR_TASK_TEMPLATE_NOT_AVAILABLE',
    })] });
  });

  it('does not guess between multiple task templates', async () => {
    const frozen = contract(['template-1', 'template-2']);
    const runtime = new ProjectSupervisorWorkItemRuntime({
      contractCatalog: { listProject: async () => [{ contract: frozen }] },
      contractPort: { verifyIntegrity: async () => ({ valid: true }) },
      taskCreation: { create: vi.fn() },
      executionPort: { executeWorkItem: vi.fn(), inspect: vi.fn(), recover: vi.fn() },
    });

    const result = await runtime.bind(input('一个不明确的新目标'));

    expect(result).toEqual({ ok: false, gaps: [expect.objectContaining({
      code: 'SUPERVISOR_TASK_TEMPLATE_AMBIGUOUS',
      refId: 'template-1,template-2',
    })] });
  });

  it('delegates the stable requestId to idempotent parent Task and Run creation', async () => {
    const snapshot = run();
    const create = vi.fn(async () => ({ ok: true as const, receipt: receipt(snapshot) }));
    const runtime = new ProjectSupervisorWorkItemRuntime({
      contractCatalog: { listProject: async () => [{ contract: snapshot.contract }] },
      contractPort: { verifyIntegrity: async () => ({ valid: true }) },
      taskCreation: { create },
      executionPort: { executeWorkItem: vi.fn(), inspect: vi.fn(), recover: vi.fn() },
    });

    const first = await runtime.bind(input());
    const second = await runtime.bind(input());

    expect(first).toEqual(second);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({ requestId: 'request-1' }));
    expect(first).toEqual({ ok: true, receipt: expect.objectContaining({
      parentTaskId: 'task-1', parentStepId: 'step-1', runId: 'run-1',
    }) });
  });

  it('advances dependencies through the formal runtime without a Supervisor verifier call', async () => {
    const frozen = contract(['template-1', 'template-2']);
    const initial = run(frozen);
    const binding = initial.binding;
    const first = workItem(binding, 'wi-1', 'node-1');
    const second = workItem(binding, 'wi-2', 'node-2', ['wi-1']);
    const pending = { ...initial, workItems: [first, second] };
    const afterFirst = {
      ...pending,
      revision: 2,
      workItems: [{ ...first, status: 'completed' as const }, second],
    };
    const completed = {
      ...afterFirst,
      revision: 3,
      terminalStatus: 'completed' as const,
      workItems: [afterFirst.workItems[0]!, { ...second, status: 'completed' as const }],
    };
    const executeWorkItem = vi.fn()
      .mockResolvedValueOnce(afterFirst)
      .mockResolvedValueOnce(completed);
    const runtime = new ProjectSupervisorWorkItemRuntime({
      contractCatalog: { listProject: async () => [] },
      contractPort: { verifyIntegrity: async () => ({ valid: true }) },
      taskCreation: { create: vi.fn() },
      executionPort: {
        recover: vi.fn(async () => pending),
        inspect: vi.fn()
          .mockResolvedValueOnce(afterFirst)
          .mockResolvedValueOnce(completed),
        executeWorkItem,
      },
    });
    const creation = receipt(pending);
    const supervisorBinding = {
      projectId: 'project-1', collaborationSessionId: 'cs-1', requestId: 'request-1',
      parentTaskId: 'task-1', parentStepId: 'step-1', parentSessionId: 'session-1',
      runId: 'run-1', solutionId: 'solution-1', solutionVersion: '1',
      contractId: 'contract-1', contractHash: HASH, taskTemplateId: 'template-1',
      snapshot: creation.run,
    };

    const result = await runtime.advance({ binding: supervisorBinding, requestId: 'request-1' });

    expect(result.terminalStatus).toBe('completed');
    expect(executeWorkItem).toHaveBeenCalledTimes(2);
    expect(executeWorkItem.mock.calls.map(([call]) => call.workItemId)).toEqual(['wi-1', 'wi-2']);
  });

  it('executes independent WorkItems in the same topology wave concurrently', async () => {
    const frozen = contract(['template-1', 'template-2']);
    const initial = run(frozen);
    const first = workItem(initial.binding, 'wi-1', 'node-1');
    const second = workItem(initial.binding, 'wi-2', 'node-2');
    const pending = { ...initial, workItems: [first, second] };
    const completed = {
      ...pending,
      revision: 3,
      terminalStatus: 'completed' as const,
      workItems: [
        { ...first, status: 'completed' as const },
        { ...second, status: 'completed' as const },
      ],
    };
    let inFlight = 0;
    let maxInFlight = 0;
    const executeWorkItem = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return completed;
    });
    const runtime = new ProjectSupervisorWorkItemRuntime({
      contractCatalog: { listProject: async () => [] },
      contractPort: { verifyIntegrity: async () => ({ valid: true }) },
      taskCreation: { create: vi.fn() },
      executionPort: {
        recover: vi.fn(async () => pending),
        inspect: vi.fn(async () => completed),
        executeWorkItem,
      },
    });
    const creation = receipt(pending);
    const supervisorBinding = {
      projectId: 'project-1', collaborationSessionId: 'cs-1', requestId: 'request-1',
      parentTaskId: 'task-1', parentStepId: 'step-1', parentSessionId: 'session-1',
      runId: 'run-1', solutionId: 'solution-1', solutionVersion: '1',
      contractId: 'contract-1', contractHash: HASH, taskTemplateId: 'template-1',
      snapshot: creation.run,
    };

    const result = await runtime.advance({ binding: supervisorBinding, requestId: 'request-1' });

    expect(result.terminalStatus).toBe('completed');
    expect(maxInFlight).toBe(2);
  });
});
