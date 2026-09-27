import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  ProjectTaskBoardService,
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
    runId: run.runId,
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
    expect(detail.binding?.parentTaskId).toBe('task-1');
    expect(detail.workItems).toHaveLength(2);
    expect(detail.revision).toBe(detail.task.revision);
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
});
