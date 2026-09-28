# Story OS.1: Desktop 空间框架 - 架构设计文档 (ADD)

**版本**: v1.0
**日期**: 2026-03-07
**状态**: 规划中
**批准状态**: 待批准

---

## 1. 架构概述

### 1.1 设计目标

创建可扩展、可维护的 Desktop 空间框架：
- 清晰的组件层次
- 简洁的状态管理
- 可复用的 hooks
- 良好的 TypeScript 类型

### 1.2 架构原则

| 原则 | 实施 |
|-----|------|
| **关注点分离** | 组件、状态、逻辑分离 |
| **单一职责** | 每个 hook 职责单一 |
| **可复用性** | hooks 可跨组件复用 |
| **可测试性** | 便于单元测试和集成测试 |
| **性能优先** | 优化渲染，避免不必要重绘 |

### 1.3 技术栈

| 类别 | 选择 | 说明 |
|-----|------|------|
| **状态管理** | Zustand | 轻量级，无需 Context Provider |
| **拖拽库** | dnd-kit | 现代，可访问性好，性能优秀 |
| **动画** | CSS Transitions | 轻量，60fps 稳定 |
| **样式** | Tailwind CSS | 工具类，快速开发 |
| **类型检查** | TypeScript | 类型安全 |

---

## 2. 组件架构

### 2.1 组件层次结构

```
Desktop
├── StatusBar          # 顶部状态栏
│   └── Clock
│   └── NetworkStatus
├── Background         # 背景层
│   ├── SolidColor
│   ├── Image
│   └── Particles
├── DesktopGrid        # 图标网格容器
│   └── DesktopIcon[]  # 图标列表
│       └── IconLabel
│       └── IconStatus
└── ContextMenu        # 右键菜单
    └── MenuItem[]
```

### 2.2 组件职责

| 组件 | 职责 | Props |
|-----|------|-------|
| **Desktop** | 容器，管理全局状态 | 无 |
| **StatusBar** | 显示时间和网络 | 无（从 store 读取） |
| **Background** | 背景渲染 | `type`, `config` |
| **DesktopGrid** | 图标网格布局 | `icons`, `onIconClick` |
| **DesktopIcon** | 单个图标 | `icon`, `onDrag` |
| **ContextMenu** | 右键菜单 | `position`, `items` |

### 2.3 组件定义

```typescript
// components/os/Desktop.tsx
interface DesktopProps {
  children?: React.ReactNode;
}

// components/os/StatusBar.tsx
interface StatusBarProps {
  showNetwork?: boolean;
}

interface NetworkStatus {
  isOnline: boolean;
  type: 'wifi' | 'ethernet' | 'none';
  strength?: number;
}

// components/os/DesktopIcon.tsx
interface DesktopIconProps {
  id: string;
  icon: string;
  label: string;
  status?: 'idle' | 'active' | 'running';
  onClick?: () => void;
  onRightClick?: (e: MouseEvent) => void;
}

interface DesktopIconItem {
  id: string;
  icon: string;
  label: string;
  position: { x: number; y: number };
  status?: 'idle' | 'active' | 'running';
}

// components/os/ContextMenu.tsx
interface ContextMenuProps {
  position: { x: number; y: number };
  items: MenuItem[];
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  onClick: () => void;
  separator?: boolean;
}
```

---

## 3. 状态管理

### 3.1 Zustand Store 设计

