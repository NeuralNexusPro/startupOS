"use client";

import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { FolderKanban, Loader2, Network, X, ChevronRight } from "lucide-react";

import { TopologyGraph } from "./TopologyGraph";
import { useCollaborationUi, type AgentActivity, type ForegroundMessage, type CoordinationGroup } from "./store";
import { useSSEConnection, preconnect } from "./use-sse";
import type { CollaborationRuntimeUiDeps, UploadedFileDisplay, UploadedFile } from "./ui-deps";
import { getCollaborationTopology, createCollaborationSession, executeCollaborationSession, sendCollaborationMessage } from "../../../lib/integrations/electron/services/collaboration";
import type { RuntimeLLMConfig } from "../../../lib/integrations/pi-agent/llm-config";

import type {
  CollaborationTopology,
  RuntimeEvent,
} from "../session/types";
import { reconcileFormalHitlProjection } from "./formal-hitl-projection";

const UiDepsContext = createContext<CollaborationRuntimeUiDeps | null>(null);
function useUiDeps(): CollaborationRuntimeUiDeps {
  const ctx = useContext(UiDepsContext);
  if (!ctx) throw new Error("UiDepsContext not provided");
  return ctx;
}

interface MultiAgentLauncherProps {
  projectId: string;
  projectName: string;
  uiDeps: CollaborationRuntimeUiDeps;
  llmConfig?: RuntimeLLMConfig;
  onOpenTaskBoard?: () => void;
  /** Render only the existing Supervisor conversation surface for embedding. */
  conversationOnly?: boolean;
  /** Notifies embedding surfaces as soon as the runtime session can receive events. */
  onSessionCreated?: (sessionId: string) => void;
  /** Lets embedding surfaces refresh their own projections from the same runtime event stream. */
  onRuntimeEvent?: (event: RuntimeEvent) => void;
  /** Optional collapse action supplied by an embedding surface. */
  onCollapse?: () => void;
  /** Restore the persisted Supervisor conversation instead of creating an empty session. */
  initialSessionId?: string;
  /** Historical events projected by the host, including ledger-backed HITL requests. */
  initialEvents?: readonly RuntimeEvent[];
  /** Resolve a formal WorkItem HITL request through the contract ledger. */
  onFormalHitlReply?: (request: FormalHitlReplyRequest, answer: string) => Promise<boolean>;
}

export interface FormalHitlReplyRequest {
  eventId: string;
  runId: string;
  requestId: string;
  attemptId: string;
  leaseEpoch: number;
  options: readonly string[];
}

type Phase = "idle" | "creating" | "starting" | "greeting" | "running" | "completed" | "error";

interface WorkerDetailDrawerProps {
  agentId: string;
  agentName: string;
  activity?: AgentActivity;
  events: RuntimeEvent[];
  onClose: () => void;
}


function formatWorkerEvents(agentId: string, events: RuntimeEvent[]) {
  return events
    .filter((e) => e.source === agentId || e.payload?.["agentId"] === agentId)
    .map((event) => {
      let text = "";
      let kind: "message" | "tool" | "error" | "status" = "message";

      switch (event.type) {
        case "ASSISTANT_MESSAGE":
          text = String(event.payload?.["content"] ?? event.payload?.["message"] ?? "");
          break;
        case "AGENT_THINKING":
          text = `思考：${String(event.payload?.["reason"] ?? "")}`;
          kind = "status";
          break;
        case "AGENT_ACT":
          text = `调用工具：${String(event.payload?.["toolName"] ?? event.payload?.["tool"] ?? "unknown")}`;
          kind = "tool";
          break;
        case "TOOL_RESULT":
          text = `工具返回：${typeof event.payload?.["result"] === "string" ? event.payload["result"] as string : JSON.stringify(event.payload?.["result"] ?? {})}`;
          kind = "tool";
          break;
        case "TOOL_FAILURE":
          text = `工具失败：${String(event.payload?.["error"] ?? "unknown")}`;
          kind = "error";
          break;
        case "WORKER_BLOCK":
          text = `阻塞上报：${String(event.payload?.["rationale"] ?? event.payload?.["blockType"] ?? "")}`;
          kind = "status";
          break;
        case "AGENT_COMPLETE_TASK":
          text = String(event.payload?.["output"] ?? "任务完成");
          kind = "status";
          break;
        case "AGENT_FAIL_TASK":
          text = `执行失败：${String(event.payload?.["error"] ?? event.payload?.["reason"] ?? "")}`;
          kind = "error";
          break;
        default:
          text = "";
      }

      return text.trim() ? { id: event.id, text, kind, timestamp: event.timestamp } : null;
    })
    .filter((x): x is { id: string; text: string; kind: "message" | "tool" | "error" | "status"; timestamp: string } => x !== null);
}

