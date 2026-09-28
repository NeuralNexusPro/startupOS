# Story OS.8: 系统集成和优化 - 架构设计文档 (ADD)

**版本**: v1.0
**日期**: 2026-03-09
**状态**: 草稿
**批准状态**: 待批准

---

## 1. 系统架构

### 1.1 目录结构

```
src/lib/system/
├── shortcuts/
│   ├── ShortcutRegistry.ts
│   ├── useShortcut.ts
│   └── types.ts
├── performance/
│   ├── LazyLoader.tsx
│   ├── VirtualList.tsx
│   └── useMemoryCleanup.ts
├── errors/
│   ├── ErrorBoundary.tsx
│   ├── ErrorFallback.tsx
│   └── errorReporting.ts
└── testing/
    └── e2e/
        ├── desktop.spec.ts
        ├── spotlight.spec.ts
        └── agents.spec.ts
```

---

## 2. 快捷键系统

### 2.1 ShortcutRegistry

```typescript
// src/lib/system/shortcuts/ShortcutRegistry.ts
interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  priority?: number;
  context?: string;
}

export class ShortcutRegistry {
  private shortcuts = new Map<string, ShortcutConfig[]>();
  private activeContext: string | null = null;

  register(id: string, config: ShortcutConfig): () => void {
    const key = this.getKey(config);
    const existing = this.shortcuts.get(key) || [];

    // 检测冲突
    const conflict = existing.find(s => s.context === config.context);
    if (conflict) {
      console.warn(`快捷键冲突: ${key} 在 ${config.context}`);
    }

    existing.push(config);
    existing.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.shortcuts.set(key, existing);

    // 返回注销函数
    return () => this.unregister(id, key);
  }

  private getKey(config: ShortcutConfig): string {
    const parts = [];
    if (config.ctrl) parts.push('ctrl');
    if (config.meta) parts.push('meta');
    if (config.shift) parts.push('shift');
    if (config.alt) parts.push('alt');
    parts.push(config.key.toLowerCase());
    return parts.join('+');
  }

  handle(e: KeyboardEvent): boolean {
    const key = this.getKeyFromEvent(e);
    const shortcuts = this.shortcuts.get(key) || [];

    for (const shortcut of shortcuts) {
      // 检查上下文
      if (shortcut.context && shortcut.context !== this.activeContext) {
        continue;
      }

      shortcut.handler(e);
      return true;
    }

    return false;
  }

  setContext(context: string | null): void {
    this.activeContext = context;
  }

  private getKeyFromEvent(e: KeyboardEvent): string {
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.metaKey) parts.push('meta');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    parts.push(e.key.toLowerCase());
    return parts.join('+');
  }

  private unregister(id: string, key: string): void {
    const shortcuts = this.shortcuts.get(key);
    if (shortcuts) {
      const filtered = shortcuts.filter(s => s !== shortcuts.find(x => x === shortcuts[0]));
      this.shortcuts.set(key, filtered);
    }
  }
}

export const shortcutRegistry = new ShortcutRegistry();
```

### 2.2 useShortcut Hook

```typescript
// src/lib/system/shortcuts/useShortcut.ts
export function useShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options: {
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    priority?: number;
    context?: string;
  } = {}
): void {
  useEffect(() => {
    const unregister = shortcutRegistry.register('hook', {
      key,
      ...options,
      handler,
    });

    return unregister;
  }, [key, handler, options]);
}
```

---

## 3. 性能优化

### 3.1 懒加载组件

```typescript
// src/lib/system/performance/LazyLoader.tsx
import { lazy, Suspense } from 'react';

export function lazyLoad<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  fallback?: React.ReactNode
) {
  const Component = lazy(factory);

  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={fallback || <LoadingSpinner />}>
      <Component {...props} />
    </Suspense>
  );
}

// 使用示例
const AgentDialog = lazyLoad(() => import('@/components/os/agent/AgentDialog'));
```

### 3.2 虚拟列表

```typescript
// src/lib/system/performance/VirtualList.tsx
import { FixedSizeList } from 'react-window';

interface VirtualListProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function VirtualList<T>({
  items,
  height,
  itemHeight,
  renderItem,
}: VirtualListProps<T>) {
  return (
    <FixedSizeList
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>{renderItem(items[index], index)}</div>
      )}
    </FixedSizeList>
  );
}
```

### 3.3 内存清理 Hook

```typescript
// src/lib/system/performance/useMemoryCleanup.ts
export function useMemoryCleanup() {
  useEffect(() => {
    return () => {
      // 清理所有事件监听器
      // 清理所有定时器
      // 取消所有订阅
    };
  }, []);
}
```

---

## 4. 错误处理

### 4.1 ErrorBoundary 组件

```typescript
// src/lib/system/errors/ErrorBoundary.tsx
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const Fallback = this.props.fallback || ErrorFallback;
      return <Fallback error={this.state.error!} reset={this.reset} />;
    }

    return this.props.children;
  }
}
```

### 4.2 ErrorFallback 组件

```typescript
// src/lib/system/errors/ErrorFallback.tsx
interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
}

export function ErrorFallback({ error, reset }: ErrorFallbackProps) {
  return (
    <div className="error-fallback">
      <h2>出错了</h2>
      <p>{error.message}</p>
      <button onClick={reset}>重试</button>
      <button onClick={() => window.location.reload()}>刷新页面</button>
    </div>
  );
}
```

---

## 5. E2E 测试

### 5.1 Playwright 配置

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/lib/system/testing/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
});
```

### 5.2 测试示例

```typescript
// src/lib/system/testing/e2e/spotlight.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Spotlight', () => {
  test('opens with Cmd+K', async ({ page }) => {
    await page.goto('/desktop');

    // 按 Cmd+K
    await page.keyboard.press('Meta+K');

    // 验证 Spotlight 打开
    await expect(page.locator('[data-testid="spotlight"]')).toBeVisible();
  });

  test('searches and displays results', async ({ page }) => {
    await page.goto('/desktop');
    await page.keyboard.press('Meta+K');

    // 输入搜索
    await page.fill('[data-testid="spotlight-input"]', 'test');

    // 验证结果显示
    await expect(page.locator('[data-testid="spotlight-results"]')).toBeVisible();
  });
});
```

---

## 6. 浏览器兼容性

### 6.1 特性检测

```typescript
// src/lib/system/compatibility.ts
export const browserSupport = {
  backdropFilter: CSS.supports('backdrop-filter', 'blur(10px)'),
  webAnimations: 'animate' in document.createElement('div'),
  intersectionObserver: 'IntersectionObserver' in window,
};

export function checkCompatibility(): boolean {
  const required = [
    browserSupport.backdropFilter,
    browserSupport.intersectionObserver,
  ];

  return required.every(Boolean);
}
```

---

## 7. 可访问性

### 7.1 ARIA 属性

```typescript
// 确保所有交互元素有正确的 ARIA 属性
<button
  aria-label="打开 Spotlight"
  aria-keyshortcuts="Meta+K"
  onClick={openSpotlight}
>
  搜索
</button>
```

### 7.2 焦点管理

```typescript
// src/hooks/useFocusTrap.ts
export function useFocusTrap(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    element.addEventListener('keydown', handleTab);
    firstElement?.focus();

    return () => element.removeEventListener('keydown', handleTab);
  }, [ref]);
}
```

---

## 附录

### 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-09 | v1.0 | 初始版本 | UX Designer |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
