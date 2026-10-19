import { getIpcRenderer, isElectron } from './env';
import { IPC_CHANNELS } from './ipc-protocol';

export interface ElectronFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  createdAt: string;
}

export interface ElectronReadFileResult {
  content: string;
  encoding: 'utf-8' | 'base64';
  contentType?: string;
}

export async function readLocalFile(filePath: string): Promise<ElectronReadFileResult> {
  if (!isElectron()) {
    throw new Error('Local file system is only available in Electron');
  }

  return getIpcRenderer().invoke<ElectronReadFileResult>(IPC_CHANNELS.FS_READ, filePath);
}

export async function writeLocalFile(filePath: string, content: string): Promise<void> {
  if (!isElectron()) {
    throw new Error('Local file system is only available in Electron');
  }

  await getIpcRenderer().invoke<void>(IPC_CHANNELS.FS_WRITE, filePath, content);
}

export async function listLocalFiles(dirPath: string): Promise<ElectronFileEntry[]> {
  if (!isElectron()) {
    throw new Error('Local file system is only available in Electron');
  }

  return getIpcRenderer().invoke<ElectronFileEntry[]>(IPC_CHANNELS.FS_LIST, dirPath);
}

export async function deleteLocalFile(filePath: string): Promise<void> {
  if (!isElectron()) {
    throw new Error('Local file system is only available in Electron');
  }

  await getIpcRenderer().invoke<void>(IPC_CHANNELS.FS_DELETE, filePath);
}

export async function openLocalFile(filePath: string): Promise<void> {
  if (!isElectron()) {
    throw new Error('System file opening is only available in Electron');
  }

  await getIpcRenderer().invoke<void>(IPC_CHANNELS.FS_OPEN, filePath);
}

export async function watchLocalPath(targetPath: string): Promise<void> {
  if (!isElectron()) {
    return;
  }

  await getIpcRenderer().invoke<void>(IPC_CHANNELS.FS_WATCH, targetPath);
}

export async function unwatchLocalPath(targetPath: string): Promise<void> {
  if (!isElectron()) {
    return;
  }

  await getIpcRenderer().invoke<void>(IPC_CHANNELS.FS_UNWATCH, targetPath);
}

export function subscribeToLocalFsChanges(listener: (payload: { path: string }) => void): () => void {
  if (!isElectron()) {
    return () => {};
  }

  return getIpcRenderer().on(IPC_CHANNELS.FS_CHANGED, (payload: unknown) => {
    if (payload && typeof payload === 'object' && 'path' in payload && typeof payload.path === 'string') {
      listener({ path: payload.path });
    }
  });
}
