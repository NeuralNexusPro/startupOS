import { describe, expect, it, vi } from 'vitest';

import {
  createProjectEvidenceSink,
  RuntimeApprovedProjectTaskPort,
} from '../composition/contract-task-session-adapters';

import type { ProjectContractRuntimeHostCapabilities } from '../composition/contract-runtime-types';
import type { ProjectTaskBoardService } from '../task-board';

describe('RuntimeApprovedProjectTaskPort', () => {
  it('freezes the approved parent task so only the WorkItem worker executes it', async () => {
    const projection = {
      version: 1 as const,
      taskId: 'T1',
      title: '跟踪趋势',
      objective: '获取今天的 GitHub 热榜',
      status: 'active' as const,
      progress: 0,
      currentStep: 'T1-S1',
      steps: [{
        id: 'T1-S1',
        text: '执行任务目标并验证交付结果',
        expectedOutput: '趋势记录',
        status: 'active' as const,
        evidenceRequired: true,
        evidenceCount: 0,
      }],
      criteria: [], blockers: [], warnings: [], evidenceCount: 0,
      actions: ['stop' as const], revision: 1, cursor: null,
      stateHash: 'state-1', truncated: false,
    };
    const execution = {
      mode: 'task_running' as const,
      status: 'running' as const,
      bridgeEpoch: 1,
    };
    const createTask = vi.fn(async () => ({
      version: 1 as const, sessionId: 'approved-session', execution, projection,
    }));
    const controlTask = vi.fn(async () => ({
      version: 1 as const,
      sessionId: 'approved-session',
      execution: { ...execution, status: 'paused' as const },
      projection,
    }));
    const session = {
      sessionId: 'approved-session',
      projectContext: { projectId: 'project-1' },
    };
    const host = {
      sessions: {
        getSession: vi.fn(async () => null),
        createSession: vi.fn(async () => session),
        updateSession: vi.fn(async () => session),
      },
      agents: {
        getOrCreateTaskRuntime: vi.fn(async () => ({ createTask, controlTask })),
      },
    } as unknown as ProjectContractRuntimeHostCapabilities;
    const taskBoard = {
      getProjectTask: vi.fn(async () => ({ taskId: 'T1', revision: 1 })),
    } as unknown as ProjectTaskBoardService;
    const port = new RuntimeApprovedProjectTaskPort(host, taskBoard);

    const receipt = await port.create({
      projectId: 'project-1',
      requestId: 'request-1',
      title: '跟踪趋势',
      objective: '获取今天的 GitHub 热榜',
      acceptanceCriteria: ['生成趋势记录'],
      source: {
        solutionId: 'solution-1', solutionVersion: '1',
        contractId: 'contract-1', contractHash: `sha256:${'a'.repeat(64)}`,
        taskTemplateId: 'template-1',
      },
    });

    expect(controlTask).toHaveBeenCalledWith(expect.objectContaining({
      action: 'stop',
      expectedRevision: 1,
      expectedCursor: null,
      bridgeEpoch: 1,
    }));
    expect(receipt).toMatchObject({ parentStepId: 'T1-S1', task: { taskId: 'T1' } });
  });

  it('maps the Pi Task current step text to its stable step ID', async () => {
    const projection = {
      version: 1 as const,
      taskId: 'T1',
      title: '跟踪趋势',
      objective: '获取今天的 GitHub 热榜',
      status: 'active' as const,
      progress: 0,
      currentStep: '执行任务目标并验证交付结果',
      steps: [{
        id: 'T1-S1',
        text: '执行任务目标并验证交付结果',
        expectedOutput: '满足验收标准的交付结果',
        status: 'active' as const,
        evidenceRequired: true,
        evidenceCount: 0,
      }],
      criteria: [],
      blockers: [],
      warnings: [],
      evidenceCount: 0,
      actions: ['stop' as const],
      revision: 1,
      cursor: null,
      stateHash: 'state-1',
      truncated: false,
    };
    const task = { taskId: 'T1' };
    const host = {
      sessions: {
        getSession: vi.fn(async () => ({
          taskRuntime: {
            execution: { requestId: 'request-1', projection },
          },
        })),
      },
    } as unknown as ProjectContractRuntimeHostCapabilities;
    const taskBoard = {
      getProjectTask: vi.fn(async () => task),
    } as unknown as ProjectTaskBoardService;
    const port = new RuntimeApprovedProjectTaskPort(host, taskBoard);

    const receipt = await port.findByRequest('project-1', 'request-1');

    expect(receipt).toMatchObject({
      parentStepId: 'T1-S1',
      task,
    });
  });

  it('records contract evidence against the active decomposed child step', async () => {
    const recordVerifiedEvidence = vi.fn(async () => ({
      version: 1 as const,
      requestId: 'evidence-request-1',
      eventId: 'evidence-event-1',
      revisionBefore: 2,
      revisionAfter: 3,
      stateHash: 'state-3',
    }));
    const projection = {
      version: 1 as const,
      taskId: 'T1',
      title: '跟踪趋势',
      objective: '获取今天的 GitHub 热榜',
      status: 'active' as const,
      progress: 40,
      currentStep: '抓取 GitHub Trending 页面数据',
      steps: [{
        id: 'T1-S1.1',
        text: '抓取 GitHub Trending 页面数据',
        expectedOutput: '原始清单',
        status: 'active' as const,
        evidenceRequired: true,
        evidenceCount: 0,
      }, {
        id: 'T1-S1.2',
        text: '整理趋势快照',
        expectedOutput: '趋势快照',
        status: 'pending' as const,
        evidenceRequired: true,
        evidenceCount: 0,
      }],
      criteria: [],
      blockers: [],
      warnings: [],
      evidenceCount: 0,
      actions: ['stop' as const],
      revision: 2,
      cursor: 'cursor-2',
      stateHash: 'state-2',
      truncated: false,
    };
    const runtime = {
      getSnapshot: () => ({
        version: 1 as const,
        sessionId: 'session-1',
        execution: {} as never,
        projection,
      }),
      recordVerifiedEvidence,
    };
    const session = { sessionId: 'session-1' };
    const host = {
      sessions: {
        listTaskRuntimeSessions: vi.fn(async () => [{
          sessionId: 'session-1',
          projectId: 'project-1',
          updatedAt: 1,
          taskRuntime: { execution: { projection } },
        }]),
        getSession: vi.fn(async () => session),
        updateSession: vi.fn(async () => session),
      },
      agents: {
        getOrCreateTaskRuntime: vi.fn(async () => runtime),
      },
    } as unknown as ProjectContractRuntimeHostCapabilities;
    const sink = createProjectEvidenceSink(host);

    await sink.record({
      run: { projectId: 'project-1' },
      workItem: {
        id: 'work-item-1',
        binding: { parentTaskId: 'T1', parentStepId: 'T1-S1' },
      },
      verifierResult: {
        verificationMethod: 'originos.artifact-output@1.0.0',
        resultRef: 'verification-1',
        contentHash: 'sha256:verified',
        artifactRefs: ['artifact-1'],
      },
      idempotencyKey: 'evidence-request-1',
    } as never);

    expect(recordVerifiedEvidence).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'T1',
      stepId: 'T1-S1.1',
    }));
  });
});
