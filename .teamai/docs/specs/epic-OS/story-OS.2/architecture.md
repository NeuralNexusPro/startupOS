# Story OS.2: Dock 任务栏基础 - 架构设计文档 (ADD)

**版本:** v2.0
**日期:** 2026-03-07
**状态:** 规划中
**批准状态:** 待批准

---

## 1. 架构概述

### 1.1 设计目标

创建可扩展、可维护的 Dock 任务栏框架，与 OS.1 保持一致的技术栈和设计规范：
- 复用 OS.1 Zustand store 的设计模式
- 集成 OS.1 的拖拽库和动画规范
- 为 OS.3 Agent 预留扩展接口
- 组件层次清晰，职责单一

### 1.2 架构原则

| 原则 | 实施 |
|-----|------|
| **关注点分离** | 组件、状态、逻辑分离 |
| **单一职责** | 每个 hook 职责单一 |
| **可复用性** | hooks 可跨组件复用 |
| **可测试性** | 便于单元测试和集成测试 |
| **性能优先** | 优化渲染，避免不必要重绘 |
| **与 OS.1 一致** | 技术栈、设计模式保持一致 |

### 1.3 技术栈

| 类别 | 选择 | 说明 |
|-----|------|------|
| **状态管理** | Zustand | 轻量级，与 OS.1 一致 |
| **拖拽库** | dnd-kit | 现代，与 OS.1 一致 |
| **动画** | CSS Transitions | 轻量，60fps 稳定 |
| **样式** | Tailwind CSS | 工具类，快速开发 |
| **类型检查** | TypeScript | 类型安全 |

---

## 2. 组件架构

### 2.1 组件层次结构

```
Dock
├── DockContainer         # Dock 容器（Glassmorphism 背景）
└── DockIcon[]            # 应用图标列表
    ├── Icon              # 图标表情/图片
    ├── Tooltip           # 工具提示
    ├── Indicator         # 运行指示灯
    └── ContextMenu       # 右键菜单
        └── MenuItem[]
```

### 2.2 组件职责

| 组件 | 职责 | Props |
|-----|------|-------|
| **Dock** | 容器，管理 dock 全局状态 | `apps`, `onAppClick` |
| **DockContainer** | Dock 背景容器（Glassmorphism） | 无 |
| **DockIcon** | 单个应用图标 | `app`, `isRunning`, `onRightClick` |
| **Tooltip** | 工具提示 | `text`, `visible` |
| **Indicator** | 运行指示灯 | `isRunning` |
| **ContextMenu** | 右键菜单 | `position`, `items`, `isOpen`, `onClose` |

### 2.3 组件定义

```typescript
// components/os/Dock.tsx
interface DockProps {
  apps?: DockApp[];
  onAppClick?: (appId: string) => void;
}

interface DockApp {
  id: string;
  name: string;
  icon: string;
  iconType?: 'emoji' | 'image' | 'component';
  iconUrl?: string;
  isRunning: boolean;
  isPinned: boolean;
  index?: number;
}

// components/os/Dock/DockIcon.tsx
interface DockIconProps {
  app: DockApp;
  index: number;
  onClick?: (appId: string) => void;
  onRightClick?: (e: React.MouseEvent, appId: string) => void;
}

// components/os/Dock/ContextMenu.tsx
interface DockContextMenuProps {
  appId: string;
  appName: string;
  isPinned: boolean;
  position: { x: number; y: number };
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onUninstall: () => void;
}

// components/os/Dock/Tooltip.tsx
interface DockTooltipProps {
  text: string;
  visible: boolean;
  position: { x: number; y: number };
}

// components/os/Dock/Indicator.tsx
interface DockIndicatorProps {
  isRunning: boolean;
}

// components/os/Dock/DroppableArea.tsx
interface DroppableAreaProps {
  id: string;
  children: React.ReactNode;
}
```

---

## 3. 状态管理

### 3.1 Zustand Store 设计

