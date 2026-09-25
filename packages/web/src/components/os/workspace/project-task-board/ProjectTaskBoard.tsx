'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Loader2, Pause, Play, RefreshCw, Search, XCircle } from 'lucide-react';

import type {
  ProjectTaskAction,
  ProjectTaskBoardStatus,
  ProjectTaskDetail,
  ProjectTaskPage,
  ProjectTaskSummary,
} from '@originos/core/lib/features/project';
import type { AgentTaskAction } from '@originos/core/lib/integrations/pi-agent/task-runtime';
import {
  controlProjectTask,
  createProjectTaskBoardRequestId,
  getProjectTask,
  listProjectTasks,
  type ProjectTaskBoardServiceError,
} from '@/services/project-task-board';
import { Button } from '@/components/ui/button';

const COLUMNS: ReadonlyArray<{ status: ProjectTaskBoardStatus; label: string }> = [
  { status: 'pending', label: '待执行' },
  { status: 'active', label: '进行中' },
  { status: 'blocked', label: '阻塞' },
  { status: 'review', label: '待审核' },
  { status: 'done', label: '已完成' },
  { status: 'cancelled', label: '已取消' },
];

const ACTION_LABEL: Record<ProjectTaskAction, string> = {
  pause: '暂停',
  resume: '恢复',
  retry: '重试',
  cancel: '取消',
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
}

type LoadState = 'loading' | 'ready' | 'failed';

function errorMessage(error: ProjectTaskBoardServiceError): string {
  return `${error.message}${error.retryable ? '，可以重试。' : ''}`;
}

function actionIcon(action: ProjectTaskAction) {
  if (action === 'pause') return <Pause className="h-3.5 w-3.5" aria-hidden="true" />;
  if (action === 'resume') return <Play className="h-3.5 w-3.5" aria-hidden="true" />;
  if (action === 'retry') return <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />;
  return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
}

function projectAction(action: AgentTaskAction): ProjectTaskAction | undefined {
  if (action === 'stop') return 'pause';
  if (action === 'resume' || action === 'retry' || action === 'cancel') return action;
  return undefined;
}

export function ProjectTaskBoard({ projectId }: ProjectTaskBoardProps) {
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
  const [runningAction, setRunningAction] = useState<ProjectTaskAction>();

  const loadPage = useCallback(async () => {
    setLoadState('loading');
    setLoadError(undefined);
    const result = await listProjectTasks({
      projectId,
      requestId: createProjectTaskBoardRequestId(),
      limit: 50,
    });
    if (!result.ok) {
      setLoadError(result.error);
      setLoadState('failed');
      return;
    }
    setPage(result.data);
    setLoadState('ready');
  }, [projectId]);

  useEffect(() => {
    setPage(undefined);
    setSelectedTaskId(undefined);
    setSelectedDetail(undefined);
    void loadPage();
  }, [loadPage]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (page?.items ?? []).filter((task) => {
      if (!normalized) return true;
      return [task.title, task.taskId, task.currentStep].filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalized));
    });
  }, [page, query]);

  const selectTask = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
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

  const control = useCallback(async (action: ProjectTaskAction) => {
    if (!selectedDetail) return;
    setRunningAction(action);
    setActionError(undefined);
    setActionFeedback(undefined);
    const result = await controlProjectTask({
      projectId,
      taskId: selectedDetail.taskId,
      action,
      requestId: createProjectTaskBoardRequestId(),
      expectedRevision: selectedDetail.revision,
    });
    setRunningAction(undefined);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setSelectedDetail(result.data);
    setActionFeedback(`${ACTION_LABEL[action]}请求已接受，已更新为权威投影。`);
    void loadPage();
  }, [loadPage, projectId, selectedDetail]);

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
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" title="当前任务投影未提供执行 Agent">
          <option value="all">所有执行 Agent（未提供）</option>
        </select>
        <select aria-label="按优先级筛选" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" title="当前任务投影未提供优先级">
          <option value="all">所有优先级（未提供）</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => void loadPage()} disabled={loadState === 'loading'}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loadState === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />刷新
        </Button>
      </header>

      {loadState === 'failed' && loadError && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">刷新失败：{errorMessage(loadError)}</div>
      )}
      {page?.items.length === 0 ? (
        <BoardNotice icon={<Search className="h-5 w-5" />} title="当前项目还没有任务" detail="任务出现后会在这里按状态展示。" />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto p-4">
            <div className="grid min-w-[1040px] grid-cols-6 gap-3">
              {COLUMNS.map((column) => (
                <TaskColumn key={column.status} label={column.label} tasks={filteredItems.filter((task) => task.status === column.status)}
                  selectedTaskId={selectedTaskId} onSelect={selectTask} />
              ))}
            </div>
          </div>
          <TaskDetail detail={selectedDetail} isLoading={detailLoading} error={detailError} actionError={actionError}
            feedback={actionFeedback} runningAction={runningAction} onControl={control} />
        </div>
      )}
    </section>
  );
}

