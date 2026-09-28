# Spotlight 快捷键修复测试计划
**Story**: OS.4 Spotlight 全局命令
**优先级**: P0 - Critical Bug
**预期时间**: 1天

---

## 📋 问题概述

**问题**: Spotlight 全局搜索的快捷键 (Ctrl+K / Cmd+K) 无法正常工作。

**根本原因分析**:
```typescript
// src/components/os/spotlight/index.tsx
export default function Spotlight({ items }: SpotlightProps) {
  const { isOpen, close } = useSpotlight();
  useSpotlightSearch(items);

  if (!isOpen) return null;  // ⚠️ 问题: 返回null导致组件卸载
  // ...
}
```

组件返回 `null` 时，React 立即卸载组件，清理 `useEffect` 中的事件监听器，导致快捷键无法触发。

---

## 🎯 测试目标

1. 验证快捷键修复方案正确性
2. 确保修复不引入新问题
3. 验证所有浏览器兼容性
4. 确保 Spotlight 功能完整可用

---

## 🔍 测试策略

### 策略 1: 单元测试
- 测试 `useGlobalShortcut` Hook
- 测试 `useSpotlight` Hook
- 测试 `spotlightStore` 状态管理

### 策略 2: 集成测试
- 测试 Spotlight 组件与快捷键集成
- 测试键盘事件处理
- 测试打开/关闭状态切换

### 策略 3: E2E测试
- 完整的用户交互流程
- 浏览器兼容性测试
- 键盘导航测试

---

## 📝 测试用例

### Test Suite 1: useGlobalShortcut Hook

```typescript
describe('useGlobalShortcut', () => {
  it('should register keyboard event listener on mount', () => {
    // Mock addEventListener
    // Verify listener is called with correct key and modifiers
  });

  it('should call callback when correct shortcut is pressed', () => {
    // Dispatch keyboard event
    // Verify callback is invoked
  });

  it('should not call callback when different keys are pressed', () => {
    // Dispatch non-matching keyboard events
    // Verify callback is NOT invoked
  });

  it('should clean up event listener on unmount', () => {
    // Mock removeEventListener
    // Unmount component
    // Verify cleanup occurred
  });

  it('should support Ctrl+K on non-Mac platforms', () => {
    // Set platform to Windows/Linux
    // Test Ctrl+K shortcut
  });

  it('should support Cmd+K on Mac platform', () => {
    // Set platform to Mac
    // Test Cmd+K (metaKey) shortcut
  });

  it('should support Shift modifier', () => {
    // Configure shortcut with shift modifier
    // Test Shift+Ctrl+K
  });
});
```

---

### Test Suite 2: useSpotlight Hook

```typescript
describe('useSpotlight', () => {
  it('should register global shortcut for opening Spotlight', () => {
    // Verify useGlobalShortcut is called correctly
    // Test Ctrl+K opens Spotlight
  });

  it('should close Spotlight on Escape key', () => {
    // Open Spotlight
    // Press Escape
    // Verify isOpen is false
  });

  it('should navigate results with Arrow keys', () => {
    // Open Spotlight with results
    // Press ArrowDown
    // Verify selectedIndex increments
    // Press ArrowUp
    // Verify selectedIndex decrements
  });

  it('should execute selected result on Enter', () => {
    // Open Spotlight with results
    // Navigate to item
    // Press Enter
    // Verify action is called
  });

  it('should not handle shortcuts when Spotlight is closed', () => {
    // Ensure Spotlight is closed
    // Press ArrowUp/Down/Enter
    // Verify no unintended actions
  });

  it('should handle keyboard event cleanup', () => {
    // Setup listeners
    // Unmount context
    // Verify all listeners removed
  });
});
```

---

### Test Suite 3: spotlightStore

