import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  active: false,
  invoke: vi.fn(),
}));

vi.mock('@originos/core/lib/integrations/electron/env', () => ({
  isElectron: () => electron.active,
  getIpcRenderer: () => ({ invoke: electron.invoke }),
}));

const { getSolutionOutputAcceptance, saveSolutionOutputAcceptance } =
  await import('../solution-output-acceptance-client');

const ref = {
  projectId: 'project-1',
  solutionId: 'solution-1',
  solutionVersion: 'v1',
};

describe('solution output acceptance client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    electron.active = false;
    electron.invoke.mockReset();
  });

  it('uses the Web route outside Electron', async () => {
    const response = {
      success: true,
      data: { ...ref, nodes: [], roles: [] },
      timestamp: '2026-10-15T00:00:00.000Z',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(response)));

    await getSolutionOutputAcceptance(ref);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/solutions/v1/acceptance?solutionId=solution-1'
    );

    await saveSolutionOutputAcceptance({
      ...ref,
      nodes: [{ nodeId: 'node-1', mode: 'automatic' }],
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/projects/project-1/solutions/v1/acceptance',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('uses the Electron channels inside the desktop renderer', async () => {
    electron.active = true;
    electron.invoke.mockResolvedValue({
      success: true,
      data: { ...ref, nodes: [], roles: [] },
      timestamp: '2026-10-15T00:00:00.000Z',
    });

    await getSolutionOutputAcceptance(ref);
    expect(electron.invoke).toHaveBeenNthCalledWith(
      1,
      'project:solution:acceptance:get',
      ref
    );

    const save = {
      ...ref,
      nodes: [{ nodeId: 'node-1', mode: 'user' as const }],
    };
    await saveSolutionOutputAcceptance(save);
    expect(electron.invoke).toHaveBeenNthCalledWith(
      2,
      'project:solution:acceptance:save',
      save
    );
  });
});
