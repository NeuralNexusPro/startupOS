# SVG 图标库测试策略
**优先级**: P1 - High
**预期时间**: 4-6小时

---

## 📋 问题概述

**问题**: 发现 30+ SVG 路径错误
```
Error: <path> attribute d: Expected arc flag ('0' or '1')
Error: <path> attribute d: Unexpected end of attribute
Error: <path> attribute d: Expected number
```

**影响**: 控制台噪音，可能影响某些图标渲染

**涉及组件**:
- `lucide-react` 库图标 (Settings, HelpCircle, X, Info)
- 自定义 SVG 图标 (NetworkStatus, 项目卡片图标)

---

## 🎯 测试目标

1. 识别所有有问题的 SVG 图标
2. 验证图标在各环境下的正确渲染
3. 确保图标库一致性
4. 建立图标使用规范

---

## 🔍 测试策略

### 策略 1: 静态代码分析
- 扫描所有 SVG 使用
- 验证 SVG 语法正确性
- 检查路径数据完整性

### 策略 2: 渲染测试
- 验证每个图标正确渲染
- 检查服务器端和客户端一致性
- 测试不同浏览器的渲染结果

### 策略 3: 快照测试
- 捕获每个图标的渲染结果
- 检测意外的视觉变化
- 确保图标跨视图一致性

---

## 📝 测试用例

### Test Suite 1: 静态 SVG 验证

```typescript
describe('SVG Static Validation', () => {
  it('should have valid SVG syntax for all icons', async () => {
    // Extract all SVG elements from mounted components
    const svgs = document.querySelectorAll('svg');

    svgs.forEach((svg, index) => {
      const html = svg.outerHTML;
      expect(html).toMatch(/^<svg/);
      expect(html).toMatch(/<\/svg>$/);
      expect(html).not.toContain('Expected arc flag');
      expect(html).not.toContain('Unexpected end of attribute');
    });
  });

  it('should have valid path data', () => {
    const paths = document.querySelectorAll('path');
    paths.forEach((path) => {
      const d = path.getAttribute('d');
      expect(d).not.toBeNull();
      expect(d).toBeTruthy();
      expect(d.length).toBeGreaterThan(0);

      // 验证 path 语法
      const validCommands = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;
      expect(d).toMatch(validCommands);
    });
  });

  it('should have closed paths where appropriate', () => {
    // Paths that start with M and end with Z should be closed
    const paths = Array.from(document.querySelectorAll('path'));
    paths.filter(p => p.getAttribute('d')?.endsWith('Z'))
      .forEach(path => {
        expect(path.getAttribute('d')).toMatch(/^M/m);
      });
  });

  it('should have valid viewBox attribute', () => {
    const svgs = document.querySelectorAll('svg');
    svgs.forEach((svg) => {
      const viewBox = svg.getAttribute('viewBox');
      if (viewBox) {
        const [minX, minY, width, height] = viewBox.split(' ').map(Number);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
      }
    });
  });
});
```

---

### Test Suite 2: Lucide React 图标测试

```typescript
describe('Lucide React Icons', () => {
  const lucideIcons = [
    { name: 'Settings', component: Settings },
    { name: 'HelpCircle', component: HelpCircle },
    { name: 'X', component: X },
    { name: 'Info', component: Info },
  ];

  lucideIcons.forEach(({ name, component: Component }) => {
    describe(`${name} Icon`, () => {
      it('should render without errors', () => {
        expect(() => {
          render(<Component />);
        }).not.toThrow();
      });

      it('should render valid SVG', () => {
        const { container } = render(<Component />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
        expect(svg?.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
      });

      it('should have correct default size', () => {
        const { container } = render(<Component />);
        const svg = container.querySelector('svg');
        const width = svg?.getAttribute('width');
        const height = svg?.getAttribute('height');
        expect(width).toBeTruthy();
        expect(height).toBe(width);
      });

      it('should accept size prop', () => {
        const { container } = render(<Component size={32} />);
        const svg = container.querySelector('svg');
        const width = svg?.getAttribute('width');
        expect(width).toBe('32');
      });

      it('should not throw console errors', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<Component />);
        const errors = consoleError.mock.calls.filter(call =>
          call.some(arg => typeof arg === 'string' && arg.includes('SVG'))
        );
        expect(errors).toHaveLength(0);
        consoleError.mockRestore();
      });

      it('should be SSR safe', () => {
        // Simulate SSR rendering
        const html = renderToString(<Component />);
        expect(html).toContain('<svg');
        expect(html).toContain('</svg>');
      });
    });
  });
});
```

---

### Test Suite 3: 自定义 SVG 图标测试

