/**
 * OS.9: 单窗口操作 Hook
 */

'use client';

import { useMemo, useCallback } from 'react';
import { useAppWindowStore } from '@/store/appWindowStore';
import { AppWindowData, AppWindowPosition } from '@originos/core/types';
import { isElectron } from '@originos/core/lib/integrations/electron';
import { closeNativeWindow, focusNativeWindow, maximizeNativeWindow, minimizeNativeWindow } from '@originos/core/lib/integrations/electron/window';

export interface UseAppWindowOptions {
  windowId: string;
}

export interface UseAppWindowReturn {
  window: AppWindowData | undefined;
  isOpen: boolean;
  isFocused: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  isDragging: boolean;
  isResizing: boolean;
  position: AppWindowPosition;

  close: () => void;
  minimize: () => void;
  maximize: () => void;
  restore: () => void;
  focus: () => void;
  move: (x: number, y: number) => void;
  resize: (width: number, height: number) => void;
  setPosition: (position: Partial<AppWindowPosition>) => void;
  setDragging: (isDragging: boolean) => void;
  setResizing: (isResizing: boolean) => void;
}

export function useAppWindow(options: UseAppWindowOptions): UseAppWindowReturn {
  const { windowId } = options;
  const store = useAppWindowStore();

  const window = useMemo(
    () => store.windows[windowId],
    [store.windows, windowId]
  );

  const isOpen = useMemo(() => !!window, [window]);
  const isFocused = useMemo(() => window?.isFocused ?? false, [window]);
  const isMinimized = useMemo(() => window?.state === 'minimized', [window]);
  const isMaximized = useMemo(() => window?.state === 'maximized', [window]);
  const isDragging = useMemo(() => window?.isDragging ?? false, [window]);
  const isResizing = useMemo(() => window?.isResizing ?? false, [window]);
  const position = useMemo(
    () => window?.position ?? { x: 0, y: 0, width: 800, height: 600, zIndex: 100 },
    [window]
  );

  const close = useCallback(() => {
    if (window?.metadata?.['renderMode'] === 'native' && isElectron()) {
      void closeNativeWindow(windowId).catch((error: unknown) => {
        console.error('[useAppWindow] native window close failed:', error);
      });
    }
    store.closeWindow(windowId);
  }, [store, window, windowId]);

  const minimize = useCallback(() => {
    if (window?.metadata?.['renderMode'] === 'native' && isElectron()) {
      void minimizeNativeWindow(windowId).catch((error: unknown) => {
        console.error('[useAppWindow] native window minimize failed:', error);
      });
    }
    store.minimizeWindow(windowId);
  }, [store, window, windowId]);

  const maximize = useCallback(() => {
    if (window?.metadata?.['renderMode'] === 'native' && isElectron()) {
      void maximizeNativeWindow(windowId).catch((error: unknown) => {
        console.error('[useAppWindow] native window maximize failed:', error);
      });
    }
    store.maximizeWindow(windowId);
  }, [store, window, windowId]);

  const restore = useCallback(() => {
    store.restoreWindow(windowId);
  }, [store, windowId]);

  const focus = useCallback(() => {
    if (window?.metadata?.['renderMode'] === 'native' && isElectron()) {
      void focusNativeWindow(windowId).catch((error: unknown) => {
        console.error('[useAppWindow] native window focus failed:', error);
      });
    }
    store.focusWindow(windowId);
  }, [store, window, windowId]);

  const move = useCallback(
    (x: number, y: number) => {
      store.updateWindowPosition(windowId, { x, y });
    },
    [store, windowId]
  );

  const resize = useCallback(
    (width: number, height: number) => {
      store.updateWindowPosition(windowId, { width, height });
    },
    [store, windowId]
  );

  const setPosition = useCallback(
    (newPosition: Partial<AppWindowPosition>) => {
      store.updateWindowPosition(windowId, newPosition);
    },
    [store, windowId]
  );

  const setDragging = useCallback(
    (dragging: boolean) => {
      store.setDragging(windowId, dragging);
    },
    [store, windowId]
  );

  const setResizing = useCallback(
    (resizing: boolean) => {
      store.setResizing(windowId, resizing);
    },
    [store, windowId]
  );

  return {
    window,
    isOpen,
    isFocused,
    isMinimized,
    isMaximized,
    isDragging,
    isResizing,
    position,

    close,
    minimize,
    maximize,
    restore,
    focus,
    move,
    resize,
    setPosition,
    setDragging,
    setResizing,
  };
}

export default useAppWindow;
