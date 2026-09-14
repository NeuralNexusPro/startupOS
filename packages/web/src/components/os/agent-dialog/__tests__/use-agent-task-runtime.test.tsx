import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  observeAgentTaskRuntime,
  restoreAgentTaskRuntime,
  runAgentTaskControl,
  submitAgentTaskDraft,
} from '@/services/agent-task-runtime';

import { useAgentTaskRuntime } from '../use-agent-task-runtime';

import type { AgentTaskRuntimeSnapshotV1 } from '@originos/core/lib/integrations/pi-agent/task-runtime';

vi.mock('@/services/agent-task-runtime', async () => {
  const actual = await vi.importActual<typeof import('@/services/agent-task-runtime')>(
    '@/services/agent-task-runtime',
  );
  return {
    ...actual,
    observeAgentTaskRuntime: vi.fn(),
    restoreAgentTaskRuntime: vi.fn(),
    runAgentTaskControl: vi.fn(),
    submitAgentTaskDraft: vi.fn(),
  };
});

function snapshot(
  sessionId: string,
  status: AgentTaskRuntimeSnapshotV1['execution']['status'] = 'idle',
): AgentTaskRuntimeSnapshotV1 {
  return {
    version: 1,
    sessionId,
    execution: {
      schemaVersion: 1,
      mode: status === 'running' ? 'task_running' : 'chat',
      status,
      bridgeEpoch: 2,
      expectedRevision: 3,
      expectedCursor: 'cursor-3',
      continuationCount: 0,
      noProgressCount: 0,
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
  };
}

describe('useAgentTaskRuntime', () => {
  const unsubscribe = vi.fn();
  let observer: ((next: AgentTaskRuntimeSnapshotV1) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    observer = undefined;
    vi.mocked(observeAgentTaskRuntime).mockImplementation((_sessionId, listener) => {
      observer = listener;
      return unsubscribe;
    });
    vi.mocked(restoreAgentTaskRuntime).mockImplementation(async (sessionId) => snapshot(sessionId));
  });

  it('restores, subscribes and switches runtime state with the active session', async () => {
    const { result, rerender } = renderHook(
      ({ sessionId }) => useAgentTaskRuntime({ sessionId, enabled: true }),
      { initialProps: { sessionId: 'session-1' } },
    );

    await waitFor(() => expect(result.current.snapshot?.sessionId).toBe('session-1'));
    expect(restoreAgentTaskRuntime).toHaveBeenCalledWith('session-1');
    expect(observeAgentTaskRuntime).toHaveBeenCalledWith('session-1', expect.any(Function));

    act(() => observer?.(snapshot('session-1', 'running')));
    expect(result.current.blocksChat).toBe(true);

    rerender({ sessionId: 'session-2' });
    await waitFor(() => expect(result.current.snapshot?.sessionId).toBe('session-2'));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(restoreAgentTaskRuntime).toHaveBeenCalledWith('session-2');
  });

  it('submits drafts and controls the latest snapshot', async () => {
    const created = snapshot('session-1', 'running');
    vi.mocked(submitAgentTaskDraft).mockResolvedValue(created);
    vi.mocked(runAgentTaskControl).mockResolvedValue(snapshot('session-1', 'cancelled'));
    const { result } = renderHook(() => useAgentTaskRuntime({
      sessionId: 'session-1',
      enabled: true,
    }));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    await act(async () => {
      expect(await result.current.create({
        requestId: 'request-1',
        title: '生成报告',
        objective: '生成报告',
        acceptanceCriteria: ['报告可读取'],
      })).toBe(true);
    });
    expect(submitAgentTaskDraft).toHaveBeenCalledWith('session-1', expect.objectContaining({
      requestId: 'request-1',
    }));

    await act(async () => {
      expect(await result.current.control('stop')).toBe(true);
    });
    expect(runAgentTaskControl).toHaveBeenCalledWith(created, 'stop');
    expect(result.current.snapshot?.execution.status).toBe('cancelled');
  });

  it('allows the existing message input for waiting_user replies', async () => {
    vi.mocked(restoreAgentTaskRuntime).mockResolvedValue(snapshot('session-1', 'waiting_user'));
    const { result } = renderHook(() => useAgentTaskRuntime({
      sessionId: 'session-1',
      enabled: true,
    }));

    await waitFor(() => expect(result.current.snapshot?.execution.status).toBe('waiting_user'));
    expect(result.current.blocksChat).toBe(false);
    expect(result.current.hasActiveTask).toBe(true);

    act(() => observer?.(snapshot('session-1', 'running')));
    expect(result.current.blocksChat).toBe(true);
  });

  it('keeps failed and paused leases active while allowing only waiting_user replies', async () => {
    vi.mocked(restoreAgentTaskRuntime).mockResolvedValue(snapshot('session-1', 'failed'));
    const { result } = renderHook(() => useAgentTaskRuntime({
      sessionId: 'session-1',
      enabled: true,
    }));

    await waitFor(() => expect(result.current.snapshot?.execution.status).toBe('failed'));
    expect(result.current.hasActiveTask).toBe(true);
    expect(result.current.blocksChat).toBe(true);

    act(() => observer?.(snapshot('session-1', 'paused')));
    expect(result.current.blocksChat).toBe(true);

    act(() => observer?.(snapshot('session-1', 'waiting_user')));
    expect(result.current.blocksChat).toBe(false);
  });

  it('treats completed and cancelled tasks as inactive so the task card can close', async () => {
    vi.mocked(restoreAgentTaskRuntime).mockResolvedValue(snapshot('session-1', 'completed'));
    const { result } = renderHook(() => useAgentTaskRuntime({
      sessionId: 'session-1',
      enabled: true,
    }));

    await waitFor(() => expect(result.current.snapshot?.execution.status).toBe('completed'));
    expect(result.current.hasActiveTask).toBe(false);
    expect(result.current.blocksChat).toBe(false);

    act(() => observer?.(snapshot('session-1', 'cancelled')));
    expect(result.current.hasActiveTask).toBe(false);
    expect(result.current.blocksChat).toBe(false);
  });

  it('preserves an editable local draft signal when planning fails', async () => {
    const failed = snapshot('session-1', 'failed');
    failed.execution.lastError = {
      code: 'TASK_PLAN_FAILED',
      message: '规划没有创建正式任务',
      retryable: true,
    };
    vi.mocked(submitAgentTaskDraft).mockResolvedValue(failed);
    const { result } = renderHook(() => useAgentTaskRuntime({
      sessionId: 'session-1',
      enabled: true,
    }));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    let created = true;
    await act(async () => {
      created = await result.current.create({
        requestId: 'request-failed',
        title: '调研报告',
        objective: '完成行业调研',
        acceptanceCriteria: [],
      });
    });

    expect(created).toBe(false);
    expect(result.current.snapshot?.execution.status).toBe('failed');
    expect(result.current.error).toContain('规划没有创建正式任务');
  });
});