interface HitlCardProps {
  req: { eventId: string; workerId: string; workerName: string; question: string; timestamp: string; formal?: { options: readonly string[] } };
  resolveAgentName: (id: string) => string;
  onReply: (answer: string) => void;
  disabled: boolean;
  uploading?: boolean;
  onUpload?: () => void;
}

function HitlCard({ req, resolveAgentName, onReply, disabled }: HitlCardProps) {
  const { ChatInputBar } = useUiDeps();
  const displayName = req.workerName || (req.workerId ? resolveAgentName(req.workerId) : "");
  return (
    <div className="flex-shrink-0 border-t border-yellow-200/80 bg-yellow-50/90">
      {req.formal && (
        <div className="flex gap-2 px-3 pt-3">
          {req.formal.options.includes("approve") && (
            <button type="button" disabled={disabled} onClick={() => onReply("approve")}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              批准并继续
            </button>
          )}
          {req.formal.options.includes("reject") && (
            <button type="button" disabled={disabled} onClick={() => onReply("reject")}
              className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              拒绝
            </button>
          )}
        </div>
      )}
      <ChatInputBar
        onSubmit={onReply}
        disabled={disabled}
        placeholder={req.formal
          ? "填写修改意见或其他处理要求…"
          : displayName ? `回复 ${displayName} 的问题…` : "输入回复…"}
        lightBg
        className="bg-yellow-50/80"
      />
    </div>
  );
}

