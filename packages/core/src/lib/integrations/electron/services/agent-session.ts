import { getIpcRenderer, isElectron } from '../env';
import { IPC_CHANNELS, type IpcResponse } from '../ipc-protocol';
import type { AgentSession } from '../../../../types/agent';
import type { RuntimeLLMConfig } from '../../pi-agent/llm-config';
import type {
  AgentTaskRuntimeEventV1,
  AgentTaskRuntimeSnapshotV1,
  ControlAgentTaskRequestV1,
  CreateAgentTaskRequestV1,
  GetAgentTaskRequestV1,
} from '../../pi-agent/task-runtime';
import type {
  RestoreAgentEntryType,
  RestoreAgentSessionRequest,
} from '../../pi-agent/session-restore';

export interface AgentContentResponse {
  content: string;
  baseDir: string;
  workingDir?: string;
  outputDir: string;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? JSON.stringify((payload as { error: unknown }).error)
        : response.statusText;
    throw new Error(message);
  }
  return payload;
}

// ── Session List ──────────────────────────────────────────────

export async function listAgentSessions(projectId?: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_LIST,
      { projectId }
    );
  }

  const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const response = await fetch(`/api/agent/sessions${params}`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Create ────────────────────────────────────────────

export async function createAgentSession(request: {
  projectId: string;
  projectName: string;
  systemPrompt?: string;
  agentType?: string;
  projectContext?: Record<string, unknown>;
  sessionId?: string;
  llmConfig?: RuntimeLLMConfig;
  agentBaseDir?: string;
  outputDir?: string;
}): Promise<IpcResponse<AgentSession>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<AgentSession>>(
      IPC_CHANNELS.AGENT_SESSION_CREATE,
      request
    );
  }

  const response = await fetch('/api/agent/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return readJsonResponse<IpcResponse<AgentSession>>(response);
}

// ── Session Get ───────────────────────────────────────────────

export async function getAgentSession(
  request: RestoreAgentSessionRequest,
): Promise<IpcResponse<AgentSession>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<AgentSession>>(
      IPC_CHANNELS.AGENT_SESSION_GET,
      request,
    );
  }

  const params = new URLSearchParams({
    projectId: request.projectId,
    entryType: request.entryType,
    entryId: request.entryId,
  });
  const response = await fetch(
    `/api/agent/sessions/${encodeURIComponent(request.sessionId)}?${params.toString()}`,
  );
  return (await response.json()) as IpcResponse<AgentSession>;
}

// ── Session Update ────────────────────────────────────────────

export async function updateAgentSession(sessionId: string, updates: Record<string, unknown>, projectId?: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_UPDATE,
      { sessionId, updates, projectId }
    );
  }

  const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const response = await fetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}${params}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Delete ────────────────────────────────────────────

export async function deleteAgentSession(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_DELETE,
      { sessionId }
    );
  }

  const response = await fetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Destroy ───────────────────────────────────────────

export async function destroyAgentSession(request: { sessionId?: string; projectId?: string }): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_DESTROY,
      request
    );
  }

  const response = await fetch('/api/agent/sessions/destroy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Statistics ────────────────────────────────────────

export async function getAgentSessionStatistics(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_STATISTICS,
      { sessionId }
    );
  }

  const response = await fetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}/statistics`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Summary ───────────────────────────────────────────

export async function getAgentSessionSummary(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_SUMMARY,
      { sessionId }
    );
  }

  const response = await fetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}/summary`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Memory Consolidate ────────────────────────────────────────

