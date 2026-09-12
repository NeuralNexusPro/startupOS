import { getIpcRenderer, isElectron } from '../env';
import { IPC_CHANNELS, type IpcResponse } from '../ipc-protocol';
import type { EntryType } from '../../../../types/agent-entry';
import type { RuntimeLLMConfig } from '../../pi-agent/llm-config';

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

function okResponse<T>(data: T): IpcResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

// ── Interviews ──────────────────────────────────────────────────

export async function listInterviews(projectId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.INTERVIEW_LIST,
      projectId
    );
  }

  const response = await fetch(`/api/interviews?projectId=${encodeURIComponent(projectId)}`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

export async function createInterview(request: { projectId: string; skipOptionalQuestions?: boolean }): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.INTERVIEW_CREATE,
      request
    );
  }

  const response = await fetch('/api/interviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

export async function getInterview(interviewId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.INTERVIEW_GET,
      interviewId
    );
  }

  const response = await fetch(`/api/interviews/${encodeURIComponent(interviewId)}`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

export async function completeInterview(interviewId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.INTERVIEW_COMPLETE,
      interviewId
    );
  }

  const response = await fetch(`/api/interviews/${encodeURIComponent(interviewId)}/complete`, {
    method: 'POST',
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Notifications ───────────────────────────────────────────────

export interface SystemNotificationRequest {
  title: string;
  body?: string;
  silent?: boolean;
  activationTarget?: SystemNotificationActivationTarget;
}

export interface SystemNotificationActivationTarget {
  entryType: EntryType;
  entryId: string;
  title?: string;
  initialMessage?: string;
}

export interface SystemNotificationResult {
  shown: boolean;
  reason?: string;
  error?: string;
  delivery?: 'electron' | 'electron-native' | 'browser';
  appName?: string;
  nativeSupported?: boolean;
}

export async function listNotifications(filters?: { status?: string; type?: string; sessionId?: string; projectId?: string }): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.NOTIFICATION_LIST,
      filters ?? {}
    );
  }

  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.sessionId) params.set('sessionId', filters.sessionId);
  if (filters?.projectId) params.set('projectId', filters.projectId);
  const query = params.toString();

  const response = await fetch(`/api/notifications${query ? `?${query}` : ''}`);
  return readJsonResponse<IpcResponse<unknown>>(response);
}

function emitSystemNotificationToast(request: SystemNotificationRequest, result: SystemNotificationResult): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('originos:system-notification', {
    detail: {
      title: request.title,
      body: request.body,
      activationTarget: request.activationTarget,
      result,
    },
  }));
}

export async function showSystemNotification(request: SystemNotificationRequest): Promise<IpcResponse<SystemNotificationResult>> {
  if (isElectron()) {
    const ipcRequest: SystemNotificationRequest = {
      title: request.title,
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(request.silent === undefined ? {} : { silent: request.silent }),
      ...(request.activationTarget === undefined ? {} : { activationTarget: request.activationTarget }),
    };
    const nativeResult = await getIpcRenderer().invoke<IpcResponse<SystemNotificationResult>>(
      IPC_CHANNELS.NOTIFICATION_SHOW,
      ipcRequest
    );
    if (nativeResult.success && nativeResult.data?.shown) {
      const data = { ...nativeResult.data, delivery: nativeResult.data.delivery ?? 'electron' };
      return {
        ...nativeResult,
        data,
      };
    }
    return nativeResult;
  }

  const browserResult = await showBrowserNotification(request);
  if (browserResult.data?.shown) {
    emitSystemNotificationToast(request, browserResult.data);
  }
  return browserResult;
}

async function showBrowserNotification(request: SystemNotificationRequest): Promise<IpcResponse<SystemNotificationResult>> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return okResponse({ shown: false, reason: 'NOT_SUPPORTED' });
  }

  const BrowserNotification = window.Notification;
  let permission = BrowserNotification.permission;
  if (permission === 'default') {
    permission = await BrowserNotification.requestPermission();
  }
  if (permission !== 'granted') {
    return okResponse({ shown: false, reason: 'PERMISSION_DENIED' });
  }

  const notification = new BrowserNotification(request.title, {
    body: request.body,
    silent: request.silent,
  });
  notification.onclick = () => {
    emitSystemNotificationToast(request, { shown: true, delivery: 'browser' });
  };
  return okResponse({ shown: true, delivery: 'browser' });
}

