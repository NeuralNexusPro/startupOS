/**
 * OS.9: 窗口管理 Hook
 */

'use client';

import { useMemo, useCallback, useEffect } from 'react';
import { useAppWindowStore } from '@/store/appWindowStore';
import { AppWindowConfig, AppWindowData, ComponentContent } from '@originos/core/types';
import { useElectronWindow } from '@/hooks/useElectronWindow';
import { isElectron } from '@originos/core/lib/integrations/electron';
import { createNativeWindow } from '@originos/core/lib/integrations/electron/window';
import { destroyAgentSession, consolidateMemory } from '@originos/core/lib/integrations/electron/services/agent-session';

const MEMORY_ENTRY_TYPES = new Set(['role-agent', 'agent', 'project', 'solution', 'skill']);

function withAgentLifecycleOnClose(config: AppWindowConfig): AppWindowConfig {
  const metadata = config.metadata;
  const entryType = metadata?.['entryType'] as string | undefined;
  const entryId = metadata?.['entryId'] as string | undefined;
  const sessionId = metadata?.['sessionId'] as string | undefined;
  const projectId = metadata?.['projectId'] as string | undefined;

  if (!entryType || !entryId || !MEMORY_ENTRY_TYPES.has(entryType)) {
    return config;
  }

  const originalOnClose = config.onClose;
  return {
    ...config,
    onClose: () => {
      originalOnClose?.();
      destroyAgentSession({ sessionId, projectId }).catch((error: unknown) => {
        console.error('[useAppWindowManager] agent destroy failed:', error);
      });
      consolidateMemory(entryType, entryId).catch((error: unknown) => {
        console.error('[useAppWindowManager] memory consolidation failed:', error);
      });
    },
  };
}

export interface UseAppWindowManagerReturn {
  // 状态
  windows: Record<string, AppWindowData>;
  windowOrder: string[];
  focusedWindowId: string | null;
  openWindowCount: number;

  // 窗口操作
  openWindow: (config: AppWindowConfig) => string;
  closeWindow: (windowId: string) => void;
  closeAllWindows: () => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  restoreWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;

  // 查询
  getWindow: (windowId: string) => AppWindowData | undefined;
  getOpenWindows: () => AppWindowData[];
  isWindowOpen: (windowId: string) => boolean;

  // 快捷方法
  openComponentWindow: (
    id: string,
    title: string,
    component: React.ComponentType<any>,
    props?: Record<string, unknown>,
    options?: Partial<AppWindowConfig>
  ) => string;

  openIframeWindow: (
    id: string,
    title: string,
    url: string,
    options?: Partial<AppWindowConfig>
  ) => string;
}