export async function consolidateMemory(entryType: string, entryId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_MEMORY_CONSOLIDATE,
      { entryType, entryId }
    );
  }

  const response = await fetch('/api/agent/memory/consolidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryType, entryId }),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Message (non-streaming) ────────────────────────

export async function sendAgentMessage(request: {
  sessionId: string;
  content: string;
  role?: string;
  projectId?: string;
  entryType?: RestoreAgentEntryType;
  entryId?: string;
}): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_MESSAGE,
      request
    );
  }

  const response = await fetch(`/api/agent/sessions/${encodeURIComponent(request.sessionId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: request.content,
      role: request.role,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      ...(request.entryType ? { entryType: request.entryType } : {}),
      ...(request.entryId ? { entryId: request.entryId } : {}),
    }),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Message Stream ─────────────────────────────────

export async function sendAgentMessageStream(request: {
  sessionId: string;
  content: string;
  role?: string;
  projectId?: string;
  entryType?: RestoreAgentEntryType;
  entryId?: string;
  streamId?: string;
}): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_MESSAGE_STREAM,
      request
    );
  }

  const response = await fetch(`/api/agent/sessions/${encodeURIComponent(request.sessionId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      content: request.content,
      role: request.role,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      ...(request.entryType ? { entryType: request.entryType } : {}),
      ...(request.entryId ? { entryId: request.entryId } : {}),
    }),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Subscribe to Agent Events (Electron IPC) ──────────────

export interface AgentRendererEvent {
  type: string;
  data: unknown;
  streamId?: string;
}

function readDelta(event: { type: string; data: unknown }): string | null {
  if (event.type !== 'text_delta' || !event.data || typeof event.data !== 'object') {
    return null;
  }
  const delta = (event.data as { delta?: unknown }).delta;
  return typeof delta === 'string' ? delta : null;
}

export function coalesceAgentEventBatch(
  events: Array<{ type: string; data: unknown }>,
): Array<{ type: string; data: unknown }> {
  const output: Array<{ type: string; data: unknown }> = [];
  for (const event of events) {
    const delta = readDelta(event);
    const previous = output[output.length - 1];
    const previousDelta = previous ? readDelta(previous) : null;
    if (delta !== null && previous && previousDelta !== null) {
      previous.data = { ...(previous.data as object), delta: previousDelta + delta };
    } else {
      output.push({ ...event });
    }
  }
  return output;
}

export function subscribeAgentEvents(
  listener: (event: AgentRendererEvent) => void,
  sessionId?: string,
): () => void {
  if (!isElectron()) {
    return () => {};
  }
  const handler = (payload: unknown) => {
    try {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      // 如果订阅方指定了 sessionId，则只接受显式携带同一 sessionId 的事件。
      // 这样可避免 project-level AGENT_EVENT（仅带 projectId）误被 skill/session 级窗口消费。
      if (sessionId) {
        const eventSessionId =
          parsed && typeof parsed === 'object' && 'sessionId' in parsed
            ? (parsed as { sessionId?: unknown }).sessionId
            : undefined;
        if (typeof eventSessionId !== 'string' || eventSessionId !== sessionId) {
          return;
        }
      }

      // 处理批量事件
      if (parsed && typeof parsed === 'object' && 'type' in parsed && parsed.type === 'batch_events') {
        const batch = parsed as { events: Array<{ type: string; data: unknown }>; streamId?: string };
        for (const event of coalesceAgentEventBatch(batch.events)) {
          listener({ ...event, streamId: batch.streamId });
        }
        return;
      }

      listener(parsed as { type: string; data: unknown; streamId?: string });
    } catch {}
  };
  const unsubscribe = getIpcRenderer().on(IPC_CHANNELS.AGENT_EVENT, handler);
  return unsubscribe;
}

// ── Session Abort ──────────────────────────────────────────

export async function abortAgentSession(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.AGENT_SESSION_ABORT,
      { sessionId }
    );
  }

  const response = await fetch('/api/agent/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Task Runtime ───────────────────────────────────

export async function createAgentTask(
  request: CreateAgentTaskRequestV1,
): Promise<IpcResponse<AgentTaskRuntimeSnapshotV1>> {
  if (!isElectron()) {
    throw new Error('Agent Task Runtime 当前仅支持 Electron Session');
  }
  return getIpcRenderer().invoke<IpcResponse<AgentTaskRuntimeSnapshotV1>>(
    IPC_CHANNELS.AGENT_TASK_CREATE,
    request,
  );
}

export async function getAgentTask(
  request: GetAgentTaskRequestV1,
): Promise<IpcResponse<AgentTaskRuntimeSnapshotV1>> {
  if (!isElectron()) {
    throw new Error('Agent Task Runtime 当前仅支持 Electron Session');
  }
  return getIpcRenderer().invoke<IpcResponse<AgentTaskRuntimeSnapshotV1>>(
    IPC_CHANNELS.AGENT_TASK_GET,
    request,
  );
}

export async function controlAgentTask(
  request: ControlAgentTaskRequestV1,
): Promise<IpcResponse<AgentTaskRuntimeSnapshotV1>> {
  if (!isElectron()) {
    throw new Error('Agent Task Runtime 当前仅支持 Electron Session');
  }
  return getIpcRenderer().invoke<IpcResponse<AgentTaskRuntimeSnapshotV1>>(
    IPC_CHANNELS.AGENT_TASK_CONTROL,
    request,
  );
}

export function subscribeAgentTaskRuntime(
  sessionId: string,
  listener: (event: AgentTaskRuntimeEventV1) => void,
): () => void {
  if (!isElectron()) {
    return () => {};
  }
  return getIpcRenderer().on(IPC_CHANNELS.AGENT_TASK_EVENT, (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const event = payload as Partial<AgentTaskRuntimeEventV1>;
    if (
      event.version !== 1
      || event.type !== 'agent_task_runtime_state'
      || event.sessionId !== sessionId
      || !event.snapshot
    ) {
      return;
    }
    listener(event as AgentTaskRuntimeEventV1);
  });
}

// ── Agent Content Get ──────────────────────────────────────

export async function getAgentContent(agentId: string): Promise<IpcResponse<AgentContentResponse>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<AgentContentResponse>>(
      IPC_CHANNELS.AGENT_CONTENT_GET,
      { agentId }
    );
  }

  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}?format=json`);
  return readJsonResponse<IpcResponse<AgentContentResponse>>(response);
}
