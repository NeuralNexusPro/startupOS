# 架构设计 - Story OS.11

**Story:** 窗体类型元数据统一注册系统（Window Type Registry）
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 技术栈

| 技术 | 用途 | 说明 |
|------|------|------|
| TypeScript | 类型定义 | 窗体类型描述符 |
| Next.js App Router | 路由 | /window/page.tsx |
| Electron | 原生窗口 | 窗体管理 |

---

## 数据结构

### WindowTypeDescriptor

```typescript
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
```

### WINDOW_TYPE_REGISTRY

```typescript
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
```

### WindowType 类型联合

```typescript
import { WINDOW_TYPE_REGISTRY } from '@/lib/features/window/window-type-registry';

type WindowType = typeof WINDOW_TYPE_REGISTRY[number]['type'];
// = 'skill' | 'solution' | 'interview' | 'workspace' | 'agent' | 'role-agent' | 'collaboration'
```

---

## 模块设计

### Window Type Registry 模块

**文件：** `src/lib/features/window/window-type-registry.ts`

**职责：**
- 定义窗体类型描述符接口
- 维护全局窗体类型注册表
- 提供 `resolveWindowType` 函数，根据 entryType 查找对应的窗体描述符

**核心函数：**

```typescript
export function resolveWindowType(entryType: string): WindowTypeDescriptor | undefined {
  return WINDOW_TYPE_REGISTRY.find(d => d.entryTypes.includes(entryType));
}
```

**查找逻辑：**
1. 遍历 `WINDOW_TYPE_REGISTRY`
2. 检查 `entryType` 是否在 `entryTypes` 数组中
3. 返回第一个匹配的 `WindowTypeDescriptor`
4. 未匹配返回 `undefined`

### AppWindowManager 模块

**文件：** `src/services/AppWindowManager.ts`

**重构前（if-else 链）：**

```typescript
if (entryType === 'skill') {
  query['windowType'] = 'skill';
  query['skillName'] = props.skillName;
  query['initialMessage'] = props.initialMessage;
} else if (entryType === 'solution') {
  query['windowType'] = 'solution';
  query['projectId'] = props.projectId;
  // ...
} else if (entryType === 'project' || entryType === 'workspace') {
  query['windowType'] = 'workspace';
  // ...
}
// ...
```

**重构后（注册表驱动）：**

```typescript
const descriptor = resolveWindowType(entryType ?? '');
if (!descriptor) {
  return store.openWindow(config); // 回退 in-app overlay
}

query['windowType'] = descriptor.type;
for (const key of descriptor.queryParams) {
  if (props[key] != null) query[key] = String(props[key]);
}
```

**优势：**
- 消除 if-else 链
- 新增窗体类型只需在注册表中添加记录
- 避免顺序 bug
- 集中管理窗体元数据

### /window/page.tsx 模块

**文件：** `src/app/window/page.tsx`

**职责：**
- 根据 `windowType` query 参数渲染对应的窗体组件
- 类型安全检查

**重构前：**

```typescript
type WindowType = 'skill' | 'solution' | 'workspace' | 'agent' | 'role-agent' | 'collaboration' | 'interview';
```

**重构后：**

```typescript
import { WINDOW_TYPE_REGISTRY } from '@/lib/features/window/window-type-registry';

type WindowType = typeof WINDOW_TYPE_REGISTRY[number]['type'];
```

**优势：**
- 类型定义从注册表自动派生
- 新增窗体类型时类型自动更新
- 避免手动维护导致的遗漏

---

## 代码变更

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/lib/features/window/window-type-registry.ts` | 窗体类型注册表定义 |
| `src/lib/features/window/index.ts` | 公共 API 导出 |

### 修改文件

| 文件路径 | 说明 |
|---------|------|
| `src/services/AppWindowManager.ts` | 用注册表替换 if-else 链 |
| `src/app/window/page.tsx` | 从注册表派生 WindowType 类型 |

---

## 窗体类型映射表

| windowType | entryTypes | queryParams | defaultSize | minSize |
|-----------|-----------|-------------|-------------|---------|
| skill | skill | skillName, initialMessage | - | - |
| solution | solution | projectId, projectName, ontologyId, projectDescription | 900x700 | 700x500 |
| interview | interview | projectId, sessionId, projectName, ontologyId | 860x680 | 700x500 |
| workspace | project, workspace | projectId, projectName, ontologyId, entryType, entryId | 1000x760 | 800x600 |
| agent | agent | agentId, agentName, agentType | 860x680 | - |
| role-agent | role-agent | agentId, agentName, agentType | 860x680 | - |
| collaboration | collaboration | projectId, projectName | 1100x800 | 900x600 |

---

## 相关文档

- [需求规格](./requirements.md)
- [测试策略](./testing.md)
- [Story OS.11 README](./README.md)
- [Story OS.9 — 应用窗口系统](../story-OS.9/README.md)
- [AppWindowManager 实现](../../../../src/services/AppWindowManager.ts)
- [window/page.tsx 路由](../../../../src/app/window/page.tsx)