```typescript
// store/desktopStore.ts
import { create } from 'zustand';

interface DesktopState {
  // 图标状态
  icons: DesktopIconItem[];
  selectedIconId: string | null;
  draggedIconId: string | null;

  // 背景状态
  background: {
    type: 'solid' | 'image' | 'particles';
    color?: string;
    imageUrl?: string;
    particlesEnabled?: boolean;
  };

  // 菜单状态
  contextMenu: {
    isOpen: boolean;
    position: { x: number; y: number } | null;
  };

  // UI 状态
  isDragging: boolean;
  isLoading: boolean;
  viewport: { width: number; height: number };

  // Actions
  setIcons: (icons: DesktopIconItem[]) => void;
  moveIcon: (id: string, position: { x: number; y: number }) => void;
  selectIcon: (id: string | null) => void;
  setDraggedIcon: (id: string | null) => void;
  setBackground: (config: Partial<DesktopState['background']>) => void;
  openContextMenu: (position: { x: number; y: number }) => void;
  closeContextMenu: () => void;
  setDragging: (isDragging: boolean) => void;
  updateViewport: (viewport: { width: number; height: number }) => void;
}

const useDesktopStore = create<DesktopState>((set) => ({
  // Initial state
  icons: [],
  selectedIconId: null,
  draggedIconId: null,
  background: {
    type: 'solid',
    color: '#0A0A0A',
    particlesEnabled: true,
  },
  contextMenu: {
    isOpen: false,
    position: null,
  },
  isDragging: false,
  isLoading: true,
  viewport: { width: 1920, height: 1080 },

  // Actions
  setIcons: (icons) => set({ icons }),
  moveIcon: (id, position) =>
    set((state) => ({
      icons: state.icons.map((icon) =>
        icon.id === id ? { ...icon, position } : icon
      ),
    })),
  selectIcon: (id) => set({ selectedIconId: id }),
  setDraggedIcon: (id) => set({ draggedIconId: id }),
  setBackground: (config) =>
    set((state) => ({
      background: { ...state.background, ...config },
    })),
  openContextMenu: (position) =>
    set({
      contextMenu: { isOpen: true, position },
    }),
  closeContextMenu: () =>
    set({
      contextMenu: { isOpen: false, position: null },
    }),
  setDragging: (isDragging) => set({ isDragging }),
  updateViewport: (viewport) => set({ viewport }),
}));

export default useDesktopStore;
```

### 3.2 状态流向

```
User Action → Component → Hook → Store → State Update → Re-render
                ↓                                      ↓
            Validation                           Analytics/Log
```

---

## 4. Hooks 设计

### 4.1 useDesktopGrid

```typescript
// hooks/useDesktopGrid.ts
interface UseDesktopGridOptions {
  columns: number;
  rows?: number;
  gap: number;
}

interface GridPosition {
  column: number;
  row: number;
}

interface UseDesktopGridReturn {
  grid: Map<string, GridPosition>;
  addToGrid: (iconId: string, position?: GridPosition) => void;
  removeFromGrid: (iconId: string) => void;
  moveInGrid: (iconId: string, to: GridPosition) => void;
  getAvailablePosition: () => GridPosition | null;
}

export function useDesktopGrid(
  options: UseDesktopGridOptions
): UseDesktopGridReturn {
  const [grid, setGrid] = useState<Map<string, GridPosition>>(new Map());

  const addToGrid = useCallback((iconId: string, position?: GridPosition) => {
    setGrid((prev) => {
      const newGrid = new Map(prev);
      const pos = position ?? getAvailablePosition(newGrid);
      if (pos) {
        newGrid.set(iconId, pos);
      }
      return newGrid;
    });
  }, []);

  const removeFromGrid = useCallback((iconId: string) => {
    setGrid((prev) => {
      const newGrid = new Map(prev);
      newGrid.delete(iconId);
      return newGrid;
    });
  }, []);

  const moveInGrid = useCallback((iconId: string, to: GridPosition) => {
    setGrid((prev) => {
      const newGrid = new Map(prev);
      newGrid.set(iconId, to);
      return newGrid;
    });
  }, []);

  const getAvailablePosition = useCallback(
    (currentGrid = grid): GridPosition | null => {
      for (let row = 0; row < (options.rows ?? 10); row++) {
        for (let col = 0; col < options.columns; col++) {
          const found = Array.from(currentGrid.values()).some(
            (pos) => pos.column === col && pos.row === row
          );
          if (!found) return { column: col, row };
        }
      }
      return null;
    },
    [grid, options.columns, options.rows]
  );

  return {
    grid,
    addToGrid,
    removeFromGrid,
    moveInGrid,
    getAvailablePosition,
  };
}
```

### 4.2 useDragAndDrop

```typescript
// hooks/useDragAndDrop.ts
import { DndContext, DragOverlay, useDroppable, useDraggable } from '@dnd-kit/core';

interface UseDragAndDropOptions {
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, destination: { x: number; y: number }) => void;
}

export function useDragAndDrop(options: UseDragAndDropOptions) {
  const handleDragStart = (event: DragStartEvent) => {
    options.onDragStart?.(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over) {
      options.onDragEnd?.(
        active.id as string,
        { x: over.data.current?.x ?? 0, y: over.data.current?.y ?? 0 }
      );
    }
  };

  const DndContextProvider = ({ children }: { children: React.ReactNode }) => (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  );

  return { DndContextProvider };
}

// 用于 DesktopComponent
export function useDraggable(id: string) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });

  return {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  };
}
```

