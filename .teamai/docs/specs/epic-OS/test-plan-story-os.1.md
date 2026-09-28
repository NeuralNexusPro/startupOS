# Story OS.1 测试计划: Desktop 空间框架

**测试负责人:** QA Engineer
**创建日期:** 2026-03-07
**测试范围:** Epic-OS Story OS.1 - Desktop 空间框架
**状态:** 准备就绪 - 等待开发完成后执行

---

## 0. 测试范围摘要

### 核心测试目标
验证 Desktop 空间框架的实现符合 PRD/IDD/ADD 要求：

| 测试类型 | 覆盖范围 | 优先级 |
|---------|---------|-------|
| 单元测试 | Desktop, DesktopGrid, Background, StatusBar, ContextMenu | P0 |
| 集成测试 | 端到端 Desktop 交互流程 | P0 |
| E2E 测试 | 完整用户场景（首次访问、拖拽、响应式） | P1 |
| 性能测试 | 加载时间、动画帧率 | P1 |

### 测试原则
1. **风险导向测试** - 优先测试 P0 关键功能
2. **数据支撑质量门** - 性能指标有明确目标值
3. **组件级测试优先** - 先验证单个组件正确性

---

## 1. 单元测试计划

### 1.1 Desktop 组件

#### 测试文件路径
`src/components/os/__tests__/Desktop.test.tsx`

#### 测试用例

```typescript
describe('Desktop Component', () => {
  describe('渲染测试', () => {
    it('应该渲染为全屏容器', () => {
      render(<Desktop />);
      const desktop = screen.getByRole('main', { name: /desktop/i });
      expect(desktop).toBeInTheDocument();
    });

    it('应该占满 100vw x 100vh', () => {
      render(<Desktop />);
      const desktop = screen.getByRole('main');
      expect(desktop).toHaveStyle({ width: '100vw', height: '100vh' });
    });

    it('不应该有滚动条', () => {
      render(<Desktop />);
      const desktop = screen.getByRole('main');
      expect(desktop).toHaveStyle({ overflow: 'hidden' });
    });

    it('应该包含 StatusBar', () => {
      render(<Desktop />);
      expect(screen.getByLabelText(/status bar/i)).toBeInTheDocument();
    });

    it('应该包含 Background', () => {
      render(<Desktop />);
      expect(screen.getByLabelText(/desktop background/i)).toBeInTheDocument();
    });

    it('应该包含 DesktopGrid', () => {
      const icons = [
        { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } },
      ];
      render(<Desktop icons={icons} />);
      expect(screen.getByRole('grid', { name: /desktop icons/i })).toBeInTheDocument();
    });
  });

  describe('交互测试', () => {
    it('应该响应窗口大小变化', () => {
      render(<Desktop />);

      act(() => {
        window.innerWidth = 800;
        window.dispatchEvent(new Event('resize'));
      });

      const desktop = screen.getByRole('main');
      expect(desktop).toBeInTheDocument();
    });

    it('应该设置初始背景为 #0A0A0A', () => {
      render(<Desktop />);
      const background = screen.getByLabelText(/desktop background/i);
      expect(background).toHaveStyle({ backgroundColor: '#0A0A0A' });
    });
  });
});
```

---

### 1.2 DesktopGrid & DesktopIcon

#### 测试文件路径
`src/components/os/__tests__/DesktopGrid.test.tsx`
`src/components/os/__tests__/DesktopIcon.test.tsx`

#### 测试用例

```typescript
describe('DesktopGrid', () => {
  describe('图标渲染', () => {
    it('应该渲染所有图标', () => {
      const icons = [
        { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } },
        { id: '2', icon: '❓', label: '帮助', position: { x: 1, y: 0 } },
      ];
      render(<DesktopGrid icons={icons} />);

      expect(screen.getByText('设置')).toBeInTheDocument();
      expect(screen.getByText('帮助')).toBeInTheDocument();
    });

    it('应该支持至少 10 个图标', () => {
      const icons = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        icon: '📁',
        label: `图标${i}`,
        position: { x: i % 4, y: Math.floor(i / 4) },
      }));
      render(<DesktopGrid icons={icons} />);

      for (let i = 0; i < 10; i++) {
        expect(screen.getByText(`图标${i}`)).toBeInTheDocument();
      }
    });

    it('应该按网格排列图标', () => {
      const icons = [
        { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } },
        { id: '2', icon: '❓', label: '帮助', position: { x: 1, y: 0 } },
      ];
      render(<DesktopGrid icons={icons} />);

      const grid = screen.getByRole('grid');
      expect(grid).toHaveStyle({
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
      });
    });
  });

  describe('点击交互', () => {
    it('应该处理图标点击', () => {
      const handleClick = vi.fn();
      const icons = [
        { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 }, onClick: handleClick },
      ];
      render(<DesktopIcon {...icons[0]} />);

      fireEvent.click(screen.getByText('设置'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});

describe('DesktopIcon', () => {
  describe('悬停效果', () => {
    it('悬停时应该轻微放大', () => {
      const icon = { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } };
      render(<DesktopIcon {...icon} />);

      const iconElement = screen.getByRole('gridcell');
      fireEvent.mouseEnter(iconElement);

      // 验证 CSS transform
      expect(iconElement).toHaveStyle({
        transform: expect.stringContaining('translateY'),
      });
    });

    it('悬停时应该显示阴影', () => {
      const icon = { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } };
      render(<DesktopIcon {...icon} />);

      const iconElement = screen.getByRole('gridcell');
      fireEvent.mouseHover(iconElement);

      expect(iconElement).toHaveStyle({
        boxShadow: expect.stringContaining('rgba'),
      });
    });
  });

  describe('状态显示', () => {
    it('应该显示 idle 状态', () => {
      const icon = {
        id: '1',
        icon: '⚙️',
        label: '设置',
        position: { x: 0, y: 0 },
        status: 'idle' as const,
      };
      render(<DesktopIcon {...icon} />);

      expect(screen.getByLabelText(/status: idle/i)).toBeInTheDocument();
    });

    it('应该显示 running 状态', () => {
      const icon = {
        id: '1',
        icon: '⚙️',
        label: '设置',
        position: { x: 0, y: 0 },
        status: 'running' as const,
      };
      render(<DesktopIcon {...icon} />);

      expect(screen.getByLabelText(/status: running/i)).toBeInTheDocument();
    });
  });
});
```

