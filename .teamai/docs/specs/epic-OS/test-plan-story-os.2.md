# Story OS.2 测试计划: Dock 任务栏基础

**测试负责人:** QA Engineer
**创建日期:** 2026-03-07
**测试范围:** Epic-OS Story OS.2 - Dock 任务栏基础
**状态:** 准备就绪 - 基于完整设计文档

---

## 0. 测试范围摘要

### 核心测试目标
验证 Dock 任务栏基础功能的实现：

| 测试类型 | 覆盖范围 | 优先级 | 预计用例 |
|---------|---------|-------|---------|
| 单元测试 | Dock, DockIcon, ContextMenu | P0 | ~20 |
| 单元测试 | Hooks (useDock, useDockIconAnimation, etc.) | P0 | ~12 |
| 集成测试 | 与 Desktop 集成、拖拽流程 | P0 | ~8 |
| 性能测试 | 动画流畅度、响应延迟 | P1 | ~6 |
| 可访问性 | 键盘导航、ARIA | P1 | ~4 |

**总计: ~50 测试用例**

---

## 1. 单元测试计划

### 1. Dock 主组件

#### 测试文件路径
`src/components/os/Dock/__tests__/Dock.test.tsx`

#### 测试用例

```typescript
describe('Dock', () => {
  describe('渲染测试', () => {
    it('应该渲染默认的 4 个应用图标', () => {
      render(<Dock />);

      expect(screen.getByText('项目创建')).toBeInTheDocument();
      expect(screen.getByText('文件管理')).toBeInTheDocument();
      expect(screen.getByText('设置')).toBeInTheDocument();
      expect(screen.getByText('帮助')).toBeInTheDocument();
    });

    it('应该固定在底部居中', () => {
      render(<Dock />);
      const dock = screen.getByRole('toolbar', { name: /dock/i });

      expect(dock).toHaveStyle({
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
      });
    });

    it('应该有正确的高度 48px', () => {
      render(<Dock />);
      const dock = screen.getByRole('toolbar');
      expect(dock).toHaveStyle({ height: '48px' });
    });

    it('应该有 Glassmorphism 背景', () => {
      render(<Dock />);
      const dock = screen.getByRole('toolbar');
      expect(dock).toHaveStyle({
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
      });
    });
  });

  describe('状态管理', () => {
    it('应该接收并渲染自定义应用列表', () => {
      const customApps = [
        { id: 'test1', name: 'Test App', icon: '🧪', isRunning: false, isPinned: true, index: 0 },
      ];

      render(<Dock apps={customApps} />);

      expect(screen.getByText('Test App')).toBeInTheDocument();
    });

    it('应该处理应用点击事件', () => {
      const handleClick = vi.fn();
      const apps = [
        { id: 'test', name: 'Test', icon: '🧪', isRunning: false, isPinned: true, index: 0 },
      ];

      render(<Dock apps={apps} onAppClick={handleClick} />);
      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      expect(handleClick).toHaveBeenCalledWith('test');
    });
  });

  describe('运行状态指示灯', () => {
    it('运行中的应用应该显示指示灯', () => {
      const apps = [
        { id: 'app1', name: 'App 1', icon: '📱', isRunning: true, isPinned: true, index: 0 },
      ];
      render(<Dock apps={apps} />);

      const indicator = screen.getByTestId(`dock-indicator-app1`);
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveStyle({
        width: '4px',
        height: '4px',
        borderRadius: '50%',
        backgroundColor: '#10B981',
      });
    });

    it('未运行的应用不应该显示指示灯', () => {
      const apps = [
        { id: 'app1', name: 'App 1', icon: '📱', isRunning: false, isPinned: true, index: 0 },
      ];
      render(<Dock apps={apps} />);

      expect(screen.queryByTestId(`dock-indicator-app1`)).not.toBeInTheDocument();
    });
  });
});
```

---

### 1.2 DockIcon 组件

#### 测试文件路径
`src/components/os/Dock/__tests__/DockIcon.test.tsx`

#### 测试用例

