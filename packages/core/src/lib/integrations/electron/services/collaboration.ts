import { getIpcRenderer, isElectron } from '../env';
import { IPC_CHANNELS, type IpcResponse } from '../ipc-protocol';
import { normalizeRuntimeLLMConfig } from '../../pi-agent/llm-config';

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

// ── Topology ──────────────────────────────────────────────────

export async function getCollaborationTopology(projectId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_TOPOLOGY_GET,
      { projectId }
    );
  }

  const response = await fetch(`/api/collaboration/topology?projectId=${encodeURIComponent(projectId)}`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session List ──────────────────────────────────────────────

export async function listCollaborationSessions(): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_SESSION_LIST
    );
  }

  const response = await fetch('/api/collaboration/sessions');
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Create ────────────────────────────────────────────

export async function createCollaborationSession(request: Record<string, unknown>): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_SESSION_CREATE,
      request
    );
  }

  const response = await fetch('/api/collaboration/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Get ───────────────────────────────────────────────

export async function getCollaborationSession(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_SESSION_GET,
      { sessionId }
    );
  }

  const response = await fetch(`/api/collaboration/sessions/${encodeURIComponent(sessionId)}`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Abort ─────────────────────────────────────────────

export async function abortCollaborationSession(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_SESSION_ABORT,
      { sessionId }
    );
  }

  const response = await fetch(`/api/collaboration/sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: 'POST',
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Execute ───────────────────────────────────────────

export async function executeCollaborationSession(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_SESSION_EXECUTE,
      { sessionId }
    );
  }

  const response = await fetch(`/api/collaboration/sessions/${encodeURIComponent(sessionId)}/execute`, {
    method: 'POST',
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Session Message ───────────────────────────────────────────

export async function sendCollaborationMessage(
  sessionId: string,
  message: string,
  workerId?: string,
  llmConfig?: import('../../pi-agent/llm-config').RuntimeLLMConfig | null,
): Promise<IpcResponse<unknown>> {
  const normalizedLlmConfig = normalizeRuntimeLLMConfig(llmConfig);

  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_SESSION_MESSAGE_POST,
      { sessionId, message, workerId, llmConfig: normalizedLlmConfig }
    );
  }

  const response = await fetch(`/api/collaboration/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, to: 'supervisor', workerId, llmConfig: normalizedLlmConfig }),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Blackboard ────────────────────────────────────────────────

export async function getCollaborationBlackboard(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_BLACKBOARD_GET,
      { sessionId }
    );
  }

  const response = await fetch(`/api/collaboration/sessions/${encodeURIComponent(sessionId)}/blackboard`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Task Snapshot (Story 9.44) ────────────────────────────────

/**
 * 获取协作会话任务快照（Multica 式 WorkspaceTaskSnapshot + memoryIndex + runs）。
 * Electron 模式走 COLLAB_SNAPSHOT_GET IPC；Web 模式走既有 GET /snapshot route。
 */
export async function getCollaborationTaskSnapshot(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_SNAPSHOT_GET,
      { sessionId }
    );
  }

  const response = await fetch(`/api/collaboration/sessions/${encodeURIComponent(sessionId)}/snapshot`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Human Review (deprecated) ─────────────────────────────────

export async function respondToHumanReview(
  sessionId: string,
  agentId: string,
  response: string
): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.COLLAB_HUMAN_REVIEW,
      { sessionId, agentId, response }
    );
  }

  const httpResponse = await fetch(`/api/collaboration/sessions/${encodeURIComponent(sessionId)}/human-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, response }),
  });
  return readJsonResponse<IpcResponse<unknown>>(httpResponse);
}

// ── Event Stream Subscription ─────────────────────────────────

type EventListener = (data: string) => void;

/**
 * Subscribe to collaboration events.
 * - Web mode: returns an EventSource connected to the SSE endpoint
 * - Electron mode: uses ipcRenderer.on to receive events pushed from main process
 *
 * Returns an unsubscribe function.
 */
export function subscribeCollaborationEvents(
  _sessionId: string,
  onEvent: EventListener
): () => void {
  if (isElectron()) {
    const unsubscribe = getIpcRenderer().on(IPC_CHANNELS.COLLAB_EVENT, (data: unknown) => {
      onEvent(typeof data === 'string' ? data : JSON.stringify(data));
    });
    return unsubscribe;
  }

  // Web mode: EventSource SSE
  const eventSource = new EventSource(`/api/collaboration/sessions/${encodeURIComponent(_sessionId)}/events`);
  eventSource.onmessage = (event) => {
    onEvent(event.data);
  };
  return () => {
    eventSource.close();
  };
}