---

### 1.3 StatusBar

#### 测试文件路径
`src/components/os/StatusBar/__tests__/index.test.tsx`

#### 测试用例

```typescript
describe('StatusBar', () => {
  describe('时间显示', () => {
    it('应该显示当前时间', () => {
      render(<StatusBar />);
      expect(screen.getByLabelText(/current time/i)).toBeInTheDocument();
    });

    it('时间应该实时更新', () => {
      vi.useFakeTimers();
      render(<StatusBar />);

      const timeElement = screen.getByLabelText(/current time/i);
      const initialTime = timeElement.textContent;

      act(() => {
        vi.advanceTimersByTime(60000); // 前进 1 分钟
      });

      expect(timeElement.textContent).not.toBe(initialTime);
      vi.useRealTimers();
    });
  });

  describe('网络状态', () => {
    it('应该在在线时显示网络图标', () => {
      render(<StatusBar showNetwork />);
      expect(screen.getByLabelText(/network status/i)).toBeInTheDocument();
    });

    it('应该显示 WiFi 图标当连接 WiFi', () => {
      const network = { isOnline: true, type: 'wifi' as const };
      render(<StatusBar network={network} />);
      expect(screen.getByLabelText(/wifi/i)).toBeInTheDocument();
    });

    it('应该在离线时显示离线图标', () => {
      const network = { isOnline: false, type: 'none' as const };
      render(<StatusBar network={network} />);
      expect(screen.getByLabelText(/offline/i)).toBeInTheDocument();
    });
  });

  describe('固定定位', () => {
    it('应该固定在顶部', () => {
      render(<StatusBar />);
      const statusBar = screen.getByLabelText(/status bar/i);
      expect(statusBar).toHaveStyle({ position: 'fixed', top: '0' });
    });

    it('应该有半透明背景', () => {
      render(<StatusBar />);
      const statusBar = screen.getByLabelText(/status bar/i);
      expect(statusBar).toHaveStyle({
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
      });
    });
  });
});
```

---

### 1.4 Background

#### 测试文件路径
`src/components/os/Background/__tests__/index.test.tsx`

#### 测试用例

```typescript
describe('Background', () => {
  describe('纯色背景', () => {
    it('应该显示纯色背景', () => {
      const config = { type: 'solid' as const, color: '#0A0A0A' };
      render(<Background config={config} />);
      const background = screen.getByLabelText(/desktop background/i);
      expect(background).toHaveStyle({ backgroundColor: '#0A0A0A' });
    });

    it('应该允许更改背景色', () => {
      const { rerender } = render(
        <Background config={{ type: 'solid' as const, color: '#0A0A0A' }} />
      );
      let background = screen.getByLabelText(/desktop background/i);
      expect(background).toHaveStyle({ backgroundColor: '#0A0A0A' });

      rerender(<Background config={{ type: 'solid' as const, color: '#FFFFFF' }} />);
      background = screen.getByLabelText(/desktop background/i);
      expect(background).toHaveStyle({ backgroundColor: '#FFFFFF' });
    });
  });

  describe('图片背景', () => {
    it('应该显示背景图片', () => {
      const config = {
        type: 'image' as const,
        imageUrl: 'https://example.com/background.jpg',
      };
      render(<Background config={config} />);
      const background = screen.getByLabelText(/desktop background/i);
      expect(background).toHaveStyle({
        backgroundImage: 'url(https://example.com/background.jpg)',
      });
    });
  });

  describe('粒子效果', () => {
    it('应该支持启用粒子效果', () => {
      const config = {
        type: 'particles' as const,
        particlesEnabled: true,
      };
      render(<Background config={config} />);
      expect(screen.getByLabelText(/particles/i)).toBeInTheDocument();
    });

    it('应该支持禁用粒子效果', () => {
      const config = {
        type: 'solid' as const,
        particlesEnabled: false,
      };
      render(<Background config={config} />);
      expect(screen.queryByLabelText(/particles/i)).not.toBeInTheDocument();
    });
  });
});
```

