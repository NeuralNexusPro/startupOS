/**
 * Collaboration Runtime UI Store — Zustand 管理本地 UI 状态。
 *
 * Story 9.12: UI 协作查看器
 *
 * Architecture notes:
 *
 * 1. **Layered state** — Raw events (`events[]`) and derived display state
 *    (`foregroundMessages`, `displayMessages`) are maintained separately.
 *    `addEvent` updates both layers incrementally so the renderer never needs
 *    to recompute the full message list on every new event.
 *
 * 2. **events[] cap** — Raw events are capped at MAX_EVENTS (2 000) entries.
 *    Older events are evicted from the in-memory array; they remain on disk.
 *    Derived display state is built incrementally and is unaffected by the cap.
 *
 * 3. **recentlyActiveAgents** — Instead of registering a `setTimeout` per
 *    event (which can pile up hundreds of timers), we store a Map of
 *    agentId → expireAt timestamps.  A single 500 ms interval (started by the
 *    component, see `pruneRecentlyActive`) sweeps expired entries and fires one
 *    setState per sweep instead of one per event.
 *
 * 4. **任务看板 (Story 9.44)** — `tasks` (TaskItem[]) is derived incrementally
 *    from TASK_* events via `applyTaskEventToTasks` (semantics aligned with the
 *    engine blackboard apply) and can be bulk-restored from a
 *    WorkspaceTaskSnapshot via `mergeSnapshotTasks` (active tasks + each
 *    agent's recent terminal task — non-full restore by design).
 */

import { create } from "zustand";
import type { RuntimeEvent, TaskItem, TaskState } from "../session/types";

// ============================================================================
// Types
// ============================================================================

export type AgentStatus = "idle" | "thinking" | "tool_call" | "complete" | "fail" | "waiting";

export interface AgentActivity {
  agentId: string;
  status: AgentStatus;
  lastUpdated: string;
  message?: string;
}

/** A single displayable message in the foreground chat panel. */
export interface ForegroundMessage {
  id: string;
  role: "user" | "supervisor";
  text: string;
  timestamp: string;
  isHitl?: boolean;
  workerId?: string;
  onBehalfOf?: string;
  isCoordination?: boolean;
  coordinationType?: "dispatch" | "status" | "result" | "general";
  streamSource?: string;
}

/** A collapsed group of consecutive coordination messages (≥ 3). */
export interface CoordinationGroup {
  id: string;
  role: "coordination-group";
  items: ForegroundMessage[];
  timestamp: string;
}

/** A visual divider between task rounds. */
export interface Divider {
  id: string;
  role: "divider";
  text: string;
  timestamp: string;
}

export type DisplayMessage = ForegroundMessage | CoordinationGroup | Divider;

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of raw events kept in memory. Oldest are evicted beyond this. */
const MAX_EVENTS = 2_000;

/** How long (ms) an agent stays highlighted in the topology after its last event. */
const RECENTLY_ACTIVE_TTL = 2_000;

// ============================================================================
// Store interface
// ============================================================================

export interface CollaborationUiState {
  // Raw event log (capped at MAX_EVENTS)
  events: RuntimeEvent[];
  lastEventId: string | null;

  // Incrementally-maintained display state
  foregroundMessages: ForegroundMessage[];
  displayMessages: DisplayMessage[];

  // Agent activities
  activities: Record<string, AgentActivity>;

  // Recently active agents — Map serialised as a plain object for Zustand
  // compatibility.  Values are expireAt timestamps (Date.now() + TTL).
  recentlyActiveMap: Record<string, number>;
  recentlyActiveAgents: string[];   // derived; refreshed by pruneRecentlyActive()

  // Selected agent for CUI view
  selectedAgentId: string | null;

  // Blackboard snapshot
  blackboardData: Record<string, unknown>;
  /** 任务看板数据（TaskItem[]）— 由 TASK_* 事件增量派生，快照恢复时整表覆盖。 */
  tasks: TaskItem[];
  /** 任务看板折叠态（默认展开）。 */
  boardCollapsed: boolean;

  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;

