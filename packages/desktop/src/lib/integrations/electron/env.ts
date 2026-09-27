import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';

export interface ElectronBridge {
  isElectron: true;
  ontologyCrossPackage: {
    invoke: (request: unknown) => Promise<IpcResponse>;
  };
  ipcRenderer: {
    send: (channel: string, payload?: unknown) => void;
    invoke: <T>(channel: string, ...args: unknown[]) => Promise<T>;
    on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
  };
}

function getWindowWithElectron(): Window & { electron?: ElectronBridge } {
  return window as Window & { electron?: ElectronBridge };
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof getWindowWithElectron().electron !== 'undefined';
}

export function getElectronBridge(): ElectronBridge {
  if (!isElectron()) {
    throw new Error('Not running in Electron environment');
  }

  return getWindowWithElectron().electron as ElectronBridge;
}

export function getIpcRenderer(): ElectronBridge['ipcRenderer'] {
  return getElectronBridge().ipcRenderer;
}
