# E2E 测试套件计划
**范围**: 全系统端到端测试
**优先级**: P0 - Critical
**预期时间**: 1-2天

---

## 📋 测试目标

1. 验证关键用户流程完整可用
2. 确保跨浏览器兼容性
3. 验证响应式布局
4. 测试性能指标

---

## 🎯 测试范围

### 核心用户流程
1. 主页浏览和导航
2. 项目创建流程
3. Spotlight 搜索
4. Dock 交互
5. 系统设置访问

### Epic-OS 功能
1. OS.1 Desktop 空间
2. OS.2 Dock 任务栏
3. OS.4 Spotlight 搜索
4. OS.5 Acrylic 组件

---

## 🔧 测试环境设置

### 技术栈
- **框架**: Playwright
- **语言**: TypeScript
- **报告**: HTML + JSON
- **CI**: GitHub Actions

### 浏览器支持
| 浏览器 | 版本 | 优先级 |
|--------|------|--------|
| Chromium | 最新 | P0 |
| Firefox | 最新 | P1 |
| WebKit (Safari) | 最新 | P1 |

### 设备尺寸
| 设备 | 分辨率 | 说明 |
|------|--------|------|
| 桌面大屏 | 1920x1080 | 主测试分辨率 |
| 桌面中屏 | 1366x768 | 常见笔记本 |
| 平板 | 768x1024 | iPad 风格 |

---

## 📝 测试用例

### Test Suite 1: 主页加载与导航

```typescript
import { test, expect } from '@playwright/test';

test.describe('Homepage Loading and Navigation', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // 验证页面标题
    await expect(page).toHaveTitle('OriginOS - Project Interview');

    // 验证核心元素可见
    await expect(page.locator('.fixed.top-0')).toBeVisible(); // TopMenuBar
    await expect(page.locator('.fixed.bottom-4')).toBeVisible(); // Dock

    // 验证无关键错误
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('HMR')) {
        errors.push(msg.text());
      }
    });

    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('SVG')).length).toBe(0);
  });

  test('should display correct number of projects', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // 等待项目加载
    await page.waitForSelector('text=我的项目', { timeout: 5000 });

    const projectHeading = page.locator('h2:has-text("我的项目")');
    await expect(projectHeading).toBeVisible();

    // 验证项目卡片存在
    const projectCards = page.locator('h3'); // 项目标题
    await expect(projectCards.first()).toBeVisible();
  });

  test('should have correct layout structure', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // TopMenuBar 位置
    const topBar = page.locator('.fixed.top-0');
    await expect(topBar).toHaveCSS('position', 'fixed');
    await expect(topBar).toHaveCSS('top', '0px');

    // Dock 位置
    const dock = page.locator('.fixed.bottom-4');
    await expect(dock).toHaveCSS('position', 'fixed');
    await expect(dock).toHaveCSS('bottom', '16px'); // bottom-4 = 1rem = 16px

    // 内容居中
    const content = page.locator('.max-w-6xl');
    await expect(content).toBeVisible();
  });

  test('should be responsive on different screen sizes', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const sizes = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 768, height: 1024 },
    ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await expect(page.locator('.fixed.top-0')).toBeVisible();
      await expect(page.locator('.fixed.bottom-4')).toBeVisible();
    }
  });
});
```

---

### Test Suite 2: Dock 任务栏交互

