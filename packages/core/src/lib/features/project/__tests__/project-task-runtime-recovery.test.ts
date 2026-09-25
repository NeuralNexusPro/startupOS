import { describe, expect, it, vi } from 'vitest';

import type { AgentSession } from '../../../../types/agent';
import { AgentManager } from '../../../integrations/pi-agent/agent-manager';
import type { OriginOSAgent } from '../../../integrations/pi-agent/core/agent';
import type {
  AgentTaskExecutionStatus,
  AgentTaskProjectionV1,
  AgentTaskRuntimePersistenceV1,
} from '../../../integrations/pi-agent/task-runtime';
import {
  ProjectContractTaskRuntimeRecovery,
  type ProjectContractRuntimeHostCapabilities,
} from '../contract-bound-runtime-composition';

function projection(
  taskId: string,
  status: AgentTaskProjectionV1['status'],
): AgentTaskProjectionV1 {
  return {
    version: 1,
    taskId,
    title: 'Recovered task',
    objective: 'Recover exact task',
    status,
    progress: 50,
    steps: [],
    criteria: [],
    blockers: status === 'blocked' ? [{
      id: 'blocker-1',
      reason: 'Waiting for user',
      blockedBy: 'user',
      neededToUnblock: 'Reply',
      resolved: false,
    }] : [],
    warnings: [],
    evidenceCount: 1,
    actions: status === 'cancelled' ? [] : ['stop', 'cancel'],
    revision: 4,
    cursor: 'cursor-4',
    stateHash: 'hash-4',
    truncated: false,
  };
}

function persistence(
  status: Extract<AgentTaskExecutionStatus, 'paused' | 'waiting_user' | 'cancelled'>,
): AgentTaskRuntimePersistenceV1 {
  const taskStatus = status === 'waiting_user'
    ? 'blocked'
    : status === 'cancelled'
      ? 'cancelled'
      : 'active';
  const task = projection('task-1', taskStatus);
  return {
    schemaVersion: 1,
    branchEntries: [],
    execution: {
      schemaVersion: 1,
      mode: status === 'cancelled' ? 'chat' : 'task_running',
      status,
      taskId: task.taskId,
      bridgeEpoch: 7,
      expectedRevision: task.revision,
      expectedCursor: task.cursor,
      continuationCount: 1,
      noProgressCount: 0,
      projection: task,
      updatedAt: '2026-09-25T08:00:00.000Z',
    },
  };
}

function session(state: AgentTaskRuntimePersistenceV1): AgentSession {
  return {
    sessionId: 'session-1',
    createdAt: 1,
    updatedAt: 2,
    status: 'active',
    messages: [],
    projectContext: {
      projectId: 'project-1',
      projectName: 'Project 1',
      currentPath: '/tmp/project-1',
    },
    systemPrompt: '',
    agentType: 'project',
    config: { sessionId: 'session-1' },
    taskRuntime: structuredClone(state),
  };
}

function fakeAgent(): OriginOSAgent {
  return {
    subscribe: vi.fn(() => () => undefined),
    getTools: vi.fn(() => []),
    setTools: vi.fn(),
    abort: vi.fn(),
    waitForIdle: vi.fn(async () => undefined),
    prompt: vi.fn(async () => undefined),
  } as unknown as OriginOSAgent;
}

function host(
  manager: AgentManager,
  stored: { value: AgentSession },
  agent = fakeAgent(),
): ProjectContractRuntimeHostCapabilities {
  vi.spyOn(manager, 'getOrRestoreAgentRuntime').mockResolvedValue(agent);
  return {
    sessions: {
      listTaskRuntimeSessions: async () => [],
      getSession: async (sessionId, projectId) =>
        sessionId === stored.value.sessionId
          && projectId === stored.value.projectContext.projectId
          ? structuredClone(stored.value)
          : null,
      updateSession: async (sessionId, updates, projectId) => {
        if (
          sessionId !== stored.value.sessionId
          || projectId !== stored.value.projectContext.projectId
        ) return null;
        stored.value = { ...stored.value, ...structuredClone(updates), updatedAt: 3 };
        return structuredClone(stored.value);
      },
      addMessage: async () => null,
    },
    agents: manager,
  };
}

