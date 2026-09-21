import { getIpcRenderer, isElectron } from '@originos/core/lib/integrations/electron/env';
import { IPC_CHANNELS, type IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type { JevDecisionReceipt } from '@originos/core/types';

export async function listPendingPerceptionDecisions(): Promise<JevDecisionReceipt[]> {
  if (!isElectron()) return [];
  return invoke<JevDecisionReceipt[]>(IPC_CHANNELS.PERCEPTION_DECISION_PENDING);
}

export async function resolvePerceptionDecision(decisionId: string, candidateKey: string): Promise<JevDecisionReceipt> {
  if (isElectron()) return invoke(IPC_CHANNELS.PERCEPTION_DECISION_RESOLVE, { decisionId, candidateKey });
  return request({ action: 'resolve-decision', decisionId, candidateKey });
}

export async function retryPerceptionDecision(decisionId: string): Promise<JevDecisionReceipt> {
  if (isElectron()) return invoke(IPC_CHANNELS.PERCEPTION_DECISION_RETRY, { decisionId });
  return request({ action: 'retry-decision', decisionId });
}

async function invoke<T>(channel: string, input?: unknown): Promise<T> {
  const response = await getIpcRenderer().invoke<IpcResponse<T>>(channel, ...(input === undefined ? [] : [input]));
  if (!response.success || !response.data) throw new Error(response.error?.code ?? 'DECISION_ACTION_FAILED');
  return response.data;
}

async function request(input: Record<string, string>): Promise<JevDecisionReceipt> {
  const response = await fetch('/api/perception/management', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json() as IpcResponse<JevDecisionReceipt>;
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.code ?? 'DECISION_ACTION_FAILED');
  return payload.data;
}
