# Story OS.9: 应用窗口系统

**Story 编号:** OS.9
**Story 名称:** 应用窗口系统
**优先级:** High
**状态:** Planning
**依赖:** OS.7 (Agent 托管服务), view-manager, view-reconciler, neural-channel
**估计工时:** 5-6 天

---

## 📋 Story 描述

### 用户故事

> 作为用户，我希望 OriginOS 能像原生操作系统一样管理应用窗口，支持打开、关闭、最小化、拖拽、调整大小和层级管理，并能通过 `view-reconciler` 直接渲染内置视图组件。

### 背景

OriginOS 已经实现了:
- OS.7 Agent 窗口管理 (专门针对 Agent 对话窗口)
- `view-manager` 模块 - 视图生命周期管理
- `view-reconciler` 模块 - 视图协调器 (支持 iframe, microapp, qiankun)
- `neural-channel` 模块 - 跨框架通信

现在需要一个通用的应用窗口系统，能够:
1. 管理任意类型的应用窗口 (不仅是 Agent)
2. 集成 `view-reconciler` 实现视图组件的直接渲染
3. 使用 `neural-channel` 实现窗口与框架的通信
4. 支持完整的窗口操作 (open/close/minimize/maximize/resize/drag/focus)

---

## 🎯 功能需求

### 核心功能

#### 1. 通用窗口管理 (AppWindowManager)

- [ ] 创建/销毁应用窗口
- [ ] 窗口层级管理 (zIndex)
- [ ] 窗口聚焦管理
- [ ] 窗口状态持久化

#### 2. 窗口操作

- [ ] 拖拽移动
- [ ] 调整大小
- [ ] 最小化/恢复
- [ ] 最大化/还原
- [ ] 关闭窗口
- [ ] 窗口聚焦

#### 3. 视图渲染集成

- [ ] 集成 `view-reconciler` 支持 iframe/microapp/qiankun
- [ ] 支持内置 React 组件视图
- [ ] 视图生命周期同步 (create/start/pause/resume/destroy)
- [ ] 视图状态管理

#### 4. 通信系统

- [ ] 集成 `neural-channel` 实现窗口间通信
- [ ] 窗口与主框架通信
- [ ] 窗口间消息广播
- [ ] 窗口间单播/组播

#### 5. 窗口装饰器

- [ ] 标题栏 (可拖拽)
- [ ] 窗口控制按钮 (关闭/最小化/最大化)
- [ ] 窗口图标
- [ ] Acrylic 材质窗口背景

---

## 🔧 技术需求

### 文件结构

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
│   ├── useAppWindow.ts            # 窗口操作 hook
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

### 类型定义

```typescript
// src/types/app-window.ts

export type AppWindowType = 'app' | 'agent' | 'settings' | 'view' | 'custom';

export type AppWindowState = 'normal' | 'minimized' | 'maximized';

export interface AppWindowPosition {
  x: number;
  y: number;
  width: number;
  height: number;
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
  keepInBounds: boolean;
}

export interface AppWindowConfig {
  id: string;
  type: AppWindowType;
  title: string;
  icon?: string;
  position: Partial<AppWindowPosition>;
  constraints?: Partial<AppWindowConstraints>;
  content: AppWindowContent;
  metadata?: Record<string, unknown>;
}

export interface AppWindowContent {
  type: 'component' | 'iframe' | 'microapp' | 'qiankun' | 'view';
  // React component for type: 'component'
  component?: React.ComponentType<any>;
  componentProps?: Record<string, unknown>;
  // URL for type: 'iframe'
  url?: string;
  // View options for type: 'view' | 'microapp' | 'qiankun'
  viewOptions?: ViewOptions;
}

export interface ViewOptions {
  id: string;
  code: string;
  title: string;
  url: string;
  context?: Record<string, unknown>;
  storagePath?: string;
  currentRouteName?: string;
  urlQuery?: string;
}

export interface AppWindowData {
  id: string;
  type: AppWindowType;
  title: string;
  icon?: string;
  state: AppWindowState;
  position: AppWindowPosition;
  constraints: AppWindowConstraints;
  content: AppWindowContent;
  zIndex: number;
  isFocused: boolean;
  createdAt: number;
  lastActivatedAt: number;
  metadata?: Record<string, unknown>;
}
```

---

## 📐 架构设计

### 层次结构

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

### 数据流