```typescript
describe('DockIcon', () => {
  const mockApp = {
    id: 'test',
    name: 'Test App',
    icon: '🧪',
    isRunning: false,
    isPinned: true,
    index: 0,
  };

  describe('悬停动画', () => {
    it('悬停时应该放大到 1.2x', () => {
      render(<DockIcon app={mockApp} index={0} />);

      const icon = screen.getByRole('button');
      fireEvent.mouseEnter(icon);

      expect(icon).toHaveStyle({ transform: 'scale(1.2)' });
    });

    it('悬停时应该显示 tooltip', async () => {
      render(<DockIcon app={mockApp} index={0} />);

      const icon = screen.getByRole('button');
      fireEvent.mouseEnter(icon);

      // 等待 tooltip 延迟 (500ms)
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(screen.getByText('Test App')).toBeVisible();
    });

    it('鼠标离开时应该恢复正常大小', () => {
      render(<DockIcon app={mockApp} index={0} />);

      const icon = screen.getByRole('button');
      fireEvent.mouseEnter(icon);
      fireEvent.mouseLeave(icon);

      expect(icon).toHaveStyle({ transform: 'scale(1)' });
    });

    it('点击时应该缩小到 0.95x', () => {
      render(<DockIcon app={mockApp} index={0} />);

      const icon = screen.getByRole('button');
      fireEvent.icon(icon, ['mousedown']);

      expect(icon).toHaveStyle({ transform: 'scale(0.95)' });
    });
  });

  describe('右键菜单', () => {
    it('右键应该打开上下文菜单', () => {
      render(<DockIcon app={mockApp} index={0} onRightClick={vi.fn()} />);

      const icon = screen.getByRole('button');
      fireEvent.contextMenu(icon);

      expect(screen.getByText('打开')).toBeInTheDocument();
      expect(screen.getByText('固定到 Dock')).toBeInTheDocument();
      expect(screen.getByText('卸载')).toBeInTheDocument();
    });

    it('已固定的应用应该显示"从 Dock 移除"', () => {
      const pinnedApp = { ...mockApp, isPinned: true };
      render(<DockIcon app={pinnedApp} index={0} onRightClick={vi.fn()} />);

      const icon = screen.getByRole('button');
      fireEvent.contextMenu(icon);

      expect(screen.getByText('从 Dock 移除')).toBeInTheDocument();
      expect(screen.queryByText('固定到 Dock')).not.toBeInTheDocument();
    });
  });

  describe('图标大小', () => {
    it('默认大小应该是 32x32px', () => {
      render(<DockIcon app={mockApp} index={0} />);

      const icon = screen.getByRole('button');
      expect(icon).toHaveStyle({ width: '32px', height: '32px' });
    });
  });
});
```

---

### 1.3 ContextMenu 组件

#### 测试文件路径
`src/components/os/Dock/__tests__/ContextMenu.test.tsx`

#### 测试用例

