/**
 * OS.9: 窗口管理服务
 */

import { AppWindowConfig, AppWindowData, ComponentContent, IframeContent } from '@originos/core/types';
import { useAppWindowStore } from '@/store/appWindowStore';
import { createNativeWindow, focusNativeWindow } from '@originos/core/lib/integrations/electron/window';
import { isElectron, getIpcRenderer } from '@originos/core/lib/integrations/electron/env';
import { destroyAgentSession, consolidateMemory } from '@originos/core/lib/integrations/electron/services/agent-session';
import useDockStore from '@/store/dockStore';
import { IPC_CHANNELS } from '@originos/core/lib/integrations/electron/ipc-protocol';
import type { DockApp } from '@originos/core/types';

const MEMORY_ENTRY_TYPES = new Set(['role-agent', 'agent', 'project', 'solution', 'skill']);

export class AppWindowManager {
  private static instance: AppWindowManager | null = null;

  private constructor() {}

  static getInstance(): AppWindowManager {
    if (!AppWindowManager.instance) {
      AppWindowManager.instance = new AppWindowManager();
    }
    return AppWindowManager.instance;
  }

  /**
   * 打开窗口，自动对 agent/project/solution 窗体注入 agent 销毁回调 + memory consolidation
   */
  openWindow(config: AppWindowConfig): string {
    const store = useAppWindowStore.getState();
    const metadata = config.metadata;
    console.log('[AppWindowManager] openWindow:', { id: config.id, metadata, hasOnClose: !!config.onClose });
    if (metadata) {
      const entryType = metadata['entryType'] as string | undefined;
      const entryId = metadata['entryId'] as string | undefined;
      const sessionId = metadata['sessionId'] as string | undefined;
      const projectId = metadata['projectId'] as string | undefined;
      if (entryType && entryId && MEMORY_ENTRY_TYPES.has(entryType)) {
        const originalOnClose = config.onClose;
        console.log('[AppWindowManager] injecting agent destroy + memory consolidation for', entryType, entryId);
        config = {
          ...config,
          onClose: () => {
            originalOnClose?.();
            // Agent destruction — use projectId for runtime mode where agent is keyed by UUID, not stable sessionId
            destroyAgentSession({ sessionId, projectId }).catch((err) => console.error('[AppWindowManager] agent destroy failed:', err));
            // Memory consolidation (fire-and-forget)
            consolidateMemory(entryType, entryId).catch((err) => console.error('[AppWindowManager] memory consolidation failed:', err));
          },
        };
      }
    }

    if (config.content.type === 'component' && typeof window !== 'undefined' && isElectron()) {
      const windowId = config.id ?? `native-${Date.now()}`;
      const entryType = metadata?.['entryType'] as string | undefined;
      const props = (config.content as ComponentContent).props ?? {};

      // Derive windowType from entryType and window id pattern
      let windowType: string;
      if (entryType === 'skill') {
        windowType = 'skill';
      } else if (windowId.includes('interview')) {
        windowType = 'interview';
      } else if (entryType === 'role-agent' || entryType === 'agent') {
        windowType = entryType;
      } else if (entryType === 'collaboration') {
        windowType = 'collaboration';
      } else if (entryType === 'solution') {
        windowType = 'solution';
      } else if (entryType === 'project-workspace') {
        windowType = 'project-workspace';
      } else if (entryType === 'sandbox') {
        windowType = 'sandbox';
      } else if (entryType === 'sense-center') {
        windowType = 'sense-center';
      } else {
        windowType = 'workspace';
      }

      // Serialize only primitive props (skip functions and React components)
      const query: Record<string, string> = { windowType, title: config.title };
      for (const [k, v] of Object.entries(props)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          query[k] = String(v);
        }
      }
      // Inject entryType/entryId/sessionId/projectId from metadata
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
        console.error('[AppWindowManager] native window creation failed:', error);
      });

      // 同步 dock 图标并广播给 dock 窗口
      this.syncWindowToDock(windowId, config.title, config);

      // Track in store with native renderMode so focusWindow works
      return store.openWindow({
        ...config,
        id: windowId,
        metadata: { ...metadata, renderMode: 'native' },
      });
    }

    return store.openWindow(config);
  }

  /**
   * 关闭窗口
   */
  closeWindow(windowId: string): void {
    useAppWindowStore.getState().closeWindow(windowId);
    if (isElectron()) {
      const dock = useDockStore.getState();
      const app = dock.apps.find(a => a.id === windowId);
      if (app && !app.isPinned) {
        dock.removeApp(windowId);
      } else if (app) {
        dock.updateApp(windowId, { isRunning: false });
      }
      this.broadcastDockApps();
    }
  }

  /**
   * 把窗体图标同步到 dockStore 并广播给 dock 窗口
   */
  private syncWindowToDock(windowId: string, title: string, config: AppWindowConfig): void {
    if (!isElectron()) return;
    const dock = useDockStore.getState();
    const existing = dock.apps.find(a => a.id === windowId);
    const icon = (config.content as ComponentContent).props?.['icon'] as string | undefined;
    if (existing) {
      dock.updateApp(windowId, { isRunning: true });
    } else {
      const newApp: DockApp = {
        id: windowId,
        name: title,
        icon: icon || '📄',
        iconType: 'emoji',
        isRunning: true,
        isMinimized: false,
        isPinned: false,
        index: dock.apps.length,
      };
      dock.addApp(newApp);
    }
    this.broadcastDockApps();
  }

  /**
   * 广播 dockStore.apps 给 dock 窗口
   */
  private broadcastDockApps(): void {
    if (!isElectron()) return;
    try {
      const apps = useDockStore.getState().apps;
      getIpcRenderer().send(IPC_CHANNELS.DOCK_SYNC_APPS, apps);
    } catch (e) {
      console.error('[AppWindowManager] dock broadcast failed:', e);
    }
  }

  /**
   * 关闭所有窗口
   */
  closeAllWindows(): void {
    useAppWindowStore.getState().closeAllWindows();
  }

  /**
   * 最小化窗口
   */
  minimizeWindow(windowId: string): void {
    useAppWindowStore.getState().minimizeWindow(windowId);
  }

  /**
   * 最大化窗口
   */
  maximizeWindow(windowId: string): void {
    useAppWindowStore.getState().maximizeWindow(windowId);
  }

  /**
   * 还原窗口
   */
  restoreWindow(windowId: string): void {
    useAppWindowStore.getState().restoreWindow(windowId);
  }

  /**
   * 聚焦窗口
   */
  focusWindow(windowId: string): void {
    const windowData = useAppWindowStore.getState().getWindow(windowId);
    if (windowData?.metadata?.['renderMode'] === 'native' && typeof window !== 'undefined' && isElectron()) {
      void focusNativeWindow(windowId).catch((error: unknown) => {
        console.error('[AppWindowManager] native window focus failed:', error);
      });
    }
    useAppWindowStore.getState().focusWindow(windowId);
  }

  /**
   * 获取窗口
   */
  getWindow(windowId: string): AppWindowData | undefined {
    return useAppWindowStore.getState().getWindow(windowId);
  }

  /**
   * 获取所有打开的窗口
   */
  getOpenWindows(): AppWindowData[] {
    return useAppWindowStore.getState().getOpenWindows();
  }

  /**
   * 检查窗口是否打开
   */
  isWindowOpen(windowId: string): boolean {
    return useAppWindowStore.getState().isWindowOpen(windowId);
  }

  /**
   * 打开 React 组件窗口
   */
  openComponentWindow(
    id: string,
    title: string,
    component: React.ComponentType<any>,
    props?: Record<string, unknown>,
    options?: Partial<AppWindowConfig>
  ): string {
    return this.openWindow({
      id,
      type: 'app',
      title,
      content: { type: 'component', component, props } as ComponentContent,
      ...options,
    });
  }

  /**
   * 打开 iframe 窗口
   */
  openIframeWindow(
    id: string,
    title: string,
    url: string,
    options?: Partial<AppWindowConfig>
  ): string {
    return this.openWindow({
      id,
      type: 'view',
      title,
      content: { type: 'iframe', url } as IframeContent,
      ...options,
    });
  }

  /**
   * 打开微前端窗口
   */
  openMicroAppWindow(
    id: string,
    title: string,
    url: string,
    name: string,
    options?: Partial<AppWindowConfig>
  ): string {
    return this.openWindow({
      id,
      type: 'view',
      title,
      content: { type: 'microapp', url, name },
      ...options,
    });
  }
}

export const appWindowManager = AppWindowManager.getInstance();
