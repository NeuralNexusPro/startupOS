# Story OS.4: Spotlight 全局命令 - 架构设计文档 (ADD)

**版本**: v1.0
**日期:** 2026-03-07
**状态:** 草稿
**批准状态:** 待批准

---

## 1. 架构概述

### 1.1 设计目标

构建高性能、类型安全的全局命令系统：
- 快捷响应 (< 100ms)
- 完整键盘导航
- 模糊搜索算法
- 组件化设计

### 1.2 架构原则

| 原则 | 实施 |
|-----|------|
| **类型安全** | 完整 TypeScript 类型定义 |
| **性能优先** | 去抖 + 虚拟化 + 缓存 |
| **组件分离** | Spotlight/SearchField/SearchResults |
| **可扩展** | 插件式搜索源 |

### 1.3 技术栈

```
React 18 + TypeScript
├── Zustand (状态管理)
├── Fuse.js (模糊搜索) 或 自定义
├── React Shortcuts (按键监听)
└── CSS Transitions (动画)
```

---

## 2. 类型定义

### 2.1 核心类型

```typescript
/**
 * Spotlight 结果类型枚举
 */
export enum SpotlightItemType {
  APP = 'app',
  COMMAND = 'command',
  AGENT = 'agent',
}

/**
 * Spotlight 搜索项接口
 */
export interface SpotlightItem {
  /** 唯一标识符 */
  id: string;

  /** 结果类型 */
  type: SpotlightItemType;

  /** 显示标题 */
  title: string;

  /** 副标题/描述 */
  subtitle?: string;

  /** Emoji 图标 */
  icon: string;

  /** 快捷键提示 */
  shortcut?: string;

  /** 执行动作 */
  action: () => void | Promise<void>;

  /** 搜索关键词 (用于模糊匹配) */
  keywords?: string[];

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Spotlight 状态接口
 */
export interface SpotlightState {
  /** 是否打开 */
  isOpen: boolean;

  /** 搜索查询 */
  query: string;

  /** 选中的结果索引 */
  selectedIndex: number;

  /** 搜索结果 */
  results: SpotlightItem[];

  /** 是否正在搜索 */
  isSearching: boolean;

  /** 是否正在加载 (异步搜索) */
  isLoading: boolean;

  // Actions

  /** 打开 Spotlight */
  open: () => void;

  /** 关闭 Spotlight */
  close: () => void;

  /** 切换开关 */
  toggle: () => void;

  /** 设置搜索查询 */
  setQuery: (query: string) => void;

  /** 更新搜索结果 */
  setResults: (results: SpotlightItem[]) => void;

  /** 设置选中索引 */
  setSelectedIndex: (index: number) => void;

  /** 执行选中项 */
  executeSelected: () => Promise<void>;

  /** 重置状态 */
  reset: () => void;
}

/**
 * Spotlight 配置接口
 */
export interface SpotlightConfig {
  /** 最大显示结果数 */
  maxResults: number;

  /** 搜索去抖时间 (ms) */
  debounceMs: number;

  /** 是否启用模糊搜索 */
  fuzzySearch: boolean;

  /** 搜索源插键 */
  sources: SpotlightSource[];
}

/**
 * 搜索源接口
 */
export interface SpotlightSource {
  /** 搜索源 ID */
  id: string;

  /** 搜索源名称 */
  name: string;

  /** 获取搜索项 */
  getItems: () => SpotlightItem[] | Promise<SpotlightItem[]>;

  /** 是否异步 */
  async?: boolean;

  /** 优先级 (数字越小越优先) */
  priority: number;
}
```

### 2.2 Props 类型

