import { describe, expect, it, vi } from 'vitest';

import { RuntimeApprovedProjectTaskPort } from '../composition/contract-task-session-adapters';

import type { ProjectContractRuntimeHostCapabilities } from '../composition/contract-runtime-types';
import type { ProjectTaskBoardService } from '../task-board';

describe('RuntimeApprovedProjectTaskPort', () => {
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
});
