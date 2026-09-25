import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  ProjectTaskBoardService,
  ProjectTaskTransitionRejectedError,
  summarizeProjectTaskRun,
  type ProjectTaskRecord,
  type ProjectTaskSource,
} from '../task-board';
import { SolutionExecutionContractStore } from '../../solution';
import {
  body,
  ontology,
} from '../../solution/__tests__/execution-contract-fixtures';
import type { AgentTaskProjectionV1 } from '../../../integrations/pi-agent/task-runtime';
import { CollaborationExecutionStore } from '../../../../modules/collaboration-runtime/facade';

function taskProjection(revision = 1): AgentTaskProjectionV1 {
  return {
    version: 1,
    taskId: 'task-1',
    title: 'Prepare orders',
    objective: 'Prepare and publish the confirmed order flow',
    status: 'active',
    progress: 50,
    currentStep: 'step-1',
    steps: [],
    criteria: [],
    blockers: [],
    warnings: [],
    evidenceCount: 0,
    actions: ['stop', 'cancel'],
    revision,
    cursor: null,
    stateHash: 'task-state-1',
    truncated: false,
  };
}

class MemoryTaskSource implements ProjectTaskSource {
  private record: ProjectTaskRecord;
  readonly transitions: string[] = [];

  constructor(
    record: ProjectTaskRecord,
    private readonly ignoreProjectFilter = false
  ) {
    this.record = record;
  }

  async list(input: { projectId: string }) {
    if (!this.ignoreProjectFilter && this.record.projectId !== input.projectId) {
      return { items: [] };
    }
    return { items: [this.record] };
  }

  async get(projectId: string, taskId: string) {
    if (this.record.projectId !== projectId || this.record.taskId !== taskId) {
      return null;
    }
    return this.record;
  }

  async control(input: { action: string }) {
    this.record = {
      ...this.record,
      task: {
        ...this.record.task,
        status: input.action === 'pause' ? 'blocked' : 'active',
        revision: this.record.task.revision + 1,
      },
    };
    return this.record;
  }

  async transition(input: { capability: string }) {
    this.transitions.push(input.capability);
    const status = input.capability === 'request_review' ? 'review'
      : input.capability === 'approve_completion' ? 'done'
        : input.capability === 'cancel' ? 'cancelled'
          : input.capability === 'pause' ? 'blocked' : 'active';
    this.record = {
      ...this.record,
      runtimeStatus: status === 'done' ? 'completed' : 'running',
      task: { ...this.record.task, status, revision: this.record.task.revision + 1 },
    };
    return this.record;
  }
}

async function setup() {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'project-task-board-'));
  const contractStore = new SolutionExecutionContractStore(dataRoot);
  const publication = await contractStore.publishCompiled(
    ontology(),
    'confirmed',
    body()
  );
  expect(publication.ok).toBe(true);
  if (!publication.ok) throw new Error('Fixture contract must publish');
  const execution = new CollaborationExecutionStore(contractStore, dataRoot);
  const run = await execution.start({
    projectId: 'project-1',
    solutionId: publication.published.contract.solutionId,
    solutionVersion: publication.published.contract.solutionVersion,
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    taskRevision: 1,
    executionContractId: publication.published.contract.contractId,
    contractHash: publication.published.contract.contractHash,
    inputRefs: ['input-1'],
  });
  const record: ProjectTaskRecord = {
    projectId: 'project-1',
    taskId: 'task-1',
    updatedAt: '2026-09-22T09:00:00.000Z',
    runtimeStatus: 'running',
    runtimeAvailability: 'controllable',
    ...summarizeProjectTaskRun(run),
    task: taskProjection(),
  };
  return { execution, run, record };
}