```typescript
// store/dockStore.ts
import { create } from 'zustand';

interface DockStoreState {
  // 应用列表
  apps: DockApp[];
  selectedAppId: string | null;
  draggedAppId: string | null;
  draggedAppIndex: number | null;

  // Dock UI 状态
  hoveringAppId: string | null;
  dockPosition: { x: number; y: number };
  dockWidth: number;

  // 菜单状态
  contextMenu: {
    isOpen: boolean;
    appId: string | null;
    position: { x: number; y: number } | null;
  };

  // Actions
  setApps: (apps: DockApp[]) => void;
  addApp: (app: DockApp) => void;
  removeApp: (appId: string) => void;
  updateApp: (appId: string, updates: Partial<Omit<DockApp, 'id'>>) => void;
  moveApp: (fromIndex: number, toIndex: number) => void;
  setAppRunning: (appId: string, isRunning: boolean) => void;
  selectApp: (appId: string | null) => void;
  setDraggedApp: (appId: string | null, index?: number | null) => void;
  setHoveringApp: (appId: string | null) => void;
  pinApp: (appId: string) => void;
  unpinApp: (appId: string) => void;
  openContextMenu: (appId: string, position: { x: number; y: number }) => void;
  closeContextMenu: () => void;
  updateDockPosition: (position: { x: number; y: number }) => void;
}

// 默认应用列表
const DEFAULT_DOCK_APPS: DockApp[] = [
  {
    id: 'project-create',
    name: '项目创建',
    icon: '➕',
    iconType: 'emoji',
    isRunning: false,
    isPinned: true,
    index: 0,
  },
  {
    id: 'file-manager',
    name: '文件管理',
    icon: '📁',
    iconType: 'emoji',
    isRunning: false,
    isPinned: true,
    index: 1,
  },
  {
    id: 'settings',
    name: '设置',
    icon: '⚙️',
    iconType: 'emoji',
    isRunning: false,
    isPinned: true,
    index: 2,
  },
  {
    id: 'help',
    name: '帮助',
    icon: '❓',
    iconType: 'emoji',
    isRunning: false,
    isPinned: true,
    index: 3,
  },
];

// Dock Store
const useDockStore = create<DockStoreState>((set, get) => ({
  // Initial state
  apps: DEFAULT_DOCK_APPS,
  selectedAppId: null,
  draggedAppId: null,
  draggedAppIndex: null,
  hoveringAppId: null,
  dockPosition: { x: 0, y: 0 },
  dockWidth: 0,
  contextMenu: {
    isOpen: false,
    appId: null,
    position: null,
  },

  // Actions
  setApps: (apps) => set({ apps }),

  addApp: (app) =>
    set((state) => ({
      apps: [...state.apps, { ...app, index: state.apps.length }],
    })),

  removeApp: (appId) =>
    set((state) => ({
      apps: state.apps.filter((app) => app.id !== appId),
      draggedAppId: state.draggedAppId === appId ? null : state.draggedAppId,
    })),

  updateApp: (appId, updates) =>
    set((state) => ({
      apps: state.apps.map((app) =>
        app.id === appId ? { ...app, ...updates } : app
      ),
    })),

  moveApp: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex === toIndex) return state;

      const newApps = [...state.apps];
      const [removed] = newApps.splice(fromIndex, 1);
      newApps.splice(toIndex, 0, removed);

      // 更新所有应用的 index
      return {
        apps: newApps.map((app, idx) => ({ ...app, index: idx })),
      };
    }),

  setAppRunning: (appId, isRunning) =>
    set((state) => ({
      apps: state.apps.map((app) =>
        app.id === appId ? { ...app, isRunning } : app
      ),
    })),

  selectApp: (appId) => set({ selectedAppId: appId }),

  setDraggedApp: (appId, index = null) =>
    set({ draggedAppId: appId, draggedAppIndex: index }),

  setHoveringApp: (appId) => set({ hoveringAppId: appId }),

  pinApp: (appId) =>
    set((state) => ({
      apps: state.apps.map((app) =>
        app.id === appId ? { ...app, isPinned: true } : app
      ),
    })),

  unpinApp: (appId) =>
    set((state) => ({
      apps: state.apps.map((app) =>
        app.id === appId ? { ...app, isPinned: false } : app
      ),
    })),

  openContextMenu: (appId, position) =>
    set({
      contextMenu: { isOpen: true, appId, position },
    }),

  closeContextMenu: () =>
    set({
      contextMenu: { isOpen: false, appId: null, position: null },
    }),

  updateDockPosition: (position) => set({ dockPosition: position }),
}));

export default useDockStore;

// Selector hooks for finer-grained reactivity
export const useDockApps = () => useDockStore((state) => state.apps);
export const useContextMenu = () => useDockStore((state) => state.contextMenu);
export const useDraggedApp = () => useDockStore((state) => ({
  appId: state.draggedAppId,
  index: state.draggedAppIndex,
}));
```

