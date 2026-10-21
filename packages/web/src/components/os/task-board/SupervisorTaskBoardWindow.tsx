'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Circle,
  Clock3,
  Database,
  FileText,
  FolderKanban,
  Loader2,
  MessageSquare,
  Network,
  PanelLeftClose,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';

import type {
  SupervisorTaskBoardProjection,
  SupervisorTaskBoardProject,
  SupervisorTaskBoardStatus,
  SupervisorTaskBoardTask,
} from '@originos/core/modules/collaboration-runtime/facade';
import { normalizeRuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/client';
import { getCollaborationTopology } from '@originos/core/lib/integrations/electron/services/collaboration';
import { openLocalFile } from '@originos/core/lib/integrations/electron/local-fs';
import { MultiAgentLauncher, type FormalHitlReplyRequest } from '@originos/core/modules/collaboration-runtime/ui/MultiAgentLauncher';
import { MarkdownContent } from '@/components/ui/chat-message';
import { AskUserQuestionComponent, parseAskUserQuestion, removeYamlBlock } from '@/components/ui/chat-message';
import { ChatInputBar } from '@/components/ui/chat-input-bar';
import { useFileUpload } from '@/lib/hooks/use-file-upload';
import { useSettingsStore } from '@/store/settingsStore';
import type { CollaborationTopology, RuntimeEvent } from '@originos/core/modules/collaboration-runtime/session/types';
import { TopologyGraph } from '@originos/core/modules/collaboration-runtime/ui/TopologyGraph';
import { useCollaborationUi } from '@originos/core/modules/collaboration-runtime/ui/store';
import { ProjectWorkspace, WorkspaceWindow } from '@/components/os/workspace';
import { AppWindowManager } from '@/services/AppWindowManager';

const COLUMNS: ReadonlyArray<{
  id: string;
  label: string;
  statuses: SupervisorTaskBoardStatus[];
  icon: typeof Circle;
  accent: string;
}> = [
  { id: 'planned', label: '计划中', statuses: ['planned'], icon: Network, accent: 'text-slate-400' },
  { id: 'queued', label: '待处理', statuses: ['pending', 'assigned'], icon: Circle, accent: 'text-slate-500' },
  { id: 'running', label: '进行中', statuses: ['running'], icon: Clock3, accent: 'text-blue-600' },
  { id: 'verifying', label: '待自动验证', statuses: ['verifying'], icon: Loader2, accent: 'text-cyan-600' },
  { id: 'waiting-hitl', label: '待人工确认', statuses: ['waiting_hitl'], icon: AlertCircle, accent: 'text-violet-600' },
  { id: 'review', label: '待 Supervisor 验收', statuses: ['reported'], icon: AlertCircle, accent: 'text-amber-600' },
  { id: 'revision', label: '退回修改', statuses: ['revision'], icon: RefreshCw, accent: 'text-orange-600' },
  { id: 'blocked', label: '受阻', statuses: ['blocked'], icon: AlertCircle, accent: 'text-slate-500' },
  { id: 'completed', label: '已完成', statuses: ['completed'], icon: CheckCircle2, accent: 'text-emerald-600' },
  { id: 'failed', label: '失败 / 待处理', statuses: ['failed', 'needs_review'], icon: XCircle, accent: 'text-rose-600' },
];

function taskValue(value: unknown, empty: string): string {
  if (value === undefined || value === null || value === '') {return empty;}
  if (typeof value === 'string') {return value;}
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const request = record['request'];
    const acceptance = record['acceptanceCriteria'];
    if (typeof request === 'string') {
      return [request, typeof acceptance === 'string' ? `\n验收标准：${acceptance}` : ''].join('');
    }
  }
  return JSON.stringify(value, null, 2);
}

