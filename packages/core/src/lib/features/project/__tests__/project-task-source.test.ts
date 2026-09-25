import { describe, expect, it } from 'vitest';

import type {
  AgentTaskProjectionV1,
  AgentTaskRuntimePersistenceV1,
  AgentTaskRuntimeSnapshotV1,
  ControlAgentTaskRequestV1,
} from '../../../integrations/pi-agent/task-runtime';
import type { CollaborationRunSnapshot } from '../../../../modules/collaboration-runtime/facade';
import {
  ProjectTaskSourceUnavailableError,
  RuntimeProjectTaskSource,
  type ProjectTaskRuntimeControlPort,
  type ProjectTaskRuntimeSessionPort,
  type ProjectTaskRuntimeSessionRecord,
} from '../project-task-source';

function projection(taskId: string, revision = 1): AgentTaskProjectionV1 {
  return {
    version: 1,
    taskId,
    title: taskId,
    objective: taskId,
    status: 'active',
    progress: 25,
    steps: [],
    criteria: [],
    blockers: [],
    warnings: [],
    evidenceCount: 0,
    actions: ['stop', 'cancel'],
    revision,
    cursor: `cursor-${revision}`,
    stateHash: `hash-${revision}`,
    truncated: false,
  };
}

function persisted(task: AgentTaskProjectionV1): AgentTaskRuntimePersistenceV1 {
  return {
    schemaVersion: 1,
    branchEntries: [],
    execution: {
      schemaVersion: 1,
      mode: 'task_running',
      status: 'running',
      taskId: task.taskId,
      bridgeEpoch: 3,
      expectedRevision: task.revision,
      expectedCursor: task.cursor,
      continuationCount: 0,
      noProgressCount: 0,
      projection: task,
      updatedAt: '2026-09-24T00:00:00.000Z',
    },
  };
}

function session(
  projectId: string,
  taskId: string,
  updatedAt = 1,
): ProjectTaskRuntimeSessionRecord {
  return {
    projectId,
    sessionId: `session-${taskId}`,
    updatedAt,
    taskRuntime: persisted(projection(taskId)),
  };
}

function snapshot(
  sessionId: string,
  task: AgentTaskProjectionV1,
): AgentTaskRuntimeSnapshotV1 {
  return {
    version: 1,
    sessionId,
    execution: {
      ...persisted(task).execution,
      projection: task,
    },
    projection: task,
  };
}

class Sessions implements ProjectTaskRuntimeSessionPort {
  calls = 0;

  constructor(private readonly values: readonly ProjectTaskRuntimeSessionRecord[]) {}

  async listTaskRuntimeSessions(projectId: string) {
    this.calls += 1;
    return this.values.filter((value) => value.projectId === projectId);
  }
}

class Runtimes implements ProjectTaskRuntimeControlPort {
  readonly controls: ControlAgentTaskRequestV1[] = [];
  private readonly snapshots = new Map<string, AgentTaskRuntimeSnapshotV1>();

  set(sessionId: string, value: AgentTaskRuntimeSnapshotV1): void {
    this.snapshots.set(sessionId, value);
  }

  getTaskRuntimeSnapshot(sessionId: string): AgentTaskRuntimeSnapshotV1 | null {
    return this.snapshots.get(sessionId) ?? null;
  }

  async controlTaskRuntime(
    sessionId: string,
    request: ControlAgentTaskRequestV1,
  ): Promise<AgentTaskRuntimeSnapshotV1> {
    this.controls.push(request);
    const current = this.snapshots.get(sessionId);
    if (!current?.projection) throw new Error('AGENT_TASK_RUNTIME_UNAVAILABLE');
    const updated = projection(current.projection.taskId, current.projection.revision + 1);
    const result = snapshot(sessionId, updated);
    this.snapshots.set(sessionId, result);
    return result;
  }
}

function run(projectId: string, taskId: string, revision = 1): CollaborationRunSnapshot {
  return {
    runId: `run-${taskId}`,
    projectId,
    binding: {
      parentTaskId: taskId,
      parentStepId: 'step-1',
      runId: `run-${taskId}`,
      solutionId: 'solution-1',
      solutionVersion: '1',
      executionContractId: 'contract-1',
      contractHash: 'hash-1',
      taskRevision: revision,
    },
  } as CollaborationRunSnapshot;
}

describe('RuntimeProjectTaskSource', () => {
  it('keeps project isolation, caps pages at 50, and rebuilds from persistence', async () => {
    const records = Array.from({ length: 51 }, (_, index) =>
      session('project-a', `task-${index + 1}`, 100 - index),
    );
    records.push(session('project-b', 'other-task'));
    const sessions = new Sessions(records);
    const source = new RuntimeProjectTaskSource(
      sessions,
      new Runtimes(),
      { findByTask: async () => null },
    );

    const first = await source.list({ projectId: 'project-a', limit: 100 });
    const second = await source.list({ projectId: 'project-a', cursor: first.cursor });

    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(1);
    expect(first.items.every((item) => item.projectId === 'project-a')).toBe(true);
    expect(sessions.calls).toBe(2);
  });

  it('returns unavailable when persisted task authority cannot be read', async () => {
    const source = new RuntimeProjectTaskSource(
      { async listTaskRuntimeSessions() { throw new Error('disk unavailable'); } },
      new Runtimes(),
      { findByTask: async () => null },
    );

    await expect(source.list({ projectId: 'project-a' })).rejects.toBeInstanceOf(
      ProjectTaskSourceUnavailableError,
    );
  });

  it('associates only the matching project Task Run', async () => {
    const item = session('project-a', 'task-1');
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      new Runtimes(),
      { findByTask: async () => run('project-a', 'task-1') },
    );

    await expect(source.get('project-a', 'task-1')).resolves.toMatchObject({
      runId: 'run-task-1',
    });
  });

  it('uses the live public runtime control boundary', async () => {
    const item = session('project-a', 'task-1');
    const runtimes = new Runtimes();
    runtimes.set(item.sessionId, snapshot(item.sessionId, projection('task-1')));
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      runtimes,
      { findByTask: async () => null },
    );

    const updated = await source.control({
      projectId: 'project-a',
      taskId: 'task-1',
      action: 'pause',
      requestId: 'pause-1',
      expectedRevision: 1,
    });

    expect(runtimes.controls[0]).toMatchObject({
      action: 'stop',
      expectedRevision: 1,
      expectedCursor: 'cursor-1',
      bridgeEpoch: 3,
    });
    expect(updated.task.revision).toBe(2);
  });
});