  // Actions
  addEvent: (event: RuntimeEvent) => void;
  /** Remove expired entries from recentlyActiveMap. Call from a component interval. */
  pruneRecentlyActive: () => void;
  setLastEventId: (id: string | null) => void;
  updateAgentActivity: (agentId: string, activity: Partial<AgentActivity>) => void;
  setSelectedAgent: (agentId: string | null) => void;
  setBlackboardData: (data: Record<string, unknown>) => void;
  setTasks: (tasks: TaskItem[]) => void;
  /**
   * 会话恢复对账：用 WorkspaceTaskSnapshot 形态的数据整表覆盖 tasks。
   * 恢复范围 = snapshot.activeTasks + 各 Agent recentTerminalTask（非全量，按用户决策收窄）。
   * 防御式收窄（unknown → TaskItem），畸形字段跳过，绝不 throw。
   */
  mergeSnapshotTasks: (snapshot: unknown) => void;
  setBoardCollapsed: (collapsed: boolean) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// ============================================================================
// Event → ForegroundMessage mapping (pure functions, no state)
// ============================================================================

function isSupervisorSource(source: string | undefined): boolean {
  if (!source) return false;
  return source === "supervisor" || source.startsWith("supervisor-");
}

function extractMessageSentText(event: RuntimeEvent): string {
  const text = event.payload?.["text"];
  if (typeof text === "string") return text;

  const delta = event.payload?.["delta"];
  if (typeof delta === "string") return delta;

  const message = event.payload?.["message"] as { content?: unknown } | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: "text"; text: string } =>
        Boolean(block) &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("");
  }
  return "";
}

function replaceTrailingStreamMessage(
  messages: ForegroundMessage[],
  source: string,
  finalText: string,
  event: RuntimeEvent,
): { messages: ForegroundMessage[]; replaced: boolean } {
  const last = messages[messages.length - 1];
  if (last?.role !== "supervisor" || last.streamSource !== source) {
    return { messages, replaced: false };
  }

  return {
    replaced: true,
    messages: [
      ...messages.slice(0, -1),
      {
        ...last,
        id: event.id,
        text: finalText,
        timestamp: event.timestamp,
        streamSource: undefined,
      },
    ],
  };
}

/**
 * Maps a single RuntimeEvent to zero or more ForegroundMessages.
 * Pure function — no side effects.
 */
