import { describe, expect, it } from 'vitest';

import type {
  AgentTaskProjectMetadataV1,
  AgentTaskProjectionV1,
  AgentTaskRuntimePersistenceV1,
  AgentTaskRuntimeSnapshotV1,
  ControlAgentTaskRequestV1,
} from '../../../integrations/pi-agent/task-runtime';
import type { CollaborationRunSnapshot } from '../../../../modules/collaboration-runtime/facade';
import {
  ProjectTaskSourceUnavailableError,
  ProjectTaskRuntimeRecoveryConflictError,
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

function persisted(
  task: AgentTaskProjectionV1,
  projectMetadata?: AgentTaskProjectMetadataV1,
): AgentTaskRuntimePersistenceV1 {
  return {
    schemaVersion: 1,
    branchEntries: [],
    execution: {
      schemaVersion: 1,
      mode: 'task_running',
      status: 'running',
      ...(projectMetadata ? { projectMetadata } : {}),
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
  projectMetadata?: AgentTaskProjectMetadataV1,
): ProjectTaskRuntimeSessionRecord {
  return {
    projectId,
    sessionId: `session-${taskId}`,
    updatedAt,
    taskRuntime: persisted(projection(taskId), projectMetadata),
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
    if (current.projection.revision !== request.expectedRevision) {
      throw new Error('REVISION_CONFLICT');
    }
    const updated = projection(current.projection.taskId, current.projection.revision + 1);
    const result = snapshot(sessionId, updated);
    this.snapshots.set(sessionId, result);
    return result;
  }
}

function run(projectId: string, taskId: string, revision = 1): CollaborationRunSnapshot {
  const binding = {
    parentTaskId: taskId,
    parentStepId: 'step-1',
    runId: `run-${taskId}`,
    solutionId: 'solution-1',
    solutionVersion: '1',
    executionContractId: 'contract-1',
    contractHash: 'hash-1',
    taskRevision: revision,
  };
  return {
    runId: binding.runId,
    projectId,
    binding,
    contract: {},
    workItems: [{
      id: `${binding.runId}:node-1`,
      binding,
      designNodeId: 'node-1',
      assignedAgentId: 'agent-a',
      skillRefs: [],
      dependsOn: [],
      inputRefs: [],
      outputRefs: ['artifact-output'],
      status: 'completed',
      revision: 2,
      leaseEpoch: 1,
      attempts: [{
        attemptId: 'attempt-1',
        leaseEpoch: 1,
        requestId: 'request-1',
        payloadHash: 'payload-1',
        status: 'completed',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:01:00.000Z',
        workerReceipt: {
          receiptId: 'worker-1',
          outputRefs: ['artifact-output', 'artifact-worker'],
          outputHash: 'output-1',
        },
        verifierResult: {
          status: 'passed',
          artifactRefs: ['artifact-verifier'],
        },
      }],
    }],
    status: 'running',
    revision: 2,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:01:00.000Z',
  } as CollaborationRunSnapshot;
}

describe('RuntimeProjectTaskSource', () => {
  it('keeps project isolation, caps 1000 persisted Tasks at 50 per page, and rebuilds the index under 500ms', async () => {
    const records = Array.from({ length: 1000 }, (_, index) =>
      session('project-a', `task-${index + 1}`, 1000 - index),
    );
    records.push(session('project-b', 'other-task'));
    const sessions = new Sessions(records);
    const source = new RuntimeProjectTaskSource(
      sessions,
      new Runtimes(),
      { findByTask: async () => null },
    );

    const startedAt = performance.now();
    const first = await source.list({ projectId: 'project-a', limit: 100 });
    const second = await source.list({ projectId: 'project-a', cursor: first.cursor });
    const elapsedMs = performance.now() - startedAt;

    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(50);
    expect(first.items.every((item) => item.projectId === 'project-a')).toBe(true);
    expect(elapsedMs).toBeLessThan(500);
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
      runStatus: 'running',
      assignedAgentIds: ['agent-a'],
      workItemCount: 1,
      artifactRefs: ['artifact-output', 'artifact-worker', 'artifact-verifier'],
      runtimeStatus: 'running',
      runtimeAvailability: 'recovery_required',
      task: { status: 'active' },
    });
  });

  it('keeps missing metadata unset without rewriting legacy persistence', async () => {
    const legacy = session('project-a', 'legacy-task');
    const metadata: AgentTaskProjectMetadataV1 = {
      version: 1,
      priority: 'urgent',
      semanticRefs: ['ontology:order'],
      inputVersions: [{ inputRef: 'orders', version: 'v3' }],
    };
    const current = session('project-a', 'current-task', 2, metadata);
    const legacyBytes = JSON.stringify(legacy.taskRuntime);
    const source = new RuntimeProjectTaskSource(
      new Sessions([legacy, current]),
      new Runtimes(),
      { findByTask: async () => null },
    );

    const page = await source.list({ projectId: 'project-a' });
    expect(page.items.find(({ taskId }) => taskId === 'legacy-task')?.projectMetadata)
      .toBeUndefined();
    expect(page.items.find(({ taskId }) => taskId === 'current-task')?.projectMetadata)
      .toEqual(metadata);
    expect(JSON.stringify(legacy.taskRuntime)).toBe(legacyBytes);
  });

  it('rejects a Run returned from another project', async () => {
    const source = new RuntimeProjectTaskSource(
      new Sessions([session('project-a', 'task-1')]),
      new Runtimes(),
      { findByTask: async () => run('project-b', 'task-1') },
    );

    await expect(source.get('project-a', 'task-1')).rejects.toBeInstanceOf(
      ProjectTaskSourceUnavailableError,
    );
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
    expect(updated.runtimeAvailability).toBe('controllable');
  });

  it('recovers the exact persisted Session and Run before an explicit resume', async () => {
    const item = session('project-a', 'task-1');
    const runtimes = new Runtimes();
    const recovered = snapshot(item.sessionId, projection('task-1'));
    recovered.execution.status = 'paused';
    recovered.execution.bridgeEpoch = 4;
    let recoveryCalls = 0;
    let runRecoveryCalls = 0;
    const taskRun = run('project-a', 'task-1');
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      runtimes,
      {
        findByTask: async () => taskRun,
        inspect: async () => taskRun,
        recover: async () => {
          runRecoveryCalls += 1;
          return taskRun;
        },
      },
      undefined,
      {
        recover: async (input) => {
          recoveryCalls += 1;
          expect(input).toEqual({
            sessionId: item.sessionId,
            projectId: 'project-a',
            taskId: 'task-1',
          });
          runtimes.set(item.sessionId, recovered);
          return { status: 'recovered', snapshot: recovered };
        },
      },
    );

    const updated = await source.control({
      projectId: 'project-a',
      taskId: 'task-1',
      action: 'resume',
      requestId: 'resume-1',
      expectedRevision: 1,
    });

    expect(recoveryCalls).toBe(1);
    expect(runRecoveryCalls).toBe(1);
    expect(runtimes.controls[0]).toMatchObject({
      requestId: 'resume-1',
      bridgeEpoch: 4,
      expectedRevision: 1,
      expectedCursor: 'cursor-1',
    });
    expect(updated.taskId).toBe('task-1');
  });

  it('rejects a recovered revision, cursor, or epoch conflict before any mutation', async () => {
    const item = session('project-a', 'task-1');
    const runtimes = new Runtimes();
    const stale = snapshot(item.sessionId, projection('task-1'));
    stale.execution.expectedCursor = 'stale-cursor';
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      runtimes,
      { findByTask: async () => null },
      undefined,
      {
        recover: async () => {
          runtimes.set(item.sessionId, stale);
          return { status: 'recovered', snapshot: stale };
        },
      },
    );

    await expect(source.control({
      projectId: 'project-a',
      taskId: 'task-1',
      action: 'pause',
      requestId: 'stale-1',
      expectedRevision: 1,
    })).rejects.toBeInstanceOf(ProjectTaskRuntimeRecoveryConflictError);
    expect(runtimes.controls).toHaveLength(0);
  });

  it('rejects an old window lease epoch after recovery rotates the Runtime epoch', async () => {
    const item = session('project-a', 'task-1');
    item.taskRuntime.execution.status = 'paused';
    const runtimes = new Runtimes();
    const recovered = snapshot(item.sessionId, projection('task-1'));
    recovered.execution.status = 'paused';
    recovered.execution.bridgeEpoch = 4;
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      runtimes,
      { findByTask: async () => null },
      undefined,
      {
        recover: async () => {
          runtimes.set(item.sessionId, recovered);
          return { status: 'recovered', snapshot: recovered };
        },
      },
    );

    await expect(source.transition({
      projectId: 'project-a',
      taskId: 'task-1',
      targetStatus: 'active',
      capability: 'resume',
      requestId: 'old-window-1',
      expectedRevision: 1,
      expectedLeaseEpoch: 3,
    })).rejects.toMatchObject({ code: 'LEASE_CONFLICT' });
    expect(runtimes.controls).toHaveLength(0);
  });

  it('rejects a Run binding changed during recovery before control or Run replay', async () => {
    const item = session('project-a', 'task-1');
    const runtimes = new Runtimes();
    const recovered = snapshot(item.sessionId, projection('task-1'));
    const original = run('project-a', 'task-1');
    const changed = {
      ...original,
      binding: { ...original.binding, solutionVersion: '2' },
    };
    let inspectCalls = 0;
    let runRecoveryCalls = 0;
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      runtimes,
      {
        findByTask: async () => original,
        inspect: async () => (++inspectCalls === 1 ? original : changed),
        recover: async () => {
          runRecoveryCalls += 1;
          return changed;
        },
      },
      undefined,
      {
        recover: async () => {
          runtimes.set(item.sessionId, recovered);
          return { status: 'recovered', snapshot: recovered };
        },
      },
    );

    await expect(source.control({
      projectId: 'project-a',
      taskId: 'task-1',
      action: 'resume',
      requestId: 'binding-stale-1',
      expectedRevision: 1,
    })).rejects.toBeInstanceOf(ProjectTaskRuntimeRecoveryConflictError);
    expect(runtimes.controls).toHaveLength(0);
    expect(runRecoveryCalls).toBe(0);
  });

  it('fences concurrent transitions to different targets at the authoritative Task revision', async () => {
    const item = session('project-a', 'task-1');
    const runtimes = new Runtimes();
    runtimes.set(item.sessionId, snapshot(item.sessionId, projection('task-1')));
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      runtimes,
      { findByTask: async () => null },
    );
    const command = {
      projectId: 'project-a',
      taskId: 'task-1',
      expectedRevision: 1,
      expectedLeaseEpoch: 3,
    };
    const results = await Promise.allSettled([
      source.transition({
        ...command,
        requestId: 'transition-blocked',
        targetStatus: 'blocked',
        capability: 'pause',
      }),
      source.transition({
        ...command,
        requestId: 'transition-cancelled',
        targetStatus: 'cancelled',
        capability: 'cancel',
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(runtimes.getTaskRuntimeSnapshot(item.sessionId)?.projection?.revision).toBe(2);
  });

  it('routes review capabilities through the public Task Runtime review port with lease CAS', async () => {
    const item = session('project-a', 'task-1');
    const runtimes = new Runtimes();
    runtimes.set(item.sessionId, snapshot(item.sessionId, projection('task-1')));
    const reviewCalls: Array<{ method: string; input: unknown }> = [];
    const reviewedProjection = { ...projection('task-1', 2), status: 'review' as const };
    const reviewedSnapshot = snapshot(item.sessionId, reviewedProjection);
    const reviews = {
      async requestReview(input: unknown) { reviewCalls.push({ method: 'requestReview', input }); return reviewedSnapshot; },
      async approveCompletion(input: unknown) { reviewCalls.push({ method: 'approveCompletion', input }); return reviewedSnapshot; },
      async rejectReview(input: unknown) { reviewCalls.push({ method: 'rejectReview', input }); return reviewedSnapshot; },
    };
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      runtimes,
      { findByTask: async () => null },
      reviews,
    );

    const updated = await source.transition({
      projectId: 'project-a',
      taskId: 'task-1',
      targetStatus: 'review',
      capability: 'request_review',
      requestId: 'review-1',
      expectedRevision: 1,
      expectedLeaseEpoch: 3,
    });

    expect(reviewCalls).toEqual([{
      method: 'requestReview',
      input: expect.objectContaining({
        sessionId: item.sessionId,
        taskId: 'task-1',
        expectedRevision: 1,
        expectedCursor: 'cursor-1',
        leaseEpoch: 3,
      }),
    }]);
    expect(updated).toMatchObject({
      reviewCapabilitiesAvailable: true,
      leaseEpoch: 3,
      task: { status: 'review', revision: 2 },
    });
  });

  it('rejects stale transition lease before calling any mutation port', async () => {
    const item = session('project-a', 'task-1');
    const runtimes = new Runtimes();
    runtimes.set(item.sessionId, snapshot(item.sessionId, projection('task-1')));
    let calls = 0;
    const reviews = {
      async requestReview() { calls += 1; throw new Error('must not run'); },
      async approveCompletion() { calls += 1; throw new Error('must not run'); },
      async rejectReview() { calls += 1; throw new Error('must not run'); },
    };
    const source = new RuntimeProjectTaskSource(
      new Sessions([item]),
      runtimes,
      { findByTask: async () => null },
      reviews,
    );
    await expect(source.transition({
      projectId: 'project-a',
      taskId: 'task-1',
      targetStatus: 'review',
      capability: 'request_review',
      requestId: 'review-stale-1',
      expectedRevision: 1,
      expectedLeaseEpoch: 2,
    })).rejects.toMatchObject({ code: 'LEASE_CONFLICT' });
    expect(calls).toBe(0);
    expect(runtimes.controls).toHaveLength(0);
  });
});
