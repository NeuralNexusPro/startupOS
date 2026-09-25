import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectTaskBoard } from '../ProjectTaskBoard';
import type {
  OntologyApprovedProjectTaskData,
  OntologyApprovedTaskTemplateCatalogData,
  ProjectTaskDetail,
  ProjectTaskPage,
  ProjectTaskSubscriptionEvent,
  ProjectTaskSubscriptionTermination,
} from '@originos/core/lib/features/project';

const service = vi.hoisted(() => ({
  listProjectTasks: vi.fn(),
  getProjectTask: vi.fn(),
  requestProjectTaskTransition: vi.fn(),
  updateProjectTaskPriority: vi.fn(),
  listWorkItemHandoffCandidates: vi.fn(),
  handoffWorkItem: vi.fn(),
  listApprovedTaskTemplates: vi.fn(),
  createProjectTaskFromTemplate: vi.fn(),
  subscribeProjectTaskBoard: vi.fn((
    _projectId: string,
    _listener: (
      message: ProjectTaskSubscriptionEvent | ProjectTaskSubscriptionTermination
    ) => void,
  ) => () => undefined),
}));

let subscriptionListener: ((
  message: ProjectTaskSubscriptionEvent | ProjectTaskSubscriptionTermination
) => void) | undefined;
const releaseSubscription = vi.fn();

vi.mock('@/services/project-task-board', () => ({
  listProjectTasks: service.listProjectTasks,
  getProjectTask: service.getProjectTask,
  requestProjectTaskTransition: service.requestProjectTaskTransition,
  updateProjectTaskPriority: service.updateProjectTaskPriority,
  listWorkItemHandoffCandidates: service.listWorkItemHandoffCandidates,
  handoffWorkItem: service.handoffWorkItem,
  listApprovedTaskTemplates: service.listApprovedTaskTemplates,
  createProjectTaskFromTemplate: service.createProjectTaskFromTemplate,
  subscribeProjectTaskBoard: service.subscribeProjectTaskBoard,
  createProjectTaskBoardRequestId: () => 'request-1',
}));

const page: ProjectTaskPage = {
  revision: 2,
  cursor: 'cursor-2',
  items: [
    { projectId: 'project-1', taskId: 'task-pending', title: '整理需求', status: 'pending', revision: 1, progress: 0, blockerCount: 0, evidenceCount: 0, actions: [], runtimeStatus: 'idle', runtimeAvailability: 'recovery_required', transitions: [], assignedAgentIds: [], workItemCount: 0, artifactRefs: [] },
    { projectId: 'project-1', taskId: 'task-active', title: '生成报告', status: 'active', revision: 2, progress: 45, currentStep: '写作', blockerCount: 0, evidenceCount: 0, actions: ['stop'], runId: 'run-1', runtimeStatus: 'running', runtimeAvailability: 'controllable', leaseEpoch: 7, transitions: [{ capability: 'pause', targetStatus: 'blocked' }, { capability: 'request_review', targetStatus: 'review' }], assignedAgentIds: ['writer'], workItemCount: 1, artifactRefs: ['artifact:report'], projectMetadata: { version: 1, priority: 'urgent', semanticRefs: ['concept:report'], inputVersions: [] } },
    { projectId: 'project-1', taskId: 'task-done', title: '已交付', status: 'done', revision: 3, progress: 100, blockerCount: 0, evidenceCount: 1, actions: [], runtimeStatus: 'completed', runtimeAvailability: 'recovery_required', transitions: [], assignedAgentIds: ['reviewer'], workItemCount: 0, artifactRefs: [] },
  ],
};

const binding = {
  parentTaskId: 'task-active',
  parentStepId: 'step-1',
  runId: 'run-1',
  solutionId: 'solution-1',
  solutionVersion: '1.0.0',
  executionContractId: 'contract-1',
  contractHash: 'hash-1',
  taskRevision: 2,
} as const;

const detail = {
  ...page.items[1],
  task: {
    taskId: 'task-active', title: '生成报告', objective: '完成项目报告', status: 'active', progress: 45, cursor: 'runtime-cursor-2',
    steps: [], criteria: [], blockers: [], warnings: [], evidenceCount: 0, actions: ['stop'], revision: 2,
  },
  binding,
  workItems: [{ id: 'work-1', status: 'running', assignedAgentId: 'writer', attempts: [], binding, designNodeId: 'node-1', skillRefs: [], dependsOn: [], inputRefs: [], outputRefs: [], revision: 1, leaseEpoch: 1 }],
} as unknown as ProjectTaskDetail;

