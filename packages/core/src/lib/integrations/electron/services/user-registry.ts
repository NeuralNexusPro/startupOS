import { getIpcRenderer, isElectron } from '../env';
import { IPC_CHANNELS, type IpcResponse } from '../ipc-protocol';
import type { UserAgent, UserSkill } from '../../../../types/user-registry';

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

export async function listUserAgents(): Promise<IpcResponse<UserAgent[]>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<UserAgent[]>>(
      IPC_CHANNELS.USER_AGENT_LIST
    );
  }

  const raw = await readJsonResponse<{ success: boolean; data: { agents: UserAgent[] }; timestamp: string }>(await fetch('/api/user-agents'));
  return { success: raw.success, data: raw.data.agents, timestamp: raw.timestamp };
}

export async function getUserAgent(id: string): Promise<IpcResponse<UserAgent>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<UserAgent>>(
      IPC_CHANNELS.USER_AGENT_GET,
      id
    );
  }

  const response = await fetch(`/api/user-agents/${encodeURIComponent(id)}`);
  return readJsonResponse<IpcResponse<UserAgent>>(response);
}

export async function listUserSkills(): Promise<IpcResponse<UserSkill[]>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<UserSkill[]>>(
      IPC_CHANNELS.USER_SKILL_LIST
    );
  }

  const raw = await readJsonResponse<{ success: boolean; data: { skills: UserSkill[] }; timestamp: string }>(await fetch('/api/user-skills'));
  return { success: raw.success, data: raw.data.skills, timestamp: raw.timestamp };
}

export async function getUserSkill(id: string): Promise<IpcResponse<UserSkill>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<UserSkill>>(
      IPC_CHANNELS.USER_SKILL_GET,
      id
    );
  }

  const response = await fetch(`/api/user-skills/${encodeURIComponent(id)}`);
  return readJsonResponse<IpcResponse<UserSkill>>(response);
}

export async function deleteUserAgent(id: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.USER_AGENT_DELETE,
      id
    );
  }

  const response = await fetch(`/api/user-agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}

export async function deleteUserSkill(id: string): Promise<IpcResponse<unknown>> {
  if (isElectron()) {
    return getIpcRenderer().invoke<IpcResponse<unknown>>(
      IPC_CHANNELS.USER_SKILL_DELETE,
      id
    );
  }

  const response = await fetch(`/api/user-skills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return readJsonResponse<IpcResponse<unknown>>(response);
}