```typescript
/**
 * Spotlight 容器 Props
 */
export interface SpotlightProps {
  /** 自定义配置 */
  config?: Partial<SpotlightConfig>;

  /** 是否禁用 */
  disabled?: boolean;

  /** 打开前回调 */
  onBeforeOpen?: () => boolean;

  /** 打开后回调 */
  onAfterOpen?: () => void;

  /** 关闭前回调 */
  onBeforeClose?: () => boolean;

  /** 关闭后回调 */
  onAfterClose?: () => void;

  /** 执行回调 */
  onExecute?: (item: SpotlightItem) => void;

  /** 子元素 */
  children?: React.ReactNode;
}

/**
 * 搜索框 Props
 */
export interface SearchFieldProps {
  /** 当前查询 */
  value: string;

  /** 查询变更回调 */
  onChange: (query: string) => void;

  /** 占位符 */
  placeholder?: string;

  /** 是否自动聚焦 */
  autoFocus?: boolean;

  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 结果列表 Props
 */
export interface SearchResultsProps {
  /** 搜索结果 */
  items: SpotlightItem[];

  /** 当前选中索引 */
  selectedIndex: number;

  /** 选择回调 */
  onSelect: (item: SpotlightItem) => void;

  /** 执行回调 */
  onExecute: (item: SpotlightItem) => void;

  /** 最大显示数 */
  maxItems?: number;
}

/**
 * 结果项 Props
 */
export interface SpotlightItemProps {
  /** 搜索项 */
  item: SpotlightItem;

  /** 是否选中 */
  selected?: boolean;

  /** 选择回调 */
  onSelect?: () => void;

  /** 执行回调 */
  onExecute?: () => void;

  /** 高亮文本 */
  highlightText?: string;
}
```

---

## 3. 组件架构

### 3.1 组件结构

```
components/os/spotlight/
├── Spotlight.tsx              # 主容器
├── SearchField.tsx            # 搜索框
├── SearchResults.tsx          # 结果列表
└── SpotlightItem.tsx          # 结果项
```

### 3.2 Spotlight 组件

```typescript
/**
 * Spotlight 全局命令容器
 *
 * 功能:
 * - 全局快捷键监听 (Cmd+K)
 * - 结果列表渲染
 * - 动画控制
 * - 点击外部关闭
 */
export function Spotlight(props: SpotlightProps) {
  // Zustand store
  const store = useSpotlightStore();

  // 快捷键监听
  useShortcut(['cmd+k', 'ctrl+k'], store.toggle);

  // 点击外部关闭
  useCloseOnEscape(store.close);

  // 动画状态
  const isOpen = store.isOpen;
  const isAnimating = useIsAnimating(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="spotlight backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="spotlight-panel"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <SearchField
              value={store.query}
              onChange={store.setQuery}
              autoFocus
            />
            <SearchResults
              items={store.results}
              selectedIndex={store.selectedIndex}
              onSelect={store.setSelectedIndex}
              onExecute={store.executeSelected}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### 3.3 SearchField 组件

```typescript
/**
 * 搜索框组件
 *
 * 功能:
 * - 自动聚焦
 * - 实时输入
 * - 清除按钮
 */
export function SearchField({ value, onChange, autoFocus }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className="spotlight-search-field">
      <span className="spotlight-search-icon">🔍</span>
      <input
        ref={inputRef}
        type="search"
        className="spotlight-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
      />
      {value && (
        <button
          className="spotlight-clear-btn"
          onClick={() => onChange('')}
        >
          ✕
        </button>
      )}
    </div>
  );
}
```

### 3.4 SearchResults 组件

```typescript
/**
 * 结果列表组件
 *
 * 功能:
 * - 渲染结果项
 * - 键盘导航
 * - 虚拟化 (可选)
 */
export function SearchResults({
  items,
  selectedIndex,
  onSelect,
  onExecute,
  maxItems = 20,
}: SearchResultsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 滚动到选中项
  useScrollToSelected(containerRef, selectedIndex, items);

  return (
    <div className="spotlight-results" role="listbox">
      {items.length === 0 && (
        <div className="spotlight-no-results">
          <span className="spotlight-no-icon">👻</span>
          <p>No results found</p>
        </div>
      )}

      {items.slice(0, maxItems).map((item, index) => (
        <SpotlightItem
          key={item.id}
          item={item}
          selected={index === selectedIndex}
          onSelect={() => onSelect(item)}
          onExecute={() => onExecute(item)}
          highlightText={useSpotlightStore(s => s.query)}
        />
      ))}
    </div>
  );
}
```

### 3.5 SpotlightItem 组件

```typescript
/**
 * 结果项组件
 *
 * 功能:
 * - 显示图标/标题/描述
 * - 高亮关键词
 * - 快捷键提示
 */
