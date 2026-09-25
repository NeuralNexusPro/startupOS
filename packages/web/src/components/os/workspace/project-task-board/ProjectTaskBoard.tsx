'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Columns, Loader2, Network, Pause, Play, RefreshCw, Search, XCircle } from 'lucide-react';

import type {
  OntologyApprovedProjectTaskData,
  OntologyCrossPackageHandoffCandidatesData,
  ProjectTaskAction,
  ProjectTaskBoardStatus,
  ProjectTaskDetail,
  ProjectTaskPage,
  ProjectTaskPublicTransition,
  ProjectTaskSubscriptionEvent,
  ProjectTaskSummary,
  ProjectTaskTransitionCapability,
} from '@originos/core/lib/features/project';
import type { AgentTaskProjectPriorityV1 } from '@originos/core/lib/features/project/client';
import {
  createProjectTaskBoardRequestId,
  getProjectTask,
  handoffWorkItem,
  listWorkItemHandoffCandidates,
  listProjectTasks,
  requestProjectTaskTransition,
  subscribeProjectTaskBoard,
  updateProjectTaskPriority,
  type ProjectTaskBoardServiceError,
} from '@/services/project-task-board';
import { Button } from '@/components/ui/button';
import { ProjectTaskCollaborationGraph } from './ProjectTaskCollaborationGraph';
import { ProjectTaskCreationPanel } from './ProjectTaskCreationPanel';

const COLUMNS: ReadonlyArray<{ status: ProjectTaskBoardStatus; label: string }> = [
  { status: 'pending', label: '待执行' },
  { status: 'active', label: '进行中' },
  { status: 'blocked', label: '阻塞' },
  { status: 'review', label: '待审核' },
  { status: 'done', label: '已完成' },
  { status: 'cancelled', label: '已取消' },
];

const STATUS_LABEL = Object.fromEntries(
  COLUMNS.map((column) => [column.status, column.label]),
) as Record<ProjectTaskBoardStatus, string>;

const ACTION_LABEL: Record<ProjectTaskTransitionCapability, string> = {
  pause: '暂停',
  resume: '恢复',
  retry: '重试',
  cancel: '取消',
  request_review: '提交审核',
  approve_completion: '确认完成',
  reject_review: '退回执行',
};

const ACTION_SHORTCUT: Record<ProjectTaskAction, string> = {
  pause: 'Alt+P',
  resume: 'Alt+U',
  retry: 'Alt+R',
  cancel: 'Alt+C',
};

const SHORTCUT_ACTION: Record<string, ProjectTaskAction> = {
  p: 'pause',
  u: 'resume',
  r: 'retry',
  c: 'cancel',
};

interface ProjectTaskBoardProps {
  readonly projectId: string;
  readonly onOpenSolutionDesign?: () => void;
}

type LoadState = 'loading' | 'ready' | 'failed';
type ViewMode = 'board' | 'graph';

type PageLoadMode = 'replace' | 'append';
type ProjectTaskWorkItem = ProjectTaskDetail['workItems'][number];

type AssignmentOperation =
  | { readonly kind: 'priority'; readonly taskId: string }
  | { readonly kind: 'handoff'; readonly taskId: string; readonly workItemId: string };

type HandoffCandidatesState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: OntologyCrossPackageHandoffCandidatesData }
  | { readonly status: 'failed'; readonly error: ProjectTaskBoardServiceError };

const PRIORITY_LABEL = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
} as const;

const RUNTIME_STATUS_LABEL = {
  idle: '未启动',
  planning: '规划中',
  running: '执行中',
  waiting_user: '等待用户',
  paused: '已暂停',
  failed: '执行失败',
  completed: '执行完成',
  cancelled: '已取消',
} as const;

function isBoardStatus(value: string): value is ProjectTaskBoardStatus {
  return COLUMNS.some((column) => column.status === value);
}

function mergeTaskPages(
  current: ProjectTaskPage | undefined,
  incoming: ProjectTaskPage,
  mode: PageLoadMode,
): ProjectTaskPage {
  if (mode === 'replace' || !current) return incoming;
  const merged = new Map(current.items.map((task) => [task.taskId, task]));
  for (const task of incoming.items) {
    const existing = merged.get(task.taskId);
    if (!existing || task.revision > existing.revision) merged.set(task.taskId, task);
  }
  return {
    items: [...merged.values()],
    ...(incoming.cursor ? { cursor: incoming.cursor } : {}),
    revision: Math.max(current.revision, incoming.revision),
  };
}

function errorMessage(error: ProjectTaskBoardServiceError): string {
  return `${error.message}${error.retryable ? '，可以重试。' : ''}`;
}