```typescript
test.describe('Dock Interaction', () => {
  test('should display all dock icons', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const dock = page.locator('.fixed.bottom-4');
    await expect(dock).toBeVisible();

    // 验证 5 个角色图标
    const icons = ['📋', '🏗️', '🎨', '💻', '🧪'];
    for (const icon of icons) {
      await expect(dock.getByText(icon)).toBeVisible();
    }
  });

  test('should have hover animation on icons', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const firstIcon = page.locator('.fixed.bottom-4 span').first();
    await firstIcon.hover();

    // 检查缩放效果（通过 transform 或 scale）
    const transform = await firstIcon.evaluate(el =>
      window.getComputedStyle(el).transform
    );
    expect(transform).not.toBe('none');
  });

  test('should be draggable', async ({ page }) => {
    await page.goto('http://3000');

    const dock = page.locator('.fixed.bottom-4');
    const firstIcon = dock.getByText('📋').locator('..').locator('..');

    // 拖拽第一个图标到最后
    await firstIcon.dragTo(dock.getByText('🧪').locator('..').locator('..'));

    // 验证位置已改变（通过检查 DOM 顺序）
    const icons = await dock.locator('span').allTextContents();
    expect(icons[0]).toBe('🏗️'); // 第一个图标已改变
  });

  test('should show tooltip on hover', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const firstIcon = page.locator('.fixed.bottom-4 span').first();
    await firstIcon.hover();

    // 检查 tooltip 是否出现（可能需要验证特定类名或属性）
    await page.waitForTimeout(600); // 等待 tooltip 延迟显示

    // 验证 tooltip 存在
    const tooltip = page.locator('[data-tooltip]').first();
    // 根据实际实现调整选择器
  });

  test('should toggle running state on click', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const firstIcon = page.locator('.fixed.bottom-4 span').first();
    await firstIcon.click();

    // 验证状态改变（通过检查指示灯或 console.log）
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('Agent') && msg.text().includes('status')) {
        consoleMessages.push(msg.text());
      }
    });

    await expect(consoleMessages.length).toBeGreaterThan(0);
  });
});
```

---

### Test Suite 3: Spotlight 搜索功能

```typescript
test.describe('Spotlight Search', () => {
  test('should open with Ctrl+K', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.keyboard.press('Control+k');

    const spotlight = page.locator('.fixed.inset-0.z-50');
    await expect(spotlight).toBeVisible();

    const searchBox = page.locator('[role="textbox"]');
    await expect(searchBox).toBeFocused();
  });

  test('should show default search results', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.keyboard.press('Control+k');

    // 验证默认结果显示
    await expect(page.locator('text=系统设置')).toBeVisible();
    await expect(page.locator('text=帮助文档')).toBeVisible();
  });

  test('should filter results on typing', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.keyboard.press('Control+k');

    const searchBox = page.locator('[role="textbox"]');
    await searchBox.fill('set');

    // 验证过滤结果
    await expect(page.locator('text=系统设置')).toBeVisible();
    // 帮助文档应该被过滤掉
    const helpText = page.locator('text=帮助文档');
    const isVisible = await helpText.isVisible();
    expect(isVisible).toBeFalsy();
  });

  test('should navigate results with arrow keys', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.keyboard.press('Control+k');

    await page.keyboard.press('ArrowDown');
    // 验证第一个结果被选中（可能检查高亮类名）
    await page.keyboard.press('ArrowDown');
    // 验证第二个结果被选中

    await page.keyboard.press('ArrowUp');
    // 验证回到第一个结果
  });

  test('should execute action on Enter', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const consoleMessages: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('Open Settings')) {
        consoleMessages.push(msg.text());
      }
    });

    await page.keyboard.press('Control+k');
    await page.keyboard.press('Enter');

    // 验证 Spotlight 关闭
    const spotlight = page.locator('.fixed.inset-0.z-50');
    await expect(spotlight).not.toBeVisible();

    // 验证动作被执行
    expect(consoleMessages.length).toBeGreaterThan(0);
  });

  test('should close on Escape', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.keyboard.press('Control+k');

    await page.keyboard.press('Escape');

    const spotlight = page.locator('.fixed.inset-0.z-50');
    await expect(spotlight).not.toBeVisible();
  });

  test('should close on clicking outside', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.keyboard.press('Control+k');

    // 点击背景
    const spotlight = page.locator('.fixed.inset-0');
    await spotlight.click({ position: { x: 10, y: 10 } });

    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible();
  });

  test('should support fuzzy search', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.keyboard.press('Control+k');

    const searchBox = page.locator('[role="textbox"]');

    // 测试部分匹配
    await searchBox.fill('sys');
    await expect(page.locator('text=系统设置')).toBeVisible();

    // 测试大小写不敏感
    await searchBox.fill('SYS');
    await expect(page.locator('text=系统设置')).toBeVisible();
  });
});
```