const templateCatalog: OntologyApprovedTaskTemplateCatalogData = {
  contracts: [{
    solutionId: 'solution-approved',
    solutionVersion: '2.0.0',
    contractId: 'contract-approved',
    contractHash: `sha256:${'a'.repeat(64)}`,
    ontologyId: 'sales',
    ontologyVersion: '3',
    objectSlots: [{
      id: 'order-slot',
      concept: { ontologyId: 'sales', ontologyVersion: '3', conceptId: 'order' },
      required: true,
      resolution: { status: 'confirmed', evidenceSourceRefIds: ['interview:1'] },
    }],
    factPolicies: [{
      factType: { ontologyId: 'sales', ontologyVersion: '3', conceptId: 'order', factTypeId: 'order-ready' },
      state: { mode: 'any' },
      freshness: { mode: 'any' },
    }],
    taskTemplates: [{
      id: 'prepare-order',
      designNodeId: 'node-prepare',
      objective: '准备订单交付',
      candidateAgentIds: ['writer'],
      candidateSkillIds: [],
    }],
  }],
};

const createdDetail = {
  ...detail,
  projectId: 'project-1',
  taskId: 'task-created',
  title: '权威创建任务',
  status: 'pending',
  revision: 8,
  progress: 0,
  currentStep: undefined,
  runId: 'run-created',
  runStatus: 'running',
  runtimeStatus: 'running',
  task: {
    ...detail.task,
    taskId: 'task-created',
    title: '权威创建任务',
    objective: '定制订单交付',
    status: 'pending',
    progress: 0,
    revision: 8,
  },
  binding: { ...binding, parentTaskId: 'task-created', runId: 'run-created', taskRevision: 8 },
  workItems: [],
  workItemCount: 0,
} as unknown as ProjectTaskDetail;

const createdReceipt = {
  requestId: 'request-1',
  inputHash: `sha256:${'b'.repeat(64)}`,
  task: createdDetail,
  run: { runId: 'run-created' },
  binding: createdDetail.binding,
  contractId: 'contract-approved',
  contractHash: `sha256:${'a'.repeat(64)}`,
  taskTemplateId: 'prepare-order',
} as unknown as OntologyApprovedProjectTaskData;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function dragData(): DataTransfer {
  const values = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'none',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: (format?: string) => {
      if (format) values.delete(format);
      else values.clear();
    },
    getData: (format: string) => values.get(format) ?? '',
    setData: (format: string, value: string) => {
      values.set(format, value);
    },
    setDragImage: () => undefined,
  };
}