function TaskColumn({ label, tasks, selectedTaskId, onSelect }: { readonly label: string; readonly tasks: readonly ProjectTaskSummary[]; readonly selectedTaskId?: string; readonly onSelect: (taskId: string) => void }) {
  return <div className="min-h-40 rounded-lg border border-slate-200 bg-slate-100/70 p-2">
    <div className="mb-2 flex items-center justify-between px-1 text-sm font-medium text-slate-700"><span>{label}</span><span className="rounded bg-white px-1.5 text-xs text-slate-500">{tasks.length}</span></div>
    <div className="space-y-2">{tasks.map((task) => <button key={task.taskId} onClick={() => onSelect(task.taskId)}
      className={`w-full rounded-md border bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-300 ${selectedTaskId === task.taskId ? 'border-blue-500 ring-1 ring-blue-300' : 'border-slate-200'}`}>
      <div className="line-clamp-2 text-sm font-medium text-slate-800">{task.title}</div>
      <progress className="mt-2 h-1.5 w-full overflow-hidden rounded bg-slate-100 accent-blue-500" value={Math.max(0, Math.min(100, task.progress))} max={100}>{task.progress}%</progress>
      <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{task.currentStep ?? '等待执行'}</span><span>{task.progress}%</span></div>
      {task.blockerCount > 0 && <div className="mt-2 text-xs text-amber-700">{task.blockerCount} 个阻塞</div>}
    </button>)}</div>
  </div>;
}

function TaskDetail({ detail, isLoading, error, actionError, feedback, runningAction, onControl }: { readonly detail?: ProjectTaskDetail; readonly isLoading: boolean; readonly error?: ProjectTaskBoardServiceError; readonly actionError?: ProjectTaskBoardServiceError; readonly feedback?: string; readonly runningAction?: ProjectTaskAction; readonly onControl: (action: ProjectTaskAction) => void }) {
  const availableActions = detail?.actions.map(projectAction).filter((action): action is ProjectTaskAction => action !== undefined) ?? [];
  const handleActionShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || runningAction) return;
    const action = SHORTCUT_ACTION[event.key.toLowerCase()];
    if (!action || !availableActions.includes(action)) return;
    event.preventDefault();
    onControl(action);
  };

  return <aside className="w-96 shrink-0 overflow-auto border-l bg-white p-4" aria-label="任务详情">
    {isLoading && <BoardNotice icon={<Loader2 className="h-5 w-5 animate-spin" />} title="正在加载任务详情" />}
    {!isLoading && error && <BoardNotice icon={<AlertCircle className="h-5 w-5" />} title="无法加载任务详情" detail={errorMessage(error)} />}
    {!isLoading && !error && !detail && <BoardNotice icon={<Search className="h-5 w-5" />} title="选择一项任务查看详情" />}
    {detail && !isLoading && <div className="space-y-5">
      <div><h2 className="text-base font-semibold text-slate-900">{detail.title}</h2><p className="mt-1 text-xs text-slate-500">{detail.taskId} · r{detail.revision}</p></div>
      <p className="text-sm text-slate-700">{detail.task.objective}</p>
      <DetailRow label="状态" value={detail.status} /><DetailRow label="当前步骤" value={detail.currentStep ?? '—'} /><DetailRow label="Run" value={detail.runId ? `${detail.runId}${detail.runStatus ? ` · ${detail.runStatus}` : ''}` : '未关联'} />
      {detail.task.blockers.filter((blocker) => !blocker.resolved).length > 0 && <div><h3 className="text-sm font-medium text-slate-800">阻塞</h3>{detail.task.blockers.filter((blocker) => !blocker.resolved).map((blocker) => <p key={blocker.id} className="mt-1 text-sm text-amber-800">{blocker.reason}：{blocker.neededToUnblock}</p>)}</div>}
      <div><h3 className="text-sm font-medium text-slate-800">WorkItems（{detail.workItemCount}）</h3>{detail.workItems.length === 0 ? <p className="mt-1 text-sm text-slate-500">没有关联的 WorkItem。</p> : <ul className="mt-2 space-y-2">{detail.workItems.map((item) => <li key={item.id} className="rounded border border-slate-200 p-2 text-sm"><div className="font-medium text-slate-800">{item.id} · {item.status}</div><div className="mt-1 text-xs text-slate-500">执行者：{item.assignedAgentId} · 尝试 {item.attempts.length} 次</div></li>)}</ul>}</div>
      {feedback && <p role="status" className="rounded bg-emerald-50 p-2 text-sm text-emerald-800">{feedback}</p>}
      {actionError && <p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-800">操作未执行：{errorMessage(actionError)}</p>}
      {availableActions.length > 0 && <div role="toolbar" aria-label="任务操作" aria-describedby="task-action-shortcuts" onKeyDown={handleActionShortcut} className="flex flex-wrap gap-2">
        {availableActions.map((action) => <Button key={action} size="sm" variant={action === 'cancel' ? 'destructive' : 'outline'} disabled={Boolean(runningAction)} onClick={() => onControl(action)} aria-keyshortcuts={ACTION_SHORTCUT[action]} title={`${ACTION_LABEL[action]}（${ACTION_SHORTCUT[action]}）`}>
          {runningAction === action ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <span className="mr-1">{actionIcon(action)}</span>}{ACTION_LABEL[action]}
        </Button>)}
        <p id="task-action-shortcuts" className="sr-only">可使用 Alt 加快捷键执行可用操作：暂停 P，恢复 U，重试 R，取消 C。</p>
      </div>}
    </div>}
  </aside>;
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) { return <div className="text-sm"><span className="text-slate-500">{label}</span><span className="ml-3 text-slate-800">{value}</span></div>; }

function BoardNotice({ icon, title, detail, children }: { readonly icon: ReactNode; readonly title: string; readonly detail?: string; readonly children?: ReactNode }) { return <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-slate-500"><span>{icon}</span><div><p className="text-sm font-medium text-slate-700">{title}</p>{detail && <p className="mt-1 text-sm">{detail}</p>}</div>{children}</div>; }