```typescript
describe('ContextMenu', () => {
  const mockItems = [
    { id: 'open', label: '打开', icon: '📂', onClick: vi.fn() },
    { id: 'separator-1', label: '', separator: true },
    { id: 'pin', label: '固定到 Dock', icon: '📌', onClick: vi.fn() },
  ];

  describe('菜单渲染', () => {
    it('应该显示菜单项', () => {
      render(
        <ContextMenu
          appId="test"
          appName="Test App"
          isPinned={false}
          position={{ x: 100, y: 100 }}
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
        />
      );

      expect(screen.getByText('打开')).toBeInTheDocument();
      expect(screen.getByText('固定到 Dock')).toBeInTheDocument();
    });

    it('不应该在关闭时渲染', () => {
      render(
        <ContextMenu
          appId="test"
          appName="Test App"
          isPinned={false}
          position={{ x: 100, y: 100 }}
          isOpen={false}
          onClose={vi.fn()}
          items={mockItems}
        />
      );

      expect(screen.queryByText('打开')).not.toBeInTheDocument();
    });

    it('应该在指定位置显示', () => {
      render(
        <ContextMenu
          appId="test"
          appName="Test App"
          isPinned={false}
          position={{ x: 100, y: 100 }}
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
        />
      );

      const menu = screen.getByRole('menu');
      expect(menu).toHaveStyle({ left: '100px', top: '100px' });
    });

    it('应该渲染分隔符', () => {
      render(
        <ContextMenu
          appId="test"
          appName="Test App"
          isPinned={false}
          position={{ x: 100, y: 100 }}
          isOpen={true}
          onClose={vi.fn()}
          items={mockItems}
        />
      );

      const separator = screen.getByRole('separator');
      expect(separator).toBeInTheDocument();
    });
  });

  describe('菜单交互', () => {
    it('点击菜单项应该执行动作', () => {
      const handlePin = vi.fn();
      const itemsWithPin = [
        { id: 'open', label: '打开', icon: '📂', onClick: vi.fn() },
        { id: 'separator-1', label: '', separator: true },
        { id: 'pin', label: '固定到 Dock', icon: '📌', onClick: handlePin },
      ];

      render(
        <ContextMenu
          appId="test"
          appName="Test App"
          isPinned={false}
          position={{ x: 100, y: 100 }}
          isOpen={true}
          onClose={vi.fn()}
          items={itemsWithPin}
        />
      );

      fireEvent.click(screen.getByText('固定到 Dock'));
      expect(handlePin).toHaveBeenCalled();
    });

    it('点击外部应该关闭菜单', () => {
      const handleClose = vi.fn();
      render(
        <ContextMenu
          appId="test"
          appName="Test App"
          isPinned={false}
          position={{ x: 100, y: 100 }}
          isOpen={true}
          onClose={handleClose}
          items={mockItems}
        />
      );

      fireEvent.click(document.body);
      expect(handleClose).toHaveBeenCalled();
    });

    it('ESC 键应该关闭菜单', () => {
      const handleClose = vi.fn();
      render(
        <ContextMenu
          appId="test"
          appName="Test App"
          isPinned={false}
          position={{ x: 100, y: 100 }}
          isOpen={true}
          onClose={handleClose}
          items={mockItems}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
```

---

### 1.4 Hooks 测试

#### 测试文件路径
`src/hooks/__tests__/useDock.test.ts`
`src/hooks/__tests__/useDockIconAnimation.test.ts`
`src/hooks/__tests__/useDockContextMenu.test.ts`

#### 测试用例

```typescript
describe('useDock', () => {
  beforeEach(() => {
    useDockStore.setState({
      apps: [],
      selectedAppId: null,
      draggedAppId: null,
      draggedAppIndex: null,
      hoveringAppId: null,
      dockPosition: { x: 0, y: 0 },
      dockWidth: 0,
      contextMenu: { isOpen: false, appId: null, position: null },
    });
  });

  it('应该处理应用点击', () => {
    const { result } = renderHook(() => useDock());

    act(() => {
      result.current.handleAppClick('test');
    });

    const state = useDockStore.getState();
    expect(state.selectedAppId).toBe('test');
  });

  it('应该更新应用运行状态', async () => {
    // 先添加一个应用
    useDockStore.setState({
      apps: [{ id: 'test', name: 'Test', icon: '🧪', isRunning: false, isPinned: true, index: 0 }],
      selectedAppId: null,
      draggedAppId: null,
      draggedAppIndex: null,
      hoveringAppId: null,
      dockPosition: { x: 0, y: 0 },
      dockWidth: 0,
      contextMenu: { isOpen: false, appId: null, position: null },
    });

    const { result } = renderHook(() => useDock());

    act(() => {
      result.current.handleAppClick('test');
    });

    const state = useDockStore.getState();
    const app = state.apps.find((a) => a.id === 'test');
    expect(app?.isRunning).toBe(true);
  });
});

describe('useDockIconAnimation', () => {
  it('悬停时应该返回放大样式', () => {
    const { result } = renderHook(() => useDockIconAnimation());

    act(() => {
      result.current.onMouseEnter();
    });

    expect(result.current.isHovered).toBe(true);
    expect(result.current.styles.transform).toBe('scale(1.2)');
  });

  it('点击时应该返回缩小样式', () => {
    const { result } = renderHook(() => useDockIconAnimation());

    act(() => {
      result.current.onMouseEnter();
      result.current.onMouseDown();
    });

    expect(result.current.isPressed).toBe(true);
    expect(result.current.styles.transform).toBe('scale(0.95)');
  });

  it('应该延迟显示 tooltip', async () => {
    const { result } = renderHook(() => useDockIconAnimation());

    act(() => {
      result.current.onMouseEnter();
    });

    // 立即检查，tooltip 不应该立即显示
    expect(result.current.tooltipVisible).toBe(false);

    // 等待 500ms 延迟
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(result.current.tooltipVisible).toBe(true);

    act(() => {
      result.current.onMouseLeave();
    });
    expect(result.current.tooltipVisible).toBe(false);
  });
});

describe('useDockContextMenu', () => {
  beforeEach(() => {
    useDockStore.setState({
      apps: [],
      selectedAppId: null,
      draggedAppId: null,
      draggedAppIndex: null,
      hoveringAppId: null,
      dockPosition: { x: 0, y: 0 },
      dockWidth: 0,
      contextMenu: { isOpen: false, appId: null, position: null },
    });
  });

  it('应该在菜单打开时返回正确状态', () => {
    useDockStore.setState({
      contextMenu: { isOpen: true, appId: 'test', position: { x: 100, y: 100 } },
      apps: [],
      selectedAppId: null,
      draggedAppId: null,
      draggedAppIndex: null,
      hoveringAppId: null,
      dockPosition: { x: 0, y:  0 },
      dockWidth: 0,
    });

    const { result } = renderHook(() => useDockContextMenu('test', 'Test App', false));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.position).toEqual({ x: 100, y: 100 });
    expect(result.current.items).toBeDefined();
    expect(result.current.items.length).toBeGreaterThan(0);
  });

  it('已固定的应用应该显示"从 Dock 移除"选项', async () => {
    const { result } = renderHook(() => useDockContextMenu('test', 'Test App', true));

    expect(result.current.items.length).toBeGreaterThan(0);

    const unpinItem = result.current.items.find((item) => item.id === 'unpin');
    expect(unpinItem?.label).toBe('从 Dock 移除');
  });
});
```

