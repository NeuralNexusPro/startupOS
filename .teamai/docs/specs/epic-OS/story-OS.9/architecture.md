# Story OS.9: 应用窗口系统 - 架构设计文档

**版本**: v1.0
**日期**: 2026-03-13
**状态**: 架构设计
**Architect**: System Architect

---

## 1. 概述

### 1.1 设计目标

创建通用应用窗口系统，整合现有模块实现原生 OS 级别的窗口管理能力。

**核心能力:**
- **窗口生命周期管理**: 创建、启动、暂停、恢复、销毁
- **多渲染器支持**: React 组件、iframe、microapp、qiankun
- **窗口操作**: 拖拽、调整大小、最小化、最大化、关闭
- **层级管理**: zIndex 管理、窗口聚焦
- **跨框架通信**: 基于 neural-channel 的窗口间通信

### 1.2 模块集成

```
┌─────────────────────────────────────────────────────────────┐
│                    AppWindowManager                          │
│  (统一窗口管理 API)                                          │
├─────────────────────────────────────────────────────────────┤
│                    ViewReconcilerAdapter                     │
│  (渲染器适配层)                                              │
├──────────────────┬──────────────────┬───────────────────────┤
│   view-manager   │  view-reconciler │   neural-channel      │
│   (生命周期)      │   (渲染协调)     │   (通信)              │
└──────────────────┴──────────────────┴───────────────────────┘
```

---

## 2. 架构层次

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Layer (Components)                     │
│  AppWindow, WindowFrame, WindowTitleBar, ViewRenderer       │
├─────────────────────────────────────────────────────────────┤
│                    Hook Layer                                │
│  useAppWindow, useAppWindowManager, useViewReconciler       │
├─────────────────────────────────────────────────────────────┤
│                    Store Layer                               │
│  appWindowStore, viewCacheStore                             │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer                             │
│  AppWindowManager, ViewReconcilerAdapter                    │
├─────────────────────────────────────────────────────────────┤
│                    Module Layer                              │
│  view-manager, view-reconciler, neural-channel              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 文件结构

```
src/
├── types/
│   └── app-window.ts              # 应用窗口类型定义
│
├── store/
│   └── appWindowStore.ts          # 窗口状态管理
│
├── services/
│   ├── AppWindowManager.ts        # 窗口管理服务
│   └── ViewReconcilerAdapter.ts   # view-reconciler 适配器
│
├── hooks/
│   ├── useAppWindow.ts            # 单窗口操作 hook
│   ├── useAppWindowManager.ts     # 窗口管理 hook
│   └── useViewReconciler.ts       # 视图协调 hook
│
├── components/
│   └── os/
│       └── window/
│           ├── AppWindow.tsx      # 通用窗口组件
│           ├── WindowFrame.tsx    # 窗口框架
│           ├── WindowTitleBar.tsx # 标题栏
│           ├── WindowControls.tsx # 窗口控制按钮
│           ├── WindowResizer.tsx  # 调整大小手柄
│           ├── ViewRenderer.tsx   # 视图渲染器
│           └── index.ts           # 导出
│
└── lib/
    └── window/
        ├── constants.ts           # 窗口常量
        ├── utils.ts               # 窗口工具函数
        └── constraints.ts         # 窗口约束
```

---

## 3. 类型定义

### 3.1 核心类型

**文件:** `src/types/app-window.ts`