function formatTime(value?: string): string {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function resolveProjectArtifactPath(ref: string, projectId: string): string | null {
  const normalized = ref.trim().replace(/\\/gu, '/').replace(/\/+/gu, '/');
  const projectMarker = `/data/projects/${projectId}/`;
  const markerIndex = normalized.indexOf(projectMarker);
  const relative = markerIndex >= 0
    ? normalized.slice(markerIndex + projectMarker.length)
    : normalized.startsWith(`data/projects/${projectId}/`)
      ? normalized.slice(`data/projects/${projectId}/`.length)
      : normalized.startsWith(`projects/${projectId}/`)
        ? normalized.slice(`projects/${projectId}/`.length)
      : normalized.replace(/^\.\//u, '');
  if (!relative || relative.startsWith('/') || /^[a-zA-Z]:\//u.test(relative) || relative.split('/').some((segment) => segment === '..')) return null;
  return relative;
}

function productWindowKey(value: string): string {
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36);
}

export async function openTaskArtifact(task: SupervisorTaskBoardTask, ref: string): Promise<boolean> {
  let resolvedRef = ref;
  if (ref.startsWith('artifact://')) {
    const response = await fetch('/api/collaboration/task-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve-artifact', projectId: task.projectId, artifactRef: ref }),
    });
    const payload = await response.json() as { path?: string; error?: string };
    if (!response.ok || !payload.path) throw new Error(payload.error ?? '无法解析任务产物');
    resolvedRef = payload.path;
  }
  const filePath = resolveProjectArtifactPath(resolvedRef, task.projectId);
  if (!filePath) return false;
  if (!filePath.toLowerCase().endsWith('.md')) {
    await openLocalFile(`projects/${task.projectId}/${filePath}`);
    return true;
  }
  AppWindowManager.getInstance().openComponentWindow(
    `task-artifact-${task.projectId}-${productWindowKey(filePath)}`,
    `${task.projectName} · ${filePath.split('/').at(-1) ?? '任务产物'}`,
    WorkspaceWindow,
    {
      projectId: task.projectId,
      projectName: task.projectName,
      entryType: 'project',
      entryId: task.projectId,
      ontologyId: `ontology-${task.projectId}`,
      initialFilePath: filePath,
    },
    {
      position: { width: 1100, height: 760 },
      constraints: { minWidth: 800, minHeight: 600 },
      metadata: { entryType: 'project-file', entryId: filePath, projectId: task.projectId },
    },
  );
  return true;
}

export function openTaskData(task: SupervisorTaskBoardTask): void {
  AppWindowManager.getInstance().openComponentWindow(
    `project-data-${task.projectId}`,
    `${task.projectName} · 数据`,
    ProjectWorkspace,
    { projectId: task.projectId, projectName: task.projectName, ontologyId: `ontology-${task.projectId}` },
    {
      position: { width: 1200, height: 800 },
      constraints: { minWidth: 800, minHeight: 600 },
      metadata: { entryType: 'project-workspace', entryId: task.projectId, projectId: task.projectId },
    },
  );
}

interface SupervisorTaskBoardWindowProps {
  initialProjectId?: string;
  initialProjectName?: string;
}

export function restoredConversationEvents(project: SupervisorTaskBoardProject | undefined): {
  sessionId?: string;
  events: RuntimeEvent[];
} {
  if (!project) return { events: [] };
  const pending = project.tasks.find((task) => task.status === 'waiting_hitl' && task.acceptance);
  const conversation = pending
    ? project.conversations.find((item) => item.sessionId === pending.sessionId)
    : project.conversations[0];
  const sessionId = pending?.sessionId ?? conversation?.sessionId;
  if (!sessionId) return { events: [] };
  const events: RuntimeEvent[] = (conversation?.entries ?? []).map((entry, index) => ({
    id: `restored:${entry.id}`,
    sessionId,
    seq: index + 1,
    type: entry.role === 'user' ? 'USER_INPUT' : entry.role === 'supervisor' ? 'ASSISTANT_MESSAGE' : 'AGENT_THINKING',
    source: entry.role === 'user' ? 'user' : 'supervisor',
    payload: entry.role === 'user' ? { message: entry.content } : entry.role === 'supervisor' ? { content: entry.content } : { message: entry.content },
    timestamp: entry.timestamp,
  }));
  for (const task of project.tasks) {
    if (task.sessionId !== sessionId || task.status !== 'waiting_hitl' || !task.acceptance || !task.runId) continue;
    events.push({
      id: `formal-hitl:${task.acceptance.requestId}`,
      sessionId,
      seq: events.length + 1,
      type: 'HUMAN_REVIEW_REQUEST',
      source: 'supervisor',
      payload: {
        question: task.acceptance.question,
        agentId: task.assignedTo,
        runId: task.runId,
        requestId: task.acceptance.requestId,
        attemptId: task.acceptance.attemptId,
        leaseEpoch: task.acceptance.leaseEpoch,
        options: task.acceptance.options,
      },
      timestamp: task.createdAt,
    });
  }
  return { sessionId, events };
}

