import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compose: vi.fn(),
  host: vi.fn(),
  service: { invoke: vi.fn() },
  sessions: {
    listTaskRuntimeSessions: vi.fn(),
    getSession: vi.fn(),
    updateSession: vi.fn(),
    addMessage: vi.fn(),
  },
  agents: {
    getOrCreateAgent: vi.fn(),
    getOrCreateTaskRuntime: vi.fn(),
    removeAgent: vi.fn(),
    getTaskRuntimeSnapshot: vi.fn(),
    controlTaskRuntime: vi.fn(),
    requestTaskReview: vi.fn(),
    approveTaskCompletion: vi.fn(),
    rejectTaskReview: vi.fn(),
  },
}));

vi.mock('../../../../../core/src/lib/features/project', () => ({
  createProjectContractRuntimeComposition: mocks.compose,
  projectContractRuntimeHost: mocks.host,
}));
vi.mock('../../../../../core/src/lib/features/agent', () => ({
  agentSessionService: mocks.sessions,
}));
vi.mock('../../../../../core/src/lib/features/agent/server', () => ({
  agentManager: mocks.agents,
}));
vi.mock('../../../../../core/src/lib/paths', () => ({ getDataRoot: (): string => '/data-root' }));

import { createOntologyCrossPackageService } from '../ontology-cross-package-ipc';

describe('Desktop ontology runtime wiring', () => {
  beforeEach(() => {
    mocks.compose.mockReset();
    mocks.host.mockReset();
    mocks.host.mockReturnValue({ sessions: mocks.sessions, agents: mocks.agents });
    mocks.compose.mockReturnValue({ service: mocks.service });
  });

  it('delegates session recovery, runtime control and trusted sender access to the Core composition', async () => {
    expect(createOntologyCrossPackageService()).toBe(mocks.service);
    expect(mocks.host).toHaveBeenCalledWith(mocks.sessions, mocks.agents);
    expect(mocks.compose).toHaveBeenCalledWith(expect.objectContaining({
      dataRoot: '/data-root',
      host: { sessions: mocks.sessions, agents: mocks.agents },
      projectAccess: { authorize: expect.any(Function) },
    }));
    const options = mocks.compose.mock.calls[0]?.[0] as {
      projectAccess: { authorize(input: { actorId: string }): Promise<{ authorized: boolean }> };
    };
    await expect(options.projectAccess.authorize({ actorId: 'desktop-sender:7' }))
      .resolves.toEqual({ authorized: true });
    await expect(options.projectAccess.authorize({ actorId: 'renderer-supplied' }))
      .resolves.toEqual({ authorized: false });
    expect(mocks.sessions.getSession).toBeTypeOf('function');
    expect(mocks.sessions.updateSession).toBeTypeOf('function');
    expect(mocks.agents.getOrCreateTaskRuntime).toBeTypeOf('function');
    expect(mocks.agents.controlTaskRuntime).toBeTypeOf('function');
  });
});