### 3.2 状态流向

```
User Action → Component → Hook → Store → State Update → Re-render
                ↓                                      ↓
            Validation                           Analytics/Log
```

---

## 4. Hooks 设计

### 4.1 useDock

```typescript
// hooks/useDock.ts
import { useState, useCallback, useEffect } from 'react';
import useDockStore from '@/store/dockStore';
import type { DockApp } from '@/types/os';
import { getRegisteredAgents } from '@/lib/integrations/pi-agent/core/utils';

interface UseDockOptions {
  enableAgentIntegration?: boolean;
}

export function useDock(options: UseDockOptions = {}) {
  const {
    apps,
    selectApp,
    setAppRunning,
    setDraggedApp,
    moveApp,
    pinApp,
    unpinApp,
    uninstallApp,
  } = useDockStore();

  const [isInitialized, setIsInitialized] = useState(false);

  // 初始化：加载默认应用
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);

      // 集成 pi-agent-core 获取 Agent（如果启用）
      if (options.enableAgentIntegration) {
        const agents = getRegisteredAgents();
        const agentApps: DockApp[] = agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          icon: agent.icon,
          iconType: 'component',
          isRunning: agent.status === 'running',
          isPinned: true,
          index: apps.length,
        }));

        // 合并应用列表
        setApps([...apps, ...agentApps]);
      }
    }
  }, [isInitialized, apps, options.enableAgentIntegration]);

  const handleAppClick = useCallback((appId: string) => {
    selectApp(appId);
    setAppRunning(appId, true);

    // 执行应用打开逻辑（通过事件通知）
    window.dispatchEvent(new CustomEvent('app-open', { detail: { appId } }));
  }, [selectApp, setAppRunning]);

  const handleRightClick = useCallback(
    (e: React.MouseEvent, appId: string) => {
      e.preventDefault();
      e.stopPropagation();
      // 右键菜单逻辑由 useDockContextMenu 处理
    },
    []
  );

  const handleDragStart = useCallback((appId: string, index: number) => {
    setDraggedApp(appId, index);
  }, [setDraggedApp]);

  const handleDragEnd = useCallback(() => {
    setDraggedApp(null);
  }, [setDraggedApp]);

  const handleDock = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex !== toIndex) {
      moveApp(fromIndex, toIndex);
    }
  }, [moveApp]);

  return {
    apps,
    handleAppClick,
    handleRightClick,
    handleDragStart,
    handleDragEnd,
    handleDock,
  };
}
```

### 4.2 useDockIconAnimation

```typescript
// hooks/useDockIconAnimation.ts
import { useState, useCallback, useRef } from 'react';

interface UseDockIconAnimationOptions {
  scale?: number;
  duration?: number;
}

export function useDockIconAnimation(options: UseDockIconAnimationOptions = {}) {
  const {
    scale = 1.2,
    duration = 200,
  } = options;

  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);

    // 延迟显示 tooltip
    tooltipTimerRef.current = setTimeout(() => {
      setTooltipVisible(true);
    }, 500);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setIsPressed(false);

    // 隐藏 tooltip
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltipVisible(false);
  }, []);

  const handleMouseDown = useCallback(() => {
    setIsPressed(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsPressed(false);
  }, []);

  // 计算样式值
  const currentScale = isPressed ? 0.95 : isHovered ? scale : 1;
  const styles = {
    transform: `scale(${currentScale})`,
    transition: `transform ${duration}ms cubic-bezier(0.36, 0, 0.66, -0.56)`,
  };

  return {
    isHovered,
    isPressed,
    tooltipVisible,
    styles,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseUp,
  };
}
```

### 4.3 useDockContextMenu