---

### 1.5 ContextMenu

#### 测试文件路径
`src/components/os/__tests__/ContextMenu.test.tsx`

#### 测试用例

```typescript
describe('ContextMenu', () => {
  describe('菜单渲染', () => {
    it('应该在 isOpen=true 时渲染', () => {
      const items = [
        { id: '1', label: '刷新', onClick: vi.fn() },
        { id: '2', label: '设置', onClick: vi.fn() },
      ];
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          items={items}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('刷新')).toBeInTheDocument();
      expect(screen.getByText('设置')).toBeInTheDocument();
    });

    it('应该在 isOpen=false 时不渲染', () => {
      const items = [{ id: '1', label: '刷新', onClick: vi.fn() }];
      render(
        <ContextMenu
          isOpen={false}
          position={{ x: 100, y: 100 }}
          items={items}
          onClose={vi.fn()}
        />
      );

      expect(screen.queryByText('刷新')).not.toBeInTheDocument();
    });

    it('应该在指定位置显示', () => {
      const items = [{ id: '1', label: '刷新', onClick: vi.fn() }];
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          items={items}
          onClose={vi.fn()}
        />
      );

      const menu = screen.getByRole('menu');
      expect(menu).toHaveStyle({ left: '100px', top: '100px' });
    });
  });

  describe('菜单项交互', () => {
    it('应该处理菜单项点击', () => {
      const handleClick = vi.fn();
      const items = [{ id: '1', label: '刷新', onClick: handleClick }];
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          items={items}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText('刷新'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('点击后应该关闭菜单', () => {
      const handleMenuClose = vi.fn();
      const items = [{ id: '1', label: '刷新', onClick: vi.fn() }];
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          items={items}
          onClose={handleMenuClose}
        />
      );

      fireEvent.click(screen.getByText('刷新'));
      expect(handleMenuClose).toHaveBeenCalledTimes(1);
    });

    it('应该显示分隔符', () => {
      const items = [
        { id: '1', label: '刷新', onClick: vi.fn() },
        { id: '2', label: '设置', onClick: vi.fn(), separator: true },
      ];
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          items={items}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('应该显示快捷键', () => {
      const items = [
        { id: '1', label: '设置', onClick: vi.fn(), shortcut: '⌘,' },
      ];
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          items={items}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('⌘,')).toBeInTheDocument();
    });
  });

  describe('外部点击关闭', () => {
    it('点击外部应该关闭菜单', () => {
      const handleClose = vi.fn();
      const items = [{ id: '1', label: '刷新', onClick: vi.fn() }];
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          items={items}
          onClose={handleClose}
        />
      );

      fireEvent.click(document.body);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
```

---

### 1.6 Hooks 测试

#### 测试文件路径
`src/hooks/__tests__/useDesktopGrid.test.ts`
`src/hooks/__tests__/useDragAndDrop.test.ts`
`src/hooks/__tests__/useResponsive.test.ts`
`src/hooks/__tests__/useContextMenu.test.ts`

#### 测试用例

```typescript
describe('useDesktopGrid', () => {
  it('应该初始化空网格', () => {
    const { result } = renderHook(() => useDesktopGrid({ columns: 3, gap: 24 }));
    expect(result.current.grid.size).toBe(0);
  });

  it('应该添加图标到网格', () => {
    const { result } = renderHook(() => useDesktopGrid({ columns: 3, gap: 24 }));
    act(() => {
      result.current.addToGrid('icon1', { column: 0, row: 0 });
    });
    expect(result.current.grid.get('icon1')).toEqual({ column: 0, row: 0 });
  });

  it('应该移动图标到新位置', () => {
    const { result } = renderHook(() => useDesktopGrid({ columns: 3, gap: 24 }));
    act(() => {
      result.current.addToGrid('icon1', { column: 0, row: 0 });
      result.current.moveInGrid('icon1', { column: 1, row: 0 });
    });
    expect(result.current.grid.get('icon1')).toEqual({ column: 1, row: 0 });
  });

  it('应该获取可用位置', () => {
    const { result } = renderHook(() => useDesktopGrid({ columns: 3, gap: 24 }));
    const position = result.current.getAvailablePosition();
    expect(position).toEqual({ column: 0, row: 0 });
  });

  it('应该移除图标', () => {
    const { result } = renderHook(() => useDesktopGrid({ columns: 3, gap: 24 }));
    act(() => {
      result.current.addToGrid('icon1');
      result.current.removeFromGrid('icon1');
    });
    expect(result.current.grid.has('icon1')).toBe(false);
  });
});

describe('useResponsive', () => {
  it('应该初始化为桌面尺寸', () => {
    const config = {
      breakpoints: { tablet: 1366, desktop: 1920 },
      gridSize: {
        tablet: { columns: 2, rows: 5 },
        desktop: { columns: 4, rows: 5 },
      },
    };
    window.innerWidth = 1920;
    const { result } = renderHook(() => useResponsive(config));
    expect(result.current.size.type).toBe('desktop');
  });

  it('应该切换到平板尺寸', () => {
    const config = {
      breakpoints: { tablet: 1366, desktop: 1920 },
      gridSize: {
        tablet: { columns: 2, rows: 5 },
        desktop: { columns: 4, rows: 5 },
      },
    };
    window.innerWidth = 1366;
    const { result } = renderHook(() => useResponsive(config));
    expect(result.current.size.type).toBe('tablet');
  });

  it('应该响应窗口变化', () => {
    const config = {
      breakpoints: { tablet: 1366, desktop: 1920 },
      gridSize: {
        tablet: { columns: 2, rows: 5 },
        desktop: { columns: 4, rows: 5 },
      },
    };
    window.innerWidth = 1920;
    const { result } = renderHook(() => useResponsive(config));

    expect(result.current.gridSize.columns).toBe(4);

    act(() => {
      window.innerWidth = 1366;
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.gridSize.columns).toBe(2);
  });
});

describe('useContextMenu', () => {
  it('应该打开菜单在指定位置', () => {
    const { result } = renderHook(() => useContextMenu());
    const event = createEvent.contextMenu(window, { clientX: 100, clientY: 100 });

    act(() => {
      result.current.open(event, [{ id: '1', label: '刷新', onClick: vi.fn() }]);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.position).toEqual({ x: 100, y: 100 });
  });

  it('应该关闭菜单', () => {
    const { result } = renderHook(() => useContextMenu());
    const event = createEvent.contextMenu(window, { clientX: 100, clientY: 100 });

    act(() => {
      result.current.open(event, [{ id: '1', label: '刷新', onClick: vi.fn() }]);
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
  });
});
```

