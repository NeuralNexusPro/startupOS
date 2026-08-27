'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  observeAgentTaskRuntime,
  restoreAgentTaskRuntime,
  runAgentTaskControl,
  submitAgentTaskDraft,
  type AgentTaskDraftInput,
} from '@/services/agent-task-runtime';

import type {
  AgentTaskRuntimeSnapshotV1,
  ControlAgentTaskRequestV1,
} from '@originos/core/lib/integrations/pi-agent/task-runtime';

interface UseAgentTaskRuntimeOptions {
  sessionId: string;
  enabled: boolean;
}

export interface AgentTaskRuntimeViewState {
  snapshot: AgentTaskRuntimeSnapshotV1 | null;
  error: string | null;
  loading: boolean;
  pendingAction: 'create' | ControlAgentTaskRequestV1['action'] | null;
  blocksChat: boolean;
  hasActiveTask: boolean;
  create(draft: AgentTaskDraftInput): Promise<boolean>;
  control(action: ControlAgentTaskRequestV1['action']): Promise<boolean>;
  clearError(): void;
}

const TERMINAL_STATUSES = new Set(['idle', 'completed', 'cancelled']);

function runtimeError(snapshot: AgentTaskRuntimeSnapshotV1): string | null {
  return snapshot.execution.lastError?.message || null;
}

export function supportsAgentTaskRuntime(agentType: string): boolean {
  // Skills are first-class product entries too. They use the same session-host
  // and persistence boundary as role agents, so a skill can opt into a
  // long-running task from its dialog instead of falling back to chat-only
  // CompletionGuard recovery.
  return agentType === 'assistant'
    || agentType === 'agent'
    || agentType === 'role-agent'
    || agentType === 'skill';
}

export function useAgentTaskRuntime({
  sessionId,
  enabled,
}: UseAgentTaskRuntimeOptions): AgentTaskRuntimeViewState {
  const [snapshot, setSnapshot] = useState<AgentTaskRuntimeSnapshotV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<AgentTaskRuntimeViewState['pendingAction']>(null);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    setPendingAction(null);
    if (!enabled || !sessionId) {return;}

    let active = true;
    setLoading(true);
    const unsubscribe = observeAgentTaskRuntime(sessionId, (nextSnapshot) => {
      if (!active || nextSnapshot.sessionId !== sessionId) {return;}
      setSnapshot(nextSnapshot);
      setError(runtimeError(nextSnapshot));
      setLoading(false);
    });

    void restoreAgentTaskRuntime(sessionId)
      .then((restored) => {
        if (!active || restored.sessionId !== sessionId) {return;}
        setSnapshot(restored);
        setError(runtimeError(restored));
      })
      .catch((restoreError: unknown) => {
        if (!active) {return;}
        setError(restoreError instanceof Error ? restoreError.message : '无法恢复任务状态');
      })
      .finally(() => {
        if (active) {setLoading(false);}
      });

    return (): void => {
      active = false;
      unsubscribe();
    };
  }, [enabled, sessionId]);

  const create = useCallback(async (draft: AgentTaskDraftInput): Promise<boolean> => {
    if (!enabled || !sessionId || pendingAction) {return false;}
    setPendingAction('create');
    setError(null);
    try {
      const created = await submitAgentTaskDraft(sessionId, draft);
      setSnapshot(created);
      if (created.execution.status === 'failed') {
        setError(created.execution.lastError?.message || '任务规划失败，可修改草稿后重试');
        return false;
      }
      setError(runtimeError(created));
      return true;
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '任务创建失败');
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [enabled, pendingAction, sessionId]);

  const control = useCallback(async (
    action: ControlAgentTaskRequestV1['action'],
  ): Promise<boolean> => {
    if (!snapshot || pendingAction) {return false;}
    setPendingAction(action);
    setError(null);
    try {
      const controlled = await runAgentTaskControl(snapshot, action);
      setSnapshot(controlled);
      setError(runtimeError(controlled));
      return true;
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : '任务控制失败');
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, snapshot]);

  return useMemo(() => {
    const status = snapshot?.execution.status;
    return {
      snapshot,
      error,
      loading,
      pendingAction,
      blocksChat: Boolean(status && !TERMINAL_STATUSES.has(status) && status !== 'waiting_user'),
      hasActiveTask: Boolean(status && !TERMINAL_STATUSES.has(status)),
      create,
      control,
      clearError: () => setError(null),
    };
  }, [control, create, error, loading, pendingAction, snapshot]);
}