export function SpotlightItem({
  item,
  selected,
  onSelect,
  onExecute,
  highlightText,
}: SpotlightItemProps) {
  const highlightedTitle = useMemo(
    () => highlightMatch(item.title, highlightText || ''),
    [item.title, highlightText],
  );

  return (
    <div
      className={`spotlight-item ${selected ? 'selected' : ''}`}
      role="option"
      aria-selected={selected}
      onClick={onExecute}
      onMouseEnter={onSelect}
    >
      <span className="spotlight-item-icon">{item.icon}</span>
      <div className="spotlight-item-content">
        <div
          className="spotlight-item-title"
          dangerouslySetInnerHTML={{ __html: highlightedTitle }}
        />
        {item.subtitle && (
          <div className="spotlight-item-subtitle">
            {item.subtitle}
          </div>
        )}
      </div>
      {item.shortcut && (
        <div className="spotlight-item-shortcut">
          {item.shortcut}
        </div>
      )}
    </div>
  );
}
```

---

## 4. 状态管理

### 4.1 Spotlight Store (Zustand)

```typescript
/**
 * Spotlight Zustand Store
 */
export const useSpotlightStore = create<SpotlightState>((set, get) => ({
  // 初始状态
  isOpen: false,
  query: '',
  selectedIndex: 0,
  results: [],
  isSearching: false,
  isLoading: false,

  // Actions

  open: () => {
    set({ isOpen: true, query: '', selectedIndex: 0, results: getInitialResults() });
  },

  close: () => {
    set({ isOpen: false, query: '', isSearching: false });
  },

  toggle: () => {
    set((state) => ({
      isOpen: !state.isOpen,
      query: state.isOpen ? '' : state.query,
      selectedIndex: state.isOpen ? 0 : state.selectedIndex,
      results: state.isOpen ? [] : getInitialResults(),
    }));
  },

  setQuery: async (query) => {
    set({ query, isSearching: true });

    // 去抖搜索
    const debounced = debounce(async () => {
      const results = await performSearch(query);
      set({ results, isSearching: false, selectedIndex: 0 });
    }, 150);

    debounced();
  },

  setResults: (results) => set({ results }),

  setSelectedIndex: (index) => {
    const { results } = get();
    set({ selectedIndex: Math.max(0, Math.min(index, results.length - 1)) });
  },

  executeSelected: async () => {
    const { results, selectedIndex } = get();
    const item = results[selectedIndex];

    if (item) {
      set({ isLoading: true });
      await item.action();
      set({ isLoading: false, isOpen: false });
    }
  },

  reset: () => set({
    isOpen: false,
    query: '',
    selectedIndex: 0,
    results: [],
    isSearching: false,
    isLoading: false,
  }),
}));
```

### 4.2 搜索源管理

```typescript
/**
 * 搜索源 Registry
 */
class SpotlightSourceRegistry {
  private sources: Map<string, SpotlightSource> = new Map();

  register(source: SpotlightSource) {
    this.sources.set(source.id, source);
  }

  unregister(id: string) {
    this.sources.delete(id);
  }

  async getAllItems(): Promise<SpotlightItem[]> {
    const allItems: SpotlightItem[] = [];

    for (const source of this.sources.values()) {
      const items = await source.getItems();
      allItems.push(...items);
    }

    // 按优先级排序
    return allItems.sort((a, b) =>
      (this.sources.get(a.id)?.priority ?? 0) -
      (this.sources.get(b.id)?.priority ?? 0)
    );
  }
}

export const spotlightSourceRegistry = new SpotlightSourceRegistry();
```

---

## 5. 搜索算法

### 5.1 模糊搜索

```typescript
/**
 * 使用 Fuse.js 进行模糊搜索
 */
import Fuse from 'fuse.js';

const fuseOptions: Fuse.IFuseOptions<SpotlightItem> = {
  keys: ['title', 'subtitle', 'keywords'],
  threshold: 0.3, // 匹配容错
  ignoreLocation: true,
  includeScore: true,
};

/**
 * 执行搜索
 */
export async function performSearch(query: string): Promise<SpotlightItem[]> {
  if (!query.trim()) {
    return spotlightSourceRegistry.getAllItems();
  }

  const allItems = await spotlightSourceRegistry.getAllItems();

  // 使用 Fuse.js 模糊搜索
  const fuse = new Fuse(allItems, fuseOptions);
  const results = fuse.search(query);

  // 返回匹配项
  return results.map((result) => result.item);
}
```

### 5.2 结果排序

```typescript
/**
 * 排序优先级
 */