---

## 2. 集成测试计划

### 2.1 端到端 Desktop 交互

#### 测试文件路径
`src/components/os/__tests__/Desktop.e2e.test.tsx`

#### 测试用例

```typescript
describe('Desktop E2E Integration', () => {
  describe('首次进入流程', () => {
    it('应该完成完整的加载流程', () => {
      render(<Desktop />);

      // Step 1: 加载状态
      expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();

      // Step 2: 2s 后状态栏淡入
      waitFor(() => {
        expect(screen.getByLabelText(/status bar/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/status bar/i)).toBeVisible();
      }, { timeout: 2500 });

      // Step 3: 图标依次淡入
      waitFor(() => {
        expect(screen.getByRole('grid')).toBeVisible();
        expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it('应该显示所有默认图标', () => {
      render(<Desktop />);

      waitFor(() => {
        expect(screen.getByText('设置')).toBeInTheDocument();
        expect(screen.getByText('帮助')).toBeInTheDocument();
        expect(screen.getByText('关于')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('拖拽流程', () => {
    it('应该完成完整的拖拽流程', () => {
      render(<Desktop />);

      waitFor(() => {
        const icon = screen.getByText('设置');
        fireEvent.mouseDown(icon);

        // 拖拽中状态
        expect(icon).toHaveStyle({ transform: 'translateY(-8px) scale(1.05)' });

        // 模拟拖拽
        fireEvent.mouseMove(icon, { clientX: 100, clientY: 100 });

        // 释放
        fireEvent.mouseUp(icon);

        // 应该吸附到新位置
        expect(icon).toHaveStyle({ transform: 'none' });
      }, { timeout: 3000 });
    });

    it('其他图标应该移开为拖拽图标让出空间', () => {
      render(<Desktop icons={[
        { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } },
        { id: '2', icon: '❓', label: '帮助', position: { x: 1, y: 0 } },
      ]} />);

      const icon1 = screen.getByText('设置');

      act(() => {
        fireEvent.mouseDown(icon1);
        fireDragEvent(icon1, { to: { x: 1, y: 0 } });
      });

      // 验证其他图标位置变化
      const icon2 = screen.getByText('帮助');
      expect(icon2).toHaveStyle({ transform: 'translateX(64px)' });
    });
  });

  describe('右键菜单流程', () => {
    it('应该显示正确的菜单项', () => {
      render(<Desktop />);

      const desktop = screen.getByRole('main');
      fireEvent.contextMenu(desktop);

      expect(screen.getByText('刷新')).toBeInTheDocument();
      expect(screen.getByText('新建 Folder')).toBeInTheDocument();
      expect(screen.getByText('设置')).toBeInTheDocument();
    });

    it('应该执行菜单项动作', () => {
      render(<Desktop />);

      const desktop = screen.getByRole('main');
      fireEvent.contextMenu(desktop);

      const refreshItem = screen.getByText('刷新');
      fireEvent.click(refreshItem);

      // 验证刷新动作执行（例如页面重新加载或状态更新）
      // 具体验收方式取决于实际实现
    });
  });
});
```

---

### 2.2 响应式切换测试

#### 测试文件路径
`src/components/os/__tests__/Responsive.test.tsx`

#### 测试用例

