import {
  controlAgentTask,
  createAgentTask,
  getAgentTask,
  subscribeAgentTaskRuntime,
} from '@originos/core/lib/integrations/electron/services/agent-session';

import type {
  AgentTaskRuntimeEventV1,
  AgentTaskRuntimeSnapshotV1,
  ControlAgentTaskRequestV1,
  CreateAgentTaskRequestV1,
} from '@originos/core/lib/integrations/pi-agent/task-runtime';

export interface AgentTaskDraftInput {
  requestId: string;
  title: string;
  objective: string;
  context?: string;
  acceptanceCriteria: string[];
}

function responseError(response: {
  error?: { message?: string };
}, fallback: string): Error {
  return new Error(response.error?.message?.trim() || fallback);
}

export function createAgentTaskRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function restoreAgentTaskRuntime(
  sessionId: string,
): Promise<AgentTaskRuntimeSnapshotV1> {
  const response = await getAgentTask({ version: 1, sessionId });
  if (!response.success || !response.data) {
    throw responseError(response, '无法恢复当前会话的任务状态');
  }
  return response.data;
}

export async function submitAgentTaskDraft(
  sessionId: string,
  draft: AgentTaskDraftInput,
): Promise<AgentTaskRuntimeSnapshotV1> {
  const request: CreateAgentTaskRequestV1 = {
    version: 1,
    requestId: draft.requestId,
    sessionId,
    objective: draft.objective.trim(),
    title: draft.title.trim(),
    ...(draft.context?.trim() ? { context: draft.context.trim() } : {}),
    acceptanceCriteria: draft.acceptanceCriteria
      .map((criterion) => criterion.trim())
      .filter(Boolean),
  };
  const response = await createAgentTask(request);
  if (!response.success || !response.data) {
    throw responseError(response, '任务创建失败');
  }
  return response.data;
}

export async function runAgentTaskControl(
  snapshot: AgentTaskRuntimeSnapshotV1,
  action: ControlAgentTaskRequestV1['action'],
): Promise<AgentTaskRuntimeSnapshotV1> {
  const projection = snapshot.projection;
  const response = await controlAgentTask({
    version: 1,
    requestId: createAgentTaskRequestId(),
    sessionId: snapshot.sessionId,
    action,
    expectedRevision: projection?.revision ?? snapshot.execution.expectedRevision,
    expectedCursor: projection?.cursor ?? snapshot.execution.expectedCursor,
    bridgeEpoch: snapshot.execution.bridgeEpoch,
  });
  if (!response.success || !response.data) {
    throw responseError(response, `任务${action}操作失败`);
  }
  return response.data;
}

export function observeAgentTaskRuntime(
  sessionId: string,
  listener: (snapshot: AgentTaskRuntimeSnapshotV1) => void,
): () => void {
  return subscribeAgentTaskRuntime(sessionId, (event: AgentTaskRuntimeEventV1) => {
    listener(event.snapshot);
  });
}