export function mapEventToForegroundMessages(event: RuntimeEvent): ForegroundMessage[] {
  if (event.source === "user") {
    if (event.type === "USER_INPUT" || event.type === "USER_REPLY_TO_SUPERVISOR") {
      const text = String(event.payload?.["message"] ?? "").trim();
      return text ? [{ id: event.id, role: "user", text, timestamp: event.timestamp }] : [];
    }
    if (event.type === "HUMAN_REVIEW_RESPONSE") {
      const text = String(event.payload?.["response"] ?? "").trim();
      return text ? [{ id: event.id, role: "user", text, timestamp: event.timestamp }] : [];
    }
    return [];
  }

  if (event.type === "HUMAN_REVIEW_REQUEST") {
    const text = String(event.payload?.["question"] ?? "").trim();
    const onBehalfOf = !isSupervisorSource(event.source)
      ? event.source
      : (event.payload?.["onBehalfOf"] as string | undefined ?? event.payload?.["agentId"] as string | undefined);
    const workerId = String(event.payload?.["agentId"] ?? onBehalfOf ?? "");
    return text ? [{
      id: event.id,
      role: "supervisor" as const,
      text,
      timestamp: event.timestamp,
      isHitl: true,
      workerId,
      onBehalfOf,
    }] : [];
  }

  if (!isSupervisorSource(event.source)) return [];

  if (event.type === "ASSISTANT_MESSAGE") {
    const text = String(event.payload?.["content"] ?? "").trim();
    return text ? [{ id: event.id, role: "supervisor", text, timestamp: event.timestamp }] : [];
  }

  if (event.type === "MESSAGE_SENT") {
    const text = extractMessageSentText(event);
    return text ? [{
      id: `stream-${event.source}`,
      role: "supervisor",
      text,
      timestamp: event.timestamp,
      streamSource: event.source,
    }] : [];
  }

  if (event.type === "AGENT_THINKING") {
    const msg = String(event.payload?.["message"] ?? "").trim();
    if (!msg || msg === "Agent started") return [];
    return [{ id: event.id, role: "supervisor", text: msg, timestamp: event.timestamp, isCoordination: true, coordinationType: "general" }];
  }

  if (event.type === "SUPERVISOR_TOOL_CALL") {
    const toolName = String(event.payload?.["toolName"] ?? "");
    const args = event.payload?.["args"] as Record<string, unknown> | undefined;
    if (toolName === "dispatch_worker") {
      const wid = String(args?.["workerId"] ?? "");
      const action = String(args?.["specificAction"] ?? "").slice(0, 80);
      return [{ id: event.id, role: "supervisor", text: `派发 ${wid}：${action}`, timestamp: event.timestamp, isCoordination: true, coordinationType: "dispatch" }];
    }
    if (toolName === "wait_workers") {
      const ids = (args?.["workerIds"] as string[] | undefined)?.join(", ") ?? "";
      return [{ id: event.id, role: "supervisor", text: `等待 ${ids} 完成…`, timestamp: event.timestamp, isCoordination: true, coordinationType: "status" }];
    }
    return [];
  }

  if (event.type === "SUPERVISOR_WORKER_COMPLETE") {
    const wid = String(event.payload?.["workerId"] ?? "");
    let outputStr = "";
    try {
      const raw = event.payload?.["output"];
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        outputStr = parsed["exitCode"] !== undefined
          ? `退出码 ${parsed["exitCode"]}`
          : String(parsed["summary"] ?? parsed["result"] ?? "").slice(0, 80);
      }
    } catch { outputStr = ""; }
    const text = outputStr ? `${wid} 完成：${outputStr}` : `${wid} 完成`;
    return [{ id: event.id, role: "supervisor", text, timestamp: event.timestamp, isCoordination: true, coordinationType: "result" }];
  }

  if (event.type === "TOOL_CALL") {
    const toolName = String(event.payload?.["toolName"] ?? event.payload?.["name"] ?? "");
    if (!toolName) return [];
    return [{ id: event.id, role: "supervisor", text: `调用工具：${toolName}`, timestamp: event.timestamp, isCoordination: true, coordinationType: "general" }];
  }

  if (event.type === "AGENT_ACT") {
    const toolName = String(event.payload?.["toolName"] ?? event.payload?.["tool"] ?? "");
    if (toolName === "dispatch_worker" || toolName === "assign_task") {
      const target = String(event.payload?.["workerId"] ?? event.payload?.["agentId"] ?? "");
      const task = String(event.payload?.["task"] ?? event.payload?.["goal"] ?? "").slice(0, 80);
      const text = `派发 ${target}：${task}`;
      return text ? [{ id: event.id, role: "supervisor", text, timestamp: event.timestamp, isCoordination: true, coordinationType: "dispatch" }] : [];
    }
  }

  if (event.type === "AGENT_COMPLETE_TASK") {
    const output = String(event.payload?.["output"] ?? "").slice(0, 80).trim();
    const agentId = String(event.payload?.["agentId"] ?? event.source ?? "");
    const text = output ? `${agentId} 已完成：${output}` : `${agentId} 任务完成`;
    return [{ id: event.id, role: "supervisor", text, timestamp: event.timestamp, isCoordination: true, coordinationType: "result" }];
  }

  if (event.type === "SUPERVISOR_AGGREGATE") {
    const state = String(event.payload?.["state"] ?? "");
    if (state === "completed") {
      return [{ id: event.id, role: "supervisor", text: "✅ 任务已完成，如需继续请告诉我。", timestamp: event.timestamp }];
    }
    if (state === "failed") {
      return [{ id: event.id, role: "supervisor", text: "❌ 任务执行遇到问题，请告诉我如何继续。", timestamp: event.timestamp }];
    }
  }

  if (event.type === "WORKER_BLOCK") {
    const wid = String(event.payload?.["workerId"] ?? event.source ?? "");
    const rationale = String(event.payload?.["rationale"] ?? event.payload?.["blockType"] ?? "").trim();
    const text = rationale ? `${wid} 需要协助：${rationale}` : `${wid} 上报阻塞`;
    return [{ id: event.id, role: "supervisor", text, timestamp: event.timestamp, isCoordination: true, coordinationType: "status" }];
  }

  return [];
}