```typescript
describe('Responsive Layout', () => {
  describe('Desktop Large (≥1920px)', () => {
    beforeEach(() => {
      window.innerWidth = 1920;
      act(() => window.dispatchEvent(new Event('resize')));
    });

    it('应该显示 4 列布局', () => {
      render(<Desktop />);
      const grid = screen.getByRole('grid');
      expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(4, 1fr)' });
    });

    it('图标间距应该是 24px', () => {
      render(<Desktop />);
      const grid = screen.getByRole('grid');
      expect(grid).toHaveStyle({ gap: '24px' });
    });

    it('图标大小应该是 64px', () => {
      render(<Desktop />);
      const icon = screen.getByRole('gridcell');
      expect(icon).toHaveStyle({ width: '64px', height: '64px' });
    });
  });

  describe('Desktop Medium (1366-1919px)', () => {
    beforeEach(() => {
      window.innerWidth = 1366;
      act(() => window.dispatchEvent(new Event('resize')));
    });

    it('应该显示 3 列布局', () => {
      render(<Desktop />);
      const grid = screen.getByRole('grid');
      expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(3, 1fr)' });
    });

    it('图标间距应该是 20px', () => {
      render(<Desktop />);
      const grid = screen.getByRole('grid');
      expect(grid).toHaveStyle({ gap: '20px' });
    });
  });

  describe('Tablet (≤1365px)', () => {
    beforeEach(() => {
      window.innerWidth = 768;
      act(() => window.dispatchEvent(new Event('resize')));
    });

    it('应该显示 2 列布局', () => {
      render(<Desktop />);
      const grid = screen.getByRole('grid');
      expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(2, 1fr)' });
    });

    it('图标间距应该是 16px', () => {
      render(<Desktop />);
      const grid = screen.getByRole('grid');
      expect(grid).toHaveStyle({ gap: '16px' });
    });

    it('图标大小应该是 56px', () => {
      render(<Desktop />);
      const icon = screen.getByRole('gridcell');
      expect(icon).toHaveStyle({ width: '56px', height: '56px' });
    });
  });
});
```

---

## 3. E2E 测试计划

### 3.1 用户场景测试

#### 测试文件路径
`src/components/os/__tests__/scenarios/os1-scenarios.test.tsx`

#### 场景 1: 首次进入 OriginOS

```typescript
describe('User Scenario: First Time Entry', () => {
  it('Alice 首次进入 OriginOS 的完整流程', async () => {
    // 1. Alice 打开 OriginOS 应用
    render(<Desktop />);

    // 2. 看到类似 macOS 的桌面空间
    waitFor(() => {
      const desktop = screen.getByRole('main');
      expect(desktop).toHaveStyle({ width: '100vw', height: '100vh' });
    }, { timeout: 2000 });

    // 3. 顶部状态栏显示时间和网络
    waitFor(() => {
      expect(screen.getByLabelText(/current time/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/network status/i)).toBeInTheDocument();
    }, { timeout: 2500 });

    // 4. 桌面有 3 个图标（设置、帮助、关于）
    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('帮助')).toBeInTheDocument();
    expect(screen.getByText('关于')).toBeInTheDocument();

    // 5. 点击 "设置" 图标，打开设置面板
    const settingsIcon = screen.getByText('设置');
    const handlePanelOpen = vi.fn();
    settingsIcon.onclick = handlePanelOpen;

    fireEvent.click(settingsIcon);
    expect(handlePanelOpen).toHaveBeenCalledTimes(1);

    // 6. 验证：界面看起来像原生 OS
    const statusBar = screen.getByLabelText(/status bar/i);
    expect(statusBar).toHaveStyle({ position: 'fixed' });
  });
});
```

#### 场景 2: 用户自定义桌面

```typescript
describe('User Scenario: Customize Desktop', () => {
  it('Bob 自定义桌面的完整流程', () => {
    // 1. Bob 打开 OriginOS
    render(<Desktop />);

    // 2. 拖拽 "帮助" 图标到新位置
    const helpIcon = screen.getByText('帮助');

    act(() => {
      fireEvent.mouseDown(helpIcon);
      // 模拟拖拽到新位置
      fireDragEvent(helpIcon, { from: { x: 0, y: 0 }, to: { x: 2, y: 1 } });
      fireEvent.mouseUp(helpIcon);
    });

    // 3. 验证：图标自动吸附到网格
    const gridPosition = getComputedStyle(helpIcon);
    expect(gridPosition.transform).toMatch(/translate/);

    // 4. 右键桌面，选择 "设置"
    const desktop = screen.getByRole('main');
    fireEvent.contextMenu(desktop);

    const settingsMenuItem = screen.getByText('设置');
    fireEvent.click(settingsMenuItem);

    // 5. 验证：背景设置面板打开
    expect(screen.getByLabelText(/background settings/i)).toBeInTheDocument();

    // 6. 更改背景图片
    const bgInput = screen.getByLabelText(/background image/i);
    fireEvent.change(bgInput, { target: { value: 'https://example.com/bg.jpg' } });

    // 7. 验证：桌面背景更新
    const background = screen.getByLabelText(/desktop background/i);
    expect(background).toHaveStyle({
      backgroundImage: 'url(https://example.com/bg.jpg)',
    });
  });
});
```

#### 场景 3: 响应式切换