### 4.3 useResponsive

```typescript
// hooks/useResponsive.ts
interface ResponsiveConfig {
  breakpoints: {
    tablet: number;
    desktop: number;
  };
  gridSize: {
    tablet: { columns: number; rows: number };
    desktop: { columns: number; rows: number };
  };
}

export function useResponsive(config: ResponsiveConfig) {
  const [size, setSize] = useState<{
    width: number;
    height: number;
    type: 'tablet' | 'desktop';
  }>({
    width: window.innerWidth,
    height: window.innerHeight,
    type: window.innerWidth >= config.breakpoints.tablet
      ? 'desktop'
      : 'tablet',
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setSize({
        width,
        height,
        type: width >= config.breakpoints.tablet ? 'desktop' : 'tablet',
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [config.breakpoints.tablet]);

  const gridSize =
    size.type === 'desktop' ? config.gridSize.desktop : config.gridSize.tablet;

  return { size, gridSize };
}
```

### 4.4 useContextMenu

```typescript
// hooks/useContextMenu.ts
export function useContextMenu() {
  const contextMenu = useDesktopStore((state) => state.contextMenu);
  const openMenu = useDesktopStore((state) => state.openContextMenu);
  const closeMenu = useDesktopStore((state) => state.closeContextMenu);
  const [items, setItems] = useState<MenuItem[]>([]);

  const open = (e: MouseEvent, menuItems: MenuItem[]) => {
    e.preventDefault();
    setItems(menuItems);
    openMenu({ x: e.clientX, y: e.clientY });
  };

  const close = () => {
    closeMenu();
  };

  return {
    isOpen: contextMenu.isOpen,
    position: contextMenu.position,
    items,
    open,
    close,
  };
}
```

---

## 5. 集成设计

### 5.1 与 pi-agent-core 集成

```typescript
// 集成点：Agent 图标
interface AgentIcon extends DesktopIconItem {
  type: 'agent';
  agentId: string;
  agentType: 'pm' | 'architect' | 'developer' | 'qa' | 'ux-designer';
}

// 在 Desktop 中加载 Agent 图标
useEffect(() => {
  // 从 pi-agent-core 获取已注册的 Agent
  const agents = getRegisteredAgents(); // 从 Epic 0
  const agentIcons: DesktopIconItem[] = agents.map((agent) => ({
    id: agent.id,
    icon: agent.icon,
    label: agent.name,
    status: agent.status === 'running' ? 'running' : 'idle',
    type: 'agent',
    agentId: agent.id,
    agentType: agent.type,
  }));

  setIcons(agentIcons);
}, []);
```

### 5.2 与 OS.2 Dock 集成预设

```typescript
// Desktop 需要预留底部空间给 Dock
const DESKTOP_PADDING_BOTTOM = 80; // Dock 高度 + 间距

// 在 DesktopGrid 计算时考虑
const gridHeight = window.innerHeight - STATUS_BAR_HEIGHT - DESKTOP_PADDING_BOTTOM;
```

### 5.3 与 OS.4 Spotlight 集成预设

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
│       ├── Desktop.tsx              # Desktop 容器
│       ├── StatusBar/
│       │   ├── index.tsx
│       │   ├── Clock.tsx
│       │   └── NetworkStatus.tsx
│       ├── Background/
│       │   ├── index.tsx
│       │   ├── SolidColor.tsx
│       │   ├── Image.tsx
│       │   └── Particles.tsx
│       ├── DesktopGrid.tsx          # 图标网格
│       └── ContextMenu.tsx          # 右键菜单
├── hooks/
│   ├── useDesktopGrid.ts            # 图标网格逻辑
│   ├── useDragAndDrop.ts            # 拖拽逻辑
│   ├── useResponsive.ts             # 响应式逻辑
│   └── useContextMenu.ts            # 右键菜单逻辑
├── store/
│   └── desktopStore.ts              # Desktop 状态管理
├── types/
│   └── os.ts                       # OS 组件类型
└── styles/
    └── desktop.css                   # Desktop 样式