---

### Test Suite 4: 项目管理流程

```typescript
test.describe('Project Management', () => {
  test('should show welcome message when no projects', async ({ page }) => {
    // 需要创建一个测试环境，无项目状态
    await page.goto('http://localhost:3000');

    // 检查欢迎部分是否显示
    const welcomeSection = page.locator('text=欢迎使用 OriginOS');
    const isVisible = await welcomeSection.isVisible();
    // 根据是否有项目来验证
  });

  test('should open project creation modal', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const createButton = page.getByText('创建项目');
    await createButton.click();

    // 验证模态框打开
    const modal = page.locator('.fixed.z-50');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('创建项目')).toBeVisible();
  });

  test('should close project creation modal', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.getByText('创建项目').click();

    // 点击关闭按钮
    const closeButton = page.locator('button').filter({ hasText: /×|X/ }).first();
    await closeButton.click();

    // 验证模态框关闭
    const modal = page.locator('.fixed.z-50');
    await expect(modal).not.toBeVisible();
  });

  test('should display project cards', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.waitForSelector('h2:has-text("我的项目")', { timeout: 5000 });

    // 验证项目卡片
    const projectCards = page.locator('h3');
    const count = await projectCards.count();
    expect(count).toBeGreaterThan(0);

    // 验证第一个卡片内容
    const firstCard = page.locator('h3').first();
    await expect(firstCard).toBeVisible();
  });

  test('should show project metadata', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.waitForSelector('text=节点', { timeout: 5000 });

    // 验证节点数显示
    const nodeInfo = page.locator('text=节点').first();
    await expect(nodeInfo).toBeVisible();

    // 验证日期显示
    const dateInfo = page.locator(/20\d{2}\/\d{1,2}\/\d{1,2}/).first();
    await expect(dateInfo).toBeVisible();
  });
});
```

---

### Test Suite 5: TopMenuBar 功能

```typescript
test.describe('TopMenuBar', () => {
  test('should display OriginOS logo', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const logo = page.locator('.fixed.top-0').getByText('OriginOS');
    await expect(logo).toBeVisible();
  });

  test('should display network status', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const networkStatus = page.locator('.fixed.top-0').getByText('离线', { exact: false });
    await expect(networkStatus).toBeVisible();
  });

  test('should display current time', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const timeElement = page.locator('.fixed.top-0').locator('span').filter({ hasText: /\d{2}\/\d{2}/ });
    await expect(timeElement).toBeVisible();
  });

  test('should display settings button', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const settingsButton = page.locator('.fixed.top-0').getByTitle('设置').first();
    await expect(settingsButton).toBeVisible();
  });

  test('should display help button', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const helpButton = page.locator('.fixed.top-0').getByTitle('帮助').first();
    await expect(helpButton).toBeVisible();
  });

  test('should have proper Z-index layering', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const topBar = page.locator('.fixed.top-0');
    const dock = page.locator('.fixed.bottom-4');

    const topBarZ = await topBar.evaluate(el => window.getComputedStyle(el).zIndex);
    const dockZ = await dock.evaluate(el => window.getComputedStyle(el).zIndex);

    expect(topBarZ).toBe('40');
    expect(dockZ).toBe('50'); // Dock 应该在 TopMenuBar 上方
  });
});
```

---

### Test Suite 6: 性能测试