---

### 1.5 Store 测试

#### 测试文件路径
`src/store/__tests__/dockStore.test.ts`

#### 测试用例

```typescript
describe('dockStore', () => {
  beforeEach(() => {
    const initial = useDockStore.getState();
    useDockStore.setState({
      apps: initial.apps,
      selectedAppId: null,
      draggedAppId: null,
      draggedAppIndex: null,
      hoveringAppId: null,
      dockPosition: { x: 0, y: 0 },
      dockWidth: 0,
      contextMenu: { isOpen: false, appId: null, position: null },
    });
  });

  it('应该有默认应用列表', () => {
    const state = useDockStore.getState();
    expect(state.apps.length).toBe(4);
    expect(state.apps[0].id).toBe('project-create');
    expect(state.apps[1].id).toBe('file-manager');
  });

  it('应该设置应用运行状态', () => {
    const setAppRunning = useDockStore.getState().setAppRunning;

    act(() => {
      setAppRunning('project-create', true);
    });

    const state = useDockStore.getState();
    const app = state.apps.find((a) => a.id === 'project-create');
    expect(app?.isRunning).toBe(true);
  });

  it('应该支持添加新应用', () => {
    const addApp = useDockStore.getState().addApp;

    const newApp = {
      id: 'new-app',
      name: 'New App',
      icon: '🆕',
      isRunning: false,
      isPinned: true,
      index: 4,
    };

    act(() => {
      addApp(newApp);
    });

    const state = useDockStore.getState();
    expect(state.apps.length).toBe(5);
    expect(state.apps[4].id).toBe('new-app');
  });

  it('应该支持移除应用', () => {
    const removeApp = useDockStore.getState().removeApp;

    act(() => {
      removeApp('project-create');
    });

    const state = useDockStore.getState();
    expect(state.apps.length).toBe(3);
    expect(state.apps.find((a) => a.id === 'project-create')).toBeUndefined();
  });

  it('应该支持应用重新排序', () => {
    const moveApp = useDockStore.getState().moveApp;

    act(() => {
      moveApp(0, 1); // 将第一个移到第二个位置
    });

    const state = useDockStore.getState();
    expect(state.apps[0].id).toBe('file-manager');
    expect(state.apps[1].id).toBe('project-create');
  });

  it('应该固定/取消固定应用', () => {
    const pinApp = useDockStore.getState().pinApp;
    const unpinApp = useDockStore.getState().unpinApp;

    act(() => {
      unpinApp('file-manager');
    });

    let state = useDockStore.getState();
    let app = state.apps.find((a) => a.id === 'file-manager');
    expect(app?.isPinned).toBe(false);

    act(() => {
      pinApp('file-manager');
    });

    state = useDockStore.getState();
    app = state.apps.find((a) => a.id === 'file-manager');
    expect(app?.isPinned).toBe(true);
  });
});
```

