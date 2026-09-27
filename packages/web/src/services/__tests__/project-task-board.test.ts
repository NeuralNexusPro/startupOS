import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  controlProjectTask,
  getProjectTask,
  listProjectTasks,
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

    expect(invoke).not.toHaveBeenCalled();
  });
});