describe('ProjectContractTaskRuntimeRecovery', () => {
  it.each(['paused', 'waiting_user', 'cancelled'] as const)(
    'restores the same %s Task through two fresh AgentManager instances without auto-starting',
    async (status) => {
      const stored = { value: session(persistence(status)) };
      const firstManager = new AgentManager();
      const firstAgent = fakeAgent();
      const first = new ProjectContractTaskRuntimeRecovery(
        host(firstManager, stored, firstAgent),
      );
      const firstResult = await first.recover({
        sessionId: 'session-1',
        projectId: 'project-1',
        taskId: 'task-1',
      });
      expect(firstResult).toMatchObject({
        status: 'recovered',
        snapshot: {
          sessionId: 'session-1',
          execution: { status },
          projection: { taskId: 'task-1', revision: 4, cursor: 'cursor-4' },
        },
      });
      if (firstResult.status !== 'recovered') throw new Error('recovery failed');
      expect(firstResult.snapshot.execution.bridgeEpoch).toBeGreaterThan(7);
      expect(firstAgent.prompt).not.toHaveBeenCalled();

      const secondManager = new AgentManager();
      const secondAgent = fakeAgent();
      const secondHost = host(secondManager, stored, secondAgent);
      const second = new ProjectContractTaskRuntimeRecovery(secondHost);
      const secondResult = await second.recover({
        sessionId: 'session-1',
        projectId: 'project-1',
        taskId: 'task-1',
      });
      expect(secondResult).toMatchObject({
        status: 'recovered',
        snapshot: {
          sessionId: 'session-1',
          execution: { status },
          projection: { taskId: 'task-1', revision: 4, cursor: 'cursor-4' },
        },
      });
      if (secondResult.status !== 'recovered') throw new Error('recovery failed');
      expect(secondResult.snapshot.execution.bridgeEpoch)
        .toBeGreaterThan(firstResult.snapshot.execution.bridgeEpoch);
      expect(secondAgent.prompt).not.toHaveBeenCalled();
      expect(secondManager.getTaskRuntimeSnapshot('session-1')?.execution.status).toBe(status);
      if (status === 'cancelled') {
        const cancelled = secondManager.getTaskRuntimeSnapshot('session-1');
        if (!cancelled) throw new Error('missing cancelled runtime');
        await expect(secondManager.controlTaskRuntime('session-1', {
          version: 1,
          requestId: 'resume-cancelled',
          sessionId: 'session-1',
          action: 'resume',
          expectedRevision: cancelled.execution.expectedRevision,
          expectedCursor: cancelled.execution.expectedCursor,
          bridgeEpoch: cancelled.execution.bridgeEpoch,
        })).rejects.toThrow('只有暂停或等待用户的任务可以恢复');
        expect(secondManager.getTaskRuntimeSnapshot('session-1')?.execution.status)
          .toBe('cancelled');
      }
    },
  );

  it('returns a structured unavailable result instead of crossing project or Task scope', async () => {
    const stored = { value: session(persistence('paused')) };
    const recovery = new ProjectContractTaskRuntimeRecovery(host(new AgentManager(), stored));

    await expect(recovery.recover({
      sessionId: 'session-1',
      projectId: 'project-other',
      taskId: 'task-1',
    })).resolves.toEqual({ status: 'unavailable', code: 'SESSION_NOT_FOUND' });
    await expect(recovery.recover({
      sessionId: 'session-1',
      projectId: 'project-1',
      taskId: 'task-other',
    })).resolves.toEqual({ status: 'unavailable', code: 'TASK_BINDING_MISMATCH' });
  });
});