// ============================================================================
// Task event mapping (Story 9.44 — pure functions, no state)
// ============================================================================

/** 事件驱动的六类 TASK_* 事件（与引擎 blackboard.ts apply 语义对齐）。 */
const TASK_EVENT_TYPES = new Set<string>([
  "TASK_CREATED",
  "TASK_ASSIGNED",
  "TASK_STARTED",
  "TASK_REPORTED",
  "TASK_COMPLETED",
  "TASK_FAILED",
]);

/** 防御式收窄 unknown → TaskItem；id/description 必须是 string，status 非法时回退 pending。 */
function asTaskItem(value: unknown): TaskItem | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<TaskItem>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return null;
  if (typeof candidate.description !== "string") return null;
  const status: TaskState = isTaskState(candidate.status) ? candidate.status : "pending";
  const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt : "";
  const completedAt =
    typeof candidate.completedAt === "string" ? candidate.completedAt : undefined;
  return {
    ...candidate,
    id: candidate.id,
    description: candidate.description,
    status,
    createdAt,
    completedAt,
  };
}

function isTaskState(value: unknown): value is TaskState {
  return (
    value === "pending" ||
    value === "assigned" ||
    value === "running" ||
    value === "reported" ||
    value === "completed" ||
    value === "failed" ||
    value === "blocked"
  );
}

/**
 * Maps a single TASK_* RuntimeEvent onto the task list incrementally.
 * Pure function — no side effects.  Semantics aligned with the engine
 * blackboard.ts apply (session/blackboard.ts TASK_* cases):
 *
 * - TASK_CREATED: payload.task → append when id not present (idempotent)
 * - TASK_ASSIGNED: assignedTo ← payload.agentId, status ← assigned
 * - TASK_STARTED: status ← running
 * - TASK_REPORTED: status ← reported, output ← payload.output
 * - TASK_COMPLETED: status ← completed, output ← payload.output, completedAt ← event.timestamp
 * - TASK_FAILED: status ← failed, completedAt ← event.timestamp
 *
 * Missing taskId/task payload or unknown event types → tasks returned unchanged.
 */
export function applyTaskEventToTasks(tasks: TaskItem[], event: RuntimeEvent): TaskItem[] {
  if (!TASK_EVENT_TYPES.has(event.type)) return tasks;

  const payload = (event.payload ?? {}) as Record<string, unknown>;

  if (event.type === "TASK_CREATED") {
    const task = asTaskItem(payload["task"]);
    if (!task || tasks.some((t) => t.id === task.id)) return tasks;
    return [...tasks, task];
  }

  const taskId = typeof payload["taskId"] === "string" ? payload["taskId"] : undefined;
  if (!taskId) return tasks;

  switch (event.type) {
    case "TASK_ASSIGNED": {
      const agentId = typeof payload["agentId"] === "string" ? payload["agentId"] : undefined;
      return tasks.map((t) =>
        t.id === taskId ? { ...t, assignedTo: agentId, status: "assigned" as const } : t,
      );
    }
    case "TASK_STARTED":
      return tasks.map((t) => (t.id === taskId ? { ...t, status: "running" as const } : t));
    case "TASK_REPORTED":
      return tasks.map((t) =>
        t.id === taskId ? { ...t, status: "reported" as const, output: payload["output"] } : t,
      );
    case "TASK_COMPLETED":
      return tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: "completed" as const, output: payload["output"], completedAt: event.timestamp }
          : t,
      );
    case "TASK_FAILED":
      return tasks.map((t) =>
        t.id === taskId ? { ...t, status: "failed" as const, completedAt: event.timestamp } : t,
      );
    default:
      return tasks;
  }
}