export function useAppWindowManager(): UseAppWindowManagerReturn {
  const store = useAppWindowStore();
  const electronWindow = useElectronWindow();

  const windows = useMemo(() => store.windows, [store.windows]);
  const windowOrder = useMemo(() => store.windowOrder, [store.windowOrder]);
  const focusedWindowId = useMemo(() => store.focusedWindowId, [store.focusedWindowId]);
  const openWindowCount = useMemo(
    () => Object.values(store.windows).filter((w) => w.state !== 'minimized').length,
    [store.windows]
  );

  const openWindow = useCallback(
    (config: AppWindowConfig) => {
      config = withAgentLifecycleOnClose(config);
      const metadata = config.metadata;

      if (config.content.type === 'component' && typeof window !== 'undefined' && isElectron()) {
        const windowId = config.id ?? `native-${Date.now()}`;
        const entryType = metadata?.['entryType'] as string | undefined;
        const props = (config.content as ComponentContent).props ?? {};

        let windowType: string;
        if (entryType === 'skill') {
          windowType = 'skill';
        } else if (windowId.includes('interview')) {
          windowType = 'interview';
        } else if (entryType === 'role-agent' || entryType === 'agent') {
          windowType = entryType;
        } else {
          windowType = 'workspace';
        }

        const query: Record<string, string> = { windowType, title: config.title };
        for (const [k, v] of Object.entries(props)) {
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            query[k] = String(v);
          }
        }
        const metaKeys = ['entryType', 'entryId', 'sessionId', 'projectId'];
        for (const k of metaKeys) {
          const v = metadata?.[k];
          if (typeof v === 'string') query[k] = v;
        }

        void createNativeWindow({
          id: windowId,
          title: config.title,
          width: config.position?.width,
          height: config.position?.height,
          x: config.position?.x,
          y: config.position?.y,
          minWidth: config.constraints?.minWidth,
          minHeight: config.constraints?.minHeight,
          route: '/window',
          query,
        }).catch((error: unknown) => {
          console.error('[useAppWindowManager] native window creation failed:', error);
        });

        return store.openWindow({
          ...config,
          id: windowId,
          metadata: { ...metadata, renderMode: 'native' },
        });
      }

      return store.openWindow(config);
    },
    [store]
  );

  const closeWindow = useCallback(
    (windowId: string) => {
      const windowData = store.windows[windowId];
      if (windowData?.metadata?.['renderMode'] === 'native' && isElectron()) {
        void electronWindow.closeWindow(windowId).catch((error: unknown) => {
          console.error('[useAppWindowManager] native window close failed:', error);
        });
      }
      store.closeWindow(windowId);
    },
    [electronWindow, store]
  );

  const closeAllWindows = useCallback(
    () => store.closeAllWindows(),
    [store]
  );

  const minimizeWindow = useCallback(
    (windowId: string) => {
      const windowData = store.windows[windowId];
      if (windowData?.metadata?.['renderMode'] === 'native' && isElectron()) {
        void electronWindow.minimizeWindow(windowId).catch((error: unknown) => {
          console.error('[useAppWindowManager] native window minimize failed:', error);
        });
      }
      store.minimizeWindow(windowId);
    },
    [electronWindow, store]
  );

  const maximizeWindow = useCallback(
    (windowId: string) => {
      const windowData = store.windows[windowId];
      if (windowData?.metadata?.['renderMode'] === 'native' && isElectron()) {
        void electronWindow.maximizeWindow(windowId).catch((error: unknown) => {
          console.error('[useAppWindowManager] native window maximize failed:', error);
        });
      }
      store.maximizeWindow(windowId);
    },
    [electronWindow, store]
  );

  const restoreWindow = useCallback(
    (windowId: string) => store.restoreWindow(windowId),
    [store]
  );

  const focusWindow = useCallback(
    (windowId: string) => {
      const windowData = store.windows[windowId];
      if (windowData?.metadata?.['renderMode'] === 'native' && isElectron()) {
        void electronWindow.focusWindow(windowId).catch((error: unknown) => {
          console.error('[useAppWindowManager] native window focus failed:', error);
        });
      }
      store.focusWindow(windowId);
    },
    [electronWindow, store]
  );

  useEffect(() => {
    return electronWindow.subscribeToClosed((windowId) => {
      const current = useAppWindowStore.getState().windows[windowId];
      if (current) {
        useAppWindowStore.getState().closeWindow(windowId);
      }
    });
  }, [electronWindow]);

  const getWindow = useCallback(
    (windowId: string) => store.getWindow(windowId),
    [store]
  );

  const getOpenWindows = useCallback(
    () => store.getOpenWindows(),
    [store]
  );

  const isWindowOpen = useCallback(
    (windowId: string) => store.isWindowOpen(windowId),
    [store]
  );

  // 快捷方法：打开 React 组件窗口
  const openComponentWindow = useCallback(
    (
      id: string,
      title: string,
      component: React.ComponentType<any>,
      props?: Record<string, unknown>,
      options?: Partial<AppWindowConfig>
    ) => {
      return openWindow({
        id,
        type: 'app',
        title,
        content: { type: 'component', component, props },
        ...options,
      });
    },
    [openWindow]
  );

  // 快捷方法：打开 iframe 窗口
  const openIframeWindow = useCallback(
    (
      id: string,
      title: string,
      url: string,
      options?: Partial<AppWindowConfig>
    ) => {
      return openWindow({
        id,
        type: 'view',
        title,
        content: { type: 'iframe', url },
        ...options,
      });
    },
    [openWindow]
  );

  return {
    windows,
    windowOrder,
    focusedWindowId,
    openWindowCount,

    openWindow,
    closeWindow,
    closeAllWindows,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    focusWindow,

    getWindow,
    getOpenWindows,
    isWindowOpen,

    openComponentWindow,
    openIframeWindow,
  };
}

export default useAppWindowManager;
