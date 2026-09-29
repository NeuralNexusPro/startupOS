'use client';

import { useCallback, useEffect, useState } from 'react';
import { isElectron } from '@originos/core/lib/integrations/electron';
import {
  closeNativeWindow,
  createNativeWindow,
  focusNativeWindow,
  maximizeNativeWindow,
  minimizeNativeWindow,
  NativeWindowConfig,
  subscribeToNativeWindowClosed,
} from '@originos/core/lib/integrations/electron/window';

export interface ElectronWindowAPI {
  isAvailable: boolean;
  createWindow: (config: NativeWindowConfig) => Promise<string>;
  closeWindow: (windowId: string) => Promise<void>;
  focusWindow: (windowId: string) => Promise<void>;
  minimizeWindow: (windowId: string) => Promise<void>;
  maximizeWindow: (windowId: string) => Promise<void>;
  subscribeToClosed: (listener: (windowId: string) => void) => () => void;
}

export function useElectronWindow(): ElectronWindowAPI {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(isElectron());
  }, []);

  const createWindow = useCallback(async (config: NativeWindowConfig) => {
    return createNativeWindow(config);
  }, []);

  const closeWindow = useCallback(async (windowId: string) => {
    await closeNativeWindow(windowId);
  }, []);

  const focusWindow = useCallback(async (windowId: string) => {
    await focusNativeWindow(windowId);
  }, []);

  const minimizeWindow = useCallback(async (windowId: string) => {
    await minimizeNativeWindow(windowId);
  }, []);

  const maximizeWindow = useCallback(async (windowId: string) => {
    await maximizeNativeWindow(windowId);
  }, []);

  const subscribeToClosed = useCallback((listener: (windowId: string) => void) => {
    return subscribeToNativeWindowClosed(listener);
  }, []);

  return {
    isAvailable: available,
    createWindow,
    closeWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    subscribeToClosed,
  };
}
