import type { JevProviderSummary } from '@originos/core/types';
import type { JevProviderUpdate } from '@originos/core/lib/features/perception';
import { getIpcRenderer, isElectron } from '@originos/core/lib/integrations/electron/env';
import { IPC_CHANNELS, type IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';

export async function getJevProvider(): Promise<JevProviderSummary> {
  return request('GET', IPC_CHANNELS.JEV_PROVIDER_GET);
}

export async function updateJevProvider(input: JevProviderUpdate): Promise<JevProviderSummary> {
  return request('PUT', IPC_CHANNELS.JEV_PROVIDER_UPDATE, input);
}

export async function clearJevProviderCredential(): Promise<JevProviderSummary> {
  return request('DELETE', IPC_CHANNELS.JEV_PROVIDER_CLEAR_CREDENTIAL, { confirm: true });
}

async function request(method: 'GET' | 'PUT' | 'DELETE', channel: string, body?: unknown): Promise<JevProviderSummary> {
  const response = isElectron()
    ? await getIpcRenderer().invoke<IpcResponse<JevProviderSummary>>(channel, ...(body === undefined ? [] : [body]))
    : await fetch('/api/jev-provider', { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
      .then((value) => value.json() as Promise<IpcResponse<JevProviderSummary>>);
  if (!response.success || !response.data) throw new Error(response.error?.code ?? 'JEV_PROVIDER_REQUEST_FAILED');
  return response.data;
}