export const SupervisorTaskBoardWindow = ({ initialProjectId, initialProjectName }: SupervisorTaskBoardWindowProps): React.ReactElement => {
  const [projection, setProjection] = useState<SupervisorTaskBoardProjection>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState(initialProjectId ?? 'all');
  const [selectedTask, setSelectedTask] = useState<SupervisorTaskBoardTask>();
  const [activeView, setActiveView] = useState<'board' | 'topology'>('board');
  const [topology, setTopology] = useState<CollaborationTopology | null>(null);
  const [topologyLoading, setTopologyLoading] = useState(false);
  const [topologyError, setTopologyError] = useState<string>();
  const [conversationCollapsed, setConversationCollapsed] = useState(false);
  const navCollapsed = Boolean(initialProjectId) && !conversationCollapsed;
  const getEffectiveConfig = useSettingsStore((state) => state.getEffectiveConfig);
  const loadSettings = useSettingsStore((state) => state.loadFromServer);
  const activities = useCollaborationUi((state) => state.activities);
  const recentlyActiveAgents = useCollaborationUi((state) => state.recentlyActiveAgents);
  const topologyActivities = useMemo(() => {
    const merged = { ...activities };
    const tasks = projection?.projects.find((project) => project.projectId === initialProjectId)?.tasks ?? [];
    for (const task of tasks) {
      if (!task.assignedTo || merged[task.assignedTo]) {continue;}
      if (task.status === 'running' || task.status === 'assigned') {
        merged[task.assignedTo] = { agentId: task.assignedTo, status: 'running', lastUpdated: task.createdAt, message: task.title };
      } else if (task.status === 'blocked' || task.status === 'waiting_hitl') {
        merged[task.assignedTo] = { agentId: task.assignedTo, status: 'waiting', lastUpdated: task.createdAt, message: task.title };
      }
    }
    return merged;
  }, [activities, initialProjectId, projection]);
  const currentProject = projection?.projects.find((project) => project.projectId === initialProjectId);
  const restoredConversation = useMemo(() => restoredConversationEvents(currentProject), [currentProject]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const endpoint = initialProjectId
        ? `/api/collaboration/task-board?projectId=${encodeURIComponent(initialProjectId)}`
        : '/api/collaboration/task-board';
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) {throw new Error(`HTTP ${response.status}`);}
      setProjection(await response.json() as SupervisorTaskBoardProjection);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法加载任务看板');
    } finally {
      setLoading(false);
    }
  }, [initialProjectId]);

  const loadTopology = useCallback(async (): Promise<void> => {
    if (!initialProjectId) {return;}
    setTopologyLoading(true);
    setTopologyError(undefined);
    try {
      const result = await getCollaborationTopology(initialProjectId);
      if (!result.success) {
        throw new Error(result.error?.message || '尚未生成多 Agent 协同图');
      }
      setTopology(result.data as CollaborationTopology);
    } catch (reason) {
      setTopology(null);
      setTopologyError(reason instanceof Error ? reason.message : '无法加载多 Agent 协同图');
    } finally {
      setTopologyLoading(false);
    }
  }, [initialProjectId]);

  useEffect(() => {
    void loadSettings();
    void load();
  }, [load, loadSettings]);

  useEffect(() => {
    if (activeView !== 'topology' || !initialProjectId || topology || topologyLoading || topologyError) {return;}
    void loadTopology();
  }, [activeView, initialProjectId, loadTopology, topology, topologyError, topologyLoading]);

  const hasActiveTasks = (projection?.projects ?? []).some((project) =>
    project.tasks.some((task) => ['planned', 'pending', 'assigned', 'running', 'verifying', 'waiting_hitl', 'reported', 'revision', 'blocked', 'needs_review'].includes(task.status)),
  );
  useEffect(() => {
    if (!hasActiveTasks) {return;}
    const interval = window.setInterval(() => { void load(); }, 3000);
    return () => window.clearInterval(interval);
  }, [hasActiveTasks, load]);

  const refreshFromRuntimeEvent = useCallback((): void => {
    window.setTimeout(() => { void load(); }, 200);
  }, [load]);

  const resolveFormalHitl = useCallback(async (request: FormalHitlReplyRequest, answer: string): Promise<boolean> => {
    if (!initialProjectId || !restoredConversation.sessionId) return false;
    setError(undefined);
    const response = await fetch('/api/collaboration/task-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: initialProjectId, ...request, answer }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? '无法提交人工确认');
      return false;
    }
    useCollaborationUi.getState().addEvent({
      id: `formal-hitl-response:${request.requestId}:${Date.now()}`,
      sessionId: restoredConversation.sessionId,
      seq: Date.now(),
      type: 'HUMAN_REVIEW_RESPONSE',
      source: 'user',
      payload: { response: answer, requestId: request.requestId },
      timestamp: new Date().toISOString(),
    });
    await load();
    return true;
  }, [initialProjectId, load, restoredConversation.sessionId]);

  const retryFormalRun = useCallback(async (runId: string): Promise<boolean> => {
    if (!initialProjectId) return false;
    setError(undefined);
    const response = await fetch('/api/collaboration/task-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry-run', projectId: initialProjectId, runId }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? '无法重试任务');
      return false;
    }
    await load();
    return true;
  }, [initialProjectId, load]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (projection?.projects ?? [])
      .filter((project) => projectFilter === 'all' || project.projectId === projectFilter)
      .map((project) => ({
        ...project,
        tasks: project.tasks.filter((task) => !normalized || [
          task.title,
          task.description,
          task.assignedTo,
          task.agentName,
          task.sessionGoal,
          taskValue(task.input, ''),
          taskValue(task.output, ''),
        ].some((value) => value?.toLowerCase().includes(normalized))),
      }))
      .filter((project) => project.tasks.length > 0);
  }, [projectFilter, projection, query]);

  let boardContent: ReactNode;
  if (loading && !projection) {
    boardContent = <BoardState icon={<Loader2 className="h-6 w-6 animate-spin" />} title="正在整理项目任务" />;
  } else if (error && !projection) {
    boardContent = <BoardState icon={<AlertCircle className="h-6 w-6" />} title="任务看板加载失败" detail={error} />;
  } else if (visibleProjects.length === 0) {
    boardContent = <BoardState icon={<FolderKanban className="h-6 w-6" />} title="没有符合条件的任务" detail="Supervisor 派发任务后会按项目出现在这里。" />;
  } else {
    boardContent = <div className="space-y-6">{visibleProjects.map((project) => (
      <ProjectBoard key={project.projectId} project={project} selectedTaskId={selectedTask?.id} onSelect={setSelectedTask} />
    ))}</div>;
  }

  return (
    <main className="flex h-full min-h-0 bg-slate-50 text-slate-950" aria-label="Supervisor 任务看板">
      <aside className={`${navCollapsed ? 'hidden' : 'flex w-60'} shrink-0 flex-col border-r border-slate-200 bg-white`}>
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex items-center gap-2 text-base font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white"><FolderKanban className="h-4 w-4" /></span>
            任务看板
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{initialProjectId ? '查看当前项目中 Supervisor 派发给 Agent 的任务。' : '集中查看 Supervisor 在各项目中派发给 Agent 的任务。'}</p>
        </div>
        <nav className="min-h-0 flex-1 overflow-auto p-2" aria-label="项目分组">
          {!initialProjectId && <ProjectFilterButton active={projectFilter === 'all'} label="全部项目" count={projection?.taskCount ?? 0} onClick={() => setProjectFilter('all')} />}
          {(projection?.projects ?? []).map((project) => (
            <ProjectFilterButton key={project.projectId} active={projectFilter === project.projectId}
              label={project.projectName} count={project.tasks.length} onClick={() => setProjectFilter(project.projectId)} />
          ))}
        </nav>
      </aside>

      {initialProjectId && projection && (
        <CollaborationConversationPanel
          projectId={initialProjectId}
          projectName={initialProjectName ?? projection?.projects[0]?.projectName ?? '当前项目'}
          collapsed={conversationCollapsed}
          onToggleCollapsed={() => setConversationCollapsed((current) => !current)}
          llmConfig={normalizeRuntimeLLMConfig(getEffectiveConfig())}
          onSessionCreated={() => { void load(); }}
          onRuntimeEvent={refreshFromRuntimeEvent}
          initialSessionId={restoredConversation.sessionId}
          initialEvents={restoredConversation.events}
          onFormalHitlReply={resolveFormalHitl}
        />
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h1 className="text-base font-semibold">Supervisor 任务</h1>
            <p className="text-xs text-slate-500">{initialProjectId ? '当前项目' : `${projection?.projects.length ?? 0} 个项目`} · {projection?.taskCount ?? 0} 个任务</p>
          </div>
          {initialProjectId && (
            <div role="tablist" aria-label="项目协作视图" className="flex h-9 items-center rounded-lg bg-slate-100 p-1">
              <button type="button" role="tab" aria-selected={activeView === 'board'} onClick={() => setActiveView('board')}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${activeView === 'board' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                <FolderKanban className="h-3.5 w-3.5" />任务看板
              </button>
              <button type="button" role="tab" aria-selected={activeView === 'topology'} onClick={() => setActiveView('topology')}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${activeView === 'topology' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                <Network className="h-3.5 w-3.5" />协同图
              </button>
            </div>
          )}
          {initialProjectId && (
            <button type="button" onClick={() => setConversationCollapsed(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
              <MessageSquare className="h-4 w-4" />发布任务
            </button>
          )}
          <div className="relative ml-auto min-w-64 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input aria-label="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、Agent、输入或输出"
              disabled={activeView === 'topology'}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50" />
          </div>
          <button type="button" onClick={() => { if (activeView === 'topology') { void loadTopology(); } else { void load(); } }} disabled={activeView === 'topology' ? topologyLoading : loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${(activeView === 'topology' ? topologyLoading : loading) ? 'animate-spin' : ''}`} />刷新
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto p-5">
          {activeView === 'topology' && initialProjectId ? (
            <section className="h-full min-h-[32rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="多 Agent 协同图">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600"><Network className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-800">多 Agent 协同图</h2><p className="mt-0.5 text-[11px] text-slate-500">查看 Supervisor 与 Worker 之间的触发、依赖和通知关系</p></div>
              </div>
              <div className="h-[calc(100%_-_3.75rem)] min-h-[28rem] bg-slate-50">
                {topologyLoading ? <BoardState icon={<Loader2 className="h-5 w-5 animate-spin" />} title="正在加载协同图" />
                  : topology ? <TopologyGraph topology={topology} activities={topologyActivities} recentlyActiveAgents={recentlyActiveAgents} />
                    : <BoardState icon={<Network className="h-5 w-5" />} title="尚未生成协同图" detail={topologyError} />}
              </div>
            </section>
          ) : boardContent}
        </div>
        </div>
      </section>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(undefined)}
          onResolveHitl={async (answer) => {
            if (!selectedTask.acceptance || !selectedTask.runId) return false;
            const accepted = await resolveFormalHitl({
              eventId: `formal-hitl:${selectedTask.acceptance.requestId}`,
              runId: selectedTask.runId,
              requestId: selectedTask.acceptance.requestId,
              attemptId: selectedTask.acceptance.attemptId,
              leaseEpoch: selectedTask.acceptance.leaseEpoch,
              options: selectedTask.acceptance.options,
            }, answer);
            if (accepted) setSelectedTask(undefined);
            return accepted;
          }}
          onRetry={async () => {
            if (!selectedTask.runId) return false;
            const retried = await retryFormalRun(selectedTask.runId);
            if (retried) setSelectedTask(undefined);
            return retried;
          }}
        />
      )}
    </main>
  );
}

const CollaborationConversationPanel = ({ projectId, projectName, collapsed, onToggleCollapsed, llmConfig, onSessionCreated, onRuntimeEvent, initialSessionId, initialEvents, onFormalHitlReply }: {
  projectId: string;
  projectName: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  llmConfig: ReturnType<typeof normalizeRuntimeLLMConfig>;
  onSessionCreated: (sessionId: string) => void;
  onRuntimeEvent: () => void;
  initialSessionId?: string;
  initialEvents: readonly RuntimeEvent[];
  onFormalHitlReply: (request: FormalHitlReplyRequest, answer: string) => Promise<boolean>;
}): React.ReactElement => {
  return (
    <aside className={`flex ${collapsed ? 'w-11' : 'w-[390px]'} shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200`} aria-label="协作对话">
      {collapsed && (
        <header className="border-b border-slate-200 px-1.5 py-3">
          <button type="button" onClick={onToggleCollapsed} aria-label="展开协作对话" aria-expanded={false}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <PanelLeftClose className="h-4 w-4 rotate-180" />
          </button>
        </header>
      )}
      <div className={collapsed ? 'hidden' : 'min-h-0 flex-1'}>
        <MultiAgentLauncher
          projectId={projectId}
          projectName={projectName}
          llmConfig={llmConfig ?? undefined}
          conversationOnly
          onCollapse={onToggleCollapsed}
          onSessionCreated={onSessionCreated}
          onRuntimeEvent={onRuntimeEvent}
          initialSessionId={initialSessionId}
          initialEvents={initialEvents}
          onFormalHitlReply={onFormalHitlReply}
          uiDeps={{
            MarkdownContent,
            ChatInputBar,
            AskUserQuestionComponent,
            parseAskUserQuestion,
            removeYamlBlock,
            useFileUpload,
          }}
        />
      </div>
    </aside>
  );
};

const ProjectFilterButton = ({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }): React.ReactElement => {
  return (
    <button type="button" onClick={onClick} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${active ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
      <FolderKanban className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm">{count}</span>
    </button>
  );
}

const ProjectBoard = ({ project, selectedTaskId, onSelect }: { project: SupervisorTaskBoardProject; selectedTaskId?: string; onSelect: (task: SupervisorTaskBoardTask) => void }): React.ReactElement => {
  return (
    <section aria-label={`项目 ${project.projectName}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-indigo-600 shadow-sm"><FolderKanban className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{project.projectName}</h2>
          <p className="text-xs text-slate-500">{project.tasks.length} 个任务 · {project.sessionCount} 次协同运行</p>
        </div>
      </div>
      <div className="grid min-w-[2100px] grid-cols-9 gap-3">
        {COLUMNS.map((column) => {
          const tasks = project.tasks.filter((task) => column.statuses.includes(task.status));
          const Icon = column.icon;
          return (
            <div key={column.id} aria-label={`${column.label}任务`} className="flex min-h-32 flex-col rounded-xl bg-slate-100/80 p-2">
              <div className="flex items-center gap-2 px-1.5 py-1 text-xs font-semibold text-slate-700">
                <Icon className={`h-3.5 w-3.5 ${column.accent}`} /><span>{column.label}</span>
                <span className="ml-auto text-[10px] font-normal text-slate-400">{tasks.length}</span>
              </div>
              <div className="mt-1 space-y-2">
                {tasks.map((task) => <TaskCard key={`${task.sessionId}:${task.id}`} task={task} selected={selectedTaskId === task.id} onClick={() => onSelect(task)} />)}
                {tasks.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 px-2 py-5 text-center text-[11px] text-slate-400">暂无任务</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const TaskCard = ({ task, selected, onClick }: { task: SupervisorTaskBoardTask; selected: boolean; onClick: () => void }): React.ReactElement => {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow ${selected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
      <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-800">{task.title}</p>
      {task.sessionGoal && <p className="mt-2 line-clamp-1 text-[11px] text-slate-400">目标：{task.sessionGoal}</p>}
      {task.acceptance && (
        <p className="mt-2 rounded-md bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700">
          等待{task.acceptance.approverName}确认
        </p>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-indigo-50 text-indigo-600"><Bot className="h-3 w-3" /></span>
        <span className="min-w-0 flex-1 truncate">{task.agentName ?? task.assignedTo ?? '待分配 Agent'}</span>
        <span className="shrink-0 text-[10px] text-slate-400">{formatTime(task.completedAt ?? task.createdAt)}</span>
      </div>
      {((task.artifacts?.length ?? 0) > 0 || (task.dataChanges?.length ?? 0) > 0) && (
        <div className="mt-2 flex gap-2 text-[10px] text-slate-500">
          {(task.artifacts?.length ?? 0) > 0 && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{task.artifacts.length} 个产物</span>}
          {(task.dataChanges?.length ?? 0) > 0 && <span className="inline-flex items-center gap-1"><Database className="h-3 w-3" />{task.dataChanges.length} 条数据</span>}
        </div>
      )}
    </button>
  );
}

const TaskDetail = ({ task, onClose, onResolveHitl, onRetry }: {
  task: SupervisorTaskBoardTask;
  onClose: () => void;
  onResolveHitl: (answer: string) => Promise<boolean>;
  onRetry: () => Promise<boolean>;
}): React.ReactElement => {
  const [reviewText, setReviewText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string>();
  const submitReview = async (answer: string): Promise<void> => {
    if (!answer.trim() || reviewing) return;
    setReviewing(true);
    setReviewError(undefined);
    try {
      const accepted = await onResolveHitl(answer.trim());
      if (!accepted) setReviewError('提交未成功，请检查提示后重试。');
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : '无法提交确认');
    } finally {
      setReviewing(false);
    }
  };
  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl" aria-label="任务详情">
      <header className="flex items-start gap-3 border-b border-slate-200 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-indigo-600">{task.projectName}</p>
          <h2 className="mt-1 text-sm font-semibold leading-6">{task.title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭任务详情" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-xs">
          <dt className="text-slate-400">执行 Agent</dt><dd className="font-medium text-slate-700">{task.agentName ?? task.assignedTo ?? '待分配'}</dd>
          <dt className="text-slate-400">任务状态</dt><dd className="text-slate-700">{COLUMNS.find((column) => column.statuses.includes(task.status))?.label ?? task.status}</dd>
          {task.acceptance && <><dt className="text-slate-400">确认主体</dt><dd className="text-slate-700">{task.acceptance.approverName}</dd></>}
          <dt className="text-slate-400">协同目标</dt><dd className="text-slate-700">{task.sessionGoal ?? '未记录'}</dd>
          <dt className="text-slate-400">派发时间</dt><dd className="text-slate-700">{formatTime(task.createdAt)}</dd>
          <dt className="text-slate-400">会话</dt><dd className="break-all font-mono text-[11px] text-slate-500">{task.sessionId}</dd>
        </dl>
        <DetailBlock title="任务说明" value={task.description} />
        {task.status === 'waiting_hitl' && task.acceptance && task.runId && (
          <section aria-label="人工确认">
            <h3 className="mb-2 text-xs font-semibold text-violet-700">等待你的确认</h3>
            <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs leading-5 text-violet-950">{task.acceptance.question}</p>
              <div className="flex gap-2">
                <button type="button" disabled={reviewing} onClick={() => { void submitReview('approve'); }}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  同意并继续
                </button>
                <button type="button" disabled={reviewing} onClick={() => { void submitReview('reject'); }}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                  拒绝
                </button>
              </div>
              <textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} disabled={reviewing}
                aria-label="其他处理意见" placeholder="也可以填写修改意见或其他处理要求"
                className="min-h-20 w-full resize-y rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs leading-5 text-slate-900 outline-none focus:border-violet-400 disabled:opacity-50" />
              <button type="button" disabled={reviewing || !reviewText.trim()} onClick={() => { void submitReview(reviewText); }}
                className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                {reviewing ? '正在提交…' : '提交其他内容'}
              </button>
              {reviewError && <p role="alert" className="text-xs text-rose-600">{reviewError}</p>}
            </div>
          </section>
        )}
        {task.status === 'needs_review' && task.runId && (
          <section aria-label="任务重试">
            <button
              type="button"
              disabled={reviewing}
              onClick={() => {
                setReviewing(true);
                setReviewError(undefined);
                void onRetry().then((accepted) => {
                  if (!accepted) setReviewError('重试未成功，请检查错误详情。');
                }).catch((reason: unknown) => {
                  setReviewError(reason instanceof Error ? reason.message : '无法重试任务');
                }).finally(() => setReviewing(false));
              }}
              className="w-full rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {reviewing ? '正在重试…' : '修复后重试并继续协同图'}
            </button>
            {reviewError && <p role="alert" className="mt-2 text-xs text-rose-600">{reviewError}</p>}
          </section>
        )}
        <DetailBlock title="任务输入" value={taskValue(task.input, 'Supervisor 未记录结构化输入')} />
        {task.failure && <TaskFailureDetail failure={task.failure} />}
        <TaskProducts task={task} />
        <MarkdownDetailBlock title="Agent 输出" value={taskValue(task.output, task.status === 'reported' || task.status === 'completed' ? '暂无输出' : '等待 Agent 产出')} />
      </div>
    </aside>
  );
}

const TaskProducts = ({ task }: { task: SupervisorTaskBoardTask }): React.ReactElement => {
  const artifacts = task.artifacts ?? [];
  const dataChanges = task.dataChanges ?? [];
  const [openError, setOpenError] = useState<string>();
  if (artifacts.length === 0 && dataChanges.length === 0) {
    return <DetailBlock title="任务产物" value="尚未记录文件、单据或数据产物" />;
  }
  return (
    <section className="space-y-3">
      {artifacts.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-slate-700">文件与单据</h3>
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <button key={`${artifact.kind}:${artifact.ref}`} type="button"
                onClick={() => {
                  setOpenError(undefined);
                  void openTaskArtifact(task, artifact.ref).then((opened) => {
                    if (!opened) setOpenError(`无法定位文件：${artifact.ref}`);
                  }).catch((error: unknown) => {
                    setOpenError(error instanceof Error ? error.message : `无法打开文件：${artifact.ref}`);
                  });
                }}
                className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700"><FileText className="h-3.5 w-3.5 text-indigo-500" />{artifact.name}</div>
                <p className="mt-1 break-all font-mono text-[10px] leading-4 text-slate-500">
                  {artifact.ref.startsWith('artifact://') ? 'OriginOS 运行产物 · 已映射到本地文件' : artifact.ref}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {artifact.operation && <span className="inline-flex rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-600">{artifact.operation}</span>}
                  <span className="ml-auto text-[10px] font-medium text-indigo-600">打开文件</span>
                </div>
              </button>
            ))}
            {openError && <p role="alert" className="text-xs text-rose-600">{openError}</p>}
          </div>
        </div>
      )}
      {dataChanges.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-slate-700">业务数据变更</h3>
          <div className="space-y-2">
            {dataChanges.map((change, index) => (
              <button key={`${change.operation}:${change.reference ?? index}`} type="button" onClick={() => openTaskData(task)}
                className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700"><Database className="h-3.5 w-3.5 text-emerald-600" />{change.label}</div>
                {change.reference && <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{change.reference}</p>}
                {change.details && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-4 text-slate-500">{JSON.stringify(change.details, null, 2)}</pre>}
                <span className="mt-2 block text-right text-[10px] font-medium text-emerald-700">在数据窗口查看</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

const TaskFailureDetail = ({ failure }: { failure: NonNullable<SupervisorTaskBoardTask['failure']> }): React.ReactElement => (
  <section>
    <h3 className="mb-2 text-xs font-semibold text-rose-700">失败原因</h3>
    <dl className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs">
      <dt className="text-rose-500">失败阶段</dt><dd className="font-medium text-rose-800">{failure.stage}</dd>
      {failure.code && <><dt className="text-rose-500">错误码</dt><dd className="font-mono text-rose-800">{failure.code}</dd></>}
      {failure.toolName && <><dt className="text-rose-500">失败工具</dt><dd className="font-mono text-rose-800">{failure.toolName}</dd></>}
      {failure.exitCode !== undefined && <><dt className="text-rose-500">退出码</dt><dd className="font-mono text-rose-800">{failure.exitCode ?? '未提供'}</dd></>}
      <dt className="text-rose-500">具体原因</dt><dd className="whitespace-pre-wrap break-words text-rose-900">{failure.reason}</dd>
      <dt className="text-rose-500">发生时间</dt><dd className="text-rose-700">{formatTime(failure.occurredAt)}</dd>
    </dl>
  </section>
);

const DetailBlock = ({ title, value }: { title: string; value: string }): React.ReactElement => {
  return <section><h3 className="mb-2 text-xs font-semibold text-slate-700">{title}</h3><div className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-700">{value}</div></section>;
}

const MarkdownDetailBlock = ({ title, value }: { title: string; value: string }): React.ReactElement => {
  return <section><h3 className="mb-2 text-xs font-semibold text-slate-700">{title}</h3><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-700"><MarkdownContent content={value} /></div></section>;
}

const BoardState = ({ icon, title, detail }: { icon: React.ReactNode; title: string; detail?: string }): React.ReactElement => {
  return <div className="grid h-full min-h-72 place-items-center"><div className="text-center text-slate-400">{<span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm">{icon}</span>}<p className="text-sm font-medium text-slate-600">{title}</p>{detail && <p className="mt-1 text-xs">{detail}</p>}</div></div>;
}