describe('ProjectTaskBoard', () => {
  beforeEach(() => {
    service.listProjectTasks.mockReset().mockResolvedValue({ ok: true, data: page });
    service.getProjectTask.mockReset().mockResolvedValue({ ok: true, data: detail });
    service.requestProjectTaskTransition.mockReset();
    service.updateProjectTaskPriority.mockReset();
    service.listWorkItemHandoffCandidates.mockReset();
    service.handoffWorkItem.mockReset();
    service.listApprovedTaskTemplates.mockReset().mockResolvedValue({ ok: true, data: templateCatalog });
    service.createProjectTaskFromTemplate.mockReset();
    subscriptionListener = undefined;
    releaseSubscription.mockReset();
    service.subscribeProjectTaskBoard.mockReset().mockImplementation((_projectId: string, listener: (
      message: ProjectTaskSubscriptionEvent | ProjectTaskSubscriptionTermination
    ) => void) => {
      subscriptionListener = listener;
      return releaseSubscription;
    });
  });

  it('merges a higher authoritative revision without disturbing filter focus and releases on unmount', async () => {
    const revised = { ...detail, revision: 4, progress: 70, currentStep: '校对' } as ProjectTaskDetail;
    service.getProjectTask.mockResolvedValue({ ok: true, data: revised });
    const { unmount } = render(<ProjectTaskBoard projectId="project-1" />);
    await screen.findByText('生成报告');
    const search = screen.getByLabelText('搜索当前页任务');
    search.focus();
    fireEvent.change(search, { target: { value: '报告' } });

    await act(async () => {
      subscriptionListener?.({
        hostId: 'host-1', sequence: 1, projectId: 'project-1', taskId: 'task-active',
        revision: 4, kind: 'task_runtime',
      });
    });

    await waitFor(() => expect(screen.getByText('校对')).toBeTruthy());
    expect(search).toHaveValue('报告');
    expect(search).toHaveFocus();
    unmount();
    expect(releaseSubscription).toHaveBeenCalledOnce();
  });

  it('rereads the authoritative snapshot when the subscription sequence has a gap', async () => {
    render(<ProjectTaskBoard projectId="project-1" />);
    await screen.findByText('生成报告');
    act(() => subscriptionListener?.({
      hostId: 'host-1', sequence: 1, projectId: 'project-1', taskId: 'task-active',
      revision: 2, kind: 'task_runtime',
    }));
    act(() => subscriptionListener?.({
      hostId: 'host-1', sequence: 3, projectId: 'project-1', taskId: 'task-active',
      revision: 3, kind: 'collaboration',
    }));
    await waitFor(() => expect(service.listProjectTasks).toHaveBeenCalledTimes(2));
  });

  it('loads the next cursor, merges by task revision, and preserves filters', async () => {
    const nextPage: ProjectTaskPage = {
      revision: 4,
      items: [
        { ...page.items[1]!, revision: 4, progress: 70, currentStep: '校对' },
        { ...page.items[2]!, taskId: 'task-new', title: '新任务', revision: 1 },
      ],
    };
    service.listProjectTasks
      .mockResolvedValueOnce({ ok: true, data: page })
      .mockResolvedValueOnce({ ok: true, data: nextPage });
    render(<ProjectTaskBoard projectId="project-1" />);

    await screen.findByText('生成报告');
    fireEvent.click(screen.getByRole('button', { name: /生成报告/ }));
    await screen.findByText('work-1 · running');
    fireEvent.change(screen.getByRole('combobox', { name: '按执行 Agent 筛选' }), { target: { value: 'writer' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按优先级筛选' }), { target: { value: 'urgent' } });
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

    await screen.findByText('校对');
    expect(service.listProjectTasks).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-2' }));
    expect(screen.queryByText('已交付')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '按执行 Agent 筛选' })).toHaveValue('writer');
    expect(screen.getByRole('combobox', { name: '按优先级筛选' })).toHaveValue('urgent');
    expect(screen.getAllByRole('button', { name: /生成报告/ })).toHaveLength(1);
    expect(screen.getByText('work-1 · running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已加载全部' })).toBeDisabled();
  });

  it('renders runtime, priority, agent, artifact and semantic projection fields', async () => {
    render(<ProjectTaskBoard projectId="project-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));

    await screen.findByText('work-1 · running');
    expect(screen.getAllByText('执行中').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/紧急/).length).toBeGreaterThan(0);
    expect(screen.getByText('artifact:report')).toBeInTheDocument();
    expect(screen.getByText('concept:report')).toBeInTheDocument();
    expect(screen.getAllByText('writer').length).toBeGreaterThan(0);
  });

  it('keeps an active Task in the active column when its WorkItem runtime is completed', async () => {
    service.listProjectTasks.mockResolvedValue({
      ok: true,
      data: {
        ...page,
        items: page.items.map((item) => item.taskId === 'task-active'
          ? { ...item, runtimeStatus: 'completed' as const, workItemCount: 1 }
          : item),
      },
    });
    render(<ProjectTaskBoard projectId="project-1" />);

    const activeColumn = await screen.findByRole('region', { name: '进行中任务列' });
    const doneColumn = screen.getByRole('region', { name: '已完成任务列' });
    expect(within(activeColumn).getByRole('button', { name: /生成报告/ })).toBeInTheDocument();
    expect(within(activeColumn).getByText('执行完成')).toBeInTheDocument();
    expect(within(doneColumn).queryByRole('button', { name: /生成报告/ })).not.toBeInTheDocument();
  });

  it('loads a 1000-task result set in authoritative pages of 50', async () => {
    const tasks = Array.from({ length: 1000 }, (_, index): ProjectTaskPage['items'][number] => ({
      projectId: 'project-1',
      taskId: `task-${index + 1}`,
      title: `批量任务 ${index + 1}`,
      status: 'pending',
      revision: 1,
      progress: 0,
      blockerCount: 0,
      evidenceCount: 0,
      actions: [],
      runtimeStatus: 'idle',
      runtimeAvailability: 'recovery_required',
      transitions: [],
      assignedAgentIds: [],
      workItemCount: 0,
      artifactRefs: [],
    }));
    service.listProjectTasks
      .mockResolvedValueOnce({ ok: true, data: { revision: 1, cursor: 'page-2', items: tasks.slice(0, 50) } })
      .mockResolvedValueOnce({ ok: true, data: { revision: 1, cursor: 'page-3', items: tasks.slice(50, 100) } });
    render(<ProjectTaskBoard projectId="project-1" />);

    const pendingColumn = await screen.findByRole('region', { name: '待执行任务列' });
    expect(within(pendingColumn).getAllByRole('button')).toHaveLength(50);
    expect(screen.queryByText('批量任务 51')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

    await screen.findByText('批量任务 51');
    expect(service.listProjectTasks).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'page-2', limit: 50 }));
    expect(within(pendingColumn).getAllByRole('button')).toHaveLength(100);
    expect(screen.queryByText('批量任务 101')).not.toBeInTheDocument();
  });

  it('keeps the selected task and filters when switching to the collaboration graph', async () => {
    render(<ProjectTaskBoard projectId="project-1" />);
    fireEvent.change(await screen.findByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    fireEvent.click(screen.getByRole('button', { name: /生成报告/ }));
    await screen.findByText('work-1 · running');

    fireEvent.click(screen.getByRole('button', { name: '协同图' }));
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    expect(screen.getByRole('button', { name: /task-active · r2/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: /生成报告 与 1 个 WorkItem 的关系图/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /work-1.*writer.*running/ }));
    expect(screen.getByRole('button', { name: /work-1.*writer.*running/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('work-1 · running').closest('li')).toHaveAttribute('aria-current', 'true');

    fireEvent.click(screen.getByRole('button', { name: '看板' }));
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    expect(screen.getByText('work-1 · running').closest('li')).toHaveAttribute('aria-current', 'true');
  });

  it('rejects a WorkItem whose binding does not belong to the selected task', async () => {
    service.getProjectTask.mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        workItems: [{ ...detail.workItems[0]!, binding: { ...binding, parentTaskId: 'task-other' } }],
      },
    });
    render(<ProjectTaskBoard projectId="project-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));
    await screen.findByText('work-1 · running');
    fireEvent.click(screen.getByRole('button', { name: '协同图' }));

    expect(screen.getByRole('alert')).toHaveTextContent('协同关系不可用');
    expect(screen.queryByRole('button', { name: /work-1.*writer.*running/ })).not.toBeInTheDocument();
  });

  it('groups only the current project page and filters the rendered cards', async () => {
    render(<ProjectTaskBoard projectId="project-1" />);

    await screen.findByText('整理需求');
    expect(screen.getAllByText('进行中').length).toBeGreaterThan(0);
    expect(service.listProjectTasks).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', limit: 50 }));

    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    expect(screen.queryByText('整理需求')).not.toBeInTheDocument();
    expect(screen.getByText('生成报告')).toBeInTheDocument();
  });

  it('shows scoped WorkItems and keeps the authoritative detail after a rejected action', async () => {
    service.requestProjectTaskTransition.mockResolvedValue({ ok: false, error: { kind: 'conflict', code: 'REVISION_CONFLICT', message: '请刷新后重试', retryable: true, issues: [], gaps: [] } });
    render(<ProjectTaskBoard projectId="project-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));
    await screen.findByText('work-1 · running');
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));

    await screen.findByRole('alert');
    expect(screen.getByText('work-1 · running')).toBeInTheDocument();
    expect(service.requestProjectTaskTransition).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', taskId: 'task-active', expectedRevision: 2, targetStatus: 'blocked', expectedLeaseEpoch: 7 }));
  });

  it('routes an available task keyboard shortcut through the shared transition handler', async () => {
    const controllableDetail = {
      ...detail,
      transitions: [{ capability: 'pause', targetStatus: 'blocked' }],
      task: { ...detail.task, actions: ['stop'] },
    } as unknown as ProjectTaskDetail;
    service.getProjectTask.mockResolvedValue({ ok: true, data: controllableDetail });
    service.requestProjectTaskTransition.mockResolvedValue({ ok: false, error: { kind: 'conflict', code: 'REVISION_CONFLICT', message: '请刷新后重试', retryable: true, issues: [], gaps: [] } });
    render(<ProjectTaskBoard projectId="project-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));
    const toolbar = await screen.findByRole('toolbar', { name: '任务操作' });
    expect(screen.getByRole('button', { name: '暂停' })).toHaveAttribute('aria-keyshortcuts', 'Alt+P');

    fireEvent.keyDown(toolbar, { key: 'p', altKey: true });
    await waitFor(() => expect(service.requestProjectTaskTransition).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      taskId: 'task-active',
      expectedRevision: 2,
      expectedLeaseEpoch: 7,
      targetStatus: 'blocked',
    })));
  });


  it('keeps the card in its original column until drag transition returns and then uses only the authoritative detail', async () => {
    const transition = deferred<{ readonly ok: true; readonly data: ProjectTaskDetail }>();
    const acceptedDetail = {
      ...detail,
      title: '服务端确认后的报告',
      status: 'review',
      revision: 3,
      transitions: [{ capability: 'approve_completion', targetStatus: 'done' }],
      task: { ...detail.task, title: '服务端确认后的报告', status: 'review', revision: 3 },
    } as unknown as ProjectTaskDetail;
    service.requestProjectTaskTransition.mockReturnValue(transition.promise);
    render(<ProjectTaskBoard projectId="project-1" />);

    const activeColumn = await screen.findByRole('region', { name: '进行中任务列' });
    const reviewColumn = screen.getByRole('region', { name: '待审核任务列' });
    const card = within(activeColumn).getByRole('button', { name: /生成报告/ });
    const transfer = dragData();
    fireEvent.dragStart(card.closest('article')!, { dataTransfer: transfer });
    fireEvent.drop(reviewColumn, { dataTransfer: transfer });

    expect(within(activeColumn).getByRole('button', { name: /生成报告/ })).toBeInTheDocument();
    expect(within(reviewColumn).queryByRole('button', { name: /生成报告/ })).not.toBeInTheDocument();
    expect(screen.getByText('正在请求移动到待审核，仍在进行中列')).toBeInTheDocument();
    expect(service.requestProjectTaskTransition).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      taskId: 'task-active',
      targetStatus: 'review',
      expectedRevision: 2,
      expectedLeaseEpoch: 7,
    }));

    await act(async () => transition.resolve({ ok: true, data: acceptedDetail }));

    await waitFor(() => expect(within(reviewColumn).getByRole('button', { name: /服务端确认后的报告/ })).toBeInTheDocument());
    expect(within(activeColumn).queryByRole('button', { name: /生成报告/ })).not.toBeInTheDocument();
    expect(service.listProjectTasks).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/已采用服务端权威投影/)).toBeInTheDocument();
  });

  it('uses the same transition request for drag and the keyboard-operable move menu', async () => {
    service.requestProjectTaskTransition.mockResolvedValue({
      ok: false,
      error: {
        kind: 'rejected',
        code: 'TRANSITION_NOT_AVAILABLE',
        message: '该转换当前不可用',
        retryable: false,
        issues: [],
        gaps: [],
      },
    });
    render(<ProjectTaskBoard projectId="project-1" />);

    const activeColumn = await screen.findByRole('region', { name: '进行中任务列' });
    const reviewColumn = screen.getByRole('region', { name: '待审核任务列' });
    const card = within(activeColumn).getByRole('button', { name: /生成报告/ });
    const transfer = dragData();
    fireEvent.dragStart(card.closest('article')!, { dataTransfer: transfer });
    fireEvent.drop(reviewColumn, { dataTransfer: transfer });
    await waitFor(() => expect(service.requestProjectTaskTransition).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole('combobox', { name: '移动任务 生成报告' }), { target: { value: 'review' } });
    await waitFor(() => expect(service.requestProjectTaskTransition).toHaveBeenCalledTimes(2));

    const [dragRequest, menuRequest] = service.requestProjectTaskTransition.mock.calls.map(([request]) => ({
      projectId: request.projectId,
      taskId: request.taskId,
      targetStatus: request.targetStatus,
      expectedRevision: request.expectedRevision,
      expectedLeaseEpoch: request.expectedLeaseEpoch,
    }));
    expect(menuRequest).toEqual(dragRequest);
  });

  it('keeps the original column, draft, filters, selection and card focus when a drag is rejected', async () => {
    service.requestProjectTaskTransition.mockResolvedValue({
      ok: false,
      error: {
        kind: 'rejected',
        code: 'EVIDENCE_GATE_FAILED',
        message: '请先解除任务阻塞',
        retryable: false,
        issues: [],
        gaps: [{ kind: 'blocker', id: 'blocker-1', message: '安全审批尚未完成' }],
      },
    });
    render(<ProjectTaskBoard projectId="project-1" />);

    const activeColumn = await screen.findByRole('region', { name: '进行中任务列' });
    const doneColumn = screen.getByRole('region', { name: '已完成任务列' });
    const card = within(activeColumn).getByRole('button', { name: /生成报告/ });
    fireEvent.click(card);
    await screen.findByText('work-1 · running');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按执行 Agent 筛选' }), { target: { value: 'writer' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按优先级筛选' }), { target: { value: 'urgent' } });
    fireEvent.change(screen.getByRole('textbox', { name: '转换说明' }), { target: { value: '等待安全审批' } });
    const transfer = dragData();
    fireEvent.dragStart(card.closest('article')!, { dataTransfer: transfer });
    fireEvent.drop(doneColumn, { dataTransfer: transfer });

    await screen.findByRole('alert');
    expect(within(activeColumn).getByRole('button', { name: /生成报告/ })).toHaveFocus();
    expect(within(doneColumn).queryByRole('button', { name: /生成报告/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    expect(screen.getByRole('combobox', { name: '按执行 Agent 筛选' })).toHaveValue('writer');
    expect(screen.getByRole('combobox', { name: '按优先级筛选' })).toHaveValue('urgent');
    expect(screen.getByRole('textbox', { name: '转换说明' })).toHaveValue('等待安全审批');
    expect(screen.getByText('work-1 · running')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/移动失败.*安全审批尚未完成/);
    expect(service.requestProjectTaskTransition).toHaveBeenCalledWith(expect.objectContaining({
      targetStatus: 'done',
      reason: '等待安全审批',
    }));
  });

  it('preserves draft, filters, selection and focus while announcing evidence rejection', async () => {
    service.requestProjectTaskTransition.mockResolvedValue({
      ok: false,
      error: {
        kind: 'rejected',
        code: 'EVIDENCE_GATE_FAILED',
        message: '请补齐任务证据',
        retryable: false,
        issues: [],
        gaps: [{ kind: 'criterion_evidence', id: 'criterion-1', message: '验收标准缺少证据' }],
      },
    });
    render(<ProjectTaskBoard projectId="project-1" />);

    const card = await screen.findByRole('button', { name: /生成报告/ });
    fireEvent.click(card);
    await screen.findByText('work-1 · running');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按执行 Agent 筛选' }), { target: { value: 'writer' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按优先级筛选' }), { target: { value: 'urgent' } });
    fireEvent.change(screen.getByRole('textbox', { name: '转换说明' }), { target: { value: '请确认发布证据' } });
    fireEvent.change(screen.getByRole('combobox', { name: '移动任务 生成报告' }), { target: { value: 'done' } });

    await screen.findByRole('alert');
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    expect(screen.getByRole('combobox', { name: '按执行 Agent 筛选' })).toHaveValue('writer');
    expect(screen.getByRole('combobox', { name: '按优先级筛选' })).toHaveValue('urgent');
    expect(screen.getByRole('textbox', { name: '转换说明' })).toHaveValue('请确认发布证据');
    expect(screen.getByText('work-1 · running')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '进行中任务列' })).getByRole('button', { name: /生成报告/ })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(/移动失败.*验收标准缺少证据/);
    expect(service.requestProjectTaskTransition).toHaveBeenCalledWith(expect.objectContaining({
      targetStatus: 'done',
      reason: '请确认发布证据',
    }));
  });

  it('keeps the authoritative priority until the server accepts and merges only the returned detail', async () => {
    const mutation = deferred<{ readonly ok: true; readonly data: { readonly task: ProjectTaskDetail } }>();
    const accepted = {
      ...detail,
      revision: 3,
      projectMetadata: { ...detail.projectMetadata!, priority: 'high' as const },
      task: { ...detail.task, revision: 3 },
    } as unknown as ProjectTaskDetail;
    service.updateProjectTaskPriority.mockReturnValue(mutation.promise);
    render(<ProjectTaskBoard projectId="project-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));
    const priority = await screen.findByRole('combobox', { name: '设置任务优先级' });
    fireEvent.change(priority, { target: { value: 'high' } });

    expect(priority).toHaveValue('urgent');
    expect(priority).toBeDisabled();
    expect(screen.getByText('正在提交，卡片保持当前优先级')).toBeInTheDocument();
    expect(screen.getAllByText(/优先级：紧急/).length).toBeGreaterThan(0);
    expect(service.updateProjectTaskPriority).toHaveBeenCalledWith({
      projectId: 'project-1',
      taskId: 'task-active',
      requestId: 'request-1',
      priority: 'high',
      expectedRevision: 2,
      expectedCursor: 'runtime-cursor-2',
      bridgeEpoch: 7,
    });

    await act(async () => mutation.resolve({ ok: true, data: { task: accepted } }));
    await waitFor(() => expect(priority).toHaveValue('high'));
    expect(screen.getAllByText(/优先级：高/).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('已采用服务端权威详情');
  });

  it('preserves priority, focus, filters, detail, selection and draft after priority rejection', async () => {
    service.updateProjectTaskPriority.mockResolvedValue({
      ok: false,
      error: { kind: 'conflict', code: 'REVISION_CONFLICT', message: '任务已被其他窗口更新', retryable: true, issues: [], gaps: [] },
    });
    render(<ProjectTaskBoard projectId="project-1" />);

    const card = await screen.findByRole('button', { name: /生成报告/ });
    fireEvent.click(card);
    await screen.findByText('work-1 · running');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按执行 Agent 筛选' }), { target: { value: 'writer' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按优先级筛选' }), { target: { value: 'urgent' } });
    fireEvent.change(screen.getByRole('textbox', { name: '转换说明' }), { target: { value: '保留这份草稿' } });
    const priority = screen.getByRole('combobox', { name: '设置任务优先级' });
    priority.focus();
    fireEvent.change(priority, { target: { value: 'low' } });

    await screen.findByRole('alert');
    expect(priority).toHaveValue('urgent');
    expect(priority).toHaveFocus();
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    expect(screen.getByRole('combobox', { name: '按执行 Agent 筛选' })).toHaveValue('writer');
    expect(screen.getByRole('combobox', { name: '按优先级筛选' })).toHaveValue('urgent');
    expect(screen.getByRole('textbox', { name: '转换说明' })).toHaveValue('保留这份草稿');
    expect(screen.getByText('work-1 · running')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/优先级更新失败.*任务已被其他窗口更新/);
  });

  it('loads Chinese handoff candidates with stable IDs and submits their authoritative CAS context', async () => {
    service.listWorkItemHandoffCandidates.mockResolvedValue({
      ok: true,
      data: {
        candidates: [{ agentId: 'reviewer-agent', displayName: '中文审核员', permissions: ['review'] }],
        authority: { runRevision: 11, workItemRevision: 5, leaseEpoch: 9, assignedAgentId: 'writer' },
      },
    });
    const handoff = deferred<{ readonly ok: true; readonly data: { readonly task: ProjectTaskDetail } }>();
    service.handoffWorkItem.mockReturnValue(handoff.promise);
    const accepted = {
      ...detail,
      assignedAgentIds: ['reviewer-agent'],
      workItems: [{ ...detail.workItems[0]!, assignedAgentId: 'reviewer-agent', revision: 6, leaseEpoch: 10 }],
    } as unknown as ProjectTaskDetail;
    render(<ProjectTaskBoard projectId="project-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));
    const selector = await screen.findByRole('combobox', { name: '交接 work-1 的执行 Agent' });
    fireEvent.focus(selector);
    await screen.findByRole('option', { name: '中文审核员' });
    expect(screen.getByRole('option', { name: '中文审核员' })).toHaveValue('reviewer-agent');
    fireEvent.change(selector, { target: { value: 'reviewer-agent' } });

    expect(selector).toHaveValue('writer');
    expect(selector).toBeDisabled();
    expect(screen.getByText('正在交接，当前执行者保持不变')).toBeInTheDocument();
    expect(service.handoffWorkItem).toHaveBeenCalledWith({
      projectId: 'project-1',
      runId: 'run-1',
      workItemId: 'work-1',
      requestId: 'request-1',
      targetAgentId: 'reviewer-agent',
      expectedRunRevision: 11,
      expectedWorkItemRevision: 5,
      expectedLeaseEpoch: 9,
    });

    await act(async () => handoff.resolve({ ok: true, data: { task: accepted } }));
    await waitFor(() => expect(selector).toHaveValue('reviewer-agent'));
    expect(screen.getByText('执行者：reviewer-agent · 尝试 0 次')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/已交接给中文审核员.*服务端权威详情/);
  });

  it('keeps the original Agent and UI state when handoff is rejected', async () => {
    service.listWorkItemHandoffCandidates.mockResolvedValue({
      ok: true,
      data: {
        candidates: [{ agentId: 'reviewer-agent', displayName: '中文审核员', permissions: ['review'] }],
        authority: { runRevision: 11, workItemRevision: 5, leaseEpoch: 9, assignedAgentId: 'writer' },
      },
    });
    service.handoffWorkItem.mockResolvedValue({
      ok: false,
      error: { kind: 'conflict', code: 'LEASE_CONFLICT', message: '执行租约已变化', retryable: true, issues: [], gaps: [] },
    });
    render(<ProjectTaskBoard projectId="project-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /生成报告/ }));
    await screen.findByText('work-1 · running');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    fireEvent.change(screen.getByRole('textbox', { name: '转换说明' }), { target: { value: '交接备注草稿' } });
    const selector = await screen.findByRole('combobox', { name: '交接 work-1 的执行 Agent' });
    fireEvent.focus(selector);
    await screen.findByRole('option', { name: '中文审核员' });
    fireEvent.change(selector, { target: { value: 'reviewer-agent' } });

    await screen.findByRole('alert');
    expect(selector).toHaveValue('writer');
    await waitFor(() => expect(selector).toHaveFocus());
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    expect(screen.getByRole('textbox', { name: '转换说明' })).toHaveValue('交接备注草稿');
    expect(screen.getByText('work-1 · running')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Agent 交接失败.*执行租约已变化/);
  });

  it('creates from an exact published template and adds no card before the authoritative receipt', async () => {
    const creation = deferred<{ readonly ok: true; readonly data: OntologyApprovedProjectTaskData }>();
    service.createProjectTaskFromTemplate.mockReturnValue(creation.promise);
    render(<ProjectTaskBoard projectId="project-1" />);

    await screen.findByText('生成报告');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    fireEvent.click(screen.getByRole('button', { name: '新建任务' }));
    await waitFor(() => expect(service.listApprovedTaskTemplates).toHaveBeenCalledWith({
      projectId: 'project-1', requestId: 'request-1',
    }));
    fireEvent.change(screen.getByRole('combobox', { name: '已发布契约' }), {
      target: { value: 'solution-approved\u00002.0.0\u0000contract-approved' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '任务模板' }), { target: { value: 'prepare-order' } });
    fireEvent.change(screen.getByRole('textbox', { name: '本次任务目标' }), { target: { value: '定制订单交付' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'order-slot factId' }), { target: { value: 'order-42' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'order-slot factVersion' }), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并启动任务' }));

    expect(screen.queryByRole('button', { name: /权威创建任务/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '正在创建，任务尚未加入看板' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    expect(service.createProjectTaskFromTemplate).toHaveBeenCalledWith({
      projectId: 'project-1',
      requestId: 'request-1',
      solutionId: 'solution-approved',
      solutionVersion: '2.0.0',
      contractId: 'contract-approved',
      contractHash: `sha256:${'a'.repeat(64)}`,
      taskTemplateId: 'prepare-order',
      objective: '定制订单交付',
      semanticInputs: [{
        slotId: 'order-slot',
        factRef: {
          ontologyId: 'sales', ontologyVersion: '3', conceptId: 'order',
          factTypeId: 'order-ready', factId: 'order-42', factVersion: '7',
        },
      }],
    });

    await act(async () => creation.resolve({ ok: true, data: createdReceipt }));

    expect(await screen.findByText(/已创建并绑定 Run run-created/)).toBeInTheDocument();
    expect(screen.getByText('run-created · running')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /权威创建任务/ })).not.toBeInTheDocument();
    expect(service.listProjectTasks).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /权威创建任务/ })).toBeInTheDocument();
  });

  it('fails closed for a manual objective without a published template and links back to solution design', async () => {
    service.listApprovedTaskTemplates.mockResolvedValue({ ok: true, data: { contracts: [] } });
    const openSolutionDesign = vi.fn();
    render(<ProjectTaskBoard projectId="project-1" onOpenSolutionDesign={openSolutionDesign} />);

    await screen.findByText('生成报告');
    fireEvent.click(screen.getByRole('button', { name: '新建任务' }));
    await screen.findByText('当前项目没有可用的已发布任务模板。');
    fireEvent.change(screen.getByRole('textbox', { name: '本次任务目标' }), { target: { value: '临时做一个任务' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并启动任务' }));

    expect(await screen.findByText('手动目标必须绑定一个已发布任务模板。')).toBeInTheDocument();
    expect(service.createProjectTaskFromTemplate).not.toHaveBeenCalled();
    expect(screen.queryByText('临时做一个任务', { selector: 'button' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回方案设计' }));
    expect(openSolutionDesign).toHaveBeenCalledTimes(1);
  });

  it('preserves creation draft, board filters, selection and submit focus on an authoritative DesignGap', async () => {
    service.createProjectTaskFromTemplate.mockResolvedValue({
      ok: false,
      error: {
        kind: 'rejected', code: 'PROJECT_TASK_DESIGN_GAP', message: '请先补齐语义输入',
        retryable: false, issues: [], gaps: [], designGaps: [{
          code: 'SEMANTIC_FACT_NOT_FOUND', severity: 'error', scope: 'contract',
          path: 'semanticInputs[0].factRef', message: '事实 order-42 不存在。',
          remediation: '选择已接纳且版本精确匹配的 canonical fact。',
        }],
      },
    });
    render(<ProjectTaskBoard projectId="project-1" />);

    const card = await screen.findByRole('button', { name: /生成报告/ });
    fireEvent.click(card);
    await screen.findByText('work-1 · running');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索当前页任务' }), { target: { value: '报告' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按执行 Agent 筛选' }), { target: { value: 'writer' } });
    fireEvent.change(screen.getByRole('combobox', { name: '按优先级筛选' }), { target: { value: 'urgent' } });
    fireEvent.click(screen.getByRole('button', { name: '新建任务' }));
    await waitFor(() => expect(service.listApprovedTaskTemplates).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('combobox', { name: '已发布契约' }), {
      target: { value: 'solution-approved\u00002.0.0\u0000contract-approved' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '任务模板' }), { target: { value: 'prepare-order' } });
    fireEvent.change(screen.getByRole('textbox', { name: '本次任务目标' }), { target: { value: '保留的任务草稿' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'order-slot factId' }), { target: { value: 'order-42' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'order-slot factVersion' }), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并启动任务' }));

    expect(await screen.findByText('事实 order-42 不存在。')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '本次任务目标' })).toHaveValue('保留的任务草稿');
    expect(screen.getByRole('textbox', { name: 'order-slot factId' })).toHaveValue('order-42');
    expect(screen.getByRole('textbox', { name: 'order-slot factVersion' })).toHaveValue('7');
    expect(screen.getByRole('textbox', { name: '搜索当前页任务' })).toHaveValue('报告');
    expect(screen.getByRole('combobox', { name: '按执行 Agent 筛选' })).toHaveValue('writer');
    expect(screen.getByRole('combobox', { name: '按优先级筛选' })).toHaveValue('urgent');
    expect(screen.getByText('work-1 · running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建并启动任务' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /权威创建任务/ })).not.toBeInTheDocument();
  });


  it('shows a desktop-unavailable load state without inventing a task', async () => {
    service.listProjectTasks.mockResolvedValue({ ok: false, error: { kind: 'unavailable', code: 'DESKTOP_TASK_BOARD_UNAVAILABLE', message: '任务看板仅可在桌面应用中使用', retryable: false, issues: [], gaps: [] } });
    render(<ProjectTaskBoard projectId="project-1" />);

    await waitFor(() => expect(screen.getByText('无法加载项目任务')).toBeInTheDocument());
    expect(screen.queryByText('整理需求')).not.toBeInTheDocument();
  });
});