```typescript
/**
 * OS.9: 应用窗口系统类型定义
 */

// ============ 窗口类型 ============

export type AppWindowType =
  | 'app'       // 通用应用
  | 'agent'     // Agent 对话窗口
  | 'settings'  // 设置窗口
  | 'view'      // 视图窗口 (iframe/microapp)
  | 'custom';   // 自定义窗口

export type AppWindowState =
  | 'normal'    // 正常状态
  | 'minimized' // 最小化
  | 'maximized' // 最大化
  | 'fullscreen'; // 全屏

// ============ 窗口位置与尺寸 ============

export interface AppWindowPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface AppWindowConstraints {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  allowResize: boolean;
  allowDrag: boolean;
  allowMinimize: boolean;
  allowMaximize: boolean;
  allowFullscreen: boolean;
  keepInBounds: boolean;
}

// ============ 窗口内容类型 ============

export type ContentRendererType =
  | 'component'   // React 组件
  | 'iframe'      // iframe 嵌入
  | 'microapp'    // microapp 微前端
  | 'qiankun'     // qiankun 微前端
  | 'view';       // 通用视图 (使用 view-reconciler)

export interface ComponentContent {
  type: 'component';
  component: React.ComponentType<any>;
  props?: Record<string, unknown>;
}

export interface IframeContent {
  type: 'iframe';
  url: string;
  sandbox?: string;
}

export interface MicroAppContent {
  type: 'microapp';
  url: string;
  name: string;
  props?: Record<string, unknown>;
}

export interface QiankunContent {
  type: 'qiankun';
  url: string;
  name: string;
  props?: Record<string, unknown>;
}

export interface ViewContent {
  type: 'view';
  viewId: string;
  viewCode: string;
  title: string;
  url: string;
  context?: Record<string, unknown>;
  storagePath?: string;
  currentRouteName?: string;
  urlQuery?: string;
}

export type AppWindowContent =
  | ComponentContent
  | IframeContent
  | MicroAppContent
  | QiankunContent
  | ViewContent;

// ============ 窗口配置 ============

export interface AppWindowConfig {
  id: string;
  type: AppWindowType;
  title: string;
  icon?: string;
  position?: Partial<AppWindowPosition>;
  constraints?: Partial<AppWindowConstraints>;
  content: AppWindowContent;
  metadata?: Record<string, unknown>;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onFocus?: () => void;
}

// ============ 窗口数据 ============

export interface AppWindowData {
  id: string;
  type: AppWindowType;
  title: string;
  icon?: string;
  state: AppWindowState;
  position: AppWindowPosition;
  constraints: AppWindowConstraints;
  content: AppWindowContent;
  isFocused: boolean;
  isDragging: boolean;
  isResizing: boolean;
  createdAt: number;
  lastActivatedAt: number;
  metadata?: Record<string, unknown>;
}

// ============ 窗口 Store 状态 ============

export interface AppWindowStoreState {
  windows: Record<string, AppWindowData>;
  windowOrder: string[]; // 窗口 ID 顺序 (用于 zIndex)
  focusedWindowId: string | null;
  maxZIndex: number;

  // Actions
  openWindow: (config: AppWindowConfig) => string;
  closeWindow: (windowId: string) => void;
  closeAllWindows: () => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  restoreWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  updateWindowPosition: (windowId: string, position: Partial<AppWindowPosition>) => void;
  setDragging: (windowId: string, isDragging: boolean) => void;
  setResizing: (windowId: string, isResizing: boolean) => void;
  getWindow: (windowId: string) => AppWindowData | undefined;
  getOpenWindows: () => AppWindowData[];
  isWindowOpen: (windowId: string) => boolean;
}

// ============ 默认值 ============

export const DEFAULT_WINDOW_CONSTRAINTS: AppWindowConstraints = {
  minWidth: 400,
  minHeight: 300,
  maxWidth: 1920,
  maxHeight: 1080,
  allowResize: true,
  allowDrag: true,
  allowMinimize: true,
  allowMaximize: true,
  allowFullscreen: false,
  keepInBounds: true,
};

export const DEFAULT_WINDOW_POSITION: Partial<AppWindowPosition> = {
  width: 800,
  height: 600,
  zIndex: 100,
};

export const WINDOW_ZINDEX_BASE = 100;
export const WINDOW_ZINDEX_STEP = 10;
```

---

## 4. Store 层设计

### 4.1 AppWindowStore

**文件:** `src/store/appWindowStore.ts`

