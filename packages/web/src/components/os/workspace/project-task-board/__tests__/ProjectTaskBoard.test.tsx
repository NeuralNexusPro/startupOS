import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectTaskBoard } from '../ProjectTaskBoard';
import type { ProjectTaskDetail, ProjectTaskPage } from '@originos/core/lib/features/project';

const service = vi.hoisted(() => ({
  listProjectTasks: vi.fn(),
  getProjectTask: vi.fn(),
  controlProjectTask: vi.fn(),
}));

vi.mock('@/services/project-task-board', () => ({
  listProjectTasks: service.listProjectTasks,
  getProjectTask: service.getProjectTask,
  controlProjectTask: service.controlProjectTask,
  createProjectTaskBoardRequestId: () => 'request-1',
}));

const page: ProjectTaskPage = {
  revision: 2,
  items: [
    { projectId: 'project-1', taskId: 'task-pending', title: '整理需求', status: 'pending', revision: 1, progress: 0, blockerCount: 0, evidenceCount: 0, actions: [], workItemCount: 0 },
    { projectId: 'project-1', taskId: 'task-active', title: '生成报告', status: 'active', revision: 2, progress: 45, currentStep: '写作', blockerCount: 0, evidenceCount: 0, actions: ['stop'], runId: 'run-1', workItemCount: 1 },
    { projectId: 'project-1', taskId: 'task-done', title: '已交付', status: 'done', revision: 3, progress: 100, blockerCount: 0, evidenceCount: 1, actions: [], workItemCount: 0 },
  ],
};

const detail = {
  ...page.items[1],
  task: {
    taskId: 'task-active', title: '生成报告', objective: '完成项目报告', status: 'active', progress: 45,
    steps: [], criteria: [], blockers: [], warnings: [], evidenceCount: 0, actions: ['stop'], revision: 2,
  },
  workItems: [{ id: 'work-1', status: 'running', assignedAgentId: 'writer', attempts: [], binding: {}, designNodeId: 'node-1', skillRefs: [], dependsOn: [], inputRefs: [], outputRefs: [], revision: 1, leaseEpoch: 1 }],
} as unknown as ProjectTaskDetail;

describe('ProjectTaskBoard', () => {
  beforeEach(() => {
    service.listProjectTasks.mockReset().mockResolvedValue({ ok: true, data: page });
    service.getProjectTask.mockReset().mockResolvedValue({ ok: true, data: detail });
    service.controlProjectTask.mockReset();
  });

  it('groups only the current project page and filters the rendered cards', async () => {
    render(<ProjectTaskBoard projectId="project-1" />);

    await screen.findByText('整理需求');
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(service.listProjectTasks).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', limit: 50 }));

    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    expect(screen.queryByText('整理需求')).not.toBeInTheDocument();
    expect(screen.getByText('生成报告')).toBeInTheDocument();
  });

  it('shows scoped WorkItems and keeps the authoritative detail after a rejected action', async () => {
    service.controlProjectTask.mockResolvedValue({ ok: false, error: { kind: 'conflict', code: 'REVISION_CONFLICT', message: '请刷新后重试', retryable: true, issues: [] } });
    render(<ProjectTaskBoard projectId="project-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));
    await screen.findByText('work-1 · running');
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));

    await screen.findByRole('alert');
    expect(screen.getByText('work-1 · running')).toBeInTheDocument();
    expect(service.controlProjectTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', taskId: 'task-active', expectedRevision: 2, action: 'pause' }));
  });

  it('runs each available task control through the keyboard shortcuts', async () => {
    const controllableDetail = {
      ...detail,
      actions: ['stop', 'resume', 'retry', 'cancel'],
      task: { ...detail.task, actions: ['stop', 'resume', 'retry', 'cancel'] },
    } as unknown as ProjectTaskDetail;
    service.getProjectTask.mockResolvedValue({ ok: true, data: controllableDetail });
    service.controlProjectTask.mockResolvedValue({ ok: false, error: { kind: 'conflict', code: 'REVISION_CONFLICT', message: '请刷新后重试', retryable: true, issues: [] } });
    render(<ProjectTaskBoard projectId="project-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));
    const toolbar = await screen.findByRole('toolbar', { name: '任务操作' });
    expect(screen.getByRole('button', { name: '暂停' })).toHaveAttribute('aria-keyshortcuts', 'Alt+P');

    for (const [key, action] of [['p', 'pause'], ['u', 'resume'], ['r', 'retry'], ['c', 'cancel']] as const) {
      fireEvent.keyDown(toolbar, { key, altKey: true });
      await waitFor(() => expect(service.controlProjectTask).toHaveBeenLastCalledWith(expect.objectContaining({
        projectId: 'project-1', taskId: 'task-active', expectedRevision: 2, action,
      })));
    }
  });

  it('shows a desktop-unavailable load state without inventing a task', async () => {
    service.listProjectTasks.mockResolvedValue({ ok: false, error: { kind: 'unavailable', code: 'DESKTOP_TASK_BOARD_UNAVAILABLE', message: '任务看板仅可在桌面应用中使用', retryable: false, issues: [] } });
    render(<ProjectTaskBoard projectId="project-1" />);

    await waitFor(() => expect(screen.getByText('无法加载项目任务')).toBeInTheDocument());
    expect(screen.queryByText('整理需求')).not.toBeInTheDocument();
  });
});