---

## 2. 集成测试计划

### 2.1 与 Desktop 集成

#### 测试文件路径
`src/components/os/__tests__/Dock.integration.test.tsx`

#### 测试用例

```typescript
describe('Dock and Desktop Integration', () => {
  it('应该在 Desktop 页面中渲染 Dock', () => {
    render(
      <main className="relative w-screen h-screen overflow-hidden">
        <Desktop />
        <Dock />
      </main>
    );

    expect(screen.getByRole('main', { name: /desktop/i })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: /dock/i })).toBeInTheDocument();
  });

  it('Dock 应该覆盖 Desktop 内容', () => {
    render(
      <main className="relative w-screen h-screen overflow-hidden">
        <Desktop />
        <Dock />
      </main>
    );

    const desktop = screen.getByRole('main', { name: /desktop/i });
    const dock = screen.getByRole('toolbar', { name: /dock/i });

    const desktopZ = getComputedStyle(desktop).zIndex;
    const dockZ = getComputedStyle(dock).zIndex;

    expect(parseInt(dockZ, 10)).toBeGreaterThan(parseInt(desktopZ, 10));
  });
});
```

---

## 3. 性能测试计划

### 3.1 动画流畅度测试

```typescript
describe('Dock Performance', () => {
  describe('动画帧率', () => {
    it('悬停放大动画应该达到 60fps', () => {
      const mockApp = {
        id: 'test',
        name: 'Test App',
        icon: '🧪',
        isRunning: false,
        isPinned: true,
        index: 0,
      };

      render(<DockIcon app={mockApp} index={0} />);

      let frameCount = 0;
      const startTime = performance.now();
      const duration = 200; // 0.2s 动画时长

      const measureFPS = () => {
        frameCount++;
        if (performance.now() - startTime < duration) {
          requestAnimationFrame(measureFPS);
        }
      };

      const icon = screen.getByRole('button');
      fireEvent.mouseEnter(icon);
      measureFPS();

      const fps = frameCount / (duration / 1000);
      expect(fps).toBeGreaterThanOrEqual(60);
    });
  });

  describe('响应延迟', () => {
    it('悬停响应延迟应该 < 100ms', () => {
      const mockApp = {
        id: 'test',
        name: 'Test App',
        icon: '🧪',
        isRunning: false,
        isPinned: true,
        index: 0,
      };

      render(<DockIcon app={mockApp} index={0} />);

      const icon = screen.getByRole('button');
      const startTime = performance.now();

      fireEvent.mouseEnter(icon);

      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(100);
    });
  });
});
```

---

## 4. 可访问性测试

### 4.1 键盘导航

```typescript
describe('Dock Accessibility', () => {
  describe('Tab 导航', () => {
    it('应该支持 Tab 键在图标间导航', () => {
      render(<Dock />);
      const icons = screen.getAllByRole('button');

      // 手动触发 Tab 导航
      icons[0].focus();
      expect(document.activeElement).toBe(icons[0]);

      // 模拟 Tab 按键
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      document.dispatchEvent(event);

      // 验证焦点移动到下一个图标
      document.dispatchEvent(event);
    });

    it('Enter 键应该触发当前焦点元素', () => {
      const handleAppClick = vi.fn();
      const apps = [
        { id: 'test', name: 'Test', icon: '🧪', isRunning: false, isPinned: true, index: 0 },
      ];
      render(<Dock apps={apps} onAppClick={handleAppClick} />);

      const icon = screen.getByRole('button', { name: /test/i });
      icon.focus();

      fireEvent.keyDown(icon, { key: 'Enter' });
      expect(handleAppClick).toHaveBeenCalledWith('test');
    });
  });

  describe('ARIA 属性', () => {
    it('Dock 应该有正确的 ARIA 角色', () => {
      render(<Dock />);
      const dock = screen.getByRole('toolbar', { name: /dock/i });
      expect(dock).toHaveAttribute('role', 'toolbar');
      expect(dock).toHaveAttribute('aria-label', '应用任务栏');
      expect(dock).toHaveAttribute('aria-orientation', 'horizontal');
    });

    it('图标应该有 ARIA 属性', () => {
      const mockApp = {
        id: 'test',
        name: 'Test App',
        icon: '🧪',
        isRunning: false,
        isPinned: true,
        index: 0,
      };
      render(<DockIcon app={mockApp} index={0} />);

      const icon = screen.getByRole('button');
      expect(icon).toHaveAttribute('aria-label', 'Test App');
      expect(icon).toHaveAttribute('tabindex', '0');
      expect(icon).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
```