```typescript
/**
 * OS.9: 应用窗口状态管理
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  AppWindowConfig,
  AppWindowData,
  AppWindowState,
  AppWindowPosition,
  DEFAULT_WINDOW_CONSTRAINTS,
  DEFAULT_WINDOW_POSITION,
  WINDOW_ZINDEX_BASE,
  WINDOW_ZINDEX_STEP,
} from '@/types/app-window';

const generateId = () => `window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const getCenteredPosition = (width: number, height: number): { x: number; y: number } => {
  return {
    x: Math.max(0, (window.innerWidth - width) / 2),
    y: Math.max(0, (window.innerHeight - height) / 2),
  };
};

export const useAppWindowStore = create<AppWindowStoreState>()(
  subscribeWithSelector((set, get) => ({
    windows: {},
    windowOrder: [],
    focusedWindowId: null,
    maxZIndex: WINDOW_ZINDEX_BASE,

    openWindow: (config: AppWindowConfig) => {
      const id = config.id || generateId();
      const width = config.position?.width ?? DEFAULT_WINDOW_POSITION.width!;
      const height = config.position?.height ?? DEFAULT_WINDOW_POSITION.height!;
      const centered = getCenteredPosition(width, height);

      const windowData: AppWindowData = {
        id,
        type: config.type,
        title: config.title,
        icon: config.icon,
        state: 'normal',
        position: {
          x: config.position?.x ?? centered.x,
          y: config.position?.y ?? centered.y,
          width,
          height,
          zIndex: get().maxZIndex + WINDOW_ZINDEX_STEP,
        },
        constraints: { ...DEFAULT_WINDOW_CONSTRAINTS, ...config.constraints },
        content: config.content,
        isFocused: true,
        isDragging: false,
        isResizing: false,
        createdAt: Date.now(),
        lastActivatedAt: Date.now(),
        metadata: config.metadata,
      };

      set((state) => {
        // 取消其他窗口聚焦
        const updatedWindows = Object.fromEntries(
          Object.entries(state.windows).map(([wid, w]) => [
            wid,
            { ...w, isFocused: false },
          ])
        );

        return {
          windows: { ...updatedWindows, [id]: windowData },
          windowOrder: [...state.windowOrder, id],
          focusedWindowId: id,
          maxZIndex: state.maxZIndex + WINDOW_ZINDEX_STEP,
        };
      });

      return id;
    },

    closeWindow: (windowId: string) => {
      set((state) => {
        const { [windowId]: closed, ...remaining } = state.windows;
        const newOrder = state.windowOrder.filter((id) => id !== windowId);

        // 找到最上层窗口作为新的聚焦窗口
        const newFocusedId = newOrder.length > 0
          ? newOrder[newOrder.length - 1]
          : null;

        return {
          windows: remaining,
          windowOrder: newOrder,
          focusedWindowId: newFocusedId,
        };
      });
    },

    closeAllWindows: () => {
      set(() => ({
        windows: {},
        windowOrder: [],
        focusedWindowId: null,
        maxZIndex: WINDOW_ZINDEX_BASE,
      }));
    },

    minimizeWindow: (windowId: string) => {
      set((state) => {
        const window = state.windows[windowId];
        if (!window) return state;

        return {
          windows: {
            ...state.windows,
            [windowId]: { ...window, state: 'minimized' as AppWindowState, isFocused: false },
          },
          focusedWindowId: state.focusedWindowId === windowId ? null : state.focusedWindowId,
        };
      });
    },

    maximizeWindow: (windowId: string) => {
      set((state) => {
        const window = state.windows[windowId];
        if (!window) return state;

        const isMaximized = window.state === 'maximized';

        return {
          windows: {
            ...state.windows,
            [windowId]: {
              ...window,
              state: isMaximized ? 'normal' as AppWindowState : 'maximized' as AppWindowState,
              // 如果还原，保存之前的位置
              ...(isMaximized && {
                position: {
                  ...window.position,
                  // 恢复到之前的位置或居中
                  x: Math.max(0, (window.innerWidth - 800) / 2),
                  y: Math.max(0, (window.innerHeight - 600) / 2),
                  width: 800,
                  height: 600,
                },
              }),
              // 如果最大化，设置为屏幕大小
              ...(!isMaximized && {
                position: {
                  x: 0,
                  y: 0,
                  width: window.innerWidth,
                  height: window.innerHeight,
                  zIndex: window.position.zIndex,
                },
              }),
            },
          },
        };
      });
    },

    restoreWindow: (windowId: string) => {
      set((state) => {
        const window = state.windows[windowId];
        if (!window) return state;

        return {
          windows: {
            ...state.windows,
            [windowId]: { ...window, state: 'normal' as AppWindowState },
          },
        };
      });
    },

    focusWindow: (windowId: string) => {
      set((state) => {
        const window = state.windows[windowId];
        if (!window) return state;

        // 取消所有窗口聚焦
        const updatedWindows = Object.fromEntries(
          Object.entries(state.windows).map(([wid, w]) => [
            wid,
            wid === windowId
              ? { ...w, isFocused: true, state: w.state === 'minimized' ? 'normal' as AppWindowState : w.state, zIndex: state.maxZIndex + WINDOW_ZINDEX_STEP }
              : { ...w, isFocused: false },
          ])
        );

        return {
          windows: updatedWindows,
          focusedWindowId: windowId,
          maxZIndex: state.maxZIndex + WINDOW_ZINDEX_STEP,
        };
      });
    },

    updateWindowPosition: (windowId: string, position: Partial<AppWindowPosition>) => {
      set((state) => {
        const window = state.windows[windowId];
        if (!window) return state;

        // 约束检查
        const constrainedPosition = { ...window.position, ...position };
        if (window.constraints.keepInBounds) {
          constrainedPosition.x = Math.max(0, Math.min(constrainedPosition.x, window.innerWidth - 100));
          constrainedPosition.y = Math.max(0, Math.min(constrainedPosition.y, window.innerHeight - 100));
        }
        if (position.width !== undefined) {
          constrainedPosition.width = Math.max(window.constraints.minWidth, Math.min(position.width, window.constraints.maxWidth));
        }
        if (position.height !== undefined) {
          constrainedPosition.height = Math.max(window.constraints.minHeight, Math.min(position.height, window.constraints.maxHeight));
        }

        return {
          windows: {
            ...state.windows,
            [windowId]: { ...window, position: constrainedPosition },
          },
        };
      });
    },

    setDragging: (windowId: string, isDragging: boolean) => {
      set((state) => {
        const window = state.windows[windowId];
        if (!window) return state;

        return {
          windows: {
            ...state.windows,
            [windowId]: { ...window, isDragging },
          },
        };
      });
    },

    setResizing: (windowId: string, isResizing: boolean) => {
      set((state) => {
        const window = state.windows[windowId];
        if (!window) return state;

        return {
          windows: {
            ...state.windows,
            [windowId]: { ...window, isResizing },
          },
        };
      });
    },

    getWindow: (windowId: string) => get().windows[windowId],

    getOpenWindows: () =>
      Object.values(get().windows).filter(
        (w) => w.state !== 'minimized'
      ).sort((a, b) => a.position.zIndex - b.position.zIndex),

    isWindowOpen: (windowId: string) => !!get().windows[windowId],
  }))
);
```

---

## 5. Service 层设计

### 5.1 AppWindowManager

**文件:** `src/services/AppWindowManager.ts`

```typescript
/**
 * OS.9: 应用窗口管理服务
 */

