import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  controlProjectTask,
  createProjectTaskFromTemplate,
  getProjectTask,
  listApprovedTaskTemplates,
  handoffWorkItem,
  listProjectTasks,
  listWorkItemHandoffCandidates,
  requestProjectTaskTransition,
  updateProjectTaskPriority,
} from '../project-task-board';

vi.mock('@originos/core/lib/integrations/electron/env', () => ({
  isElectron: vi.fn(() => true),
}));

const invoke = vi.fn();

function installBridge(): void {
  (window as Window & { electron?: unknown }).electron = {
    isElectron: true,
    ontologyCrossPackage: { invoke },
  };
}

function page() {
  return { items: [], revision: 4 };
}

function detail() {
  return { taskId: 'task-1', revision: 7, workItems: [] };
}

function response(data: unknown) {
  return { success: true, data, timestamp: '2026-09-24T00:00:00.000Z' };
}

describe('project task board service', () => {
  afterEach(() => {
    invoke.mockReset();
    delete (window as Window & { electron?: unknown }).electron;
  });

  it('sends a project-scoped list request through the desktop bridge', async () => {
    installBridge();
    invoke.mockResolvedValue(response({ ok: true, requestId: 'list-1', data: page(), revision: 4 }));

    await expect(listProjectTasks({
      projectId: 'project-1', requestId: 'list-1', cursor: 'cursor-1', limit: 99,
    })).resolves.toMatchObject({ ok: true, data: page() });

    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: '1', projectId: 'project-1', requestId: 'list-1',
      type: 'list_project_tasks', cursor: 'cursor-1', limit: 50,
    }));
  });

  it('sends task detail and control requests with the required CAS fields', async () => {
    installBridge();
    invoke
      .mockResolvedValueOnce(response({ ok: true, requestId: 'inspect-1', data: detail(), revision: 7 }))
      .mockResolvedValueOnce(response({ ok: true, requestId: 'control-1', data: detail(), revision: 8 }));

    await getProjectTask({ projectId: 'project-1', taskId: 'task-1', requestId: 'inspect-1' });
    await controlProjectTask({
      projectId: 'project-1', taskId: 'task-1', action: 'pause', requestId: 'control-1', expectedRevision: 7,
    });

    expect(invoke).toHaveBeenNthCalledWith(1, expect.objectContaining({
      projectId: 'project-1', requestId: 'inspect-1', type: 'inspect_bound_task', taskId: 'task-1',
    }));
    expect(invoke).toHaveBeenNthCalledWith(2, expect.objectContaining({
      projectId: 'project-1', requestId: 'control-1', type: 'control_bound_task', taskId: 'task-1', expectedRevision: 7,
    }));
  });

  it('lists approved templates and creates from an exact frozen template binding', async () => {
    installBridge();
    const catalog = { contracts: [{
      solutionId: 'solution-1', solutionVersion: '1', contractId: 'contract-1',
      contractHash: `sha256:${'a'.repeat(64)}`, ontologyId: 'orders', ontologyVersion: '1',
      objectSlots: [], factPolicies: [], taskTemplates: [],
    }] };
    const created = {
      requestId: 'create-1', inputHash: `sha256:${'b'.repeat(64)}`,
      task: detail(), run: { runId: 'run-1' },
      binding: { parentTaskId: 'task-1', runId: 'run-1' },
      contractId: 'contract-1', contractHash: `sha256:${'a'.repeat(64)}`,
      taskTemplateId: 'template-1',
    };
    invoke
      .mockResolvedValueOnce(response({ ok: true, requestId: 'catalog-1', data: catalog }))
      .mockResolvedValueOnce(response({ ok: true, requestId: 'create-1', data: created, revision: 7 }));

    await expect(listApprovedTaskTemplates({
      projectId: 'project-1', requestId: 'catalog-1',
    })).resolves.toMatchObject({ ok: true, data: catalog });
    await expect(createProjectTaskFromTemplate({
      projectId: 'project-1', requestId: 'create-1', solutionId: 'solution-1',
      solutionVersion: '1', contractId: 'contract-1', contractHash: `sha256:${'a'.repeat(64)}`,
      taskTemplateId: 'template-1', objective: '处理订单', semanticInputs: [],
    })).resolves.toMatchObject({ ok: true, data: created, revision: 7 });

    expect(invoke).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'list_approved_task_templates', projectId: 'project-1', requestId: 'catalog-1',
    }));
    expect(invoke).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'create_approved_project_task', solutionId: 'solution-1',
      contractId: 'contract-1', taskTemplateId: 'template-1', semanticInputs: [],
    }));
  });

  it('preserves DesignGap from approved task creation without a local card', async () => {
    installBridge();
    const designGap = {
      code: 'TASK_TEMPLATE_NOT_FOUND', severity: 'error', scope: 'contract',
      path: 'taskTemplateId', message: '模板不存在', remediation: '返回方案设计',
    };
    invoke.mockResolvedValue(response({
      ok: false, requestId: 'create-2', error: {
        category: 'validation', code: 'PROJECT_TASK_DESIGN_GAP',
        issues: [{ code: designGap.code, message: designGap.message, field: designGap.path }],
        retryable: false, remediation: designGap.remediation, designGaps: [designGap],
      },
    }));

    await expect(createProjectTaskFromTemplate({
      projectId: 'project-1', requestId: 'create-2', solutionId: 'solution-1',
      solutionVersion: '1', contractId: 'contract-1', contractHash: `sha256:${'a'.repeat(64)}`,
      taskTemplateId: 'missing', objective: '处理订单', semanticInputs: [],
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROJECT_TASK_DESIGN_GAP', designGaps: [designGap] },
    });
  });

  it('passes target transition intent and CAS fields unchanged', async () => {
    installBridge();
    invoke.mockResolvedValue(response({ ok: true, requestId: 'transition-1', data: detail(), revision: 8 }));

    await expect(requestProjectTaskTransition({
      projectId: 'project-1',
      taskId: 'task-1',
      targetStatus: 'review',
      requestId: 'transition-1',
      expectedRevision: 7,
      expectedLeaseEpoch: 3,
      reason: 'Ready for review',
    })).resolves.toMatchObject({ ok: true, data: detail() });

    expect(invoke).toHaveBeenCalledWith({
      contractVersion: '1',
      actorId: 'project-task-board',
      projectId: 'project-1',
      taskId: 'task-1',
      type: 'transition_project_task',
      targetStatus: 'review',
      requestId: 'transition-1',
      expectedRevision: 7,
      expectedLeaseEpoch: 3,
      reason: 'Ready for review',
    });
  });

  it('preserves authoritative state and evidence gaps from a rejected transition', async () => {
    installBridge();
    const authoritative = {
      projectId: 'project-1', taskId: 'task-1', title: 'Task 1', status: 'review', revision: 7,
      progress: 100, blockerCount: 0, evidenceCount: 0, actions: [], runtimeStatus: 'running',
      runtimeAvailability: 'controllable', assignedAgentIds: [], workItemCount: 1, artifactRefs: [],
      transitions: [{ capability: 'approve_completion', targetStatus: 'done' }],
    };
    const gap = { kind: 'criterion_evidence', id: 'criterion-1', message: 'Evidence missing' };
    invoke.mockResolvedValue(response({
      ok: false,
      requestId: 'transition-2',
      error: {
        category: 'validation',
        code: 'EVIDENCE_GATE_FAILED',
        issues: [{ code: 'PROJECT_TASK_CRITERION_EVIDENCE_GAP', message: 'Evidence missing', field: 'task.criterion_evidence.criterion-1' }],
        retryable: false,
        remediation: '补充验收证据',
        authoritative,
        gaps: [gap],
      },
    }));

    await expect(requestProjectTaskTransition({
      projectId: 'project-1', taskId: 'task-1', targetStatus: 'done',
      requestId: 'transition-2', expectedRevision: 7,
    })).resolves.toMatchObject({
      ok: false,
      error: {
        kind: 'rejected',
        code: 'EVIDENCE_GATE_FAILED',
        authoritative,
        gaps: [gap],
      },
    });
  });

  it('maps unavailable, conflict, and rejection replies into structured errors', async () => {
    installBridge();
    invoke
      .mockResolvedValueOnce(response({
        ok: false, requestId: 'list-1', error: { category: 'unavailable', code: 'CAPABILITY_NOT_READY', issues: [], retryable: true, remediation: '稍后重试', },
      }))
      .mockResolvedValueOnce(response({
        ok: false, requestId: 'inspect-1', error: { category: 'conflict', code: 'REVISION_CONFLICT', issues: [], retryable: true, remediation: '刷新后重试', },
      }))
      .mockResolvedValueOnce(response({
        ok: false, requestId: 'control-1', error: { category: 'authorization', code: 'AUTHORIZATION_DENIED', issues: [], retryable: false, remediation: '没有权限', },
      }));

    await expect(listProjectTasks({ projectId: 'project-1', requestId: 'list-1' })).resolves.toMatchObject({ ok: false, error: { kind: 'unavailable', code: 'CAPABILITY_NOT_READY' } });
    await expect(getProjectTask({ projectId: 'project-1', taskId: 'task-1', requestId: 'inspect-1' })).resolves.toMatchObject({ ok: false, error: { kind: 'conflict', code: 'REVISION_CONFLICT' } });
    await expect(controlProjectTask({ projectId: 'project-1', taskId: 'task-1', action: 'cancel', requestId: 'control-1', expectedRevision: 7 })).resolves.toMatchObject({ ok: false, error: { kind: 'rejected', code: 'AUTHORIZATION_DENIED' } });
  });

  it('fails closed outside desktop and sends retry through the same controlled boundary', async () => {
    await expect(listProjectTasks({ projectId: 'project-1', requestId: 'list-1' })).resolves.toMatchObject({ ok: false, error: { kind: 'unavailable', code: 'DESKTOP_TASK_BOARD_UNAVAILABLE' } });
    installBridge();
    invoke.mockResolvedValue(response({ ok: true, requestId: 'retry-1', data: detail(), revision: 8 }));
    await expect(controlProjectTask({ projectId: 'project-1', taskId: 'task-1', action: 'retry', requestId: 'retry-1', expectedRevision: 7 })).resolves.toMatchObject({ ok: true, data: detail() });
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ action: 'retry', expectedRevision: 7 }));
  });

  it('rejects invalid requests before they cross the desktop boundary', async () => {
    installBridge();

    await expect(controlProjectTask({
      projectId: 'project-1', taskId: 'task-1', action: 'cancel', requestId: '', expectedRevision: -1,
    })).resolves.toMatchObject({ ok: false, error: { kind: 'rejected', code: 'TASK_BOARD_INVALID_REQUEST' } });
    await expect(requestProjectTaskTransition({
      projectId: 'project-1', taskId: 'task-1', targetStatus: 'done', requestId: 'transition-invalid',
      expectedRevision: 7, expectedLeaseEpoch: -1,
    })).resolves.toMatchObject({ ok: false, error: { kind: 'rejected', code: 'TASK_BOARD_INVALID_REQUEST' } });

    expect(invoke).not.toHaveBeenCalled();
  });

  it('passes priority and handoff CAS scopes without optimistic inference', async () => {
    installBridge();
    invoke
      .mockResolvedValueOnce(response({
        ok: true,
        requestId: 'priority-1',
        data: { receipt: { requestId: 'priority-1' }, task: detail() },
      }))
      .mockResolvedValueOnce(response({
        ok: true,
        requestId: 'candidates-1',
        data: {
          candidates: [{ agentId: 'agent-2', displayName: '审核员', permissions: ['review'] }],
          authority: { runRevision: 11, workItemRevision: 5, leaseEpoch: 3, assignedAgentId: 'agent-1' },
        },
      }))
      .mockResolvedValueOnce(response({
        ok: true,
        requestId: 'handoff-1',
        data: { receipt: { receiptId: 'receipt-1' }, task: detail() },
      }));

    await expect(updateProjectTaskPriority({
      projectId: 'project-1',
      taskId: 'task-1',
      requestId: 'priority-1',
      priority: 'urgent',
      expectedRevision: 7,
      expectedCursor: 'cursor-7',
      bridgeEpoch: 3,
    })).resolves.toMatchObject({ ok: true, data: { task: detail() } });
    await expect(listWorkItemHandoffCandidates({
      projectId: 'project-1',
      runId: 'run-1',
      workItemId: 'work-1',
      requestId: 'candidates-1',
    })).resolves.toMatchObject({ ok: true, data: { candidates: [{ agentId: 'agent-2' }] } });
    await expect(handoffWorkItem({
      projectId: 'project-1',
      runId: 'run-1',
      workItemId: 'work-1',
      requestId: 'handoff-1',
      targetAgentId: 'agent-2',
      expectedRunRevision: 11,
      expectedWorkItemRevision: 5,
      expectedLeaseEpoch: 3,
    })).resolves.toMatchObject({ ok: true, data: { task: detail() } });

    expect(invoke).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'update_project_task_priority',
      expectedRevision: 7,
      expectedCursor: 'cursor-7',
      bridgeEpoch: 3,
    }));
    expect(invoke).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'list_work_item_handoff_candidates', runId: 'run-1', workItemId: 'work-1',
    }));
    expect(invoke).toHaveBeenNthCalledWith(3, expect.objectContaining({
      type: 'handoff_work_item',
      targetAgentId: 'agent-2',
      expectedRunRevision: 11,
      expectedWorkItemRevision: 5,
      expectedLeaseEpoch: 3,
    }));
  });
});