// ── Launch ──────────────────────────────────────────────────────

export async function launchEntry(context: { entryType: EntryType; entryId: string; sessionId?: string }): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.LAUNCH,
      context
    );
  }

  const response = await fetch('/api/launch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── User Config ─────────────────────────────────────────────────

export interface UserLLMConfig {
  enabled?: boolean;
  provider?: string;
  anthropicAuthToken?: string | null;
  anthropicApiKey?: string | null;
  anthropicBaseUrl?: string | null;
  anthropicCredentialSource?: RuntimeLLMConfig["anthropicCredentialSource"] | null;
  authToken?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  model?: string;
  maxTokens?: number;
  mapping?: Record<string, string>;
}

export interface UserPreferencesConfig {
  language?: string;
}

export async function getUserConfig(): Promise<IpcResponse<{ llm?: UserLLMConfig; preferences?: UserPreferencesConfig }>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<{ llm?: UserLLMConfig; preferences?: UserPreferencesConfig }>>(
      IPC_CHANNELS.USER_CONFIG_GET
    );
  }
  const response = await fetch('/api/user-config');
  return readJsonResponse<IpcResponse<{ llm?: UserLLMConfig; preferences?: UserPreferencesConfig }>>(response);
}

export async function setUserConfig(config: { llm?: UserLLMConfig; preferences?: UserPreferencesConfig }): Promise<IpcResponse<{ llm?: UserLLMConfig; preferences?: UserPreferencesConfig }>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<{ llm?: UserLLMConfig; preferences?: UserPreferencesConfig }>>(
      IPC_CHANNELS.USER_CONFIG_SET,
      config
    );
  }
  const response = await fetch('/api/user-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return readJsonResponse<IpcResponse<{ llm?: UserLLMConfig; preferences?: UserPreferencesConfig }>>(response);
}

// ── Debug ───────────────────────────────────────────────────────

export async function getDebugEnv(): Promise<IpcResponse<Record<string, string | undefined>>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<Record<string, string | undefined>>>(
      IPC_CHANNELS.DEBUG_ENV
    );
  }

  const response = await fetch('/api/debug/env');
  return readJsonResponse<IpcResponse<Record<string, string | undefined>>>(response);
}

// ── Taste Detection ──────────────────────────────────────────

export async function startTasteDetection(request: { userId: string; projectId?: string; maxTurns?: number }): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.TASTE_DETECTION_START,
      request
    );
  }

  const response = await fetch('/api/taste/user/detection/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return okResponse(await readJsonResponse<unknown>(response));
}

export async function sendTasteDetectionMessage(sessionId: string, content: string, turn?: number): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.TASTE_DETECTION_MESSAGE,
      { sessionId, content, turn }
    );
  }

  const response = await fetch(`/api/taste/user/detection/${encodeURIComponent(sessionId)}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, turn }),
  });
  return okResponse(await readJsonResponse<unknown>(response));
}

export async function analyzeTasteDetection(sessionId: string, forceReanalyze?: boolean): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.TASTE_DETECTION_ANALYZE,
      { sessionId, forceReanalyze }
    );
  }

  const response = await fetch(`/api/taste/user/detection/${encodeURIComponent(sessionId)}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options: { forceReanalyze } }),
  });
  return okResponse(await readJsonResponse<unknown>(response));
}

export async function getTasteDraft(sessionId: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.TASTE_DETECTION_DRAFT,
      { sessionId }
    );
  }

  const response = await fetch(`/api/taste/user/detection/${encodeURIComponent(sessionId)}/taste-draft`);
  return okResponse(await readJsonResponse<unknown>(response));
}

// ── Sandbox ──────────────────────────────────────────────────

export async function listSandboxApps(): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.SANDBOX_APP_LIST
    );
  }

  const response = await fetch('/api/sandbox/apps');
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Interview Answers ─────────────────────────────────────────

export async function submitInterviewAnswer(
  interviewId: string,
  questionId: string,
  answer: string
): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.INTERVIEW_ANSWER_SUBMIT,
      { interviewId, questionId, answer }
    );
  }

  const response = await fetch(`/api/interviews/${encodeURIComponent(interviewId)}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, answer }),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

// ── Notification Update ───────────────────────────────────────

export async function updateNotification(
  id: string,
  updates: { status?: string }
): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.NOTIFICATION_UPDATE,
      { id, updates }
    );
  }

  const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}