import { AppWindowConfig, AppWindowData, AppWindowContent } from '@/types/app-window';
import { useAppWindowStore } from '@/store/appWindowStore';

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
   * 打开窗口
   */
  openWindow(config: AppWindowConfig): string {
    const store = useAppWindowStore.getState();
    return store.openWindow(config);
  }

  /**
   * 关闭窗口
   */
  closeWindow(windowId: string): void {
    const store = useAppWindowStore.getState();
    store.closeWindow(windowId);
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
      content: { type: 'component', component, props },
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
      content: { type: 'iframe', url },
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
```

### 5.2 ViewReconcilerAdapter

**文件:** `src/services/ViewReconcilerAdapter.ts`

```typescript
/**
 * OS.9: ViewReconciler 适配器
 * 整合 view-manager, view-reconciler, neural-channel
 */

import ViewManager from '@neural-nexus/view-manager';
import { IframeReconciler, MicroAppReconciler, QiankunReconciler, Reconciler } from '@neural-nexus/view-reconciler';
import { getManagerInstance, Manager } from '@neural-nexus/neural-channel';
import { ViewContent, AppWindowContent } from '@/types/app-window';

export interface ViewReconcilerOptions {
  windowId: string;
  content: AppWindowContent;
  containerId: string;
  context?: Record<string, unknown>;
}

export class ViewReconcilerAdapter {
  private viewManager: ViewManager | null = null;
  private channelManager: Manager;
  private reconcilers: Map<string, Reconciler> = new Map();

  constructor() {
    this.channelManager = getManagerInstance();
    this.viewManager = new ViewManager(10); // 最多 10 个页面
  }

  /**
   * 创建视图
   */
  createView(options: ViewReconcilerOptions): string {
    const { windowId, content, containerId, context = {} } = options;

    if (content.type !== 'view' && content.type !== 'iframe' && content.type !== 'microapp' && content.type !== 'qiankun') {
      throw new Error(`Unsupported content type: ${content.type}`);
    }

    const viewContent = content as ViewContent;
    const viewId = viewContent.viewId || windowId;

    // 创建视图
    const page = this.viewManager?.openPage({
      id: viewId,
      code: viewContent.viewCode || `view-${viewId}`,
      title: viewContent.title,
      url: viewContent.url,
      context: { ...context, ...viewContent.context },
      storagePath: viewContent.storagePath || '',
      iframeContentId: containerId,
      currentRouteName: viewContent.currentRouteName || '',
      urlQuery: viewContent.urlQuery || '',
    });

    // 根据类型创建对应的 Reconciler
    const reconciler = this.createReconciler(viewContent, containerId, context);
    if (reconciler) {
      this.reconcilers.set(viewId, reconciler);
      reconciler.create();
      reconciler.start();
    }

    return viewId;
  }

  /**
   * 创建对应类型的 Reconciler
   */
  private createReconciler(
    content: ViewContent,
    containerId: string,
    context: Record<string, unknown>
  ): Reconciler | null {
    const pageData = {
      data: {
        id: content.viewId,
        title: content.title,
        url: content.url,
        code: content.viewCode || `view-${content.viewId}`,
        context,
        currentRouteName: content.currentRouteName || '',
        storagePath: content.storagePath || '',
        urlQuery: content.urlQuery || '',
      },
      code: content.viewCode || `view-${content.viewId}`,
    } as any;

    switch (content.type) {
      case 'iframe':
        return new IframeReconciler(pageData, context, containerId);
      case 'microapp':
        return new MicroAppReconciler(pageData, context, containerId);
      case 'qiankun':
        return new QiankunReconciler(pageData, context, containerId);
      default:
        return new IframeReconciler(pageData, context, containerId);
    }
  }

  /**
   * 暂停视图
   */
  pauseView(viewId: string): void {
    const reconciler = this.reconcilers.get(viewId);
    if (reconciler) {
      reconciler.pause();
    }
  }

  /**
   * 恢复视图
   */
  resumeView(viewId: string, isActive: boolean = true): void {
    const reconciler = this.reconcilers.get(viewId);
    if (reconciler) {
      reconciler.resume(isActive, true);
    }
  }

  /**
   * 销毁视图
   */
  destroyView(viewId: string): void {
    const reconciler = this.reconcilers.get(viewId);
    if (reconciler) {
      reconciler.destroy();
      this.reconcilers.delete(viewId);
    }
    this.viewManager?.closePage(viewId);
  }

  /**
   * 刷新视图
   */
  refreshView(viewId: string): void {
    const reconciler = this.reconcilers.get(viewId);
    if (reconciler) {
      reconciler.refresh(true);
    }
  }

  /**
   * 发送消息到视图
   */
  sendToView(viewId: string, type: string, payload: any): void {
    this.channelManager.sendTo(type, payload, viewId);
  }

  /**
   * 广播消息
   */
  broadcast(type: string, payload: any): void {
    this.channelManager.broadcast(type, payload);
  }

  /**
   * 监听消息
   */
  onMessage(type: string, callback: (payload: any) => void): void {
    this.channelManager.on(type, callback);
  }

  /**
   * 移除监听
   */
  offMessage(type: string): void {
    this.channelManager.remove(type);
  }

  /**
   * 销毁所有视图
   */
  destroyAll(): void {
    this.reconcilers.forEach((reconciler, viewId) => {
      reconciler.destroy();
    });
    this.reconcilers.clear();
    this.viewManager?.closeAllpage();
  }
}

export const viewReconcilerAdapter = new ViewReconcilerAdapter();
```

---

## 6. Hook 层设计

### 6.1 useAppWindow Hook

**文件:** `src/hooks/useAppWindow.ts`

```typescript
/**
 * OS.9: 单窗口操作 Hook
 */

import { useMemo, useCallback } from 'react';
import { useAppWindowStore } from '@/store/appWindowStore';
import { AppWindowData, AppWindowPosition, AppWindowState } from '@/types/app-window';

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
    store.closeWindow(windowId);
  }, [store, windowId]);

  const minimize = useCallback(() => {
    store.minimizeWindow(windowId);
  }, [store, windowId]);

  const maximize = useCallback(() => {
    store.maximizeWindow(windowId);
  }, [store, windowId]);

  const restore = useCallback(() => {
    store.restoreWindow(windowId);
  }, [store, windowId]);

  const focus = useCallback(() => {
    store.focusWindow(windowId);
  }, [store, windowId]);

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
```

---

## 7. 组件层设计

### 7.1 AppWindow 组件

**文件:** `src/components/os/window/AppWindow.tsx`

```typescript
/**
 * OS.9: 通用窗口组件
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { AcrylicPanel } from '@/components/os/acrylic';
import { useAppWindow } from '@/hooks/useAppWindow';
import { AppWindowConfig, DEFAULT_WINDOW_CONSTRAINTS } from '@/types/app-window';
import { WindowTitleBar } from './WindowTitleBar';
import { WindowResizer } from './WindowResizer';
import { ViewRenderer } from './ViewRenderer';

export interface AppWindowProps {
  windowId: string;
  config: AppWindowConfig;
  children?: React.ReactNode;
}

export function AppWindow({ windowId, config, children }: AppWindowProps) {
  const {
    window,
    isOpen,
    isFocused,
    isMinimized,
    isMaximized,
    isDragging,
    position,
    close,
    minimize,
    maximize,
    focus,
    setPosition,
    setDragging,
    setResizing,
  } = useAppWindow({ windowId });

  const windowRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // 聚焦窗口
  const handleFocus = useCallback(() => {
    if (!isFocused) {
      focus();
    }
  }, [isFocused, focus]);

  // 关闭窗口
  const handleClose = useCallback(() => {
    config.onClose?.();
    close();
  }, [config, close]);

  // 拖拽开始
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMaximized) return;
      if ((e.target as HTMLElement).closest('[data-no-drag]')) return;

      setDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [isMaximized, position, setDragging]
  );

  // 拖拽中
  useEffect(() => {
    if (!isDragging || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const handleMouseUp = () => {
      setDragging(false);
      setDragStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, setPosition, setDragging]);

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocused) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, handleClose]);

  if (!isOpen || !window || isMinimized) return null;

  const constraints = { ...DEFAULT_WINDOW_CONSTRAINTS, ...config.constraints };

  const windowElement = (
    <div
      ref={windowRef}
      className="fixed outline-none"
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        zIndex: position.zIndex,
      }}
      tabIndex={-1}
      onClick={handleFocus}
      onMouseDown={handleFocus}
    >
      <AcrylicPanel
        variant="standard"
        className={`h-full flex flex-col rounded-lg overflow-hidden shadow-2xl ${
          isFocused ? 'ring-2 ring-blue-500/50' : ''
        }`}
      >
        <WindowTitleBar
          title={window.title}
          icon={window.icon}
          isFocused={isFocused}
          isMaximized={isMaximized}
          constraints={constraints}
          onClose={handleClose}
          onMinimize={minimize}
          onMaximize={maximize}
          onDragStart={handleDragStart}
        />

        <div className="flex-1 overflow-hidden bg-white/80 dark:bg-gray-900/80">
          {children || <ViewRenderer content={config.content} windowId={windowId} />}
        </div>

        {constraints.allowResize && !isMaximized && (
          <WindowResizer
            windowId={windowId}
            position={position}
            constraints={constraints}
            onResize={setPosition}
            onResizeStart={() => setResizing(true)}
            onResizeEnd={() => setResizing(false)}
          />
        )}
      </AcrylicPanel>
    </div>
  );

  return createPortal(windowElement, document.body);
}
```

---

## 8. 数据流

```
┌──────────────────────────────────────────────────────────────┐
│                        User Interaction                       │
│                 (Click, Drag, Resize, Keyboard)              │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    AppWindow Component                        │
│  (WindowFrame, TitleBar, Controls, ViewRenderer)            │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    useAppWindow Hook                          │
│  (状态访问, 操作方法)                                         │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    appWindowStore                             │
│  (Zustand 状态管理)                                           │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    AppWindowManager                           │
│  (服务层 API)                                                 │
└─────────────────────────┬────────────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│view-manager  │ │view-reconciler│ │neural-channel│
│(生命周期)     │ │(渲染协调)     │ │(通信)        │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 9. 与现有系统集成

### 9.1 与 OS.7 Agent 窗口集成

```typescript
// Agent 窗口可以使用通用窗口系统
import { appWindowManager } from '@/services/AppWindowManager';
import { AgentDialog } from '@/components/os/agent-host/AgentDialog';

// 打开 Agent 窗口
appWindowManager.openComponentWindow(
  'agent-developer',
  'Developer Agent',
  AgentDialog,
  { agentId: 'agent-1' },
  { type: 'agent', constraints: { allowMaximize: false } }
);
```

### 9.2 与 Acrylic 材质集成

```typescript
// 窗口使用 Acrylic 材质
import { AcrylicPanel } from '@/components/os/acrylic';

<AcrylicPanel variant="standard" className="h-full flex flex-col">
  {/* 窗口内容 */}