/**
 * Restore tasks from a WorkspaceTaskSnapshot-shaped value (unknown).
 *
 * Restored list = snapshot.activeTasks + agents[].recentTerminalTask, each
 * defensively narrowed via asTaskItem, deduped by id (first occurrence wins —
 * active tasks win over terminal snapshots of the same id).  Malformed or
 * empty snapshots clear/skip gracefully and never throw.
 */
export function mergeSnapshotTasksPure(snapshot: unknown): TaskItem[] {
  const restored: TaskItem[] = [];
  const seen = new Set<string>();

  const pushUnique = (value: unknown): void => {
    const task = asTaskItem(value);
    if (!task || seen.has(task.id)) return;
    seen.add(task.id);
    restored.push(task);
  };

  if (typeof snapshot === "object" && snapshot !== null) {
    const s = snapshot as { activeTasks?: unknown; agents?: unknown };
    if (Array.isArray(s.activeTasks)) {
      for (const item of s.activeTasks) pushUnique(item);
    }
    if (Array.isArray(s.agents)) {
      for (const agent of s.agents) {
        if (typeof agent === "object" && agent !== null) {
          pushUnique((agent as { recentTerminalTask?: unknown }).recentTerminalTask);
        }
      }
    }
  }

  return restored;
}

// ============================================================================
// Incremental collapseCoordinationGroups
// ============================================================================

/**
 * Append `newMessages` to an existing `displayMessages` list incrementally.
 *
 * Rules (mirrors the original collapseCoordinationGroups):
 * - Non-coordination messages always get their own entry.
 * - Coordination messages accumulate; when a run of ≥ 3 is flushed (because a
 *   non-coordination message arrives, or at end-of-list) they become a
 *   CoordinationGroup.  Runs of 1–2 are kept as individual entries.
 * - A new coordination message can extend the last CoordinationGroup in
 *   displayMessages if the group is still the tail.
 *
 * This function returns a NEW array (immutable update for Zustand).
 */
function appendToDisplayMessages(
  displayMessages: DisplayMessage[],
  newMessages: ForegroundMessage[],
): DisplayMessage[] {
  if (newMessages.length === 0) return displayMessages;

  // Work on a mutable copy; we'll return it at the end.
  const result: DisplayMessage[] = [...displayMessages];

  // Pending coordination buffer — may contain items that aren't yet flushed
  // into result.  We need to "re-open" the tail if it's already a group or
  // individual coordination messages.
  let coordBuf: ForegroundMessage[] = [];

  // If the current tail is a coordination group or a run of coordination
  // messages, pull them back into coordBuf so we can continue the run.
  if (result.length > 0) {
    const tail = result[result.length - 1]!;
    if (tail.role === "coordination-group") {
      // Re-open the group into the buffer and remove it from result.
      coordBuf = [...(tail as CoordinationGroup).items];
      result.pop();
    } else if ((tail as ForegroundMessage).isCoordination) {
      // Pull back the trailing individual coordination messages.
      while (result.length > 0) {
        const last = result[result.length - 1]!;
        if (last.role !== "coordination-group" && (last as ForegroundMessage).isCoordination) {
          coordBuf.unshift(last as ForegroundMessage);
          result.pop();
        } else {
          break;
        }
      }
    }
  }

  const flushCoord = () => {
    if (coordBuf.length === 0) return;
    if (coordBuf.length < 3) {
      result.push(...coordBuf);
    } else {
      result.push({
        id: `coord-group-${coordBuf[0]!.id}`,
        role: "coordination-group",
        items: coordBuf,
        timestamp: coordBuf[0]!.timestamp,
      } as CoordinationGroup);
    }
    coordBuf = [];
  };

  for (const msg of newMessages) {
    if (msg.isCoordination) {
      coordBuf.push(msg);
    } else {
      flushCoord();
      result.push(msg);
    }
  }
  flushCoord();

  return result;
}