```typescript
// hooks/useDockContextMenu.ts
import { useCallback, useEffect } from 'react';
import useDockStore from '@/store/dockStore';
import type { DockMenuItem } from '@/types/os';

export function useDockContextMenu(appId: string, appName: string, isPinned: boolean) {
  const { contextMenu, closeContextMenu, pinApp, uninstallApp, removeApp } = useDockStore();
  const [items, setItems] = useState<DockMenuItem[]>([]);

  // 生成菜单项
  useEffect(() => {
    setItems([
      {
        id: 'open',
        label: '打开',
        icon: '📂',
        onClick: () => {
          console.log(`Open app: ${appId}`);
          window.dispatchEvent(new CustomEvent('app-open', { detail: { appId } }));
        },
      },
      {
        id: 'separator-1',
        label: '',
        separator: true,
      },
      {
        id: isPinned ? 'unpin' : 'pin',
        label: isPinned ? '从 Dock 移除' : '固定到 Dock',
        icon: isPinned ? '𝗑️' : '📌',
        onClick: () => (isPinned ? removeApp(appId) : pinApp(appId)),
      },
      {
        id: 'separator-2',
        label: '',
        separator: true,
      },
      {
        id: 'uninstall',
        label: '卸载',
        icon: '🗑️',
        onClick: () => uninstallApp(appId),
      },
    ]);
  }, [appId, appName, isPinned, pinApp, uninstallApp, removeApp]);

  const isOpen = contextMenu.isOpen && contextMenu.appId === appId;
  const position = contextMenu.position;

  const close = useCallback(() => {
    closeContextMenu();
  }, [closeContextMenu]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = () => {
      close();
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, close]);

  // ESC 键关闭菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, close]);

  return {
    isOpen,
    position,
    items,
    close,
  };
}
```

### 4.4 useDropZone

```typescript
// hooks/useDropZone.ts
import { useDroppable } from '@dnd-kit/core';

export function useDropZone(id: string) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return {
    ref: setNodeRef,
    isOver,
  };
}
```

---

## 5. 集成设计

### 5.1 与 Desktop (OS.1) 集成

```typescript
// src/app/desktop/page.tsx
import Desktop from '@/components/os/Desktop';
import Dock from '@/components/os/Dock';

export default function DesktopPage() {
  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <Desktop />
      <Dock />
    </main>
  );
}
```

**集成要点：**
- Dock 作为 Desktop 的兄弟组件，不在其内部
- Desktop 的 `pb-24` 为 Dock 预留空间（96px）
- Dock 的 `z-index` 应高于 Desktop
- 两者共享 Zustand store（可选扩展）

### 5.2 Dock 与 Desktop 的视觉集成

```css
/* Desktop */
.desktop-container {
  padding-bottom: 96px; /* Dock 高度 + 间距 */
}

/* Dock */
.dock {
  position: fixed;
  bottom: 16px; /* 距离底部 16px */
  left: 50%;
  transform: translateX(-50%);
  z-index: 50; /* 高于 Desktop */
}
```

### 5.3 与 pi-agent-core 集成预设

```typescript
// 为 OS.3 Agent 对象预留集成点
interface AgentDockApp extends DockApp {
  type: 'agent';
  agentType: 'pm' | 'architect' | 'developer' | 'qa' | 'ux-designer';
  agentId: string;
}

// Agent 运行状态同步
useEffect(() => {
  const unsubscribe = subscribeToAgentStatus((status: AgentStatus[]) => {
    status.forEach(agent => {
      updateApp(agent.id, { isRunning: agent.isRunning });
    });
  });

  return unsubscribe;
}, []);
```

### 5.4 与 Spotlight (OS.4) 集成预设

```typescript
// 全局快捷键监听
useEffect(() => {
  const handleShortcut = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      // 触发 Spotlight (OS.4)
      window.dispatchEvent(new CustomEvent('open-spotlight'));
    }
  };

  window.addEventListener('keydown', handleShortcut);
  return () => window.removeEventListener('keydown', handleShortcut);
}, []);
```

---

## 6. 文件结构

### 6.1 目录结构