</AcrylicPanel>
```

### 9.3 与 Fluent 动画集成

```typescript
// 窗口使用 Fluent 动画
import { useTransition } from '@/hooks/useTransition';

const { state, enter, exit } = useTransition(false, {
  duration: 'normal',
  easing: 'decelerate',
});
```

---

## 10. 性能优化

### 10.1 窗口渲染优化

- 使用 React.memo 避免不必要的重渲染
- 使用 Zustand 选择器避免全局订阅
- 使用 will-change 优化动画性能

### 10.2 视图缓存

- 缓存视图状态，避免重复加载
- 使用 view-manager 的页面缓存能力
- 暂停不可见视图的渲染

### 10.3 通信优化

- 使用 MessageChannel 实现高效通信
- 避免频繁的消息广播
- 使用消息缓冲队列

---

## 11. 实施计划

### Phase 1: 基础架构 (Day 1-2)

- [ ] 创建类型定义 `src/types/app-window.ts`
- [ ] 创建状态管理 `src/store/appWindowStore.ts`
- [ ] 创建窗口服务 `src/services/AppWindowManager.ts`

### Phase 2: 组件实现 (Day 3-4)

- [ ] 实现 `AppWindow` 组件
- [ ] 实现 `WindowTitleBar` 组件
- [ ] 实现 `WindowControls` 组件
- [ ] 实现 `WindowResizer` 组件

### Phase 3: 视图集成 (Day 5)

- [ ] 实现 `ViewReconcilerAdapter`
- [ ] 实现 `ViewRenderer` 组件
- [ ] 集成 `view-manager` 和 `view-reconciler`
- [ ] 集成 `neural-channel` 通信

### Phase 4: 测试与优化 (Day 6)

- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 文档完善

---

## 12. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-13 | v1.0 | 初始架构设计 | Architect |

---

**批准签名**:

- [ ] 产品经理 (PM)
- [x] 系统架构师
- [ ] 开发负责人