```typescript
describe('Custom SVG Icons', () => {
  describe('NetworkStatus Icon', () => {
    it('should render offline icon correctly', () => {
      const { container } = render(<NetworkStatus isConnected={false} />);
      const paths = container.querySelectorAll('path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should render WiFi icon with correct signal strength', () => {
      const strengths = [1, 2, 3, 4];
      strengths.forEach(strength => {
        const { container } = render(
          <NetworkStatus isConnected={true} signalStrength={strength} />
        );
        const pathCount = container.querySelectorAll('path').length;
        expect(pathCount).toBeGreaterThan(0);
      });
    });

    it('should handle hydration correctly', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<NetworkStatus isConnected={false} />);
      const hydrationWarnings = consoleWarn.mock.calls.filter(call =>
        call.some(arg => typeof arg === 'string' && arg.includes('Prop'))
      );
      expect(hydrationWarnings).toHaveLength(0);
      consoleWarn.mockRestore();
    });
  });

  describe('Project Card Icons', () => {
    const testData = [
      { icon: '📁', name: 'Folder' },
      { icon: '🕸️', name: 'Ontology' },
      // 添加更多...
    ];

    testData.forEach(({ icon, name }) => {
      it(`should render ${name} icon correctly`, () => {
        const { container } = render(
          <ProjectCard project={{
            id: 'test',
            name: 'Test Project',
            icon,
            // ...
          }} />
        );
        const iconElement = container.getByText(icon);
        expect(iconElement).toBeInTheDocument();
      });
    });
  });
});
```

---

### Test Suite 4: SVG 快照测试

```typescript
describe('Icon Snapshots', () => {
  const testIcons = [
    { name: 'Home', component: Home },
    { name: 'Search', component: Search },
    { name: 'Settings', component: Settings },
    // 添加所有图标...
  ];

  testIcons.forEach(({ name, component: Component }) => {
    it(`${name} - should match snapshot`, () => {
      const { container } = render(<Component />);
      expect(container).toMatchSnapshot();
    });
  });

  it('NetworkStatus offline - should match snapshot', () => {
    const { container } = render(<NetworkStatus isConnected={false} />);
    expect(container).toMatchSnapshot();
  });

  it('NetworkStatus WiFi - should match snapshot', () => {
    const { container } = render(
      <NetworkStatus isConnected={true} signalStrength={3} />
    );
    expect(container).toMatchSnapshot();
  });
});
```

---

### Test Suite 5: E2E SVG 渲染测试

```typescript
describe('SVG E2E Rendering', () => {
  beforeEach(async () => {
    await page.goto('http://localhost:3000');
  });

  test('should render all TopMenuBar icons', async () => {
    const svgs = await page.locator('.fixed.top-0 svg').all();
    expect(svgs.length).toBeGreaterThan(0);

    // 检查 SVG 属性
    for (const svg of svgs) {
      const isValid = await svg.evaluate(el => {
        return (
          el.tagName === 'svg' &&
          el.getAttribute('xmlns') === 'http://www.w3.org/2000/svg' &&
          el.getAttribute('viewBox') !== null
        );
      });
      expect(isValid).toBe(true);
    }
  });

  test('should render all Dock icons', async () => {
    const dock = page.locator('.fixed.bottom-4');
    await expect(dock).toBeVisible();

    const emojis = await dock.locator('span').all();
    expect(emojis.length).toBe(5); // PM, Architect, UX, Developer, QA
  });

  test('should have no console SVG errors', async () => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('SVG') || msg.text().includes('path')) {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // 等待收集所有错误
    await page.waitForTimeout(1000);

    expect(errors.length).toBe(0);
  });

  test('all SVGs should have valid path data', async () => {
    const paths = await page.locator('path').all();
    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) {
      const d = await path.getAttribute('d');
      expect(d).toBeTruthy();
      expect(d?.length).toBeGreaterThan(0);

      // 验证基本语法
      const validCommands = /^[a-zA-Z0-9.,\s-]+$/;
      expect(d).toMatch(validCommands);
    }
  });

  test('icons should be visible and have correct dimensions', async () => {
    const icons = await page.locator('.text-2xl, svg').all();

    for (const icon of icons) {
      const isVisible = await icon.isVisible();
      expect(isVisible).toBe(true);

      const box = await icon.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    }
  });
});
```

---

### Test Suite 6: 跨浏览器图标渲染

```typescript
describe('Cross-Browser Icon Rendering', () => {
  const browsers: BrowserType[] = ['chromium', 'firefox', 'webkit'];

  browsers.forEach(browserType => {
    test(`${browserType} - should render all icons correctly`, async () => {
      const browser = await playwright[browserType].launch();
      const page = await browser.newPage();

      // 监听错误
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error' && msg.text().includes('SVG')) {
          errors.push(msg.text());
        }
      });

      await page.goto('http://localhost:3000');
      await page.waitForLoadState('networkidle');

      // 验证图标数量
      const svgs = await page.locator('svg').all();
      expect(svgs.length).toBeGreaterThan(0);

      // 验证无错误
      expect(errors.length).toBe(0);

      // 截图对比
      await page.screenshot({
        path: `snapshots/${browserType}-icons.png`,
        fullPage: false
      });

      await browser.close();
    });
  });
});
```

