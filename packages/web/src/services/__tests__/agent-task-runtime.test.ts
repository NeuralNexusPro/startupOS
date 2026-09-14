import {
  controlAgentTask,
  createAgentTask,
} from '@originos/core/lib/integrations/electron/services/agent-session';
import { describe, expect, it, vi } from 'vitest';

import {
  runAgentTaskControl,
  submitAgentTaskDraft,
} from '../agent-task-runtime';

import type { AgentTaskRuntimeSnapshotV1 } from '@originos/core/lib/integrations/pi-agent/task-runtime';

vi.mock('@originos/core/lib/integrations/electron/services/agent-session', () => ({
  controlAgentTask: vi.fn(),
  createAgentTask: vi.fn(),
  getAgentTask: vi.fn(),
  subscribeAgentTaskRuntime: vi.fn(),
}));

function taskSnapshot(): AgentTaskRuntimeSnapshotV1 {
  return {
    version: 1,
    sessionId: 'session-1',
    execution: {
      schemaVersion: 1,
      mode: 'task_running',
      status: 'running',
      bridgeEpoch: 5,
      expectedRevision: 6,
      expectedCursor: 'execution-cursor',
      continuationCount: 0,
      noProgressCount: 0,
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
    projection: {
      version: 1,
      taskId: 'task-1',
      title: '调研报告',
      objective: '完成行业调研',
      status: 'active',
      progress: 20,
      steps: [],
      criteria: [],
      blockers: [],
      warnings: [],
      evidenceCount: 0,
      actions: ['stop', 'cancel'],
      revision: 7,
      cursor: 'projection-cursor',
      stateHash: 'hash',
      truncated: false,
    },
  };
}

describe('agent task runtime service', () => {
  it('submits title/objective/context with optional empty criteria', async () => {
    const snapshot = taskSnapshot();
    vi.mocked(createAgentTask).mockResolvedValue({
      success: true,
      data: snapshot,
      timestamp: '2026-08-02T00:00:00.000Z',
    });

    await submitAgentTaskDraft('session-1', {
      requestId: 'request-1',
      title: ' 调研报告 ',
      objective: ' 完成行业调研 ',
      context: ' 只使用公开资料 ',
      acceptanceCriteria: [' ', '给出来源'],
    });

    expect(createAgentTask).toHaveBeenCalledWith({
      version: 1,
      requestId: 'request-1',
      sessionId: 'session-1',
      title: '调研报告',
      objective: '完成行业调研',
      context: '只使用公开资料',
      acceptanceCriteria: ['给出来源'],
    });
  });

  it('sends distinct cancel action with canonical CAS scope', async () => {
    const snapshot = taskSnapshot();
    vi.mocked(controlAgentTask).mockResolvedValue({
      success: true,
      data: snapshot,
      timestamp: '2026-08-02T00:00:00.000Z',
    });

    await runAgentTaskControl(snapshot, 'cancel');

    expect(controlAgentTask).toHaveBeenCalledWith(expect.objectContaining({
      version: 1,
      sessionId: 'session-1',
      action: 'cancel',
      expectedRevision: 7,
      expectedCursor: 'projection-cursor',
      bridgeEpoch: 5,
    }));
  });
});