```typescript
describe('User Scenario: Responsive Switch', () => {
  it('Charlie 在不同设备上的完整流程', () => {
    // 1. Charlie 在笔记本（1366x768）上开发
    window.innerWidth = 1366;
    window.innerHeight = 768;
    act(() => window.dispatchEvent(new Event('resize')));

    render(<Desktop />);

    // 2. 验证：图标网格自动调整
    const grid = screen.getByRole('grid');
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(3, 1fr)' });

    // 3. 切换到外接显示器（1920x1080）
    window.innerWidth = 1920;
    window.innerHeight = 1080;
    act(() => window.dispatchEvent(new Event('resize')));

    // 4. 验证：图标网格扩展
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(4, 1fr)' });

    // 5. 在平板（768x1024）上查看
    window.innerWidth = 768;
    window.innerHeight = 1024;
    act(() => window.dispatchEvent(new Event('resize')));

    // 6. 验证：图标变 2 列布局
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(2, 1fr)' });

    const icon = screen.getByRole('gridcell');
    expect(icon).toHaveStyle({ width: '56px', height: '56px' });

    // 7. 验证：用户体验一致性（所有图标仍然可见）
    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('帮助')).toBeInTheDocument();
  });
});
```

---

## 4. 性能测试计划

### 4.1 加载时间测试

```typescript
describe('Performance Tests', () => {
  describe('加载时间', () => {
    it('初始加载时间应该 < 2s', () => {
      const startTime = performance.now();
      render(<Desktop />);

      waitFor(() => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        expect(duration).toBeLessThan(2000);
      }, { timeout: 2500 });
    });

    it('状态栏淡入应该在 0.3s 内完成', () => {
      render(<Desktop />);

      const startTime = performance.now();
      waitFor(() => {
        expect(screen.getByLabelText(/status bar/i)).toBeVisible();
        const endTime = performance.now();
        const duration = endTime - startTime;
        expect(duration).toBeLessThan(300);
      }, { timeout: 500 });
    });
  });

  describe('动画帧率', () => {
    it('悬停动画应该达到 60fps', () => {
      render(<Desktop />);
      const icon = screen.getByText('设置');

      let frameCount = 0;
      const startTime = performance.now();
      const duration = 1000; // 1 秒

      const measureFPS = () => {
        frameCount++;
        if (performance.now() - startTime < duration) {
          requestAnimationFrame(measureFPS);
        }
      };

      fireEvent.mouseEnter(icon);
      measureFPS();

      const fps = frameCount / (duration / 1000);
      expect(fps).toBeGreaterThanOrEqual(60);
    });

    it('拖拽动画应该达到 60fps', () => {
      render(<Desktop />);
      const icon = screen.getByText('设置');

      let frameCount = 0;
      const startTime = performance.now();
      const duration = 1000;

      const measureFPS = () => {
        frameCount++;
        if (performance.now() - startTime < duration) {
          requestAnimationFrame(measureFPS);
        }
      };

      act(() => {
        fireEvent.mouseDown(icon);
        measureFPS();
      });

      const fps = frameCount / (duration / 1000);
      expect(fps).toBeGreaterThanOrEqual(60);
    });
  });

  describe('粒子性能', () => {
    it('粒子效果 CPU 占用应该 < 10%', () => {
      const config = {
        type: 'particles' as const,
        particlesEnabled: true,
      };
      render(<Background config={config} />);

      // 使用 Performance API 测量
      const startCpuMark = performance.now();
      const measureDuration = 2000;

      waitFor(() => {
        const endCpuMark = performance.now();
        const cpuTime = endCpuMark - startCpuMark;
        const cpuPercent = (cpuTime / measureDuration) * 100;

        expect(cpuPercent).toBeLessThan(10);
      }, { timeout: 3000 });
    });
  });

  describe('拖拽无延迟', () => {
    it('拖拽开始响应时间应该 < 16ms (60fps)', () => {
      render(<Desktop />);
      const icon = screen.getByText('设置');

      const startTime = performance.now();
      fireEvent.mouseDown(icon);
      const endTime = performance.now();

      const latency = endTime - startTime;
      expect(latency).toBeLessThan(16);
    });
  });
});
```

---

## 5. 可访问性测试

### 5.1 键盘导航

```typescript
describe('Accessibility Tests', () => {
  describe('键盘导航', () => {
    it('Tab 键应该在图标间导航', () => {
      render(<Desktop icons={[
        { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } },
        { id: '2', icon: '❓', label: '帮助', position: { x: 1, y: 0 } },
      ]} />);

      const settingsIcon = screen.getByText('设置');
      settingsIcon.focus();

      // 按 Tab 键
      fireEvent.keyDown(document, { key: 'Tab', code: 'Tab' });

      // 焦点应该移动到下一个图标
      const helpIcon = screen.getByText('帮助');
      expect(helpIcon).toHaveFocus();
    });

    it('Enter 键应该触发选中项', () => {
      const handleClick = vi.fn();
      render(<Desktop icons={[
        { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 }, onClick: handleClick },
      ]} />);

      const settingsIcon = screen.getByText('设置');
      settingsIcon.focus();

      fireEvent.keyDown(settingsIcon, { key: 'Enter', code: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('Esc 键应该关闭菜单', () => {
      const handleMenuClose = vi.fn();
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 100 }}
          items={[{ id: '1', label: '刷新', onClick: vi.fn() }]}
          onClose={handleMenuClose}
        />
      );

      const menu = screen.getByRole('menu');
      menu.focus();

      fireEvent.keyDown(menu, { key: 'Escape', code: 'Escape' });
      expect(handleMenuClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('屏幕阅读器', () => {
    it('Desktop 应该有正确的 ARIA 角色', () => {
      render(<Desktop />);
      const desktop = screen.getByRole('main');
      expect(desktop).toHaveAttribute('role', 'grid');
      expect(desktop).toHaveAttribute('aria-label', '桌面图标');
    });

    it('图标应该有正确的 ARIA 角色', () => {
      render(<Desktop icons={[
        { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } },
      ]} />);

      const icon = screen.getByRole('gridcell');
      expect(icon).toHaveAttribute('aria-label', '设置');
      expect(icon).toHaveAttribute('tabindex', '0');
    });
  });
});
```