---

## 🔍 故障排查脚本

### SVG 健康检查脚本

```typescript
// scripts/check-svg-health.ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface SVGHealthResult {
  file: string;
  hasErrors: boolean;
  errors: string[];
}

function checkSVGContent(content: string): string[] {
  const errors: string[] = [];

  // 检查基本 SVG 结构
  if (!content.includes('<svg')) {
    errors.push('Missing <svg> tag');
  }
  if (!content.includes('</svg>')) {
    errors.push('Missing closing </svg> tag');
  }

  // 检查路径数据
  const pathMatches = content.match(/path[^>]* d="([^"]*)"/g) || [];
  pathMatches.forEach(match => {
    const d = match.match(/d="([^"]*)"/)?.[1];
    if (d) {
      // 检查未闭合的路径命令
      if (/[^Z]$/.test(d) && /[Aa]$/.test(d)) {
        errors.push('Arc command without explicit large-arc-flag');
      }
      if (d.includes('..')) {
        errors.push('Double decimal points in path data');
      }
    }
  });

  return errors;
}

function scanProjectForSVGs(): SVGHealthResult[] {
  const results: SVGHealthResult[] = [];

  function scanDirectory(dir: string) {
    const files = readdirSync(dir, { withFileTypes: true });

    files.forEach(file => {
      const fullPath = join(dir, file.name);

      if (file.isDirectory()) {
        // 跳过 node_modules 等
        if (!['node_modules', '.next', 'dist', 'coverage'].includes(file.name)) {
          scanDirectory(fullPath);
        }
      } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
        const content = readFileSync(fullPath, 'utf-8');
        const errors = checkSVGContent(content);

        if (errors.length > 0) {
          results.push({
            file: fullPath,
            hasErrors: true,
            errors
          });
        }
      }
    });
  }

  scanDirectory('src');
  return results;
}

const issues = scanProjectForSVGs();

if (issues.length > 0) {
  console.error('❌ SVG Health Check Failed');
  issues.forEach(issue => {
    console.error(`\n📄 ${issue.file}`);
    issue.errors.forEach(err => console.error(`  - ${err}`));
  });
  process.exit(1);
} else {
  console.log('✅ All SVGs passed health check');
}
```

---

## 📊 图标清单

### Lucide React 图标
| 图标 | 组件 | 用途 | 测试状态 |
|------|------|------|---------|
| Settings | `<Settings />` | 顶部菜单栏 | ⬜ 待测 |
| HelpCircle | `<HelpCircle />` | 顶部菜单栏 | ⬜ 待测 |
| X | `<X />` | 关闭按钮 | ⬜ 待测 |
| Info | `<Info />` | 信息图标 | ⬜ 待测 |

### 自定义 SVG 图标
| 图标 | 位置 | 用途 | 测试状态 |
|------|------|------|---------|
| NetworkStatus | `StatusBar/NetworkStatus.tsx` | 连接状态 | ✅ 已测试 |
| 卡片装饰图标 | `page.tsx` | 项目卡片 | ⬜ 待测 |

### Emoji 图标
| 图标 | 用途 | 测试状态 |
|------|------|---------|
| 📋, 🏗️, 🎨, 💻, 🧪 | Dock | ⬜ 待测 |
| ➕ | 创建按钮 | ⬜ 待测 |
| 📁 | 文件图标 | ⬜ 待测 |
| 🕸️ | 本体图标 | ⬜ 待测 |

---

## ✅ 验收标准

1. ✅ 所有 SVG 图标无控制台错误
2. ✅ 所有 SVG path 数据有效
3. ✅ 服务端和客户端渲染一致
4. ✅ 跨浏览器渲染一致
5. ✅ 图标在所有设备比例下显示正确
6. ✅ 无 hydration 警告
7. ✅ SVG 健康检查脚本通过

---

## 🚀 实施步骤

1. **分析阶段** (1小时)
   - 运行 SVG 健康检查脚本
   - 统计所有图标使用
   - 识别问题图标

2. **测试开发** (2小时)
   - 创建单元测试套件
   - 创建快照测试
   - 创建 E2E 测试

3. **修复与验证** (2小时)
   - 修复或有问题的图标
   - 验证修复效果
   - 更新测试快照

4. **文档更新** (1小时)
   - 更新图标使用规范
   - 添加图标清单
   - 记录已知问题

---

**状态**: 📝 测试策略完成
**QA Engineer**: 🔬
