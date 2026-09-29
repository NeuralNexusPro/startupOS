import { contextBridge, ipcRenderer } from 'electron';

import type { IpcResponse } from '@originos/core/lib/integrations/electron';
import type {
  ProjectTaskSubscriptionEvent,
  ProjectTaskSubscriptionTermination,
} from '@originos/core/lib/features/project';

import { IPC_CHANNELS } from './ipc-protocol';

type IpcListener = (...args: unknown[]) => void;
type ProjectTaskListener = (
  event: ProjectTaskSubscriptionEvent | ProjectTaskSubscriptionTermination
) => void;

interface ProjectTaskDesktopEvent {
  readonly projectId: string;
  readonly payload: ProjectTaskSubscriptionEvent | ProjectTaskSubscriptionTermination;
}

function sanitizeIpcArg(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeIpcArg);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, sanitizeIpcArg(entryValue)])
    );
  }
  return value;
}

const projectTaskListeners = new Map<string, Set<ProjectTaskListener>>();
let releaseProjectTaskEvents: (() => void) | undefined;

function isProjectTaskDesktopEvent(value: unknown): value is ProjectTaskDesktopEvent {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { projectId?: unknown }).projectId === 'string'
    && Boolean((value as { payload?: unknown }).payload)
    && typeof (value as { payload?: unknown }).payload === 'object';
}

function ensureProjectTaskEventListener(): void {
  if (releaseProjectTaskEvents) return;
  const wrappedListener = (_event: Electron.IpcRendererEvent, value: unknown) => {
    if (!isProjectTaskDesktopEvent(value)) return;
    const listeners = projectTaskListeners.get(value.projectId);
    if (!listeners) return;
    for (const listener of [...listeners]) listener(value.payload);
  };
  ipcRenderer.on(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT, wrappedListener);
  releaseProjectTaskEvents = () => {
    ipcRenderer.removeListener(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_EVENT, wrappedListener);
    releaseProjectTaskEvents = undefined;
  };
}

const electronApi = {
  isElectron: true,
  ipcRenderer: {
    send(channel: string, payload?: unknown) {
      if (payload === undefined) {
        ipcRenderer.send(channel);
        return;
      }
      ipcRenderer.send(channel, sanitizeIpcArg(payload));
    },
    invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
      return ipcRenderer.invoke(channel, ...args.map(sanitizeIpcArg)) as Promise<T>;
    },
    on(channel: string, listener: IpcListener) {
      const wrappedListener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
        listener(...args);
      };
      ipcRenderer.on(channel, wrappedListener);

      return () => {
        ipcRenderer.removeListener(channel, wrappedListener);
      };
    },
  },
  ontologyCrossPackage: {
    invoke(request: unknown): Promise<IpcResponse> {
      return ipcRenderer.invoke(
        IPC_CHANNELS.ONTOLOGY_CROSS_PACKAGE_INVOKE,
        sanitizeIpcArg(request)
      ) as Promise<IpcResponse>;
    },
    subscribeProjectTasks(projectId: string, listener: ProjectTaskListener): () => void {
      if (projectId.trim().length === 0 || projectId.length > 256) {
        throw new TypeError('Invalid project ID');
      }
      const listeners = projectTaskListeners.get(projectId) ?? new Set<ProjectTaskListener>();
      const isFirstListener = listeners.size === 0;
      listeners.add(listener);
      projectTaskListeners.set(projectId, listeners);
      ensureProjectTaskEventListener();
      if (isFirstListener) {
        void ipcRenderer.invoke(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_SUBSCRIBE, projectId);
      }

      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const current = projectTaskListeners.get(projectId);
        current?.delete(listener);
        if (current?.size === 0) {
          projectTaskListeners.delete(projectId);
          void ipcRenderer.invoke(IPC_CHANNELS.ONTOLOGY_PROJECT_TASKS_UNSUBSCRIBE, projectId);
        }
        if (projectTaskListeners.size === 0) releaseProjectTaskEvents?.();
      };
    },
  },
  canonicalOntologyAuthoring: {
    execute(request: unknown): Promise<IpcResponse> {
      return ipcRenderer.invoke(
        IPC_CHANNELS.ONTOLOGY_CANONICAL_AUTHORING_EXECUTE,
        sanitizeIpcArg(request)
      ) as Promise<IpcResponse>;
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronApi);