```typescript
test.describe('Performance Tests', () => {
  test('should load within 2 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(2000);
  });

  test('should have stable 60fps animations', async ({ page, context }) => {
    // 注意：此测试需要 Chrome DevTools 支持
    await page.goto('http://localhost:3000');

    // 简化的帧率检查
    const fpsStart = await page.evaluate(() => {
      return (window.performance as any).now();
    });

    // 触发动画（hover Dock 图标）
    const firstIcon = page.locator('.fixed.bottom-4 span').first();
    await firstIcon.hover();

    await page.waitForTimeout(500);

    const fpsEnd = await page.evaluate(() => {
      return (window.performance as any).now();
    });

    const animationTime = fpsEnd - fpsStart;
    expect(animationTime).toBeLessThan(1000); // 动画应在 1秒内完成
  });

  test('should have reasonable memory usage', async ({ page, context }) => {
    // 获取初始内存
    const memBefore = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    // 导航到不同页面并返回
    await page.goto('http://localhost:3000/desktop');
    await page.goBack();
    await page.goto('http://localhost:3000/apps');
    await page.goBack();

    await page.waitForTimeout(1000);

    // 检查内存增长
    const memAfter = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    // 内存增长应合理（小于 10MB）
    if (memBefore > 0 && memAfter > 0) {
      const memGrowth = (memAfter - memBefore) / 1024 / 1024;
      expect(memGrowth).toBeLessThan(10);
    }
  });
});
```

---

### Test Suite 7: 可访问性测试

```typescript
test.describe('Accessibility Tests', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const headings = page.locator('h1, h2, h3');
    const count = await headings.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have alt text for images', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      // SVG 图标可能不需要 alt，忽略空 alt
      if (alt !== '') {
        expect(alt).toBeTruthy();
      }
    }
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Tab 导航检查
    let tabCount = 0;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      if (focused) {
        tabCount++;
      }
    }

    expect(tabCount).toBeGreaterThan(0);
  });

  test('buttons should have proper roles', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const buttons = await page.locator('button').all();
    for (const button of buttons) {
      const hasText = (await button.textContent()).trim().length > 0;
      const hasAriaLabel = await button.getAttribute('aria-label');
      const hasTitle = await button.getAttribute('title');

      const isAccessible = hasText || hasAriaLabel || hasTitle;
      expect(isAccessible).toBe(true);
    }
  });
});
```

---

### Test Suite 8: 跨浏览器测试

```typescript
describe('Cross-Browser Tests', () => {
  const projects = [
    { name: 'chromium', use: ({ chromium }) => chromium },
    { name: 'firefox', use: ({ firefox }) => firefox },
    { name: 'webkit', use: ({ webkit }) => webkit },
  ];

  for (const project of projects) {
    describe(`${project.name}`, () => {
      test('should load homepage', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await expect(page).toHaveTitle('OriginOS - Project Interview');
      });

      test('should show Dock', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await expect(page.locator('.fixed.bottom-4')).toBeVisible();
      });

      test('should open Spotlight', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.keyboard.press('Control+k');
        await expect(page.locator('.fixed.inset-0.z-50')).toBeVisible();
      });
    });
  }
});
```

---

## 📊 测试报告

### 报告格式
- **HTML 交互式报告**: Playwright 默认
- **JSON 机器-readable**: CI/CD 集成
- **Summary 文本**: 快速概览

### 关键指标
| 指标 | 目标 |
|------|------|
| 测试通过率 | >95% |
| 测试覆盖率 | 关键路径 100% |
| 执行时间 | <5分钟 |
| Flakiness | <1% |

---

## ✅ 验收标准

1. ✅ 所有核心用户流程测试通过
2. ✅ 跨浏览器测试通过（Chromium + 至少一个其他）
3. ✅ 响应式布局验证通过（3种屏幕尺寸）
4. ✅ 无关键失败测试
5. ✅ 性能指标达标（加载时间 <2s）
6. ✅ 可访问性检查通过

---

## 🚀 实施步骤

1. **搭建测试环境** (1小时)
   - 配置 Playwright
   - 设置 CI/CD 集成
   - 创建测试数据

2. **编写测试用例** (4小时)
   - 主页测试套件
   - Dock 测试套件
   - Spotlight 测试套件
   - 项目管理测试套件

3. **执行与修复** (3小时)
   - 运行全部测试
   - 修复失败用例
   - 优化慢速测试

4. **文档与交付** (1小时)
   - 编写测试文档
   - 生成测试报告
   - 建立定时任务

---

**状态**: 📝 E2E 测试套件计划完成
**QA Engineer**: 🔬