```typescript
describe('spotlightStore', () => {
  it('should initialize with correct default state', () => {
    const state = useSpotlightStore.getState();
    expect(state.isOpen).toBe(false);
    expect(results).toEqual([]);
  });

  it('should open Spotlight with clean state', () => {
    const { open } = useSpotlightStore.getState();
    open();
    const state = useSpotlightStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.query).toBe('');
    expect(state.selectedIndex).toBe(0);
  });

  it('should close Spotlight with cleanup', () => {
    // Open and set some state
    const { open, close } = useSpotlightStore.getState();
    open();
    close();
    const state = useSpotlightStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
  });

  it('should update query and reset selection', () => {
    const { setQuery } = useSpotlightStore.getState();
    setQuery('test');
    const state = useSpotlightStore.getState();
    expect(state.query).toBe('test');
    expect(state.selectedIndex).toBe(0);
  });

  it('should cycle through results with next/previous', () => {
    const { setResults, selectNext, selectPrevious } = useSpotlightStore.getState();
    setResults([{id: '1'}, {id: '2'}, {id: '3'}]);

    selectNext();
    expect(state.selectedIndex).toBe(1);

    selectNext();
    expect(state.selectedIndex).toBe(2);

    // Should wrap around
    selectNext();
    expect(state.selectedIndex).toBe(0);

    selectPrevious();
    expect(state.selectedIndex).toBe(2);
  });

  it('should execute selected item action', async () => {
    const mockAction = vi.fn().mockResolvedValue(undefined);
    const { setResults, executeSelected } = useSpotlightStore.getState();
    setResults([{id: '1', action: mockAction}]);

    await executeSelected();
    expect(mockAction).toHaveBeenCalled();
  });
});
```

---

### Test Suite 4: Integration Tests

```typescript
describe('Spotlight Integration', () => {
  beforeEach(() => {
    render(
      <Spotlight items={mockItems} />
    );
  });

  it('should render nothing when closed', () => {
    // Spotlight returns null when isOpen is false
    // Verify DOM is clean (no Spotlight elements)
  });

  it('should add global shortcut handler on mount', () => {
    // Mock useGlobalShortcut
    // Verify it's called with correct options
  });

  it('should open Spotlight when Ctrl+K is pressed', async () => {
    // Simulate Ctrl+K keydown
    // Verify Spotlight UI appears
    // Verify search input is focused
  });

  it('should close Spotlight when Escape is pressed', async () => {
    // Open Spotlight
    // Press Escape
    // Verify Spotlight disappears
  });

  it('should keep global shortcut registered even when closed', () => {
    // Open Spotlight
    // Close Spotlight
    // Verify Ctrl+K still opens it again
  });

  it('should display search input and results correctly', () => {
    // Open Spotlight
    // Verify search input exists
    // Verify results display correctly
  });

  it('should filter results based on search query', () => {
    // Open Spotlight
    // Type search query
    // Verify results are filtered
  });

  it('should handle fuzzy matching', () => {
    // Test partial matches, case insensitive
  });

  it('should have correct z-index and positioning', () => {
    // Open Spotlight
    // Verify it's on top of other elements (z-50)
    // Verify positioning is correct
  });

  it('should click outside to close', () => {
    // Open Spotlight
    // Click backdrop
    // Verify Spotlight closes
  });
});
```

---

### Test Suite 5: E2E Tests (Playwright)

```typescript
describe('Spotlight E2E Tests', () => {
  beforeEach(async () => {
    await page.goto('http://localhost:3000');
  });

  test('should open Spotlight with Ctrl+K', async () => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('.fixed.inset-0.z-50')).toBeVisible();
    await expect(page.locator('[role="textbox"]')).toBeFocused();
  });

  test('should open Spotlight with Cmd+K on Mac', async ({ context }) => {
    const isMac = (await context.evaluate(() => navigator.platform)).includes('Mac');
    if (isMac) {
      await page.keyboard.press('Meta+k');
      await expect(page.locator('.fixed.inset-0.z-50')).toBeVisible();
    }
  });

  test('should close Spotlight with Escape', async () => {
    // Open Spotlight
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Escape');
    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible();
  });

  test('should filter search results', async () => {
    await page.keyboard.press('Control+k');
    const searchBox = page.locator('[role="textbox"]');
    await searchBox.fill('set');
    await expect(page.locator('text=系统设置')).toBeVisible();
    await expect(page.locator('text=帮助文档')).toBeHidden();
  });

  test('should navigate results with arrow keys', async () => {
    await page.keyboard.press('Control+k');
    await page.keyboard.press('ArrowDown');
    // Verify first result is selected/highlighted
    await page.keyboard.press('ArrowDown');
    // Verify second result is selected
  });

  test('should execute action on Enter', async () => {
    const consoleLog = [];
    page.on('console', msg => {
      if (msg.text().includes('Open Settings')) {
        consoleLog.push(msg.text());
      }
    });
    await page.keyboard.press('Control+k');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible();
    // Verify action was executed
  });

  test('should close on clicking outside', async () => {
    await page.keyboard.press('Control+k');
    await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible();
  });

  test('should have correct styling and positioning', async () => {
    await page.keyboard.press('Control+k');
    const spotlight = page.locator('.fixed.inset-0.z-50');
    await expect(spotlight).toHaveCSS('position', 'fixed');
    const zindex = await spotlight.evaluate(el => window.getComputedStyle(el).zIndex);
    expect(zindex).toBe('50');
  });
});
```

