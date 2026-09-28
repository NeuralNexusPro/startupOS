# Story OS.11: 窗体类型元数据统一注册系统（Window Type Registry）

**Epic:** OS — Phase 0 OS 交互基础
**状态:** 📋 Planning
**优先级:** High（影响所有 Electron 原生窗口的路由分发正确性）
**估计工时:** 1-2 天
**依赖:** OS.9（应用窗口系统）已交付

---

## 背景与问题

当前 `AppWindowManager.ts` 中，窗体类型路由分发靠一段硬编码的 `if-else` 链决定（第 81-115 行）：

```ts
if (entryType === 'skill') { ... }
else if (entryType === 'solution') { ... }
else if (entryType === 'project' || entryType === 'workspace') { ... }
else if (entryType === 'agent' || entryType === 'role-agent') { ... }
// ...
```

该模式存在以下问题：

1. **易产生顺序 bug** — 新增 `entryType` 时必须手动调整 `else-if` 顺序，容易被其他条件误拦截（如 `solution` 窗口被 `project` 条件命中，打开了 workspace 窗口）
2. **没有中央注册表** — 每种窗体类型的 `windowType` 字符串、query 参数映射、路由、默认尺寸、组件名 displayName 分散在多处，难以维护
3. **componentName 依赖不可靠** — 生产构建后函数名会被 tree-shake/压缩，`component.name` 无法作为 fallback 判断依据
4. **`/window/page.tsx` 与 `AppWindowManager` 需手动保持同步** — 新增窗体类型时两处都需要修改，容易遗漏

---

## 设计方案

### 统一注册表 `WindowTypeRegistry`

在 `src/lib/features/window/` 新建窗体类型注册系统：

```typescript
// src/lib/features/window/window-type-registry.ts

export interface WindowTypeDescriptor {
  /** 窗体类型标识（windowType query 参数的值） */
  type: string;
  /** 触发条件：entryType 列表（精确匹配） */
  entryTypes: string[];
  /** query 参数映射：从 props 中提取哪些字段 */
  queryParams: string[];
  /** 默认窗口尺寸 */
  defaultSize?: { width: number; height: number };
  /** 最小窗口尺寸 */
  minSize?: { width: number; height: number };
}

export const WINDOW_TYPE_REGISTRY: WindowTypeDescriptor[] = [
  {
    type: 'skill',
    entryTypes: ['skill'],
    queryParams: ['skillName', 'initialMessage'],
  },
  {
    type: 'solution',
    entryTypes: ['solution'],
    queryParams: ['projectId', 'projectName', 'ontologyId', 'projectDescription'],
    defaultSize: { width: 900, height: 700 },
    minSize: { width: 700, height: 500 },
  },
  {
    type: 'interview',
    entryTypes: ['interview'],
    queryParams: ['projectId', 'sessionId', 'projectName', 'ontologyId'],
    defaultSize: { width: 860, height: 680 },
    minSize: { width: 700, height: 500 },
  },
  {
    type: 'workspace',
    entryTypes: ['project', 'workspace'],
    queryParams: ['projectId', 'projectName', 'ontologyId', 'entryType', 'entryId'],
    defaultSize: { width: 1000, height: 760 },
    minSize: { width: 800, height: 600 },
  },
  {
    type: 'agent',
    entryTypes: ['agent'],
    queryParams: ['agentId', 'agentName', 'agentType'],
    defaultSize: { width: 860, height: 680 },
  },
  {
    type: 'role-agent',
    entryTypes: ['role-agent'],
    queryParams: ['agentId', 'agentName', 'agentType'],
    defaultSize: { width: 860, height: 680 },
  },
  {
    type: 'collaboration',
    entryTypes: ['collaboration'],
    queryParams: ['projectId', 'projectName'],
    defaultSize: { width: 1100, height: 800 },
    minSize: { width: 900, height: 600 },
  },
];

export function resolveWindowType(entryType: string): WindowTypeDescriptor | undefined {
  return WINDOW_TYPE_REGISTRY.find(d => d.entryTypes.includes(entryType));
}
```

### `AppWindowManager` 重构

将 `if-else` 链替换为注册表驱动的查找：

```typescript
// 从注册表解析 windowType 和 query 参数
const descriptor = resolveWindowType(entryType ?? '');
if (!descriptor) {
  return store.openWindow(config); // 回退 in-app overlay
}

query['windowType'] = descriptor.type;
for (const key of descriptor.queryParams) {
  if (props[key] != null) query[key] = String(props[key]);
}
```

### `/window/page.tsx` 类型守卫生成

注册表中的 `type` 字段即为 `windowType` query 参数的合法值，可从注册表生成类型联合：

```typescript
import { WINDOW_TYPE_REGISTRY } from '@/lib/features/window/window-type-registry';

type WindowType = typeof WINDOW_TYPE_REGISTRY[number]['type'];
// = 'skill' | 'solution' | 'interview' | 'workspace' | 'agent' | 'role-agent' | 'collaboration'
```

---

## 实施范围

### 文件变更

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| CREATE | `src/lib/features/window/window-type-registry.ts` | 注册表定义 + `resolveWindowType` |
| CREATE | `src/lib/features/window/index.ts` | 公共 API 导出 |
| MODIFY | `src/services/AppWindowManager.ts` | 用注册表替换 if-else 链 |
| MODIFY | `src/app/window/page.tsx` | 从注册表派生 WindowType 类型 |

### 不在范围

- ❌ 窗体组件本身的动态加载机制（保持 `dynamic()` 方式不变）
- ❌ 跨进程窗口状态同步（另见 OS.11 Dock 同步相关改造）
- ❌ 窗体布局模板（标题栏、关闭按钮等，属于 OS.9 范围）

---

## 验收标准

1. - [ ] `WINDOW_TYPE_REGISTRY` 包含所有现有窗体类型，`AppWindowManager` 中无 if-else 链
2. - [ ] 点击项目卡片"AI 解决方案"在 Electron 下打开 `solution` 窗口而非 `workspace` 窗口
3. - [ ] 新增窗体类型只需在注册表中添加一条记录
4. - [ ] `npx tsc --noEmit --skipLibCheck` 0 error
5. - [ ] `npm run lint` 0 error

---

## 相关

- [Story OS.9 — 应用窗口系统](../story-OS.9/README.md)
- [AppWindowManager 实现](../../../../src/services/AppWindowManager.ts)
- [window/page.tsx 路由](../../../../src/app/window/page.tsx)