```
src/
├── components/
│   └── os/
│       ├── Dock.tsx                    # Dock 容器
│       ├── Dock/
│       │   ├── index.tsx               # Dock 主组件
│       │   ├── DockIcon.tsx           # 图标组件
│       │   ├── Tooltip.tsx             # 工具提示
│       │   ├── Indicator.tsx           # 运行指示灯
│       │   ├── ContextMenu.tsx         # 右键菜单
│       │   └── DroppableArea.tsx       # 拖拽区域
│       └── __tests__/
│           ├── Dock.test.tsx           # Dock 组件测试
│           ├── DockIcon.test.tsx       # DockIcon 组件测试
│           └── ContextMenu.test.tsx     # 右键菜单测试
├── hooks/
│   ├── useDock.ts                     # Dock 状态逻辑
│   ├── useDockIconAnimation.ts         # 图标动画逻辑
│   ├── useDockContextMenu.ts          # 菜单逻辑
│   └── useDropZone.ts                 # 拖拽区域逻辑
├── store/
│   └── dockStore.ts                   # Dock 状态管理
└── types/
    └── os.ts                           # OS 组件类型 (扩展)
```

### 6.2 文件组织原则

| 原则 | 说明 |
|-----|------|
| **组件单文件/目录** | 复杂组件使用目录结构 |
| **Hooks 可复用** | hooks 放在 hooks/，命名 `use*` |
| **Store 分模块** | store 按功能分文件 |
| **类型集中** | types/ 集中管理类型 |

---

## 7. 性能优化

### 7.1 渲染优化

```typescript
// 使用 React.memo 避免不必要的重绘
import { memo } from 'react';

export const DockIcon = memo<DockIconProps>(
  ({ app, index, onClick, onRightClick, ...otherProps }) => {
    // 组件实现
  },
  (prevProps, nextProps) => {
    // 自定义比较函数，只比较必要的状态
    return (
      prevProps.app.id === nextProps.app.id &&
      prevProps.app.isRunning === nextProps.app.isRunning &&
      prevProps.app.isPinned === nextProps.app.isPinned &&
      prevProps.index === nextProps.index
    );
  }
);

// 使用 useMemo 缓存计算
const memoizedApps = useMemo(
  () => apps.map(app => ({ ...app })),
  [apps]
);
```

### 7.2 虚拟化（如果需要）

如果图标数量 > 20，考虑虚拟化：

```typescript
// 使用 @tanstack/react-virtual 进行虚拟化
import { useVirtualizer } from '@tanstack/react-virtual';

const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: apps.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48, // Dock 图标大小 + 间距
});
```

### 7.3 事件节流

```typescript
// 窗口 resize 节流
import { useMemo } from 'react';

const handleResizeDebounced = useMemo(
  () => debounce(handleResize, 100),
  []
);
```

### 7.4 动画优化

```css
/* 使用 transform 和 opacity 进行动画，避免布局重绘 */
.dock-icon {
  will-change: transform;
  transition: transform 0.2s cubic-bezier(0.36, 0, 0.66, -0.56);
}

/* 避免同时动画过多的元素 */
.dock-icon:not(:hover) {
  will-change: auto; /* 重置未悬停的元素 */
}
```

---

## 8. 可测试性

### 8.1 组件测试示例

```typescript
// components/os/Dock/__tests__/Dock.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Dock from '../Dock';

describe('Dock', () => {
  it('renders default apps', () => {
    render(<Dock />);
    expect(screen.getByText('项目创建')).toBeInTheDocument();
    expect(screen.getByText('文件管理')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('帮助')).toBeInTheDocument();
  });

  it('handles icon click', () => {
    const handleClick = vi.fn();
    render(<Dock onAppClick={handleClick} />);
    fireEvent.click(screen.getByText('项目创建'));
    expect(handleClick).toHaveBeenCalledWith('project-create');
  });

  it('shows running status indicator', () => {
    render(<Dock apps={[
      {
        id: 'test',
        name: 'test',
        icon: '📄',
        isRunning: true,
        isPinned: true,
        index: 0,
      },
    ]} />);

    const indicator = screen.getByTestId(`dock-indicator-test`);
    expect(indicator).toBeInTheDocument();
  });

  it('opens context menu on right click', async () => {
    render(<Dock />);
    const icon = screen.getByText('项目创建');

    fireEvent.contextMenu(icon);

    await waitFor(() => {
      expect(screen.getByText('固定到 Dock')).toBeInTheDocument();
    });
  });

  it('handles drag and drop reordering', async () => {
    render(<Dock />);
    const icon1 = screen.getByText('项目创建');
    const icon2 = screen.getByText('文件管理');

    // 模拟拖拽
    fireEvent.dragStart(icon1);
    fireEvent.dragOver(icon2);

    expect(icon1).toBeInTheDocument();
  });
});
```