function WorkerDetailDrawer({ agentId, agentName, activity, events, onClose }: WorkerDetailDrawerProps) {
  const { MarkdownContent } = useUiDeps();
  const workerEvents = useMemo(() => formatWorkerEvents(agentId, events), [agentId, events]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [workerEvents.length]);

  const statusLabel: Record<string, string> = {
    thinking: "思考中",
    tool_call: "工具调用",
    waiting: "等待中",
    complete: "已完成",
    fail: "失败",
    idle: "空闲",
  };

  const statusColor: Record<string, string> = {
    thinking: "text-blue-600",
    tool_call: "text-violet-600",
    waiting: "text-yellow-600",
    complete: "text-green-600",
    fail: "text-red-600",
    idle: "text-gray-400",
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            W
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{agentName}</div>
            {activity && (
              <div className={`text-xs font-medium ${statusColor[activity.status] ?? "text-gray-400"}`}>
                {statusLabel[activity.status] ?? activity.status}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Events */}
      <div ref={scrollRef} className="flex-1 min-h-0 space-y-2 overflow-y-auto px-4 py-3">
        {workerEvents.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
            暂无活动记录
          </div>
        ) : (
          workerEvents.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border px-3 py-2 text-xs leading-5 ${
                item.kind === "error"
                  ? "border-red-100 bg-red-50 text-red-700"
                  : item.kind === "tool"
                    ? "border-violet-100 bg-violet-50 text-violet-700"
                    : item.kind === "status"
                      ? "border-gray-100 bg-gray-50 text-gray-500"
                      : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              <div className="mb-1 text-[10px] text-gray-400">
                {new Date(item.timestamp).toLocaleTimeString()}
              </div>
              {item.kind === "message" ? (
                <MarkdownContent content={item.text} />
              ) : (
                <div className="whitespace-pre-wrap break-words">{item.text}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AgentStatusBar({
  topology,
  activities,
  recentlyActiveAgents,
  onNodeClick,
}: {
  topology: CollaborationTopology;
  activities: Record<string, AgentActivity>;
  recentlyActiveAgents: string[];
  onNodeClick: (id: string) => void;
}) {
  const agentIds = Object.keys(topology.agents);

  const statusDot: Record<string, string> = {
    thinking: "bg-blue-500 animate-pulse",
    tool_call: "bg-violet-500 animate-pulse",
    waiting: "bg-yellow-400",
    complete: "bg-green-500",
    fail: "bg-red-500",
    idle: "bg-gray-300",
  };

  return (
    <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-gray-100 bg-white px-5 py-2.5">
      <span className="flex-shrink-0 text-xs text-gray-400">内部进度</span>
      <div className="mx-1 h-3 w-px bg-gray-200" />
      <div className="flex items-center gap-1.5">
        {agentIds.map((id) => {
          const agent = topology.agents[id] as { name: string };
          const activity = activities[id];
          const status = activity?.status ?? "idle";
          const isActive = recentlyActiveAgents.includes(id);

          return (
            <button
              key={id}
              onClick={() => onNodeClick(id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                isActive
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-transparent text-gray-500 hover:border-gray-200 hover:bg-white"
              }`}
            >
              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDot[status] ?? "bg-gray-300"}`} />
              {agent.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const COORDINATION_STYLE: Record<string, string> = {
  dispatch: "text-blue-600",
  result: "text-green-600",
  status: "text-yellow-600",
  general: "text-gray-400",
};

export const MultiAgentLauncher: React.FC<MultiAgentLauncherProps> = ({
  projectId,
  projectName,
  uiDeps,
  llmConfig,
  onOpenTaskBoard,
  conversationOnly = false,
  onSessionCreated,
  onRuntimeEvent,
  onCollapse,
  initialSessionId,
  initialEvents = [],
  onFormalHitlReply,
}) => {
  const { useFileUpload } = uiDeps;
  const { MarkdownContent, ChatInputBar, AskUserQuestionComponent, parseAskUserQuestion, removeYamlBlock } = uiDeps;
  const [phase, setPhase] = useState<Phase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topology, setTopology] = useState<CollaborationTopology | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  // showTopology removed — topology is always shown in right panel when available
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileDisplay[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const lastEventId = useCollaborationUi((state) => state.lastEventId);
  const activities = useCollaborationUi((state) => state.activities);
  const events = useCollaborationUi((state) => state.events);
  const recentlyActiveAgents = useCollaborationUi((state) => state.recentlyActiveAgents);
  // displayMessages is maintained incrementally in the store — no useMemo needed.
  const displayMessages = useCollaborationUi((state) => state.displayMessages);
  const [pendingUserMessage, setPendingUserMessage] = useState<ForegroundMessage | null>(null);

  // Single interval to prune recentlyActiveAgents — replaces per-event setTimeout.
  useEffect(() => {
    const id = setInterval(() => useCollaborationUi.getState().pruneRecentlyActive(), 500);
    return () => clearInterval(id);
  }, []);

  // SSE 收到任意用户事件即清掉 pending 兜底
  const lastUserEventId = useMemo(() => {
    const lastUserEv = [...events].reverse().find(
      (e) => e.source === "user" && (e.type === "USER_INPUT" || e.type === "USER_REPLY_TO_SUPERVISOR" || e.type === "HUMAN_REVIEW_RESPONSE"),
    );
    return lastUserEv?.id ?? null;
  }, [events]);

  useEffect(() => {
    if (lastUserEventId !== null && pendingUserMessage !== null) {
      setPendingUserMessage(null);
    }
  }, [lastUserEventId, pendingUserMessage]);

  const allDisplayMessages = useMemo(
    () => (pendingUserMessage ? [...displayMessages, pendingUserMessage] : displayMessages),
    [displayMessages, pendingUserMessage],
  );

  // 多 HITL 并发：从事件历史派生所有未回复的 HITL 请求
  interface HitlRequest {
    eventId: string;
    workerId: string;
    workerName: string;
    question: string;
    timestamp: string;
    formal?: Omit<FormalHitlReplyRequest, "eventId">;
  }
  const pendingHitlRequests = useMemo((): HitlRequest[] => {
    const requests: HitlRequest[] = [];
    for (const ev of events) {
      if (ev.type !== "HUMAN_REVIEW_REQUEST") continue;
      const wid = String(ev.payload?.["agentId"] ?? ev.source ?? "");
      const requestId = String(ev.payload?.["requestId"] ?? "");
      const alreadyReplied = events.some((e) => {
        if (e.type !== "USER_REPLY_TO_SUPERVISOR" && e.type !== "HUMAN_REVIEW_RESPONSE") return false;
        if (e.timestamp <= ev.timestamp) return false;
        const responseRequestId = String(e.payload?.["requestId"] ?? "");
        if (requestId) return responseRequestId === requestId;
        return !wid
          || String(e.payload?.["workerId"] ?? e.payload?.["agentId"] ?? "") === wid;
      });
      if (!alreadyReplied) {
        const runId = String(ev.payload?.["runId"] ?? "");
        const attemptId = String(ev.payload?.["attemptId"] ?? "");
        const leaseEpoch = Number(ev.payload?.["leaseEpoch"]);
        const options = Array.isArray(ev.payload?.["options"])
          ? ev.payload["options"].map(String)
          : [];
        requests.push({
          eventId: ev.id,
          workerId: wid,
          workerName: "",
          question: String(ev.payload?.["question"] ?? ""),
          timestamp: ev.timestamp,
          ...(runId && requestId && attemptId && Number.isInteger(leaseEpoch)
            ? { formal: { runId, requestId, attemptId, leaseEpoch, options } }
            : {}),
        });
      }
    }
    return requests;
  }, [events]);

  const isAwaitingHitl = pendingHitlRequests.length > 0;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [allDisplayMessages.length]);

  useEffect(() => {
    if (lastEventId === null) return;
    const latest = useCollaborationUi.getState().events.at(-1);
    if (!latest) return;
    if (latest.type.startsWith("TASK_") || latest.type === "SUPERVISOR_WORKER_COMPLETE" || latest.type === "SUPERVISOR_WORKER_FAILED") {
      onRuntimeEvent?.(latest);
    }

    if (latest.type === "SUPERVISOR_AGENT_START" || latest.type === "AGENT_START") {
      setPhase((prev) => prev === "greeting" ? "running" : prev);
    }
    // Supervisor 直接回复用户消息后，等待下一条用户输入
    if (
      (latest.type === "ASSISTANT_MESSAGE" || latest.type === "MESSAGE_SENT") &&
      (latest.source === "supervisor" || (typeof latest.source === "string" && latest.source.startsWith("supervisor-")))
    ) {
      setPhase((prev) => prev === "running" ? "greeting" : prev);
    }
    if (latest.type === "SESSION_END" || latest.type === "DAG_COMPLETE" ||
        (latest.type === "SUPERVISOR_AGGREGATE" && (latest.payload?.["state"] === "completed" || latest.payload?.["state"] === "partial"))) {
      const allEvents = useCollaborationUi.getState().events;
      const hasUnresolvedHitl = allEvents.some((e) => e.type === "HUMAN_REVIEW_REQUEST") &&
        !allEvents.some((e) => e.type === "HUMAN_REVIEW_RESPONSE");
      if (!hasUnresolvedHitl) {
        setPhase("completed");
      }
    }
    if (latest.type === "SESSION_ERROR" || latest.type === "DAG_FAIL") {
      setPhase("error");
    }
  }, [lastEventId, onRuntimeEvent]);

  useEffect(() => {
    void getCollaborationTopology(projectId)
      .then((result) => {
        if (result.success) {
          setTopology(result.data as CollaborationTopology);
        } else {
          // 拓扑加载失败不再静默：图面板整体消失时至少能在控制台/日志里定位。
          console.error("[MultiAgentLauncher] Get topology failed:", result.error);
        }
      })
      .catch((error) => {
        console.error("[MultiAgentLauncher] Get topology request failed:", error);
      });
  }, [projectId]);

  useSSEConnection(sessionId ?? "");

  const autoStart = useCallback(async () => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    setError(null);

    try {
      if (initialSessionId) {
        useCollaborationUi.getState().reset();
        for (const event of initialEvents) {
          useCollaborationUi.getState().addEvent(event);
        }
        setSessionId(initialSessionId);
        preconnect(initialSessionId);
        onSessionCreated?.(initialSessionId);
        setPhase(initialEvents.some((event) => event.type === "HUMAN_REVIEW_REQUEST") ? "running" : "greeting");
        return;
      }
      setPhase("creating");
      const createResult = await createCollaborationSession({ projectId, mode: "system", llmConfig });

      if (!createResult.success) {
        throw new Error(createResult.error?.message || "创建失败");
      }

      const sid = typeof createResult.data === "object" && createResult.data !== null && "id" in createResult.data
        ? String((createResult.data as Record<string, unknown>)["id"])
        : "";
      useCollaborationUi.getState().reset();
      setSessionId(sid);
      // 立即建立事件连接并开始缓冲，不等 React 重渲
      preconnect(sid);
      onSessionCreated?.(sid);

      setPhase("starting");
      const execResult = await executeCollaborationSession(sid);

      if (!execResult.success) {
        throw new Error(execResult.error?.message || "启动失败");
      }

      const execStatus = typeof execResult.data === "object" && execResult.data !== null && "status" in execResult.data
        ? String((execResult.data as Record<string, unknown>)["status"])
        : "running";
      setPhase(execStatus === "greeting" ? "greeting" : "running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      setPhase("error");
      autoStarted.current = false;
    }
  }, [projectId, llmConfig, onSessionCreated, initialEvents, initialSessionId]);

  useEffect(() => {
    void autoStart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialSessionId || sessionId !== initialSessionId) return;
    const seenEventIds = new Set(events.flatMap((event) => {
      const canonicalId = event.id.startsWith('restored:') ? event.id.slice('restored:'.length) : event.id;
      return [event.id, canonicalId];
    }));
    for (const event of initialEvents) {
      const canonicalId = event.id.startsWith('restored:') ? event.id.slice('restored:'.length) : event.id;
      if (seenEventIds.has(event.id) || seenEventIds.has(canonicalId)) continue;
      useCollaborationUi.getState().addEvent(event);
      seenEventIds.add(event.id);
      seenEventIds.add(canonicalId);
    }
    const updates = reconcileFormalHitlProjection(events, initialEvents, initialSessionId);
    if (!updates.length) return;
    for (const event of updates) useCollaborationUi.getState().addEvent(event);
    if (updates.some(({ type }) => type === "HUMAN_REVIEW_REQUEST")) setPhase("running");
  }, [events, initialEvents, initialSessionId, sessionId]);

  const uploadBasePath = useCallback(
    () => (sessionId ? `data/projects/${projectId}/collaboration-sessions/${sessionId}/attachments` : null),
    [sessionId, projectId],
  );

  const handleFileUploaded = useCallback((files: UploadedFile[]) => {
    setUploadedFiles((prev) => [...prev, ...files.map((f) => ({ name: f.name, path: f.path, size: f.size }))]);
  }, []);

  const handleUpload = useFileUpload({
    basePath: uploadBasePath,
    onUploaded: handleFileUploaded,
    onError: (err) => setUploadError(err.message),
    onStateChange: (state) => {
      setUploading(state === "uploading");
      if (state !== "error") setUploadError(null);
    },
  });

  const submitReply = useCallback(async (message: string, workerId?: string) => {
    if (!message.trim() || sessionId === null) return;

    let fullMessage = message.trim();
    if (uploadedFiles.length > 0) {
      const fileRefs = uploadedFiles.map((f) => `[附件: ${f.name}${f.path ? ` (${f.path})` : ""}]`).join("\n");
      fullMessage = `${fullMessage}\n\n${fileRefs}`;
    }
    setUploadedFiles([]);

    setPendingUserMessage({
      id: `pending-${Date.now()}`,
      role: "user",
      text: fullMessage,
      timestamp: new Date().toISOString(),
    });

    const result = await sendCollaborationMessage(sessionId, fullMessage, workerId, llmConfig);

    if (!result.success) {
      setError(result.error?.message || "发送失败");
      setPendingUserMessage(null);
    } else {
      setPhase("running");
    }
  }, [sessionId, phase, uploadedFiles, llmConfig]);

  const agentNames: Record<string, string> = topology !== null
    ? Object.fromEntries(Object.entries(topology.agents).map(([id, a]) => [id, (a as { name: string }).name]))
    : {};

  const resolveAgentName = (id: string): string => {
    // 精确匹配
    if (agentNames[id]) return agentNames[id];
    // supervisor-cs-xxx → 取 "supervisor" 前缀，找 topology 中匹配的 key
    for (const [key, name] of Object.entries(agentNames)) {
      if (id.startsWith(key) || key.startsWith(id)) return name;
    }
    // 前缀截取：取第一个 "-cs-" 或 "-" 前的部分作为可读标识
    const shortId = id.replace(/-cs-[\w-]+$/, "").replace(/-[a-z0-9]{8,}$/, "");
    return shortId || id;
  };

  const isLaunching = phase === "creating" || phase === "starting";
  const isGreeting = phase === "greeting";
  const isRunning = phase === "running";

  // Phase status badge
  const phaseBadge = (() => {
    if (isLaunching) return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        {phase === "creating" ? "创建中" : "启动中"}
      </span>
    );
    if (isGreeting) return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
        等待目标
      </span>
    );
    if (isRunning && !isAwaitingHitl) return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
        执行中
      </span>
    );
    if (isRunning && isAwaitingHitl) return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-600">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        等待回复
      </span>
    );
    if (phase === "completed") return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-600">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        已完成
      </span>
    );
    if (phase === "error") return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
        出错
      </span>
    );
    return null;
  })();

  return (
    <UiDepsContext.Provider value={uiDeps}>
    <div className="flex h-full w-full flex-col bg-white text-gray-900">

      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
            Co
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{projectName}</h2>
            <p className="text-xs text-gray-400">多 Agent 协作</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenTaskBoard && !conversationOnly && (
            <button
              type="button"
              onClick={onOpenTaskBoard}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              aria-label={`打开${projectName}任务看板`}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              任务看板
            </button>
          )}
          {phaseBadge}
          {conversationOnly && onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="收起协作对话"
              className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <span aria-hidden="true">‹</span>
            </button>
          )}
        </div>
      </div>

      {/* Agent status bar */}
      {!conversationOnly && topology !== null && (isRunning || isLaunching) && (
        <AgentStatusBar
          topology={topology}
          activities={activities}
          recentlyActiveAgents={recentlyActiveAgents}
          onNodeClick={(id) => setSelectedAgentId((prev) => prev === id ? null : id)}
        />
      )}

      {/* Error banner */}
      {error !== null && (
        <div className="mx-5 mt-3 flex-shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">
          {error}
          <button
            className="ml-3 font-semibold underline"
            onClick={() => { autoStarted.current = false; void autoStart(); }}
          >
            重试
          </button>
        </div>
      )}

      {/* Main area — left: chat, right: topology, far-right: worker detail */}
      <div className="min-h-0 flex-1 overflow-hidden flex">

        {/* Left: Chat + Input */}
        <div className="flex h-full flex-col overflow-hidden border-r border-gray-100 bg-gray-50/50" style={{ width: conversationOnly ? '100%' : topology !== null ? (selectedAgentId ? '35%' : '50%') : '100%', transition: 'width 0.2s' }}>

          {/* Launching skeleton */}
          {isLaunching && allDisplayMessages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-10">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-gray-500">
                  {phase === "creating" ? "正在创建协作会话…" : "正在启动 Supervisor…"}
                </span>
              </div>
              <p className="text-xs text-gray-400">Supervisor 就绪后将开始协调各 Agent</p>
            </div>
          )}

          {/* Message thread */}
          {(!isLaunching || allDisplayMessages.length > 0) && (
            <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {allDisplayMessages.length === 0 ? (
                <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/60 text-xs text-gray-400">
                  等待 Supervisor 开始协调…
                </div>
              ) : (
                allDisplayMessages.map((msg) => {
                  // Coordination group — collapsible
                  if (msg.role === "coordination-group") {
                    const grp = msg as CoordinationGroup;
                    const expanded = expandedGroups.has(grp.id);
                    return (
                      <div key={grp.id} className="pl-4">
                        <button
                          onClick={() => setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            if (expanded) next.delete(grp.id); else next.add(grp.id);
                            return next;
                          })}
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
                        >
                          <ChevronRight className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
                          <span>Supervisor 协调了 {grp.items.length} 个步骤</span>
                        </button>
                        {expanded && (
                          <div className="mt-1.5 space-y-1 border-l border-gray-100 pl-4">
                            {grp.items.map((item) => {
                              const type = item.coordinationType ?? "general";
                              return (
                                <div key={item.id} className="flex items-center gap-1.5">
                                  <ChevronRight className={`h-3 w-3 flex-shrink-0 ${COORDINATION_STYLE[type] ?? "text-gray-400"}`} />
                                  <span className={`text-xs ${COORDINATION_STYLE[type] ?? "text-gray-400"}`}>{item.text}</span>
                                  <span className="text-[10px] text-gray-300">{new Date(item.timestamp).toLocaleTimeString()}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const m = msg as ForegroundMessage;

                  // Coordination pill — inline
                  if (m.isCoordination) {
                    const type = m.coordinationType ?? "general";
                    return (
                      <div key={m.id} className="flex items-center gap-1.5 pl-6">
                        <ChevronRight className={`h-3 w-3 flex-shrink-0 ${COORDINATION_STYLE[type] ?? "text-gray-400"}`} />
                        <span className={`text-xs ${COORDINATION_STYLE[type] ?? "text-gray-400"}`}>{m.text}</span>
                        <span className="text-[10px] text-gray-300">{new Date(m.timestamp).toLocaleTimeString()}</span>
                      </div>
                    );
                  }

                  // Chat bubble
                  return (
                    <div key={m.id} className={`flex items-start gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      {m.role === "supervisor" && (
                        <div className="mt-2.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                      )}
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                          m.role === "user"
                            ? "rounded-tr-sm bg-primary text-white"
                            : m.isHitl
                              ? "rounded-tl-sm border border-yellow-200 bg-yellow-50 text-yellow-800"
                              : "rounded-tl-sm bg-gray-100 text-gray-900"
                        }`}
                      >
                        {m.isHitl && m.onBehalfOf && (
                          <div className="mb-1.5 text-[11px] font-semibold text-yellow-600">
                            代 {resolveAgentName(m.onBehalfOf)} 询问
                          </div>
                        )}
                        {m.role === "user" ? (
                          <div className="whitespace-pre-wrap break-words">{m.text}</div>
                        ) : (() => {
                          const parsedQuestion = parseAskUserQuestion(m.text);
                          const displayContent = parsedQuestion ? removeYamlBlock(m.text) : m.text;
                          return (
                            <>
                              {displayContent && (
                                <div className="prose prose-sm max-w-none prose-p:leading-relaxed">
                                  <MarkdownContent content={displayContent} />
                                </div>
                              )}
                              {parsedQuestion && (
                                <AskUserQuestionComponent
                                  parsedQuestion={parsedQuestion}
                                  onAnswer={(labels) => { void submitReply(labels.join(", "), m.workerId); }}
                                  disabled={isLaunching}
                                />
                              )}
                            </>
                          );
                        })()}
                        <div className={`mt-1 text-right text-xs ${m.role === "user" ? "text-white/70" : "text-gray-500"}`}>
                          {new Date(m.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Thinking dots */}
              {isRunning && !isAwaitingHitl && (
                <div className="flex items-start gap-2 pl-4">
                  <div className="mt-2.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                  <div className="rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 多 HITL 并发卡片 */}
          {pendingHitlRequests.map((req) => (
            <HitlCard
              key={req.eventId}
              req={req}
              resolveAgentName={resolveAgentName}
              onReply={(answer) => {
                if (req.formal && onFormalHitlReply) {
                  void onFormalHitlReply({ eventId: req.eventId, ...req.formal }, answer);
                  return;
                }
                void submitReply(answer, req.workerId);
              }}
              disabled={isLaunching}
              uploading={uploading}
              onUpload={sessionId ? handleUpload : undefined}
            />
          ))}

          {/* Greeting / completed input area — hidden when HITL card is present */}
          {(isGreeting || isRunning || phase === "completed" || phase === "error") && !isAwaitingHitl && (
            <ChatInputBar
              onSubmit={(msg) => { void submitReply(msg); }}
              disabled={isLaunching || pendingUserMessage !== null}
              placeholder={
                isGreeting ? "输入协作目标，按 Enter 发送…"
                : phase === "completed" ? "继续提问或发起新任务…"
                : phase === "error" ? "修正后重试或发起新任务…"
                : "回复 Supervisor…"
              }
              onUpload={sessionId ? handleUpload : undefined}
              uploadedFiles={uploadedFiles}
              onRemoveFile={(idx) => {
                if (idx === -1) setUploadError(null);
                else setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));
              }}
              uploadError={uploadError}
              uploading={uploading}
              lightBg
              className="border-t border-gray-100 bg-white"
            />
          )}
        </div>

        {/* Worker detail drawer */}
        {!conversationOnly && selectedAgentId !== null && (
          <div className="flex h-full flex-col overflow-hidden border-l border-gray-100 bg-white" style={{ width: '30%', minWidth: 280, transition: 'width 0.2s' }}>
            <WorkerDetailDrawer
              agentId={selectedAgentId}
              agentName={resolveAgentName(selectedAgentId)}
              activity={activities[selectedAgentId]}
              events={events}
              onClose={() => setSelectedAgentId(null)}
            />
          </div>
        )}

        {/* Right: Topology panel */}
        {!conversationOnly && topology !== null && (
          <div className="flex h-full flex-col overflow-hidden bg-slate-950" style={{ width: selectedAgentId ? '35%' : '50%', transition: 'width 0.2s' }}>
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-cyan-400/20 bg-slate-950 px-4 py-2.5">
              <Network className="h-3.5 w-3.5 text-cyan-300" />
              <span className="text-xs font-medium text-slate-200">协作拓扑</span>
              <span className="ml-auto text-[10px] font-medium uppercase text-cyan-400/70">Live Mesh</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <TopologyGraph
                topology={topology}
                activities={activities as unknown as Record<string, AgentActivity>}
                recentlyActiveAgents={recentlyActiveAgents}
                onNodeClick={(id) => {
                  setSelectedAgentId((prev) => prev === id ? null : id);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
    </UiDepsContext.Provider>
  );
};