function actionIcon(action: ProjectTaskTransitionCapability) {
  if (action === 'pause') return <Pause className="h-3.5 w-3.5" aria-hidden="true" />;
  if (action === 'resume') return <Play className="h-3.5 w-3.5" aria-hidden="true" />;
  if (action === 'retry' || action === 'reject_review') return <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />;
  if (action === 'cancel') return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Play className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function ProjectTaskBoard({ projectId, onOpenSolutionDesign }: ProjectTaskBoardProps) {
  const [page, setPage] = useState<ProjectTaskPage | undefined>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<ProjectTaskBoardServiceError>();
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [selectedDetail, setSelectedDetail] = useState<ProjectTaskDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<ProjectTaskBoardServiceError>();
  const [actionError, setActionError] = useState<ProjectTaskBoardServiceError>();
  const [actionFeedback, setActionFeedback] = useState<string>();
  const [runningTransition, setRunningTransition] = useState<{ readonly taskId: string; readonly targetStatus: ProjectTaskBoardStatus }>();
  const [transitionAnnouncement, setTransitionAnnouncement] = useState('');
  const [transitionDrafts, setTransitionDrafts] = useState<Record<string, string>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string>();
  const [runningAssignment, setRunningAssignment] = useState<AssignmentOperation>();
  const [handoffCandidates, setHandoffCandidates] = useState<Record<string, HandoffCandidatesState>>({});
  const taskCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const assignmentControlRefs = useRef(new Map<string, HTMLSelectElement>());
  const pageRef = useRef<ProjectTaskPage>();
  const selectedTaskIdRef = useRef<string>();
  const subscriptionCursorRef = useRef<{ readonly hostId: string; readonly sequence: number }>();

  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId; }, [selectedTaskId]);

  const loadPage = useCallback(async (mode: PageLoadMode = 'replace', cursor?: string) => {
    if (mode === 'append') setLoadingMore(true);
    else setLoadState('loading');
    setLoadError(undefined);
    const result = await listProjectTasks({
      projectId,
      requestId: createProjectTaskBoardRequestId(),
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    if (!result.ok) {
      setLoadError(result.error);
      if (mode === 'replace') setLoadState('failed');
      setLoadingMore(false);
      return;
    }
    setPage((current) => mergeTaskPages(current, result.data, mode));
    setLoadState('ready');
    setLoadingMore(false);
  }, [projectId]);

  useEffect(() => {
    setPage(undefined);
    setSelectedTaskId(undefined);
    setSelectedWorkItemId(undefined);
    setSelectedDetail(undefined);
    void loadPage('replace');
  }, [loadPage]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (page?.items ?? []).filter((task) => {
      const textMatches = !normalized || [
        task.title,
        task.taskId,
        task.currentStep,
        ...task.assignedAgentIds,
      ].filter(Boolean).some((value) => value?.toLowerCase().includes(normalized));
      const agentMatches = agentFilter === 'all' || task.assignedAgentIds.includes(agentFilter);
      const priorityMatches = priorityFilter === 'all'
        || task.projectMetadata?.priority === priorityFilter;
      return textMatches && agentMatches && priorityMatches;
    });
  }, [agentFilter, page, priorityFilter, query]);

  const agentOptions = useMemo(() => [...new Set(
    (page?.items ?? []).flatMap((task) => task.assignedAgentIds),
  )].sort(), [page]);

  const priorityOptions = useMemo(() => [...new Set(
    (page?.items ?? []).flatMap((task) => task.projectMetadata?.priority
      ? [task.projectMetadata.priority]
      : []),
  )], [page]);

  const selectTask = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSelectedWorkItemId(undefined);
    setSelectedDetail(undefined);
    setDetailError(undefined);
    setActionError(undefined);
    setActionFeedback(undefined);
    setDetailLoading(true);
    const result = await getProjectTask({ projectId, taskId, requestId: createProjectTaskBoardRequestId() });
    if (result.ok) setSelectedDetail(result.data);
    else setDetailError(result.error);
    setDetailLoading(false);
  }, [projectId]);

  useEffect(() => {
    subscriptionCursorRef.current = undefined;
    let active = true;
    const refreshSnapshot = async (): Promise<void> => {
      await loadPage('replace');
      const taskId = selectedTaskIdRef.current;
      if (taskId) await selectTask(taskId);
    };
    const release = subscribeProjectTaskBoard(projectId, (message) => {
      if (!active) return;
      if ('code' in message) {
        setPage(undefined);
        setSelectedTaskId(undefined);
        setSelectedWorkItemId(undefined);
        setSelectedDetail(undefined);
        setLoadState('failed');
        setLoadError({
          kind: 'rejected', code: message.code, message: '项目访问权限已撤销',
          retryable: false, issues: [], gaps: [], designGaps: [],
        });
        return;
      }

      const event = message as ProjectTaskSubscriptionEvent;
      const cursor = subscriptionCursorRef.current;
      const hasGap = cursor !== undefined
        && (cursor.hostId !== event.hostId || cursor.sequence + 1 !== event.sequence);
      subscriptionCursorRef.current = { hostId: event.hostId, sequence: event.sequence };
      if (hasGap) {
        void refreshSnapshot();
        return;
      }

      const currentTask = pageRef.current?.items.find(({ taskId }) => taskId === event.taskId);
      if (!currentTask || event.revision <= currentTask.revision) return;
      void getProjectTask({
        projectId,
        taskId: event.taskId,
        requestId: createProjectTaskBoardRequestId(),
      }).then((result) => {
        if (!active || !result.ok) return;
        setPage((current) => current ? {
          ...current,
          revision: Math.max(current.revision, result.data.revision),
          items: current.items.map((task) => task.taskId === result.data.taskId ? result.data : task),
        } : current);
        setSelectedDetail((current) => current?.taskId === result.data.taskId ? result.data : current);
      });
    });
    return () => {
      active = false;
      release();
    };
  }, [loadPage, projectId, selectTask]);

  const requestTransition = useCallback(async (
    task: ProjectTaskSummary,
    targetStatus: ProjectTaskBoardStatus,
  ) => {
    if (runningTransition) return;
    setRunningTransition({ taskId: task.taskId, targetStatus });
    setActionError(undefined);
    setActionFeedback(undefined);
    setTransitionAnnouncement(`${task.title} 正在移动到${STATUS_LABEL[targetStatus]}，任务仍保留在原列。`);
    const draft = transitionDrafts[task.taskId]?.trim();
    const result = await requestProjectTaskTransition({
      projectId,
      taskId: task.taskId,
      targetStatus,
      requestId: createProjectTaskBoardRequestId(),
      expectedRevision: task.revision,
      ...(task.leaseEpoch === undefined ? {} : { expectedLeaseEpoch: task.leaseEpoch }),
      ...(draft ? { reason: draft } : {}),
    });
    setRunningTransition(undefined);
    if (!result.ok) {
      setActionError(result.error);
      const gapDetail = result.error.gaps.map((gap) => gap.message).join('；');
      const message = `移动失败：${errorMessage(result.error)}${gapDetail ? `（${gapDetail}）` : ''}`;
      setTransitionAnnouncement(message);
      taskCardRefs.current.get(task.taskId)?.focus();
      return;
    }

    setPage((current) => current ? {
      ...current,
      revision: Math.max(current.revision, result.data.revision),
      items: current.items.map((item) => item.taskId === result.data.taskId ? result.data : item),
    } : current);
    if (selectedTaskId === result.data.taskId) setSelectedDetail(result.data);
    setTransitionDrafts((current) => {
      const next = { ...current };
      delete next[task.taskId];
      return next;
    });
    const message = `${result.data.title} 已移动到${STATUS_LABEL[result.data.status]}，已采用服务端权威投影。`;
    setActionFeedback(message);
    setTransitionAnnouncement(message);
  }, [projectId, runningTransition, selectedTaskId, transitionDrafts]);

  const requestTransitionByTaskId = useCallback((
    taskId: string,
    targetStatus: ProjectTaskBoardStatus,
  ) => {
    const task = page?.items.find((candidate) => candidate.taskId === taskId);
    if (task) void requestTransition(task, targetStatus);
  }, [page, requestTransition]);

  const registerTaskCard = useCallback((taskId: string, element: HTMLButtonElement | null) => {
    if (element) taskCardRefs.current.set(taskId, element);
    else taskCardRefs.current.delete(taskId);
  }, []);

  const mergeAuthoritativeDetail = useCallback((detail: ProjectTaskDetail) => {
    setPage((current) => current ? {
      ...current,
      revision: Math.max(current.revision, detail.revision),
      items: current.items.map((item) => item.taskId === detail.taskId ? detail : item),
    } : current);
    setSelectedDetail((current) => current?.taskId === detail.taskId ? detail : current);
  }, []);

  const acceptCreatedTask = useCallback((created: OntologyApprovedProjectTaskData) => {
    setPage((current) => {
      if (!current) return { items: [created.task], revision: created.task.revision };
      const existing = current.items.some(({ taskId }) => taskId === created.task.taskId);
      return {
        ...current,
        revision: Math.max(current.revision, created.task.revision),
        items: existing
          ? current.items.map((task) => task.taskId === created.task.taskId ? created.task : task)
          : [...current.items, created.task],
      };
    });
    setSelectedTaskId(created.task.taskId);
    setSelectedWorkItemId(undefined);
    setSelectedDetail(created.task);
    setDetailError(undefined);
    setActionError(undefined);
    setActionFeedback(`任务已从权威创建回执加入看板，Run ${created.run.runId}。`);
  }, []);

  const registerAssignmentControl = useCallback((key: string, element: HTMLSelectElement | null) => {
    if (element) assignmentControlRefs.current.set(key, element);
    else assignmentControlRefs.current.delete(key);
  }, []);

  const restoreAssignmentFocus = useCallback((key: string) => {
    globalThis.setTimeout(() => assignmentControlRefs.current.get(key)?.focus(), 0);
  }, []);

  const requestPriority = useCallback(async (
    detail: ProjectTaskDetail,
    priority: AgentTaskProjectPriorityV1,
  ) => {
    if (runningAssignment || detail.projectMetadata?.priority === priority) return;
    const key = `priority:${detail.taskId}`;
    if (detail.leaseEpoch === undefined) {
      const error: ProjectTaskBoardServiceError = {
        kind: 'unavailable', code: 'TASK_RUNTIME_CAS_UNAVAILABLE',
        message: '任务运行时版本不可用，请刷新后重试', retryable: true, issues: [], gaps: [], designGaps: [],
      };
      setActionError(error);
      setTransitionAnnouncement(`优先级更新失败：${errorMessage(error)}`);
      restoreAssignmentFocus(key);
      return;
    }
    setRunningAssignment({ kind: 'priority', taskId: detail.taskId });
    setActionError(undefined);
    setActionFeedback(undefined);
    setTransitionAnnouncement(`${detail.title} 正在更新优先级，当前卡片保持不变。`);
    const result = await updateProjectTaskPriority({
      projectId,
      taskId: detail.taskId,
      requestId: createProjectTaskBoardRequestId(),
      priority,
      expectedRevision: detail.revision,
      expectedCursor: detail.task.cursor,
      bridgeEpoch: detail.leaseEpoch,
    });
    setRunningAssignment(undefined);
    if (!result.ok) {
      setActionError(result.error);
      setTransitionAnnouncement(`优先级更新失败：${errorMessage(result.error)}`);
      restoreAssignmentFocus(key);
      return;
    }
    mergeAuthoritativeDetail(result.data.task);
    const message = `${result.data.task.title} 的优先级已更新为${PRIORITY_LABEL[priority]}，已采用服务端权威详情。`;
    setActionFeedback(message);
    setTransitionAnnouncement(message);
  }, [mergeAuthoritativeDetail, projectId, restoreAssignmentFocus, runningAssignment]);

  const loadHandoffCandidates = useCallback(async (
    detail: ProjectTaskDetail,
    item: ProjectTaskWorkItem,
  ) => {
    if (!detail.runId || handoffCandidates[item.id]?.status === 'loading'
      || handoffCandidates[item.id]?.status === 'ready') return;
    setHandoffCandidates((current) => ({ ...current, [item.id]: { status: 'loading' } }));
    const result = await listWorkItemHandoffCandidates({
      projectId,
      runId: detail.runId,
      workItemId: item.id,
      requestId: createProjectTaskBoardRequestId(),
    });
    if (!result.ok) {
      setHandoffCandidates((current) => ({ ...current, [item.id]: { status: 'failed', error: result.error } }));
      setActionError(result.error);
      setTransitionAnnouncement(`Agent 候选加载失败：${errorMessage(result.error)}`);
      restoreAssignmentFocus(`handoff:${item.id}`);
      return;
    }
    setHandoffCandidates((current) => ({ ...current, [item.id]: { status: 'ready', data: result.data } }));
  }, [handoffCandidates, projectId, restoreAssignmentFocus]);

  const requestHandoff = useCallback(async (
    detail: ProjectTaskDetail,
    item: ProjectTaskWorkItem,
    targetAgentId: string,
  ) => {
    if (runningAssignment || !detail.runId || targetAgentId === item.assignedAgentId) return;
    const candidateState = handoffCandidates[item.id];
    if (candidateState?.status !== 'ready') return;
    const key = `handoff:${item.id}`;
    setRunningAssignment({ kind: 'handoff', taskId: detail.taskId, workItemId: item.id });
    setActionError(undefined);
    setActionFeedback(undefined);
    setTransitionAnnouncement(`${item.id} 正在交接执行 Agent，当前执行者保持不变。`);
    const result = await handoffWorkItem({
      projectId,
      runId: detail.runId,
      workItemId: item.id,
      requestId: createProjectTaskBoardRequestId(),
      targetAgentId,
      expectedRunRevision: candidateState.data.authority.runRevision,
      expectedWorkItemRevision: candidateState.data.authority.workItemRevision,
      expectedLeaseEpoch: candidateState.data.authority.leaseEpoch,
    });
    setRunningAssignment(undefined);
    if (!result.ok) {
      setActionError(result.error);
      setTransitionAnnouncement(`Agent 交接失败：${errorMessage(result.error)}`);
      restoreAssignmentFocus(key);
      return;
    }
    mergeAuthoritativeDetail(result.data.task);
    setHandoffCandidates((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    const candidate = candidateState.data.candidates.find(({ agentId }) => agentId === targetAgentId);
    const message = `${item.id} 已交接给${candidate?.displayName ?? targetAgentId}，已采用服务端权威详情。`;
    setActionFeedback(message);
    setTransitionAnnouncement(message);
  }, [handoffCandidates, mergeAuthoritativeDetail, projectId, restoreAssignmentFocus, runningAssignment]);

  if (loadState === 'loading' && !page) {
    return <BoardNotice icon={<Loader2 className="h-5 w-5 animate-spin" />} title="正在加载项目任务" />;
  }

  if (loadState === 'failed' && !page) {
    return (
      <BoardNotice icon={<AlertCircle className="h-5 w-5" />} title="无法加载项目任务" detail={loadError ? errorMessage(loadError) : undefined}>
        <Button size="sm" variant="outline" onClick={() => void loadPage()}>重试</Button>
      </BoardNotice>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-50" aria-label="项目任务看板">
      <header className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input aria-label="搜索当前页任务" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前页任务"
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
        <select aria-label="按执行 Agent 筛选" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
          <option value="all">所有执行 Agent</option>
          {agentOptions.map((agentId) => <option key={agentId} value={agentId}>{agentId}</option>)}
        </select>
        <select aria-label="按优先级筛选" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
          <option value="all">所有优先级</option>
          {priorityOptions.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => void loadPage('replace')} disabled={loadState === 'loading'}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loadState === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />刷新
        </Button>
        <div className="flex rounded-md border border-slate-200 bg-white p-0.5" role="group" aria-label="任务视图">
          <Button size="sm" variant={viewMode === 'board' ? 'secondary' : 'ghost'} aria-pressed={viewMode === 'board'} onClick={() => setViewMode('board')}>
            <Columns className="mr-1 h-3.5 w-3.5" aria-hidden="true" />看板
          </Button>
          <Button size="sm" variant={viewMode === 'graph' ? 'secondary' : 'ghost'} aria-pressed={viewMode === 'graph'} onClick={() => setViewMode('graph')}>
            <Network className="mr-1 h-3.5 w-3.5" aria-hidden="true" />协同图
          </Button>
        </div>
      </header>

      <ProjectTaskCreationPanel
        projectId={projectId}
        onCreated={acceptCreatedTask}
        onOpenSolutionDesign={onOpenSolutionDesign}
      />

      <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
        {transitionAnnouncement}
      </div>
      {loadState === 'failed' && loadError && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">刷新失败：{errorMessage(loadError)}</div>
      )}
      {page?.items.length === 0 ? (
        <BoardNotice icon={<Search className="h-5 w-5" />} title="当前项目还没有任务" detail="任务出现后会在这里按状态展示。" />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto p-4">
            {viewMode === 'board' ? (
              <div className="grid min-w-[1040px] grid-cols-6 gap-3">
                {COLUMNS.map((column) => (
                  <TaskColumn key={column.status} status={column.status} label={column.label}
                    tasks={filteredItems.filter((task) => task.status === column.status)}
                    selectedTaskId={selectedTaskId}
                    runningTransition={runningTransition}
                    onSelect={selectTask}
                    onTransition={requestTransitionByTaskId}
                    registerTaskCard={registerTaskCard} />
                ))}
              </div>
            ) : (
              <ProjectTaskCollaborationGraph
                tasks={filteredItems}
                selectedTaskId={selectedTaskId}
                selectedWorkItemId={selectedWorkItemId}
                detail={selectedDetail}
                onSelectTask={selectTask}
                onSelectWorkItem={(taskId, workItemId) => {
                  if (taskId !== selectedTaskId) void selectTask(taskId);
                  setSelectedWorkItemId(workItemId);
                }}
              />
            )}
            <div className="mt-4 flex justify-center">
              <Button size="sm" variant="outline" disabled={!page?.cursor || loadingMore}
                onClick={() => page?.cursor && void loadPage('append', page.cursor)}>
                {loadingMore && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {page?.cursor ? '加载更多' : '已加载全部'}
              </Button>
            </div>
          </div>
          <TaskDetail detail={selectedDetail} isLoading={detailLoading} error={detailError} actionError={actionError}
            feedback={actionFeedback} runningTransition={runningTransition} selectedWorkItemId={selectedWorkItemId}
            runningAssignment={runningAssignment} handoffCandidates={handoffCandidates}
            transitionDraft={selectedTaskId ? transitionDrafts[selectedTaskId] ?? '' : ''}
            onTransition={requestTransition}
            onPriorityChange={requestPriority}
            onLoadHandoffCandidates={loadHandoffCandidates}
            onHandoff={requestHandoff}
            registerAssignmentControl={registerAssignmentControl}
            onTransitionDraftChange={(value) => {
              if (!selectedTaskId) return;
              setTransitionDrafts((current) => ({ ...current, [selectedTaskId]: value }));
            }} />
        </div>
      )}
    </section>
  );
}

function TaskColumn({
  status,
  label,
  tasks,
  selectedTaskId,
  runningTransition,
  onSelect,
  onTransition,
  registerTaskCard,
}: {
  readonly status: ProjectTaskBoardStatus;
  readonly label: string;
  readonly tasks: readonly ProjectTaskSummary[];
  readonly selectedTaskId?: string;
  readonly runningTransition?: { readonly taskId: string; readonly targetStatus: ProjectTaskBoardStatus };
  readonly onSelect: (taskId: string) => void;
  readonly onTransition: (taskId: string, targetStatus: ProjectTaskBoardStatus) => void;
  readonly registerTaskCard: (taskId: string, element: HTMLButtonElement | null) => void;
}) {
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('application/x-originos-project-task')
      || event.dataTransfer.getData('text/plain');
    if (taskId) onTransition(taskId, status);
  };

  return <div role="region" aria-label={label + '任务列'}
    onDragOver={(event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }}
    onDrop={handleDrop}
    className="min-h-40 rounded-lg border border-slate-200 bg-slate-100/70 p-2">
    <div className="mb-2 flex items-center justify-between px-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <span className="rounded bg-white px-1.5 text-xs text-slate-500">{tasks.length}</span>
    </div>
    <div className="space-y-2">
      {tasks.map((task) => {
        const isRunning = runningTransition?.taskId === task.taskId;
        return <article key={task.taskId} draggable={!isRunning} aria-busy={isRunning}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('application/x-originos-project-task', task.taskId);
            event.dataTransfer.setData('text/plain', task.taskId);
          }}
          className={'rounded-md border bg-white p-3 shadow-sm transition-colors hover:border-blue-300 ' + (selectedTaskId === task.taskId ? 'border-blue-500 ring-1 ring-blue-300' : 'border-slate-200')}>
          <button ref={(element) => registerTaskCard(task.taskId, element)}
            onClick={() => onSelect(task.taskId)}
            className="w-full text-left">
            <div className="line-clamp-2 text-sm font-medium text-slate-800">{task.title}</div>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{RUNTIME_STATUS_LABEL[task.runtimeStatus]}</span>
              <span className={'rounded px-1.5 py-0.5 ' + (task.runtimeAvailability === 'controllable' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>
                {task.runtimeAvailability === 'controllable' ? '可控制' : '需恢复'}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">优先级：{task.projectMetadata?.priority ? PRIORITY_LABEL[task.projectMetadata.priority] : '未设置'}</span>
            </div>
            <progress className="mt-2 h-1.5 w-full overflow-hidden rounded bg-slate-100 accent-blue-500" value={Math.max(0, Math.min(100, task.progress))} max={100}>{task.progress}%</progress>
            <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{task.currentStep ?? '等待执行'}</span><span>{task.progress}%</span></div>
            {task.blockerCount > 0 && <div className="mt-2 text-xs text-amber-700">{task.blockerCount} 个阻塞</div>}
          </button>
          <div className="mt-2 border-t border-slate-100 pt-2">
            <select id={'move-task-' + task.taskId} aria-label={'移动任务 ' + task.title} value=""
              disabled={Boolean(runningTransition)}
              onChange={(event) => {
                if (isBoardStatus(event.target.value)) onTransition(task.taskId, event.target.value);
              }}
              className="h-7 w-full rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 disabled:cursor-wait">
              <option value="">移动到…</option>
              {COLUMNS.filter((column) => column.status !== task.status).map((column) => (
                <option key={column.status} value={column.status}>{column.label}</option>
              ))}
            </select>
            {isRunning && <p className="mt-1 flex items-center text-xs text-blue-700">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
              正在请求移动到{STATUS_LABEL[runningTransition.targetStatus]}，仍在{STATUS_LABEL[task.status]}列
            </p>}
          </div>
        </article>;
      })}
    </div>
  </div>;
}

function TaskDetail({
  detail,
  isLoading,
  error,
  actionError,
  feedback,
  runningTransition,
  runningAssignment,
  handoffCandidates,
  selectedWorkItemId,
  transitionDraft,
  onTransition,
  onPriorityChange,
  onLoadHandoffCandidates,
  onHandoff,
  registerAssignmentControl,
  onTransitionDraftChange,
}: {
  readonly detail?: ProjectTaskDetail;
  readonly isLoading: boolean;
  readonly error?: ProjectTaskBoardServiceError;
  readonly actionError?: ProjectTaskBoardServiceError;
  readonly feedback?: string;
  readonly runningTransition?: { readonly taskId: string; readonly targetStatus: ProjectTaskBoardStatus };
  readonly runningAssignment?: AssignmentOperation;
  readonly handoffCandidates: Readonly<Record<string, HandoffCandidatesState>>;
  readonly selectedWorkItemId?: string;
  readonly transitionDraft: string;
  readonly onTransition: (task: ProjectTaskSummary, targetStatus: ProjectTaskBoardStatus) => void;
  readonly onPriorityChange: (task: ProjectTaskDetail, priority: AgentTaskProjectPriorityV1) => void;
  readonly onLoadHandoffCandidates: (task: ProjectTaskDetail, item: ProjectTaskWorkItem) => void;
  readonly onHandoff: (task: ProjectTaskDetail, item: ProjectTaskWorkItem, targetAgentId: string) => void;
  readonly registerAssignmentControl: (key: string, element: HTMLSelectElement | null) => void;
  readonly onTransitionDraftChange: (value: string) => void;
}) {
  const isRunning = Boolean(detail && runningTransition?.taskId === detail.taskId);
  const transitionForShortcut = (action: ProjectTaskAction): ProjectTaskPublicTransition | undefined =>
    detail?.transitions.find((transition) => transition.capability === action);
  const handleActionShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || isRunning || !detail) return;
    const action = SHORTCUT_ACTION[event.key.toLowerCase()];
    if (!action) return;
    const transition = transitionForShortcut(action);
    if (!transition) return;
    event.preventDefault();
    onTransition(detail, transition.targetStatus);
  };

  return <aside className="w-96 shrink-0 overflow-auto border-l bg-white p-4" aria-label="任务详情">
    {isLoading && <BoardNotice icon={<Loader2 className="h-5 w-5 animate-spin" />} title="正在加载任务详情" />}
    {!isLoading && error && <BoardNotice icon={<AlertCircle className="h-5 w-5" />} title="无法加载任务详情" detail={errorMessage(error)} />}
    {!isLoading && !error && !detail && <BoardNotice icon={<Search className="h-5 w-5" />} title="选择一项任务查看详情" />}
    {detail && !isLoading && <div className="space-y-5">
      <div><h2 className="text-base font-semibold text-slate-900">{detail.title}</h2><p className="mt-1 text-xs text-slate-500">{detail.taskId} · r{detail.revision}</p></div>
      <p className="text-sm text-slate-700">{detail.task.objective}</p>
      <DetailRow label="状态" value={detail.status} /><DetailRow label="运行状态" value={RUNTIME_STATUS_LABEL[detail.runtimeStatus]} /><DetailRow label="运行能力" value={detail.runtimeAvailability === 'controllable' ? '可控制' : '需要恢复运行时'} />
      <label className="block text-sm text-slate-700">
        优先级
        <select ref={(element) => registerAssignmentControl(`priority:${detail.taskId}`, element)}
          aria-label="设置任务优先级" value={detail.projectMetadata?.priority ?? ''}
          disabled={Boolean(runningAssignment)}
          onChange={(event) => {
            if (event.target.value in PRIORITY_LABEL) {
              onPriorityChange(detail, event.target.value as AgentTaskProjectPriorityV1);
            }
          }}
          className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-500 disabled:cursor-wait">
          <option value="" disabled>未设置</option>
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {runningAssignment?.kind === 'priority' && runningAssignment.taskId === detail.taskId
          && <span className="mt-1 flex items-center text-xs text-blue-700"><Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />正在提交，卡片保持当前优先级</span>}
      </label>
      <DetailRow label="当前步骤" value={detail.currentStep ?? '—'} /><DetailRow label="Run" value={detail.runId ? detail.runId + (detail.runStatus ? ' · ' + detail.runStatus : '') : '未关联'} />
      <DetailRow label="执行 Agent" value={detail.assignedAgentIds.length > 0 ? detail.assignedAgentIds.join('、') : '未分配'} />
      <DetailRow label="产物" value={detail.artifactRefs.length > 0 ? detail.artifactRefs.join('、') : '暂无'} />
      <DetailRow label="语义引用" value={detail.projectMetadata?.semanticRefs.length ? detail.projectMetadata.semanticRefs.join('、') : '未设置'} />
      {detail.task.blockers.filter((blocker) => !blocker.resolved).length > 0 && <div><h3 className="text-sm font-medium text-slate-800">阻塞</h3>{detail.task.blockers.filter((blocker) => !blocker.resolved).map((blocker) => <p key={blocker.id} className="mt-1 text-sm text-amber-800">{blocker.reason}：{blocker.neededToUnblock}</p>)}</div>}
      <div><h3 className="text-sm font-medium text-slate-800">WorkItems（{detail.workItemCount}）</h3>{detail.workItems.length === 0 ? <p className="mt-1 text-sm text-slate-500">没有关联的 WorkItem。</p> : <ul className="mt-2 space-y-2">{detail.workItems.map((item) => {
        const candidateState = handoffCandidates[item.id];
        const handoffRunning = runningAssignment?.kind === 'handoff' && runningAssignment.workItemId === item.id;
        return <li id={'work-item-' + item.id} key={item.id} aria-current={selectedWorkItemId === item.id ? 'true' : undefined} className={'rounded border p-2 text-sm ' + (selectedWorkItemId === item.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200')}>
          <div className="font-medium text-slate-800">{item.id} · {item.status}</div>
          <div className="mt-1 text-xs text-slate-500">执行者：{item.assignedAgentId} · 尝试 {item.attempts.length} 次</div>
          <label className="mt-2 block text-xs text-slate-700">
            交接执行 Agent
            <select ref={(element) => registerAssignmentControl(`handoff:${item.id}`, element)}
              aria-label={`交接 ${item.id} 的执行 Agent`} value={item.assignedAgentId}
              disabled={!detail.runId || Boolean(runningAssignment) || candidateState?.status === 'loading'}
              onFocus={() => onLoadHandoffCandidates(detail, item)}
              onChange={(event) => onHandoff(detail, item, event.target.value)}
              className="mt-1 h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-500 disabled:cursor-wait">
              <option value={item.assignedAgentId}>当前：{item.assignedAgentId}</option>
              {candidateState?.status === 'ready' && candidateState.data.candidates
                .filter(({ agentId }) => agentId !== item.assignedAgentId)
                .map(({ agentId, displayName }) => <option key={agentId} value={agentId}>{displayName}</option>)}
            </select>
            {candidateState?.status === 'loading' && <span className="mt-1 flex items-center text-blue-700"><Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />正在加载候选</span>}
            {handoffRunning && <span className="mt-1 flex items-center text-blue-700"><Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />正在交接，当前执行者保持不变</span>}
          </label>
        </li>;
      })}</ul>}</div>
      <label className="block text-sm text-slate-700">
        转换说明（可选）
        <textarea aria-label="转换说明" value={transitionDraft} onChange={(event) => onTransitionDraftChange(event.target.value)}
          className="mt-1 min-h-16 w-full rounded border border-slate-200 p-2 text-sm outline-none focus:border-blue-500"
          placeholder="补充审核或状态转换说明" />
      </label>
      {feedback && <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-800">{feedback}</p>}
      {actionError && <div role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-800">
        <p>操作未执行：{errorMessage(actionError)}</p>
        {actionError.gaps.length > 0 && <ul className="mt-1 list-disc pl-5">{actionError.gaps.map((gap) => <li key={gap.kind + ':' + gap.id}>{gap.message}</li>)}</ul>}
      </div>}
      {detail.transitions.length > 0 && <div role="toolbar" aria-label="任务操作" aria-describedby="task-action-shortcuts" onKeyDown={handleActionShortcut} className="flex flex-wrap gap-2">
        {detail.transitions.map((transition) => {
          const shortcut = transition.capability in ACTION_SHORTCUT
            ? ACTION_SHORTCUT[transition.capability as ProjectTaskAction]
            : undefined;
          const pending = isRunning && runningTransition?.targetStatus === transition.targetStatus;
          return <Button key={transition.capability + ':' + transition.targetStatus} size="sm"
            variant={transition.capability === 'cancel' ? 'destructive' : 'outline'}
            disabled={Boolean(runningTransition)}
            onClick={() => onTransition(detail, transition.targetStatus)}
            {...(shortcut ? { 'aria-keyshortcuts': shortcut, title: ACTION_LABEL[transition.capability] + '（' + shortcut + '）' } : {})}>
            {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <span className="mr-1">{actionIcon(transition.capability)}</span>}
            {ACTION_LABEL[transition.capability]}
          </Button>;
        })}
        <p id="task-action-shortcuts" className="sr-only">可使用 Alt 加快捷键执行可用操作：暂停 P，恢复 U，重试 R，取消 C。</p>
      </div>}
    </div>}
  </aside>;
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) { return <div className="text-sm"><span className="text-slate-500">{label}</span><span className="ml-3 text-slate-800">{value}</span></div>; }

function BoardNotice({ icon, title, detail, children }: { readonly icon: ReactNode; readonly title: string; readonly detail?: string; readonly children?: ReactNode }) { return <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-slate-500"><span>{icon}</span><div><p className="text-sm font-medium text-slate-700">{title}</p>{detail && <p className="mt-1 text-sm">{detail}</p>}</div>{children}</div>; }
