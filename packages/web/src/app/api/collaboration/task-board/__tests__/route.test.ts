import { beforeEach, describe, expect, it, vi } from 'vitest';

const inspect = vi.fn();
const resolveHitl = vi.fn();

vi.mock('@originos/core/modules/collaboration-runtime/facade', () => ({
  readSupervisorTaskBoard: vi.fn(),
}));
vi.mock('@/services/ontologyCrossPackageService', () => ({
  getProjectContractRuntimeComposition: () => ({ executionPort: { inspect, resolveHitl } }),
}));

const { POST } = await import('../route');

describe('POST /api/collaboration/task-board', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspect.mockResolvedValue({ projectId: 'proj-a' });
    resolveHitl.mockResolvedValue({ runId: 'run-a', projectId: 'proj-a' });
  });

  it('resolves a formal HITL decision through the contract ledger', async () => {
    const response = await POST(new Request('http://localhost/api/collaboration/task-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-a', runId: 'run-a', requestId: 'hitl-a', attemptId: 'attempt-a',
        leaseEpoch: 2, answer: '批准',
      }),
    }));

    expect(response.status).toBe(200);
    expect(resolveHitl).toHaveBeenCalledWith({
      runId: 'run-a', requestId: 'hitl-a', attemptId: 'attempt-a', leaseEpoch: 2,
      decision: 'approve', decisionRef: 'task-board:hitl-a:approve',
    });
  });

  it('records free-form review content as an edit decision', async () => {
    const response = await POST(new Request('http://localhost/api/collaboration/task-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-a', runId: 'run-a', requestId: 'hitl-a', attemptId: 'attempt-a',
        leaseEpoch: 2, answer: '随便看看',
      }),
    }));

    expect(response.status).toBe(200);
    expect(resolveHitl).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-a', requestId: 'hitl-a', attemptId: 'attempt-a', leaseEpoch: 2,
      decision: 'edit',
      editedPayloadHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      decisionRef: expect.stringMatching(/^task-board:hitl-a:edit:sha256:[a-f0-9]{64}$/),
    }));
  });

  it('resolves an artifact protocol ref to its persisted project file', async () => {
    const response = await POST(new Request('http://localhost/api/collaboration/task-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve-artifact',
        projectId: 'proj-a',
        artifactRef: 'artifact://collaboration/proj-a/run-a/T1/attempt-a',
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      path: 'projects/proj-a/collaboration-artifacts/run-a/T1/attempt-a.json',
    });
  });
});