function sortResults(
  results: SpotlightItem[],
  query: string
): SpotlightItem[] {
  return results.sort((a, b) => {
    // 1. 精确匹配
    if (a.title.toLowerCase() === query.toLowerCase() &&
        b.title.toLowerCase() !== query.toLowerCase()) {
      return -1;
    }

    // 2. 前缀匹配
    if (a.title.toLowerCase().startsWith(query.toLowerCase()) &&
        !b.title.toLowerCase().startsWith(query.toLowerCase())) {
      return -1;
    }

    // 3. 类型优先 (app > agent > command)
    const typePriority = {
      [SpotlightItemType.APP]: 1,
      [SpotlightItemType.AGENT]: 2,
      [SpotlightItemType.COMMAND]: 3,
    };
    const aPriority = typePriority[a.type] ?? 4;
    const bPriority = typePriority[b.type] ?? 4;

    return aPriority - bPriority;
  });
}
```

### 5.3 关键词高亮

```typescript
/**
 * 高亮匹配关键词
 */
export function highlightMatch(
  text: string,
  query: string
): string {
  if (!query.trim()) return text;

  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return text;

  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);

  return `${before}<mark>${match}</mark>${after}`;
}
```

---

## 6. Hooks

### 6.1 useShortcut Hook

```typescript
/**
 * 全局快捷键 Hook
 */
export function useShortcut(
  keys: string[],
  handler: (e: KeyboardEvent) => void,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查快捷键匹配
      for (const key of keys) {
        if (matchesShortcut(e, key)) {
          e.preventDefault();
          handler(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keys, handler, enabled]);
}

/**
 * 检查是否匹配快捷键
 */
function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+');

  const modifiers: Set<string> = new Set();

  if (event.metaKey || event.ctrlKey) modifiers.add('cmd');
  if (event.shiftKey) modifiers.add('shift');
  if (event.altKey) modifiers.add('alt');

  const shortcutModifiers = parts.filter(p => p !== 'event.key.toLowerCase()');

  // 检查修饰键
  return shortcutModifiers.every(mod => modifiers.has(mod)) &&
         parts.pop() === event.key.toLowerCase();
}
```

### 6.2 useScrollToSelected Hook

```typescript
/**
 * 滚动到选中项
 */
export function useScrollToSelected(
  containerRef: RefObject<HTMLDivElement>,
  selectedIndex: number,
  items: SpotlightItem[]
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const selected = container.querySelector(
      `[data-index="${selectedIndex}"]`
    ) as HTMLElement;

    if (selected) {
      selected.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex, items, containerRef]);
}
```

### 6.3 useSpotlight Hook

```typescript
/**
 * Spotlight 便捷 Hook
 */
export interface UseSpotlightReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  query: string;
  setQuery: (query: string) => void;
  results: SpotlightItem[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  executeSelected: () => Promise<void>;
}

export function useSpotlight(): UseSpotlightReturn {
  const store = useSpotlightStore();

  return {
    isOpen: store.isOpen,
    open: store.open,
    close: store.close,
    toggle: store.toggle,
    query: store.query,
    setQuery: store.setQuery,
    results: store.results,
    selectedIndex: store.selectedIndex,
    setSelectedIndex: store.setSelectedIndex,
    executeSelected: store.executeSelected,
  };
}
```

---

## 7. 集成点

### 7.1 与 Desktop 集成 (OS.1)

```typescript
// src/components/os/Desktop.tsx
export function Desktop() {
  // 渲染 Spotlight 作为 overlay
  return (
    <div className="desktop">
      {/* ... Desktop 内容 ... */}

      <Spotlight config={spotlightConfig} />
    </div>
  );
}
```

### 7.2 与 Agent Registry 集成 (OS.3)

```typescript
// 注册 Agent 搜索源
import { useAgentRegistryStore } from '@/store/agentRegistry';

spotlightSourceRegistry.register({
  id: 'agents',
  name: 'Agents',
  async getItems() {
    const { agents } = useAgentRegistryStore.getState();
    return Object.values(agents).map((agent) => ({
      id: agent.id,
      type: SpotlightItemType.AGENT,
      title: agent.displayName,
      subtitle: agent.capabilities.join(', '),
      icon: agent.icon,
      action: () => {
        // 启动 Agent
        launchAgent(agent.id);
      },
    }));
  },
  priority: 2,
});
```

### 7.3 与 Dock 集成 (OS.2)

```typescript
// 注册 App 搜索源
import { useDockStore } from '@/store/dockStore';