---

## 6. 验收标准

### 6.1 功能验收

| 标准 | 测量方法 | 目标值 | 测试类型 |
|-----|---------|-------|---------|
| Desktop 占满全屏 | 屏幕截取验证 | 100vw × 100vh | 单元 |
| 图标可拖拽 | 拖拽测试 | 成功拖拽到新位置 | 单元 + 集成 |
| 状态栏显示正确 | 单元测试 | 时间 + 网络图标 | 单元 |
| 响应式布局正常 | 断点测试 | 3 种尺寸正常 | 集成 |
| 右键菜单弹出 | 交互测试 | 正确弹出和关闭 | 单元 |

### 6.2 性能验收

| 指标 | 目标值 | 测量方法 |
|-----|-------|----------|
| 加载时间 | < 2s | Performance API |
| 动画帧率 | ≥ 60fps | requestAnimationFrame |
| 粒子 CPU 占用 | < 10% | Performance API |
| 拖拽响应 | < 16ms | 事件监听 |

### 6.3 质量门

```
┌─────────────────────────────────────────────────────────────────┐
│                    OS.1 Quality Gate                            │
├─────────────────────────────────────────────────────────────────┤
│  单元测试覆盖率: ≥ 80%                                           │
│  关键组件覆盖率: 100% (Desktop, StatusBar, DesktopGrid)         │
│                                                                 │
│  性能指标:                                                        │
│  ├─ 加载时间: < 2s        🟢 待验证                            │
│  ├─ 动画帧率: ≥ 60fps     🟢 待验证                            │
│  ├─ 粒子性能: CPU < 10%   🟢 待验证                            │
│  └─ 拖拽响应: < 16ms      🟢 待验证                            │
│                                                                 │
│  功能验收:                                                        │
│  ├─ 全屏显示: 100vw × 100vh  🟢 待验证                         │
│  ├─ 拖拽流畅: 成功重新排列     🟢 待验证                         │
│  ├─ 响应式: 3 种断点正常       🟢 待验证                         │
│  └─ 右键菜单: 正确弹出关闭     🟢 待验证                         │
│                                                                 │
│  [ ] 所有单元测试通过                                             │
│  [ ] 所有集成测试通过                                             │
│  [ ] 所有 E2E 测试通过                                            │
│  [ ] 所有性能测试达标                                             │
│  [ ] 可访问性测试通过                                             │
│  [ ] QA 审查通过                                                 │
│  [ ] PM 验收通过                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 测试环境要求

### 7.1 依赖项

| 组件 | 版本 | 用途 |
|-----|------|------|
| Vitest | Latest | 测试框架 |
| @testing-library/react | Latest | React 组件测试 |
| @testing-library/jest-dom | Latest | Jest DOM 匹配器 |
| @testing-library/user-event | Latest | 用户事件模拟 |
| @dnd-kit/core | ^6.1.0 | 拖拽测试 |
| Zustand | ^4.4.0 | Store 测试 |

### 7.2 Mock 策略

```typescript
// 窗口 resize mock
vi.stubGlobal('innerWidth', 1920);
vi.stubGlobal('innerHeight', 1080);

// 性能 API mock
vi.spyOn(performance, 'now').mockReturnValue(Date.now());

// 动画帧 mock
vi.stubGlobal('requestAnimationFrame', (cb) => {
  return setTimeout(cb, 16);
});
```

### 7.3 测试数据

```typescript
// src/components/os/__tests__/fixtures/icon-fixtures.ts
export const MOCK_ICONS = {
  minimal: [
    { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } },
  ],
  typical: [
    { id: '1', icon: '⚙️', label: '设置', position: { x: 0, y: 0 } },
    { id: '2', icon: '❓', label: '帮助', position: { x: 1, y: 0 } },
    { id: '3', icon: 'ℹ️', label: '关于', position: { x: 2, y: 0 } },
  ],
  stress: Array.from({ length: 50 }, (_, i) => ({
    id: String(i),
    icon: '📁',
    label: `图标${i}`,
    position: { x: i % 4, y: Math.floor(i / 4) },
  })),
};

export const MOCK_MENU_ITEMS = [
  { id: '1', label: '刷新', onClick: vi.fn() },
  { id: '2', label: '新建 Folder', onClick: vi.fn() },
  { id: '3', label: '设置...', onClick: vi.fn(), shortcut: '⌘,' },
];