### 8.2 Hooks 测试示例

```typescript
// hooks/__tests__/useDock.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useDock } from '../useDock';
import { useDockStore } from '@/store/dockStore';

describe('useDock', () => {
  beforeEach(() => {
    useDockStore.setState({
      apps: [],
      selectedAppId: null,
      draggedAppId: null,
      draggingAppIndex: null,
      hoveringAppId: null,
      dockPosition: { x: 0, y: 0 },
      dockWidth: 0,
      contextMenu: {
        isOpen: false,
        appId: null,
        position: null,
      },
    });
  });

  afterEach(() => {
    useDockStore.getState().setApps([
      {
        id: 'project-create',
        name: '项目创建',
        icon: '➕',
        iconType: 'emoji',
        isRunning: false,
        isPinned: true,
        index: 0,
      },
      {
        id: 'file-manager',
        name: '文件管理',
        icon: '📁',
        iconType: 'emoji',
        isRunning: false,
        isPinned: true,
        index: 1,
      },
    ]);
  });

  it('handles app click', () => {
    const { result } = renderHook(() => useDock());
    const handleClick = vi.fn();

    result.current.handleAppClick('project-create');

    expect(useDockStore.getState().selectedAppId).toBe('project-create');
  });

  it('updates app running status', () => {
    const { result } = renderHook(() => useDock());

    act(() => {
      result.current.handleAppClick('project-create');
    });

    const app = useDockStore.getState().apps.find(a => a.id === 'project-create');
    expect(app?.isRunning).toBe(true);
  });

  it('handles app reordering', () => {
    const { result } = renderHook(() => useDock());

    act(() => {
      result.current.handleDock(0, 1);
    });

    const apps = useDockStore.getState().apps;
    expect(apps[0].id).toBe('file-manager');
    expect(apps[1].id).toBe('project-create');
  });
});
```

### 8.3 集成测试示例

```typescript
// components/os/__tests__/Dock.integration.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('Dock Integration', () => {
  it('renders within Desktop layout', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <main className="relative w-screen h-screen overflow-hidden" data-testid="desktop-page">
          <div className="relative w-screen h-screen overflow-hidden" data-testid="desktop">
            <p>Desktop content</p>
            <p className="pb-24">Has padding for Dock</p>
          </div>
          <div data-testid="dock" className="fixed bottom-4 left-1/2 -translate-x-1/2">
            <span>Dock</span>
          </div>
        </main>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('dock')).toBeInTheDocument();
    expect(screen.getByTestId('dock')).toHaveStyle({
      position: 'fixed',
      bottom: '16px',
    });
  });
});
```

---

## 9. 安全性考虑

### 9.1 输入验证

```typescript
// 验证 DockApp 配置
const validateDockApp = (item: any): item is DockApp => {
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.icon === 'string' &&
    typeof item.isRunning === 'boolean' &&
    typeof item.isPinned === 'boolean' &&
    (item.iconType === undefined || ['emoji', 'image', 'component'].includes(item.iconType))
  );
};

// 在 store 中使用验证
const addApp = (app: unknown) => {
  if (!validateDockApp(app)) {
    throw new Error('Invalid DockApp configuration');
  }
  set((state) => ({
    apps: [...state.apps, app as DockApp],
  }));
};
```

### 9.2 XSS 防护

```typescript
import DOMPurify from 'dompurify';

// 安全地渲染应用名称
const SafeAppName: React.FC<{ name: string }> = ({ name }) => {
  const safeName = DOMPurify.sanitize(name);
  return <span>{safeName}</span>;
};

// 在 Tooltip 中使用
<DockTooltip>
  <SafeAppName name={app.name} />
</DockTooltip>
```

### 9.3 事件注入防护

```typescript
// 防止未授权的事件处理
const handleAppClick = useCallback((appId: string) => {
  // 验证 appId 格式
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(appId)) {
    console.warn('Invalid appId format:', appId);
    return;
  }

  // 验证应用是否存在
  const app = apps.find(a => a.id === appId);
  if (!app) {
    console.warn('App not found:', appId);
    return;
  }

  selectApp(appId);
  setAppRunning(appId, true);
}, [apps, selectApp, setAppRunning]);
```

---

## 10. 部署配置

