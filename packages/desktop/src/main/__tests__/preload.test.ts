import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../ipc-protocol';

const { exposeInMainWorld, invoke, on, removeListener } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
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

  it('allowlists project task events to the precise channel and reuses duplicate subscriptions', async () => {
    const api = await loadPreloadApi();
    const ontologyCrossPackage = api['ontologyCrossPackage'] as {
      subscribeProjectTasks: (projectId: string, listener: (event: unknown) => void) => () => void;
    };
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const releaseFirst = ontologyCrossPackage.subscribeProjectTasks('project-1', firstListener);
    const releaseSecond = ontologyCrossPackage.subscribeProjectTasks('project-1', secondListener);

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT,
      expect.any(Function),
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE,
      'project-1',
    );

    const eventListener = on.mock.calls[0]?.[1] as (event: unknown, value: unknown) => void;
    const update = { hostId: 'host-1', sequence: 1, projectId: 'project-1', taskId: 'task-1', revision: 2, kind: 'task_runtime' };
    eventListener({}, { projectId: 'project-1', payload: update });
    eventListener({}, { projectId: 'project-2', payload: update });
    expect(firstListener).toHaveBeenCalledWith(update);
    expect(secondListener).toHaveBeenCalledWith(update);
    expect(firstListener).toHaveBeenCalledTimes(1);

    releaseFirst();
    expect(invoke).toHaveBeenCalledTimes(1);
    releaseSecond();
    expect(invoke).toHaveBeenLastCalledWith(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_UNSUBSCRIBE,
      'project-1',
    );
    expect(removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT,
      eventListener,
    );
  });
});
