import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compose: vi.fn(),
  host: vi.fn(() => ({ kind: 'shared-host' })),
  service: { invoke: vi.fn() },
  sessions: { id: 'sessions' },
  agents: { id: 'agents' },
}));

vi.mock('@originos/core/lib/features/project', () => ({
  createProjectContractRuntimeComposition: mocks.compose,
  projectContractRuntimeHost: mocks.host,
}));
vi.mock('@originos/core/lib/features/agent', () => ({
  agentSessionService: mocks.sessions,
}));
vi.mock('@originos/core/lib/features/agent/server', () => ({
  agentManager: mocks.agents,
}));
vi.mock('@originos/core/lib/paths', () => ({ getDataRoot: (): string => '/data-root' }));

import { createOntologyCrossPackageService } from '../ontologyCrossPackageService';

describe('Web ontology runtime wiring', () => {
  beforeEach(() => {
    mocks.compose.mockReset();
    mocks.host.mockClear();
    mocks.compose.mockReturnValue({ service: mocks.service });
  });

  it('delegates the complete runtime composition to Core', () => {
    expect(createOntologyCrossPackageService()).toBe(mocks.service);
    expect(mocks.host).toHaveBeenCalledWith(mocks.sessions, mocks.agents);
    expect(mocks.compose).toHaveBeenCalledWith({
      dataRoot: '/data-root',
      host: { kind: 'shared-host' },
    });
  });
});