spotlightSourceRegistry.register({
  id: 'dock-apps',
  name: 'Apps',
  async getItems() {
    const { apps } = useDockStore.getState();
    return apps.map((app) => ({
      id: app.id,
      type: SpotlightItemType.APP,
      title: app.name,
      icon: app.icon,
      shortcut: app.shortcut,
      action: () => {
        // 启动 App
        launchApp(app.id);
      },
    }));
  },
  priority: 1,
});
```

---

## 8. 文件结构

```
src/
├── types/
│   └── spotlight.ts                # Spotlight 类型定义
├── store/
│   └── spotlight.ts                # Spotlight Zustand store
├── hooks/
│   └── spotlight.ts                # Spotlight hooks
├── components/
│   └── os/
│       └── spotlight/
│           ├── Spotlight.tsx       # 主容器
│           ├── SearchField.tsx     # 搜索框
│           ├── SearchResults.tsx   # 结果列表
│           └── SpotlightItem.tsx   # 结果项
├── lib/
│   └── spotlight/
│       ├── fuse.ts                 # 模糊搜索配置
│       ├── highlight.ts            # 关键词高亮
│       └── registry.ts             # 搜索源 registry
└── styles/
    └── spotlight.css               # Spotlight 样式
```

---

## 9. 性能优化

### 9.1 去抖搜索

```typescript
const debouncedSearch = debounce(
  (query: string) => performSearch(query),
  150 // 150ms 去抖
);
```

### 9.2 结果虚拟化

```typescript
// 使用 react-window 虚拟化长列表
import { FixedSizeList } from 'react-window';

export function SearchResults({ items }: SearchResultsProps) {
  return (
    <FixedSizeList
      height={400}
      itemCount={items.length}
      itemSize={44}
    >
      {({ index, style }) => (
        <SpotlightItem
          key={items[index].id}
          item={items[index]}
          style={style}
        />
      )}
    </FixedSizeList>
  );
}
```

### 9.3 缓存

```typescript
// 缓存搜索结果
const searchCache = new Map<string, SpotlightItem[]>();

export async function performSearch(query: string): Promise<SpotlightItem[]> {
  if (searchCache.has(query)) {
    return searchCache.get(query)!;
  }

  const results = /* ... search logic ... */;
  searchCache.set(query, results);
  return results;
}
```

---

## 10. 测试策略

### 10.1 单元测试

```typescript
describe('Spotlight Store', () => {
  it('should open and close properly', () => {
    const store = useSpotlightStore.getState();
    store.open();
    expect(store.isOpen).toBe(true);

    store.close();
    expect(store.isOpen).toBe(false);
  });

  it('should set query and search', async () => {
    const store = useSpotlightStore.getState();
    store.open();
    store.setQuery('dev');

    await wait(200);
    expect(store.results.length).toBeGreaterThan(0);
  });
});
```

### 10.2 集成测试

```typescript
describe('Spotlight Integration', () => {
  it('should register and search from sources', async () => {
    spotlightSourceRegistry.register(mockSource);
    const store = useSpotlightStore.getState();

    store.setQuery('test');
    await wait(200);

    const results = store.results;
    expect(results.some(r => r.sourceId === mockSource.id)).toBe(true);
  });
});
```

### 10.3 E2E 测试

```typescript
describe('Spotlight E2E', () => {
  it('should open on Cmd+K and execute command', async () => {
    // 快捷键
    await page.keyboard.press('Meta+K');
    await expect(page.locator('.spotlight')).toBeVisible();

    // 输入搜索
    await page.fill('.spotlight-input', 'finder');
    await expect(page.locator('.spotlight-item')).toHaveCount(1);

    // 执行
    await page.keyboard.press('Enter');
    await expect(page.locator('.spotlight')).not.toBeVisible();
  });
});
```

---

## 11. 附录

### 11.1 完整类型定义

```typescript
// src/types/spotlight.ts (完整定义见第 2 节)
```

### 11.2 依赖清单

```json
{
  "dependencies": {
    "zustand": "^4.5.0",
    "fuse.js": "^7.0.0",
    "react-window": "^1.8.10",
    "@react-hook/shortcuts": "^0.1.0",
    "framer-motion": "^11.0.0"
  }
}
```

### 11.3 集成清单

| 集成点 | Story | 状态 |
|-------|-------|------|
| Desktop 渲染 | OS.1 | ✅ 已完成 |
| Agent Registry | OS.3 | ✅ 已完成 |
| Dock Apps | OS.2 | ✅ 已完成 |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
