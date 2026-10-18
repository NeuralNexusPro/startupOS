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
});