```

### 6.2 文件组织原则

| 原则 | 说明 |
|-----|------|
| **组件单文件/目录** | 简单组件单文件，复杂组件目录结构 |
| **Hooks 可复用** | hooks 放在 hooks/，命名 `use*` |
| **Store 分模块** | store 按功能分文件 |
| **类型集中** | types/ 集中管理类型 |
| **样式模块化** | styles/ 按组件分 CSS 文件 |

---

## 7. 性能优化

### 7.1 渲染优化

```typescript
// 使用 React.memo 避免不必要的重绘
export const DesktopIcon = React.memo<DesktopIconProps>(
  ({ id, icon, label, status, onClick, onRightClick }) => {
    // ...
  }
);

// 使用 useMemo 缓存计算
const gridPositions = useMemo(
  () => calculateGridPositions(icons, gridSize),
  [icons, gridSize.columns, gridSize.rows]
);
```

### 7.2 虚拟化（如需要）

如果图标数量 > 50，考虑虚拟化：

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: icons.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 100, // 图标高度
});
```

### 7.3 事件节流

```typescript
// 窗口 resize 节流
const handleResizeDebounced = useMemo(
  () => debounce(handleResize, 100),
  []
);
```

---

## 8. 可测试性

### 8.1 组件测试示例

```typescript
// components/os/__tests__/Desktop.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';

describe('Desktop', () => {
  it('renders icons', () => {
    const icons = [
      { id: '1', icon: '⚙️', label: '设置' },
      { id: '2', icon: '❓', label: '帮助' },
    ];
    render(<Desktop icons={icons} />);
    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('帮助')).toBeInTheDocument();
  });

  it('handles icon click', () => {
    const handleClick = vi.fn();
    render(<Desktop icons={[{ id: '1', icon: '⚙️', label: '设置', onClick: handleClick }]} />);
    fireEvent.click(screen.getByText('设置'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### 8.2 Hooks 测试示例

```typescript
// hooks/__tests__/useDesktopGrid.test.ts
import { renderHook } from '@testing-library/react';
import { useDesktopGrid } from '../useDesktopGrid';

describe('useDesktopGrid', () => {
  it('adds icon to grid', () => {
    const { result } = renderHook(() =>
      useDesktopGrid({ columns: 3, rows: 3, gap: 24 })
    );
    result.current.addToGrid('icon1');
    expect(result.current.grid.has('icon1')).toBe(true);
  });
});
```

---

## 9. 安全性考虑

### 9.1 输入验证

```typescript
// 验证图标配置
const validateIconItem = (item: any): item is DesktopIconItem => {
  return (
    typeof item.id === 'string' &&
    typeof item.icon === 'string' &&
    typeof item.label === 'string' &&
    typeof item.position?.x === 'number' &&
    typeof item.position?.y === 'number'
  );
};
```

### 9.2 XSS 防护

```typescript
// 确保用户输入转义
const safeLabel = DOMPurify.sanitize(icon.label);
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
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};
export default nextConfig;
```

---

## 11. 附录

### 11.1 类型定义完整版

```typescript
// types/os.ts
import { ReactNode } from 'react';

export interface DesktopIconItem {
  id: string;
  icon: string;
  label: string;
  position: { x: number; y: number };
  status?: 'idle' | 'active' | 'running';
  type?: 'system' | 'agent' | 'app';
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  onClick: () => void;
  separator?: boolean;
}

export interface NetworkStatus {
  isOnline: boolean;
  type: 'wifi' | 'ethernet' | 'none';
  strength?: number;
}

export interface BackgroundConfig {
  type: 'solid' | 'image' | 'particles';
  color?: string;
  imageUrl?: string;
  particlesEnabled?: boolean;
}

export useDesktopStore {
  icons: DesktopIconItem[];
  selectedIconId: string | null;
  draggedIconId: string | null;
  background: BackgroundConfig;
  contextMenu: {
    isOpen: boolean;
    position: { x: number; y: number } | null;
  };
  isDragging: boolean;
  isLoading: boolean;
  viewport: { width: number; height: number };
}
```

### 11.2 依赖清单

```json
{
  "dependencies": {
    "zustand": "^4.4.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0"
  }
}
```

### 11.3 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-07 | v1.0 | 初始版本 | 系统架构 |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
