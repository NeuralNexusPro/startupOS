import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../ipc-protocol';

const { exposeInMainWorld, invoke } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}));

async function loadPreloadApi(): Promise<Record<string, unknown>> {
  await import('../preload');
  const [, api] = exposeInMainWorld.mock.calls[0] as [string, Record<string, unknown>];
  return api;
}

describe('preload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes the ontology cross-package invoke method with a precise channel', async () => {
    const api = await loadPreloadApi();
    const ontologyCrossPackage = api['ontologyCrossPackage'] as {
      invoke: (request: unknown) => Promise<unknown>;
    };

    await ontologyCrossPackage.invoke({ requestId: 'request-1', nested: undefined });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.ONTOLOGY_CROSS_PACKAGE_INVOKE,
      { requestId: 'request-1' }
    );
  });
});
