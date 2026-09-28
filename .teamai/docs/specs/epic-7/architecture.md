# Epic 7: 本体数据服务层 — 架构总览

**版本:** 1.0
**创建:** 2026-05-07
**状态:** 待实施

---

## 🎯 设计目标

构建基于本体结构的**实例数据服务层**，让 Agent/RoleAgent 和前端用户都能基于本体 Schema 对实例数据进行增删改查操作。解决当前本体系统只能创建 Domain/Concept、无法管理实例数据的问题。

### 核心需求

1. **Agent 可操作本体数据** — 通过 Tool 调用创建、查询、更新、删除实例
2. **多视图前端编辑** — 表单、文档、表格、图谱四种视图
3. **文件存储 + 索引** — 单条实例一个 JSON 文件，NeDB 风格 `_index.json` 内存索引
4. **版本追溯** — 主动保存版本时记录完整快照
5. **Schema 校验** — 基于 Concept 定义校验实例字段

### AGENTS.md 规约符合性声明

- ✅ **技术栈约束**：TypeScript 严格模式、Next.js App Router、React 函数组件、Tailwind、Zustand
- ✅ **目录结构规约**：服务层位于 `src/lib/features/ontology-data-store/`，工具位于 `src/lib/integrations/pi-agent/tools/`，API 位于 `src/app/api/ontology-data/`
- ✅ **单向依赖**：app/ → components/ → services/ → lib/features/ → lib/storage/，禁止双向/循环依赖
- ✅ **数据存储**：本地文件系统 (JSON)，MVP 阶段禁止数据库
- ✅ **本体三层结构**：Domain → Concept → Instance（强制）
- ✅ **组件分层**：molecules/ 不依赖业务逻辑，organisms/ 可依赖 lib/

---

## 📐 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    Layer 5: App                      │
│  src/app/api/ontology-data/     API 路由              │
│  src/app/api/agents/[id]/data/  Agent 数据操作接口    │
└──────────────────────────┬──────────────────────────┘
                           │ 单向依赖
┌──────────────────────────▼──────────────────────────┐
│                    Layer 4: Components               │
│  src/components/os/data-editor/                      │
│  DataFormView  DataTableView(TanStack)  DataGraphView│
│  DataDocumentView  VersionPanel  DataWindowContent   │
└──────────────────────────┬──────────────────────────┘
                           │ 单向依赖
┌──────────────────────────▼──────────────────────────┐
│                    Layer 3: Services                 │
│  src/services/DataWindowManager.ts  数据窗体管理      │
└──────────────────────────┬──────────────────────────┘
                           │ 单向依赖
┌──────────────────────────▼──────────────────────────┐
│              Layer 2: lib/features                   │
│         ┌────────── ontology-data-store/ ───────┐   │
│         │ store.ts         核心 CRUD             │   │
│         │ index-manager.ts 内存索引 (_index.json) │   │
│         │ query-engine.ts  查询引擎              │   │
│         │ schema-validator.ts  Schema 校验       │   │
│         │ version.ts       版本管理              │   │
│         │ export.ts        JSON/CSV 导出         │   │
│         │ types.ts         类型定义              │   │
│         │ index.ts         公共 API 导出         │   │
│         └───────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────┘
                           │ 单向依赖
┌──────────────────────────▼──────────────────────────┐
│              Layer 1: lib/integrations               │
│  pi-agent/tools/ontology-data-tools.ts  (7 个工具)   │
└─────────────────────────────────────────────────────┘
```

---

## 📁 数据存储结构

```
data/ontologies/{ontologyId}/
├── ontology.json                    # 已有：本体 schema（Domain/Concept/Relation）
├── data/                            # ★ 新增：实例数据目录
│   └── {domainId}/{conceptId}/
│       ├── {instanceId}.json        # 单条实例数据
│       └── _index.json              # 概念索引（NeDB 风格）
└── versions/                        # ★ 新增：版本历史
    └── {instanceId}/
        └── {version}.json           # 主动保存的版本快照
```

### 单条实例数据结构

```typescript
interface InstanceData {
  id: string;
  conceptId: string;
  domainId: string;
  ontologyId: string;
  fields: Record<string, unknown>;  // 字段值（由 Concept Schema 定义）
  meta: {
    createdAt: number;
    updatedAt: number;
    createdBy: 'user' | 'agent' | 'skill';
    version: number;
  };
}
```

### 索引结构（`_index.json`）

```json
{
  "conceptId": "concept-xxx",
  "updatedAt": 1717603200000,
  "entries": {
    "inst-001": {
      "name": "张三",
      "status": "active",
      "createdAt": 1717603200000,
      "updatedAt": 1717603200000
    },
    "inst-002": {
      "name": "李四",
      "status": "pending",
      "createdAt": 1717603300000,
      "updatedAt": 1717603300000
    }
  }
}
```

索引在启动时加载到内存，CRUD 操作时同步维护。查询操作直接对内存索引执行，无需扫描文件。

---

## Story 分解

| Story | 标题 | 职责 |
|-------|------|------|
| **7.1** | 数据存储层 + 索引系统 | store.ts, index-manager.ts, query-engine.ts, schema-validator.ts |
| **7.2** | 版本管理系统 | version.ts — 保存/查询/回退版本 |
| **7.3** | Agent 数据操作工具 | ontology-data-tools.ts — 7 个工具 + 批量删除确认机制 |
| **7.4** | REST API 路由 | api/ontology-data/ — 实例/版本/导出的 HTTP 接口 |

## 依赖关系

```
7.1 (数据服务层)
    │
    ├── 7.2 (版本管理) ──── 7.3 (Agent 工具)
    │                            │
    │                            └── 7.4 (API 路由)
    │
    └── 8.1 (表单/文档视图) → 8.2 (表格视图) → 8.3 (图谱视图) → 8.4 (窗体集成)
```

---

## 可复用文件

| 文件 | 复用点 |
|------|--------|
| `src/types/ontology.ts` | Domain/Concept/Instance 类型（需扩展） |
| `src/types/api.ts` | ApiResponse, PaginationParams |
| `src/lib/integrations/pi-agent/tools/ontology-tools.ts` | 现有工具模式（TypeBox + ToolRegistration） |
| `src/lib/integrations/pi-agent/tools/registry.ts` | 工具注册模式 |
| `src/lib/storage/json-store.ts` | 文件 I/O 模式参考 |
| `src/app/api/projects/[id]/files/route.ts` | API 路由模式参考 |

---

## 验证方法

1. **Story 7.1/7.2**：`__tests__/` 单元测试覆盖 CRUD、索引、查询、版本
2. **Story 7.3**：Pi Agent 会话中调用工具，验证参数校验和确认流程
3. **Story 7.4**：curl 或 Playwright E2E 测试 API 路由
4. **Epic 8**：Playwright 测试各视图渲染和交互