---

### Test Suite 6: Browser Compatibility

```typescript
describe('Spotlight Browser Compatibility', () => {
  const browsers = ['chromium', 'firefox', 'webkit'];

  browsers.forEach(browserType => {
    test(`should work in ${browserType}`, async () => {
      const browser = await playwright[browserType].launch();
      const page = await browser.newPage();
      await page.goto('http://localhost:3000');

      await page.keyboard.press('Control+k');
      await expect(page.locator('.fixed.inset-0.z-50')).toBeVisible();

      await browser.close();
    });
  });
});
```

---

## 🔧 修复方案测试

### 方案 A: 将快捷键监听移到 Desktop/主页组件

**测试点**:
```typescript
describe('Fix: Move shortcut listener to parent', () => {
  it('should register shortcuts in parent component', () => {
    // Verify parent component has useGlobalShortcut
  });

  it('should open Spotlight from parent component', () => {
    // Press shortcut
    // Verify Spotlight store isOpen becomes true
  });

  it('should not unmount listener when Spotlight closes', () => {
    // Open Spotlight
    // Close Spotlight
    // Verify listener still active
  });
});
```

### 方案 B: 使用 CSS 隐藏代替 `return null`

**测试点**:
```typescript
describe('Fix: CSS hide instead of null return', () => {
  it('should keep component mounted when closed', () => {
    // Verify spotlight element exists in DOM
    // Verify it has display: none or opacity-0
  });

  it('should show Spotlight when open', () => {
    // Trigger open
    // Verify element becomes visible
  });

  it('should have proper z-index layering', () => {
    // Verify z-index works correctly
    // Verify backdrop covers page content
  });
});
```

---

## 📊 测试覆盖率目标

| 模块 | 目标覆盖率 | 测试文件 |
|------|-----------|---------|
| useGlobalShortcut | 95%+ | src/hooks/__tests__/useGlobalShortcut.test.ts |
| useSpotlight | 90%+ | src/hooks/__tests__/useSpotlight.test.ts |
| spotlightStore | 100% | src/store/__tests__/spotlightStore.test.ts |
| Spotlight 组件 | 85%+ | src/components/os/spotlight/__tests__/integration.test.tsx |
| E2E 流程 | 关键用户路径 | tests/e2e/spotlight.spec.ts |

---

## ✅ 验收标准

1. ✅ 快捷键 (Ctrl+K / Cmd+K) 可以打开 Spotlight
2. ✅ 快捷键在所有浏览器中工作
3. ✅ 键盘导航（方向键、Enter、Escape）正常
4. ✅ 搜索过滤和模糊匹配工作
5. ✅ 单元测试覆盖率 >90%
6. ✅ E2E 测试全部通过
7. ✅ 无新的 console 错误或警告
8. ✅ 性能无明显下降（<10ms 响应时间）

---

## 🚀 实施步骤

1. **设计阶段** (2小时)
   - 确定修复方案
   - 设计测试用例
   - 准备 mock 数据

2. **实现阶段** (4小时)
   - 实现修复方案
   - 编写单元测试
   - 编写集成测试
   - 编写 E2E 测试

3. **验证阶段** (2小时)
   - 运行所有测试
   - 验证覆盖率
   - 手动测试验证
   - 浏览器兼容性测试

---

**状态**: 📝 测试计划完成，等待开发实施
**QA Engineer**: 🔬