describe('project task board projection', () => {
  it('keeps the task, run, WorkItem and revision in one projection', async () => {
    const { execution, record } = await setup();
    const board = new ProjectTaskBoardService(
      new MemoryTaskSource(record),
      execution
    );

    const page = await board.listProjectTasks({ projectId: 'project-1' });
    const detail = await board.getProjectTask('project-1', 'task-1');
    expect(page.items[0]?.revision).toBe(1);
    expect(page.items[0]?.runId).toBe(record.runId);
    expect(page.items[0]?.assignedAgentIds.length).toBeGreaterThan(0);
    expect(page.items[0]?.workItemCount).toBe(2);
    expect(detail.binding?.parentTaskId).toBe('task-1');
    expect(detail.workItems).toHaveLength(2);
    expect(detail.revision).toBe(detail.task.revision);
  });

  it('does not derive Task status from a completed WorkItem summary', async () => {
    const { execution, record } = await setup();
    const board = new ProjectTaskBoardService(
      new MemoryTaskSource({
        ...record,
        workItemCount: 1,
        assignedAgentIds: ['agent-a'],
        artifactRefs: ['artifact-1'],
      }),
      execution
    );

    const page = await board.listProjectTasks({ projectId: 'project-1' });
    expect(page.items[0]).toMatchObject({
      status: 'active',
      workItemCount: 1,
      assignedAgentIds: ['agent-a'],
      artifactRefs: ['artifact-1'],
    });
  });

  it('rejects a source record that crosses project scope', async () => {
    const { execution, record } = await setup();
    const board = new ProjectTaskBoardService(
      new MemoryTaskSource(record, true),
      execution
    );
    await expect(
      board.listProjectTasks({ projectId: 'other-project' })
    ).rejects.toThrow(/crossed project scope/);
  });

  it('requires the expected task revision for control commands', async () => {
    const { execution, record } = await setup();
    const board = new ProjectTaskBoardService(
      new MemoryTaskSource(record),
      execution
    );
    const updated = await board.requestProjectTaskAction({
      projectId: 'project-1',
      taskId: 'task-1',
      action: 'pause',
      requestId: 'request-1',
      expectedRevision: 1,
    });
    expect(updated.task.revision).toBe(2);
    expect(updated.task.status).toBe('blocked');
    await expect(
      board.requestProjectTaskAction({
        projectId: 'project-1',
        taskId: 'task-1',
        action: 'resume',
        requestId: 'request-2',
        expectedRevision: 1,
      })
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  it('replays one request ID with the same result', async () => {
    const { execution, record } = await setup();
    const board = new ProjectTaskBoardService(
      new MemoryTaskSource(record),
      execution
    );
    const request = {
      projectId: 'project-1',
      taskId: 'task-1',
      action: 'pause' as const,
      requestId: 'request-1',
      expectedRevision: 1,
    };
    const first = await board.requestProjectTaskAction(request);
    const replay = await board.requestProjectTaskAction(request);
    expect(replay).toEqual(first);
    expect(replay.task.revision).toBe(2);
    await expect(
      board.requestProjectTaskAction({ ...request, action: 'resume' })
    ).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
  });

  it('resolves one public target capability and replays the same transition request', async () => {
    const { execution, record } = await setup();
    const source = new MemoryTaskSource({
      ...record,
      leaseEpoch: 7,
      reviewCapabilitiesAvailable: true,
    });
    const board = new ProjectTaskBoardService(source, execution);
    const request = {
      projectId: 'project-1',
      taskId: 'task-1',
      targetStatus: 'review' as const,
      requestId: 'transition-review-1',
      expectedRevision: 1,
      expectedLeaseEpoch: 7,
    };
    const first = await board.requestProjectTaskTransition(request);
    const replay = await board.requestProjectTaskTransition(request);
    expect(first.status).toBe('review');
    expect(replay).toEqual(first);
    expect(source.transitions).toEqual(['request_review']);
  });

  it('rejects unavailable, ambiguous, stale revision and stale lease with zero writes', async () => {
    const { execution, record } = await setup();
    const source = new MemoryTaskSource({ ...record, leaseEpoch: 5 });
    const board = new ProjectTaskBoardService(source, execution);
    await expect(board.requestProjectTaskTransition({ projectId: 'project-1', taskId: 'task-1', targetStatus: 'pending', requestId: 'unavailable-1', expectedRevision: 1, expectedLeaseEpoch: 5 }))
      .rejects.toMatchObject({ code: 'TRANSITION_NOT_AVAILABLE' });
    await expect(board.requestProjectTaskTransition({ projectId: 'project-1', taskId: 'task-1', targetStatus: 'review', requestId: 'stale-revision-1', expectedRevision: 0, expectedLeaseEpoch: 5 }))
      .rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(board.requestProjectTaskTransition({ projectId: 'project-1', taskId: 'task-1', targetStatus: 'review', requestId: 'stale-lease-1', expectedRevision: 1, expectedLeaseEpoch: 4 }))
      .rejects.toMatchObject({ code: 'LEASE_CONFLICT' });
    expect(source.transitions).toHaveLength(0);

    const ambiguousSource = new MemoryTaskSource({
      ...record,
      task: { ...record.task, status: 'review' },
      runtimeStatus: 'paused',
      reviewCapabilitiesAvailable: true,
      leaseEpoch: 5,
    });
    const ambiguousBoard = new ProjectTaskBoardService(ambiguousSource, execution);
    await expect(ambiguousBoard.requestProjectTaskTransition({ projectId: 'project-1', taskId: 'task-1', targetStatus: 'active', requestId: 'ambiguous-1', expectedRevision: 1, expectedLeaseEpoch: 5 }))
      .rejects.toMatchObject({ code: 'TRANSITION_AMBIGUOUS' });
    expect(ambiguousSource.transitions).toHaveLength(0);
  });

  it('does not let completed WorkItems substitute for Task Step/Criterion Evidence', async () => {
    const { execution, record } = await setup();
    const source = new MemoryTaskSource({
      ...record,
      task: {
        ...record.task,
        status: 'review',
        steps: [{ id: 'step-1', text: 'Deliver', expectedOutput: 'artifact', status: 'done', evidenceRequired: true, evidenceCount: 0 }],
        criteria: [{ id: 'criterion-1', text: 'Verified', status: 'satisfied', evidenceCount: 0 }],
        evidenceCount: 0,
      },
      runtimeStatus: 'running',
      reviewCapabilitiesAvailable: true,
      workItemCount: 2,
      artifactRefs: ['work-item-output'],
    });
    const board = new ProjectTaskBoardService(source, execution);
    const rejection = board.requestProjectTaskTransition({ projectId: 'project-1', taskId: 'task-1', targetStatus: 'done', requestId: 'complete-with-workitems-1', expectedRevision: 1 });
    await expect(rejection).rejects.toBeInstanceOf(ProjectTaskTransitionRejectedError);
    await expect(rejection).rejects.toMatchObject({
      code: 'EVIDENCE_GATE_FAILED',
      gaps: expect.arrayContaining([
        expect.objectContaining({ kind: 'step_evidence', id: 'step-1' }),
        expect.objectContaining({ kind: 'criterion_evidence', id: 'criterion-1' }),
        expect.objectContaining({ kind: 'task_evidence' }),
      ]),
    });
    expect(source.transitions).toHaveLength(0);
  });

  it('rejects completion while any Task blocker remains unresolved without mutating the task', async () => {
    const { execution, record } = await setup();
    const source = new MemoryTaskSource({
      ...record,
      task: {
        ...record.task,
        status: 'review',
        steps: [{ id: 'step-1', text: 'Deliver', expectedOutput: 'artifact', status: 'done', evidenceRequired: true, evidenceCount: 1 }],
        criteria: [{ id: 'criterion-1', text: 'Verified', status: 'satisfied', evidenceCount: 1 }],
        blockers: [{ id: 'blocker-1', reason: 'Security approval', blockedBy: 'reviewer', neededToUnblock: 'Approve release', resolved: false }],
        evidenceCount: 1,
      },
      runtimeStatus: 'running',
      reviewCapabilitiesAvailable: true,
      leaseEpoch: 8,
    });
    const board = new ProjectTaskBoardService(source, execution);

    await expect(board.requestProjectTaskTransition({
      projectId: 'project-1',
      taskId: 'task-1',
      targetStatus: 'done',
      requestId: 'complete-blocked-1',
      expectedRevision: 1,
      expectedLeaseEpoch: 8,
    })).rejects.toMatchObject({
      code: 'EVIDENCE_GATE_FAILED',
      authoritative: expect.objectContaining({ status: 'review', revision: 1 }),
      gaps: [expect.objectContaining({ kind: 'blocker', id: 'blocker-1' })],
    });
    expect(source.transitions).toHaveLength(0);
    await expect(board.getProjectTask('project-1', 'task-1')).resolves.toMatchObject({
      status: 'review',
      revision: 1,
    });
  });

  it('approves completion only after Step/Criterion Evidence and blockers pass', async () => {
    const { execution, record } = await setup();
    const source = new MemoryTaskSource({
      ...record,
      task: {
        ...record.task,
        status: 'review',
        steps: [{ id: 'step-1', text: 'Deliver', expectedOutput: 'artifact', status: 'done', evidenceRequired: true, evidenceCount: 1 }],
        criteria: [{ id: 'criterion-1', text: 'Verified', status: 'satisfied', evidenceCount: 1 }],
        blockers: [{ id: 'blocker-1', reason: 'Approval', blockedBy: 'user', neededToUnblock: 'Approved', resolved: true }],
        evidenceCount: 1,
      },
      runtimeStatus: 'running',
      reviewCapabilitiesAvailable: true,
      leaseEpoch: 8,
    });
    const board = new ProjectTaskBoardService(source, execution);
    const completed = await board.requestProjectTaskTransition({ projectId: 'project-1', taskId: 'task-1', targetStatus: 'done', requestId: 'complete-1', expectedRevision: 1, expectedLeaseEpoch: 8 });
    expect(completed.status).toBe('done');
    expect(source.transitions).toEqual(['approve_completion']);
  });
});