```
User Action (Click/Drag/Resize)
         │
         ▼
┌─────────────────────┐
│  AppWindow Component │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  useAppWindow Hook  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  appWindowStore     │◄───►│ ViewReconcilerAdapter│
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           ▼                           ▼
┌─────────────────────┐     ┌─────────────────────┐
│ AppWindowManager    │     │ view-reconciler     │
└─────────────────────┘     │ (IframeReconciler/  │
                            │  MicroAppReconciler)│
                            └─────────────────────┘
```

---

## 🔗 模块集成

### 1. view-manager 集成

```typescript
import ViewManager from '@neural-nexus/view-manager';

// 创建视图管理器
const viewManager = new ViewManager(10); // 最多10个页面

// 打开视图
const page = viewManager.openPage({
  id: 'app-settings',
  code: 'settings-app',
  title: 'Settings',
  url: 'iframe://settings',
  context: {},
  storagePath: '/settings',
  currentRouteName: 'settings',
  urlQuery: ''
});

// 页面生命周期
page.onCreate();   // 创建
page.onStart();    // 启动
page.onPause();    // 暂停
page.onResume();   // 恢复
page.onStop();     // 停止
page.onDestroy();  // 销毁
```

### 2. view-reconciler 集成

```typescript
import { IframeReconciler, MicroAppReconciler } from '@neural-nexus/view-reconciler';

// 创建 Reconciler
const reconciler = new IframeReconciler(page, context, iframeContentId);

// 生命周期调用
reconciler.create();   // 创建挂载点
reconciler.start();    // 显示视图
reconciler.pause();    // 暂停视图
reconciler.resume();   // 恢复视图
reconciler.destroy();  // 销毁视图
```

### 3. neural-channel 集成

```typescript
import { getManagerInstance } from '@neural-nexus/neural-channel';

const channelManager = getManagerInstance();
channelManager.setup();

// 监听窗口消息
channelManager.on('WINDOW_MESSAGE', (payload) => {
  // 处理窗口消息
});

// 广播消息
channelManager.broadcast('WINDOW_EVENT', { type: 'focus', windowId });

// 发送到特定窗口
channelManager.sendTo('WINDOW_COMMAND', { action: 'close' }, windowId);
```

---

## ✅ 验收标准

### 功能验收

- [ ] 可以打开多个应用窗口
- [ ] 窗口可拖拽移动
- [ ] 窗口可调整大小
- [ ] 窗口可最小化/最大化/还原
- [ ] 窗口关闭正确清理资源
- [ ] 窗口层级管理正确
- [ ] 聚焦管理正确
- [ ] iframe 视图正确渲染
- [ ] 内置组件视图正确渲染
- [ ] 窗口间通信正常

### 性能验收

- [ ] 窗口拖拽流畅 (60fps)
- [ ] 窗口调整大小流畅 (60fps)
- [ ] 多窗口 (5+) 无性能问题
- [ ] 内存无泄漏

### 兼容性验收

- [ ] 集成现有 Agent 窗口系统
- [ ] 复用现有 Acrylic 材质
- [ ] 复用现有 Fluent 动画

---

## 📅 实施计划

### Day 1-2: 基础架构

- [ ] 创建类型定义 `src/types/app-window.ts`
- [ ] 创建窗口 Store `src/store/appWindowStore.ts`
- [ ] 创建窗口管理服务 `src/services/AppWindowManager.ts`

### Day 3-4: 组件实现

- [ ] 实现 `AppWindow` 组件
- [ ] 实现 `WindowFrame` 组件
- [ ] 实现 `WindowTitleBar` 组件
- [ ] 实现 `WindowControls` 组件
- [ ] 实现 `WindowResizer` 组件

### Day 5: 视图集成

- [ ] 实现 `ViewReconcilerAdapter`
- [ ] 实现 `ViewRenderer` 组件
- [ ] 集成 `view-manager` 和 `view-reconciler`
- [ ] 集成 `neural-channel` 通信

### Day 6: 测试与优化

- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 文档完善

---

## 🔗 相关文档

- [view-manager README](../../../src/modules/view-manager/README.md)
- [view-reconciler README](../../../src/modules/view-reconciler/README.md)
- [neural-channel README](../../../src/modules/neural-channel/README.md)
- [Story OS.7 架构](../story-OS.7/architecture.md)
- [Epic OS README](../README.md)

---

## 📝 变更历史

| 日期 | 变更内容 | 变更人 |
|-----|---------|--------|
| 2026-03-13 | 创建 Story OS.9 | Developer |

---

**批准签名**:

- [ ] 产品经理 (PM)
- [ ] 系统架构师
- [ ] 开发负责人