export const MOCK_NETWORK_STATUS = {
  online: { isOnline: true, type: 'wifi' as const, strength: 4 },
  offline: { isOnline: false, type: 'none' as const },
};
```

---

## 8. 执行计划

### 8.1 里程碑

| 阶段 | 任务 | 天数 | 负责人 |
|-----|-----|------|--------|
| Phase 1 | 创建测试框架 + fixtures | 0.5 | QA |
| Phase 2 | 单元测试编写 | 1 | QA |
| Phase 3 | 集成测试编写 | 0.5 | QA |
| Phase 4 | E2E 场景测试 | 0.5 | QA |
| Phase 5 | 性能测试执行 | 0.5 | QA |
| Phase 6 | 可访问性测试 | 0.5 | QA |
| Phase 7 | Bug 修复验证 | 按需 | Developer + QA |
| Phase 8 | PM 验收协调 | 0.5 | QA + PM |

**总计: 4 天** (与开发周期 4 天并行为 1 周)

### 8.2 与开发协同

| 任务 | 开始前置 | 完成条件 |
|-----|---------|---------|
| 单元测试编写 | Desktop 组件完成 | 测试通过 |
| 集成测试编写 | 所有组件完成 | E2E 流程通过 |
| 性能测试执行 | 动画实现完成 | P95 达标 |
| 验收测试执行 | 所有测试通过 | PM 签字 |

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|-----|-----|-----|---------|
| 性能不达标 | Medium | High | 提前基准测试，优化建议 |
| 响应式复杂 | Low | Medium | 优先 3 种目标尺寸测试 |
| 拖拽不稳定 | Low | Medium | 使用成熟库 (dnd-kit) |
| 动画卡顿 | Low | High | 使用 CSS transitions |
| 测试环境差异 | Medium | Low | 多浏览器测试计划 |

---

## 10. 测试报告模板

### 测试执行摘要

```
Story: OS.1 - Desktop 空间框架
测试执行日期: 2026-03-XX
测试负责人: QA Engineer

测试结果总览:
┌─────────────────────────────────────────────────────────────┐
│  测试类型   │ 总用例 │ 通过 │ 失败 │ 跳过 │ 覆盖率         │
├─────────────────────────────────────────────────────────────┤
│  单元测试   │   65   │  64  │   1  │   0  │ 82%            │
│  集成测试   │   18   │  18  │   0  │   0  │ N/A (E2E)      │
│  E2E 测试   │    8   │   8  │   0  │   0  │ 场景覆盖: 100%  │
│  性能测试   │    5   │   4  │   1  │   0  │ 达标率: 80%    │
│  可访问性   │    6   │   6  │   0  │   0  │ WCAG 2.1 AA    │
├─────────────────────────────────────────────────────────────┤
│  合计      │  102   │  100 │   2  │   0  │                 │
└─────────────────────────────────────────────────────────────┘

关键指标:
• 单元覆盖率: 82% (目标 ≥ 80%) ✅
• 加载时间: 1.8s (目标 < 2s) ✅
• 动画帧率: 58fps (目标 ≥ 60fps) ⚠️
• 粒子性能: 8% (目标 < 10%) ✅
• 拖拽响应: 14ms (目标 < 16ms) ✅

质量门:
[✅] 所有单元测试通过
[✅] 所有集成测试通过
[✅] 所有 E2E 测试通过
[⚠️] 所有性能测试达标 (4/5 达标)
[✅] 可访问性测试通过
[✅] QA 审查通过
[ ] PM 验收通过 (待执行)

建议:
1. 性能优化: investigate 58fps case (drag animation)
2. 失败用例: useDesktopGrid edge case with overflow

结论: 🟢 APPROVED (附带上述优化建议)
```

---

## 11. 附件

### 11.1 测试文件结构

```
src/components/os/
├── __tests__/
│   ├── fixtures/
│   │   ├── icon-fixtures.ts
│   │   └── menu-fixtures.ts
│   ├── scenarios/
│   │   └── os1-scenarios.test.tsx      # 用户场景测试
│   ├── Desktop.test.tsx                # ~15 用例
│   ├── DesktopGrid.test.tsx            # ~10 用例
│   ├── DesktopIcon.test.tsx            # ~12 用例
│   ├── Desktop.e2e.test.tsx            # ~8 用例
│   ├── Responsive.test.tsx             # ~9 用例
│   └── Background/__tests__/index.test.tsx  # ~8 用例
├── StatusBar/__tests__/
│   └── index.test.tsx                  # ~13 用例
└── ContextMenu.__tests__/*.test.tsx    # ~5 用例

src/hooks/__tests__/
├── useDesktopGrid.test.ts              # ~6 用例
├── useDragAndDrop.test.ts              # ~4 用例
├── useResponsive.test.ts               # ~5 用例
└── useContextMenu.test.ts              # ~3 用例
```

### 11.2 相关文档

| 文档 | 路径 |
|-----|------|
| Story OS.1 PRD | `docs/specs/epic-OS/story-OS.1/prd.md` |
| Story OS.1 IDD | `docs/specs/epic-OS/story-OS.1/interaction.md` |
| Story OS.1 ADD | `docs/specs/epic-OS/story-OS.1/architecture.md` |
| Epic-OS README | `docs/specs/epic-OS/README.md` |

---

**文档版本:** 1.0
**最后更新:** 2026-03-07
**状态:** 准备就绪 - 等待开发完成后执行
