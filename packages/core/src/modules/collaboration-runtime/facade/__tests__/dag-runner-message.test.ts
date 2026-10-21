import { describe, expect, it } from 'vitest';

import type { CollaborationRunSnapshot } from '../contract-execution-types';
import { formalRunStatusMessage } from '../dag-runner';

function snapshot(
  overrides: Partial<CollaborationRunSnapshot>,
): CollaborationRunSnapshot {
  return {
    runId: 'run-1',
    projectId: 'project-1',
    binding: {
      parentTaskId: 'T1', parentStepId: 'T1-S1', runId: 'run-1',
      solutionId: 'solution-1', solutionVersion: '1',
      executionContractId: 'contract-1', contractHash: `sha256:${'a'.repeat(64)}`,
      taskRevision: 1,
    },
    contract: {} as CollaborationRunSnapshot['contract'],
    workItems: [], status: 'running', revision: 1,
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('formalRunStatusMessage', () => {
  it('reports terminal failure to the user instead of stopping at the running notice', () => {
    const message = formalRunStatusMessage('T1', snapshot({
      terminalStatus: 'failed',
      failureReason: 'MAX_DURATION_EXCEEDED',
    }));

    expect(message).toContain('任务 T1 执行失败');
    expect(message).toContain('MAX_DURATION_EXCEEDED');
    expect(message).toContain('启动新的 Run');
  });

  it('includes completed worker output in the Supervisor conversation message', () => {
    const message = formalRunStatusMessage('T1', snapshot({
      terminalStatus: 'completed',
    }), [{
      agentId: 'trend-agent',
      output: '**项目名**：openclaw',
    }]);

    expect(message).toContain('任务 T1 已完成');
    expect(message).toContain('### trend-agent 的产出');
    expect(message).toContain('**项目名**：openclaw');
    expect(message).not.toContain('已写入任务看板');
  });

  it('reports a review-stalled worker reason instead of a generic running status', () => {
    const message = formalRunStatusMessage('T1', snapshot({
      workItems: [{
        id: 'run-1:analyze',
        binding: snapshot({}).binding,
        designNodeId: 'analyze',
        assignedAgentId: 'analyst',
        skillRefs: ['analyze'],
        dependsOn: [],
        inputRefs: [],
        outputRefs: [],
        status: 'needs_review',
        revision: 1,
        leaseEpoch: 1,
        attempts: [{
          attemptId: 'attempt-1',
          leaseEpoch: 1,
          requestId: 'request-1',
          payloadHash: `sha256:${'b'.repeat(64)}`,
          status: 'needs_review',
          createdAt: '2026-10-18T00:00:00.000Z',
          updatedAt: '2026-10-18T00:00:00.000Z',
          reason: 'WORKER_RESULT_INVALID',
        }],
      }],
    }));

    expect(message).toContain('WORKER_RESULT_INVALID');
    expect(message).toContain('暂未继续推进');
  });
});
