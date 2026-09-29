'use client';

import { useCallback, useEffect, useState } from 'react';
import { isElectron } from '@originos/core/lib/integrations/electron';
import {
  deleteLocalFile,
  listLocalFiles,
  readLocalFile,
  subscribeToLocalFsChanges,
  unwatchLocalPath,
  watchLocalPath,
  writeLocalFile,
  type ElectronFileEntry as LocalFileEntry,
  type ElectronReadFileResult as LocalReadFileResult,
} from '@originos/core/lib/integrations/electron/local-fs';

export function useLocalFS() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(isElectron());
  }, []);

  const readFile = useCallback(async (filePath: string): Promise<LocalReadFileResult> => {
    return readLocalFile(filePath);
  }, []);

  const writeFile = useCallback(async (filePath: string, content: string): Promise<void> => {
    await writeLocalFile(filePath, content);
  }, []);

  const listFiles = useCallback(async (dirPath: string): Promise<LocalFileEntry[]> => {
    return listLocalFiles(dirPath);
  }, []);

  const deleteFile = useCallback(async (filePath: string): Promise<void> => {
    await deleteLocalFile(filePath);
  }, []);

  const watchPath = useCallback(async (targetPath: string): Promise<void> => {
    await watchLocalPath(targetPath);
  }, []);

  const unwatchPath = useCallback(async (targetPath: string): Promise<void> => {
    await unwatchLocalPath(targetPath);
  }, []);

  const onChanged = useCallback((listener: (payload: { path: string }) => void): (() => void) => {
    return subscribeToLocalFsChanges(listener);
  }, []);

  return {
    isReady,
    readFile,
    writeFile,
    listFiles,
    deleteFile,
    watchPath,
    unwatchPath,
    onChanged,
  };
}