// ============================================================================
// Zustand store
// ============================================================================

const initialState = {
  events: [] as RuntimeEvent[],
  lastEventId: null as string | null,
  foregroundMessages: [] as ForegroundMessage[],
  displayMessages: [] as DisplayMessage[],
  activities: {} as Record<string, AgentActivity>,
  recentlyActiveMap: {} as Record<string, number>,
  recentlyActiveAgents: [] as string[],
  selectedAgentId: null as string | null,
  blackboardData: {} as Record<string, unknown>,
  tasks: [] as TaskItem[],
  boardCollapsed: false,
  isConnected: false,
  isConnecting: false,
  error: null as string | null,
};

export const useCollaborationUi = create<CollaborationUiState>((set, get) => ({
  ...initialState,

  addEvent: (event) => {
    // ── Deduplication ───────────────────────────────────────────────────────
    // Fast check using lastEventId before scanning the array.
    const state = get();
    if (state.lastEventId === event.id) return;
    if (state.events.some((e) => e.id === event.id)) return;

    // ── Map event → foreground messages (O(1) per event) ───────────────────
    const newFgMessages = mapEventToForegroundMessages(event);

    // ── Update recentlyActiveMap (O(1), no setTimeout) ──────────────────────
    const source = event.source;
    let newActiveMap = state.recentlyActiveMap;
    if (source && source !== "system" && source !== "user") {
      newActiveMap = { ...state.recentlyActiveMap, [source]: Date.now() + RECENTLY_ACTIVE_TTL };
    }

    // ── Append to events[], evicting oldest if over cap ─────────────────────
    const newEvents = state.events.length < MAX_EVENTS
      ? [...state.events, event]
      : [...state.events.slice(state.events.length - (MAX_EVENTS - 1)), event];

    // ── Incremental display state update ────────────────────────────────────
    let newForegroundMessages = state.foregroundMessages;
    let newDisplayMessages = state.displayMessages;

    if (newFgMessages.length > 0) {
      if (event.type === "MESSAGE_SENT" && newFgMessages[0]?.streamSource) {
        const incoming = newFgMessages[0];
        const last = state.foregroundMessages[state.foregroundMessages.length - 1];
        newForegroundMessages = last?.role === "supervisor" && last.streamSource === incoming.streamSource
          ? [
              ...state.foregroundMessages.slice(0, -1),
              {
                ...last,
                text: `${last.text}${incoming.text}`,
                timestamp: incoming.timestamp,
              },
            ]
          : [...state.foregroundMessages, incoming];
        newDisplayMessages = appendToDisplayMessages([], newForegroundMessages);
      } else if (event.type === "ASSISTANT_MESSAGE" && isSupervisorSource(event.source)) {
        const finalText = String(event.payload?.["content"] ?? "").trim();
        const replaced = finalText
          ? replaceTrailingStreamMessage(state.foregroundMessages, event.source, finalText, event)
          : { messages: state.foregroundMessages, replaced: false };
        newForegroundMessages = replaced.replaced
          ? replaced.messages
          : [...state.foregroundMessages, ...newFgMessages];
        newDisplayMessages = replaced.replaced
          ? appendToDisplayMessages([], newForegroundMessages)
          : appendToDisplayMessages(state.displayMessages, newFgMessages);
      } else {
        newForegroundMessages = [...state.foregroundMessages, ...newFgMessages];
        newDisplayMessages = appendToDisplayMessages(state.displayMessages, newFgMessages);
      }
    }

    // ── Incremental task board update (Story 9.44) ───────────────────────────
    const newTasks = TASK_EVENT_TYPES.has(event.type)
      ? applyTaskEventToTasks(state.tasks, event)
      : state.tasks;

    set({
      events: newEvents,
      lastEventId: event.id,
      foregroundMessages: newForegroundMessages,
      displayMessages: newDisplayMessages,
      recentlyActiveMap: newActiveMap,
      tasks: newTasks,
    });
  },

  pruneRecentlyActive: () => {
    const { recentlyActiveMap } = get();
    const now = Date.now();
    const survivors: Record<string, number> = {};
    for (const [id, expireAt] of Object.entries(recentlyActiveMap)) {
      if (expireAt > now) survivors[id] = expireAt;
    }
    const activeAgents = Object.keys(survivors);
    set({ recentlyActiveMap: survivors, recentlyActiveAgents: activeAgents });
  },

  setLastEventId: (id) => set({ lastEventId: id }),

  updateAgentActivity: (agentId, activity) =>
    set((state) => ({
      activities: {
        ...state.activities,
        [agentId]: {
          agentId,
          status: "idle",
          lastUpdated: new Date().toISOString(),
          ...state.activities[agentId],
          ...activity,
        },
      },
    })),

  setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),

  setBlackboardData: (data) => set({ blackboardData: data }),
  setTasks: (tasks) => set({ tasks }),
  mergeSnapshotTasks: (snapshot) => set({ tasks: mergeSnapshotTasksPure(snapshot) }),
  setBoardCollapsed: (collapsed) => set({ boardCollapsed: collapsed }),
  setConnected: (connected) => set({ isConnected: connected }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));

// ============================================================================
// eventToAgentStatus — pure helper, unchanged
// ============================================================================

/**
 * 根据事件类型推导 Agent 活动状态。
 */
export function eventToAgentStatus(event: RuntimeEvent): Partial<AgentActivity> | null {
  switch (event.type) {
    case "AGENT_THINKING":
      return { status: "thinking", message: event.payload?.["message"] as string };
    case "TOOL_CALL":
    case "AGENT_ACT":
      return { status: "tool_call", message: event.payload?.["toolName"] as string };
    case "TOOL_RESULT":
    case "TOOL_FAILURE":
      return { status: "thinking" };
    case "AGENT_COMPLETE_TASK":
      return { status: "complete" };
    case "AGENT_FAIL_TASK":
      return { status: "fail", message: event.payload?.["error"] as string };
    case "HUMAN_REVIEW_REQUEST":
      return { status: "waiting", message: event.payload?.["question"] as string };
    case "AGENT_PAUSED":
      return { status: "waiting", message: "等待用户回答..." };
    case "WORKER_BLOCK":
      return { status: "waiting", message: event.payload?.["suggestedQuestion"] as string };
    case "AGENT_START":
      return { status: "idle" };
    case "AGENT_END":
      return { status: "complete" };
    case "ASSISTANT_MESSAGE": {
      const content = event.payload?.["content"];
      return { status: "thinking", message: typeof content === "string" ? content.slice(0, 100) : undefined };
    }
    case "SUPERVISOR_TOOL_CALL": {
      const args = event.payload?.["args"] as Record<string, unknown> | undefined;
      const workerId = args?.["workerId"] as string | undefined;
      return { status: "tool_call", message: workerId ? `派发: ${workerId}` : "协调中" };
    }
    case "SUPERVISOR_WORKER_COMPLETE":
      return { status: "complete" };
    default:
      return null;
  }
}