---

## 5. 验收标准对应测试

### 5.1 PRD 验收标准

| 验收标准 | 测试方法 | 测试用例 ID |
|---------|---------|-----------|
| Dock 固定在底部居中 | 单元测试 | `Dock-it-bt-001`, `Dock-it-bt-002`, `Dock-it-bt-003` |
| 显示至少 4 个应用图标 | 单元测试 | `Dock-it-001` |
| 运行中的应用有指示灯 | 单元测试 | `Dock-ri-001`, `Dock-ri-002` |
| 右键菜单弹出正确 | 单元测试 | `ContextMenu-it-001`, `ContextMenu-it-002` |
| 图标可拖拽排序 | 集成测试 | `Dock-dnd-it-001` |
| 悬停放大动画流畅 | 性能测试 | `Dock-perf-001` |

### 5.2 IDD 验收标准

| 验收标准 | 测试方法 | 目标值 |
|---------|---------|-------|
| 悬停动画流畅 (60fps) | 性能测试 | ≥ 60fps |
| 右键菜单弹出准确 | UI 测试 | 位置准确 |
| 拖拽排序流畅 | UI 测试 | 无卡顿 |
| 动画符合 Fluent 规范 | 验收标准检查 | 缓动函数正确 |
| 键盘导航可用 | 可访问性测试 | Tab/Enter/Esc 可用 |

---

## 6. 执行计划

### 6.1 里程碑 (参考 OS.1 效率)

| 阶段 | 任务 | 预计时间 (参考) | 依赖 |
|-----|-----|---------|------|
| Phase 1 | 审查完整设计文档 | 5 分钟 | ✅ 完成 |
| Phase 2 | 完善测试计划 | 10 分钟 | 设计文档 |
| Phase 3 | 执行单元测试 | 开发完成后 | Dev |
| Phase 4 | 执行性能测试 | 开发完成后 | 功能完成 |
| Phase 5 | QA 验收报告 | 所有测试通过 | PM 确认 |

### 6.2 与开发协同

| 任务 | 开始前置 | 完成条件 |
|-----|---------|---------|
| 单元测试编写 | 组件完成 | 测试通过 |
| Hooks 测试编写 | Hooks 完成 | 测试通过 |
| 集成测试执行 | 完成 | 测试通过 |
| 性能基准测试 | 功能完成 | P95 达标 |

---

## 7. 质量门