### 10.1 Next.js 配置

```javascript
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // OS 组件在客户端渲染
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
```

### 10.2 Tailwind CSS 配置扩展

```javascript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  theme: {
    extend: {
      animation: {
        'dock-slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'dock-scale': 'scale 0.2s cubic-bezier(0.36, 0, 0.66, -0.56)',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scale: {
          '0%, 100%': { transform: 'scale(1)' },
        },
      },
    },
  },
};

export default config;
```

---

## 11. 附录

### 11.1 类型定义完整版

```typescript
// types/os.ts
import { ReactNode } from 'react';

// ============ Dock App ============

export interface DockApp {
  id: string;
  name: string;
  icon: string;
  iconType?: 'emoji' | 'image' | 'component';
  iconUrl?: string;
  iconComponent?: React.ReactNode;
  isRunning: boolean;
  isPinned: boolean;
  index?: number;
}

export interface DockAppIconItem extends DockApp {
  index: number;
}

// ============ Dock Components ============

export interface DockProps {
  apps?: DockApp[];
  onAppClick?: (appId: string) => void;
}

export interface DockContainerProps {
  children: React.ReactNode;
}

export interface DockIconProps {
  app: DockApp;
  index: number;
  onClick?: (appId: string) => void;
  onRightClick?: (e: React.MouseEvent, appId: string) => void;
}

export interface TooltipProps {
  text: string;
  visible: boolean;
  position: { x: number; y: number };
}

export interface IndicatorProps {
  isRunning: boolean;
}

export interface DroppableAreaProps {
  id: string;
  children: React.ReactNode;
  data?: { appId: string };
}

// ============ Context Menu ============

export interface DockMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  onClick: () => void;
  separator?: boolean;
}

export interface DockContextMenuProps {
  appId: string;
  appName: string;
  isPinned: boolean;
  position: { x: number; y: number };
  isOpen: boolean;
  onClose: () => void;
}

// ============ Dock Store State ============

export interface DockState {
  apps: DockApp[];
  selectedAppId: string | null;
  draggedAppId: string | null;
  draggedAppIndex: number | null;

  hoveringAppId: string | null;
  dockPosition: { x: number; y: number };
  dockWidth: number;

  contextMenu: {
    isOpen: boolean;
    appId: string | null;
    position: { x: number; y: number } | null;
  };

  setApps: (apps: DockApp[]) => void;
  addApp: (app: DockApp) => void;
  removeApp: (appId: string) => void;
  updateApp: (appId: string, updates: Partial<Omit<DockApp, 'id'>>) => void;
  moveApp: (fromIndex: number, toIndex: number) => void;
  setAppRunning: (appId: string, isRunning: boolean) => void;
  selectApp: (appId: string | null) => void;
  setDraggedApp: (appId: string | null, index?: number | null) => void;
  setHoveringApp: (appId: string | null) => void;
  pinApp: (appId: string) => void;
  unpinApp: (appId: string) => void;
  uninstallApp: (appId: string) => void;
  openContextMenu: (appId: string, position: { x: number; y: number }) => void;
  closeContextMenu: () => void;
  updateDockPosition: (position: { x: number; y: number }) => void;
}

export type DockStore = DockState;

// ============ Agent Integration ============

export interface AgentDockApp extends DockApp {
  type: 'agent';
  agentType: 'pm' | 'architect' | 'developer' | 'qa' | 'ux-designer';
  agentId: string;
}

// ============ Resize Observer ============

export interface DockDimensions {
  width: number;
  height: number;
  availableWidth: number;
  iconCount: number;
  iconSize: number;
  gap: number;
}

// ============ Responsive Config ============

export interface DockResponsiveConfig {
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  iconSizes: {
    mobile: { size: number; gap: number };
    tablet: { size: number; gap: number };
    desktop: { size: number; gap: number };
  };
}
```

### 11.2 依赖清单

```json
{
  "dependencies": {
    "zustand": "^4.4.0",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@tanstack/react-virtual": "^3.0.0-alpha.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.5.0",
    "dompurify": "^3.0.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "jsdom": "^23.0.0"
  }
}
```

### 11.3 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-07 | v1.0 | 初始版本（基础） | 系统架构 |
| 2026-03-07 | v2.0 | 完整版本（补充完整章节） | 系统架构 |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