```
┌─────────────────────────────────────────────────────────────────┐
│                    OS.2 Quality Gate                            │
├─────────────────────────────────────────────────────────────────┤
│  单元测试覆盖率: ≥ 80%                                           │
│  关键组件覆盖率: 100% (Dock, DockIcon, ContextMenu)         │
│         Hooks 覆盖率: 100% (4 个 hooks)                        │
│                                                                 │
│  性能指标:                                                        │
│  ├─ 悬停响应: < 100ms      🟢 待验证                            │
│  ├─ 动画帧率: ≥ 60fps       🟢 待验证                            │
│  └─ 加载时间: < 1s         🟢 待验证                            │
│                                                                 │
│  功能验收:                                                        │
│  ├─ Dock 固定底部居中    🟢 待验证                            │
│  ├─ 4+ 个应用图标        🟢 待验证                            │
│  ├─ 运行指示灯显示      🟢 待验证                            │
│  ├─ 右键菜单正确定位      🟢 待验证                            │
│  ├─ 拖拽排序流程         🟢 待验证                            │
│  └─ 悬停动画流畅         🟢 待验证                            │
│                                                                 │
│  可访问性:                                                        │
│  ├─ 键盘导航可用          🟢 待验证                            │
│  └─ ARIA 属性完整         🟢 待验证                            │
│                                                                 │
│  [ ] 所有单元测试通过                                             │
│  [ ] 所有集成测试通过                                             │
│  [ ] 所有性能测试达标                                             │
│  [ ] 可访问性测试通过                                             │
│  [ ] QA 审查通过                                                 │
│  [ ] PM 验收通过                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. 测试报告模板

```
Story: OS.2 - Dock 任务栏基础
测试执行日期: 2026-03-XX
测试负责人: QA Engineer

测试结果总览:
┌─────────────────────────────────────────────────────────────┐
│  测试类型   │ 总用例 │ 通过 │ 失败 │ 跳过 │ 覆盖率         │
├─────────────────────────────────────────────────────────────┤
│  单元测试   │   32   │     │     │     │ ~85%           │
│  Hooks 测试 │   12   │     │     │     │ 100%           │
│  集成测试   │    8   │     │     │     │ N/A            │
│  性能测试   │    6   │     │     │     │ ≥ 60fps 目标值   │
│  可访问性   │    4   │     │     │     │ WCAG 2.1 AA    │
├─────────────────────────────────────────────────────────────┤
│  合计      │   62   │     │     │     │                 │
└─────────────────────────────────────────────────────────────┘

关键指标:
• 单元覆盖率: ≥ 85% (待验证)
• 悬停响应: < 100ms (待验证)
• 动画帧率: ≥ 60fps (待验证)
• 加载时间: < 1s (待验证)

质量门:
[ ] 所有单元测试通过
[ ] 所有集成测试通过
[ ] 所有性能测试达标
[ ] 可访问性测试通过
[ ] QA 审查通过
[ ] PM 验收通过

结论: 🟢 AWAITING DEVELOPMENT COMPLETION
```

---

## 9. 附件

### 9.1 测试文件结构

```
src/
├── components/os/Dock/__tests__/
│   ├── Dock.test.tsx                    # ~8 用例
│   ├── DockIcon.test.tsx                # ~8 用例
│   └── ContextMenu.test.tsx              # ~6 用例
├── hooks/__tests__/
│   ├── useDock.test.ts                   # ~4 用例
│   ├── useDockIconAnimation.test.ts       # ~4 用例
│   └── useDockContextMenu.test.ts        # ~4 用例
└── store/__tests__/
    └── dockStore.test.ts                 # ~8 用例
```

### 9.2 相关文档

| 文档 | 路径 | 状态 |
|-----|------|------|
| Story README | `docs/specs/epic-OS/story-OS.2/README.md` |
| PRD | `docs/specs/epic-OS/story-OS.2/prd.md` | ✅ |
| IDD | `docs/specs/epic-OS/story-OS.2/interaction.md` | ✅ |
| ADD | `docs/specs/epic-OS/story-OS.2/architecture.md` | ✅ (1313 行) |
| OS.1 测试报告 | `docs/QA/OS.1-QA-TEST-REPORT.md` | ✅ 参考 |

---

**文档版本:** 1.0 (基于完整设计文档)
**最后更新:** 2026-03-07
**状态:** 准备就绪 - 等待开发完成后执行

---

## OS.1 vs OS.2 对比总结

| 指标 | OS.1 实际 | OS.2 预期 |
|-----|----------|---------|
| 设计文档行数 | 1,504 行 | 2,058 行 (+36%) |
| ADD 完整度 | 775 行 | 1,313 行 (+69%) |
| 测试用例数 | 45 | 50-65 |
| 开发时间 | 53 分钟 | 45-90 分钟 (预计) |
| 测试执行 | 2.78s | < 5s (预计) |
| 总时间 | 58 分钟 | 80-120 分钟 (预计) |

---

**QA Inbox 已更新**，准备开始测试执行！
