# Epic ONT: Ontology Core 语义底座

**Epic 编号:** ONT  
**Epic 名称:** Ontology Core 语义底座  
**优先级:** Critical  
**状态:** Planning  
**Owner:** Architecture / Core  
**创建日期:** 2026-07-27  
**最后更新:** 2026-08-19

---

## Epic 定位

Epic ONT 是 `packages/core` 内的本体核心能力 Epic，负责为 OriginOS 提供统一的业务语义模型、事实访问、Action 门控和契约校验能力。

它不是解决方案设计 Epic，也不是多 Agent 运行时 Epic。

```text
Epic ONT
  Owns: ontology schema / storage / migration / validation / OSDK / contract DTO
  Does not own: Agent+Skill 方案编排、supervisor/worker 调度、Web 编辑器 UI、记忆系统
```

按照 startupOS 架构围栏，本 Epic 只交付 core 可复用能力，并通过公共 API 被其他 Epic 消费。

---

## 架构围栏

本 Epic 必须符合 [AGENTS.md](../../../AGENTS.md) 的 monorepo 和模块依赖规约。

### 包边界

| 包/模块 | ONT 中的职责 | 边界 |
|---------|--------------|------|
| `packages/core/src/lib/features/ontology/` | canonical ontology schema、validator、migration、OSDK contract、public API | ONT 主实现位置 |
| `packages/core/src/lib/features/ontology-data-store/` | ontology facts、projection、DataFile/JSONL storage adapter | 仅做本体数据存储适配 |
| `packages/core/src/types/` | 跨模块稳定 DTO 类型 | 只放确需跨 package 共享的类型 |
| `packages/core/src/modules/collaboration-runtime/` | 消费 ONT 公共 API 做运行时门控 | 不属于 ONT 实现主体 |
| `packages/web/src/app/` | API route 参数解析和响应映射 | 禁止写本体业务逻辑 |
| `packages/web/src/components/` | 本体/方案 UI 展示 | 禁止写 schema、migration、validator |
| `packages/desktop/src/main/services/` | IPC、data root、文件系统环境适配 | 禁止复制 core 本体逻辑 |
| `packages/core/src/modules/memory-core/` | 消费运行投影做召回和沉淀 | 不直接写 canonical ontology |

### 依赖方向

```text
web / desktop
  -> @originos/core public API

collaboration-runtime
  -> ontology public API
  -> ontology-data-store public API

solution-design / P2
  -> ontology public API
  -> contract validation API

memory-core / cognitive / taste
  -> runtime context projection query API
  -/-> ontology internal files

ontology feature
  -> storage / shared / types
  -/-> web
  -/-> desktop
  -/-> collaboration-runtime
  -/-> memory-core
```

Feature 间必须通过 `index.ts` 暴露的公共 API 访问。禁止为了实现方便跨 feature 导入内部文件。

### 数据围栏

- MVP 阶段只使用本地文件系统 JSON/JSONL。
- canonical ontology 使用 DataFile JSON。
- facts、runtime projection、audit trace 优先使用 append-only JSONL，必要时生成 DataFile JSON 快照。
- 禁止引入数据库、图数据库、后台服务或外部向量库作为 ONT 的 MVP 依赖。
- Web API route、Web component、Desktop service 不得手写 ontology 文件路径或序列化逻辑。

DataFile 格式：

```typescript
interface DataFile<T> {
  version: string;
  createdAt: string;
  updatedAt: string;
  data: T;
}
```

---

## 非目标

ONT 明确不做以下事情：

- 不替代 Epic P2 的 `Agent + Skill + SOP DAG + topology + executionManifest` 方案设计产物。
- 不把 Solution Design 改成“只输出 Ontology Core”。
- 不实现 supervisor/worker 调度、任务拆解、worker spawner、重试、HITL 或运行时 UI。
- 不接管 Epic 9 / collaboration-runtime 的事件存储、DAG executor、sandbox worker。
- 不接管 Epic M/C/T 的 Memory Core、Pattern、TASTE 蒸馏。
- 不在 Web/desktop 层实现本体转换、校验或迁移。

---

## 与其他 Epic 的关系

| Epic / 模块 | 关系 |
|-------------|------|
| Epic 1 项目初始化 | 通过 ONT public API 创建或更新项目 ontology；保留对话式访谈体验 |
| Epic P2 解决方案设计 | 读取 ONT schema 和 contract validator；P2 仍交付 Agent+Skill 方案 |
| Story P2.6 SOP I/O 契约 | 使用 ONT 的 contract DTO 和 validation API，不迁入 ONT 实施 |
| Story P2.4 沙盒推演 | 使用 ONT validator 检查本体缺口；推演 UI 和流程仍属于 P2 |
| Epic 9 / collaboration-runtime | 使用 ONT OSDK 和 Action gate；runtime 编排仍属于 Epic 9 |
| Epic C/M/T | 消费 runtime context projection 做召回、Pattern、TASTE；不得直接写 canonical ontology |
| `ontology-data-store` | 作为 ONT 下层事实/投影存储适配，需服从 canonical schema |
| `business-model.json` | 迁移期兼容投影，不再作为第二写入源 |

---

## 架构模型

ONT 只定义“可操作世界模型”和“本体访问门控”。

```text
Ontology Core
├── Model Schema
│   ├── Domain
│   ├── BusinessObject
│   ├── Aggregate
│   ├── Property
│   ├── Relation
│   ├── FactType
│   ├── Rule / Policy
│   ├── Action
│   ├── DomainEvent
│   └── Projection
│
├── Contract Schema
│   ├── SkillContract
│   ├── AgentContract
│   ├── InputFact
│   ├── OutputFact
│   ├── ActionBinding
│   └── ValidationResult
│
├── OSDK
│   ├── facts.get/query
│   ├── actions.execute
│   ├── validateContract
│   ├── validateAction
│   └── createChangeProposal
│
└── Storage
    ├── canonical ontology DataFile JSON
    ├── facts JSONL / snapshots
    ├── projections JSONL / snapshots
    └── migration records
```

Agent、Skill、SOP DAG、topology、supervisor/worker session 只可以引用这些模型和 API，不成为 ONT 的主产物。

---

## 设计原则

### 1. Ontology 是语义底座，不是方案编排器

ONT 定义业务对象、事实、规则、Action 和权限边界。P2 决定哪些 Agent/Skill 如何组合，collaboration-runtime 决定如何执行。

### 2. Action 是唯一写入口

运行时写 facts 必须通过 OSDK Action API。直接 `write_file` 修改本体 facts 或 canonical ontology 视为越过架构围栏。

### 3. Contract 是跨 Epic 协议

Skill/Agent contract 是 ONT 暴露给 P2 和 collaboration-runtime 的协议。ONT 负责定义类型和校验，不负责生成完整方案拓扑。

### 4. Projection 不是第二事实源

`business-model.json`、编辑器 ViewModel、Context Graph projection 都是投影。canonical ontology 和 OSDK facts 才是本体规范源。

### 5. 默认拒绝

以下情况必须返回结构化错误，而不是降级继续：

- 引用不存在的对象、字段、Rule、Action。
- Skill contract 缺少必需 input/output/action 绑定。
- Action 前置条件不满足。
- 输出破坏聚合不变量。
- Agent 没有目标 Action 或事实类型权限。
- 事实版本冲突或来源不可信。

---

## 目标数据路径

逻辑路径由 core data-root resolver 统一解析，Web/desktop 只能注入 data root。

```text
{project-root}/data/ontology/{projectId}-ontology.json
{project-root}/data/ontology/{projectId}-facts.jsonl
{project-root}/data/ontology/{projectId}-projections.jsonl
{project-root}/data/ontology/{projectId}-migrations.jsonl
```

如现有项目仍使用其他路径，ONT.3 负责迁移和兼容读取。

---

## Stories

| Story | 标题 | 状态 | 优先级 | ONT 交付边界 |
|-------|------|------|--------|--------------|
| ONT.1 | Canonical Ontology Schema 与公共类型 | Planning | Critical | 定义 canonical model、contract DTO、schema version、public exports |
| ONT.2 | Ontology Store 与 DataFile/JSONL 存储 | Planning | Critical | core storage adapter、data-root 解析、atomic write、append-only facts |
| ONT.3 | 旧模型迁移与兼容投影 | Planning | Critical | `Domain/Concept/Instance`、`business-model.json`、`OntologyModel` 迁移与只读投影 |
| ONT.4 | Validator、Rule、Action Gate | Planning | Critical | 引用校验、聚合不变量、Action 前置/后置条件、结构化错误 |
| ONT.5 | OSDK Facts / Actions API | Planning | Critical | 类型化 facts 查询、Action execute、版本检查、审计 metadata |
| ONT.6 | Skill / Agent Contract Validation API | Planning | High | P2 可消费的 contract DTO、SOP I/O 连通性校验、权限校验 |
| ONT.7 | Context Projection Protocol | Planning | High | 定义 runtime projection DTO 和 append/query API；不实现 runtime 调度 |
| ONT.8 | Cross-package Adapters 与端到端验证 | Planning | High | Web API adapter、Desktop IPC adapter、P2/runtime integration tests |

### 实施顺序

```text
ONT.1
  ├─> ONT.2 ─> ONT.3
  ├─> ONT.4 ─> ONT.5
  └─> ONT.6 ─> ONT.7 ─> ONT.8
```

ONT.1、ONT.2、ONT.4 是架构门。下游 P2、Epic 9、Epic C/M/T 不得复制临时 schema 或绕开 public API。

---

## Story 级围栏要求

每个 ONT Story 实施前必须补齐：

- `requirements.md`：用户价值、前置依赖、验收标准。
- `architecture.md`：模块落点、依赖方向、数据路径、禁止依赖、AGENTS.md 符合性声明。
- `testing.md`：core unit、integration、adapter、migration 或 E2E 用例。

涉及公共 API、数据结构、数据路径、架构围栏或迁移策略变化时，必须同步更新 `docs/changes/`；若修改全局围栏，再同步更新 `AGENTS.md`。

---

## Epic 级验收标准

### Schema 与存储

- [ ] canonical ontology、contract DTO、projection DTO 均由 `packages/core` 公共 API 导出。
- [ ] canonical ontology 文件符合 DataFile JSON 格式。
- [ ] facts、projections、migrations 使用 JSONL 或 DataFile 快照。
- [ ] 不引入数据库、图数据库或后台服务依赖。
- [ ] 旧 ontology 数据可迁移，迁移失败可回滚。

### 架构依赖

- [ ] `packages/core/src/lib/features/ontology/` 不依赖 web、desktop、collaboration-runtime、memory-core。
- [ ] Web API route 不包含本体转换、校验、迁移或 Action gate 逻辑。
- [ ] Desktop service 不复制 core 本体逻辑，只做 IPC/data-root adapter。
- [ ] P2、collaboration-runtime、memory-core、cognitive、taste 均通过 public API 消费 ONT 能力。
- [ ] 无跨 feature 内部路径导入，无循环依赖。

### 语义能力

- [ ] 支持 BusinessObject、Aggregate、Property、Relation、FactType、Rule、Action、DomainEvent、Projection。
- [ ] Action 可声明前置条件、后置条件、权限、版本检查、审计 metadata。
- [ ] Skill/Agent contract 可声明 input facts、output facts、allowed actions、permissions。
- [ ] Validator 对缺失字段、非法引用、越权 Action、SOP 断流和版本冲突返回结构化错误。

### 下游集成

- [ ] P2 可以调用 contract validation API 校验 Agent+Skill 方案，但方案编排仍在 P2。
- [ ] collaboration-runtime 可以调用 OSDK facts/actions 和 Action gate，但 supervisor/worker 调度仍在 Epic 9。
- [ ] runtime 可以通过 Context Projection Protocol 追加 plan/goal/task、agent、skill、fact、decision、outcome、gap 记录。
- [ ] Epic C/M/T 可以通过 projection query API 消费运行投影，但不能直接修改 canonical ontology。

---

## 风险与约束

| 风险 | 缓解 |
|------|------|
| ONT 范围膨胀成 P2 + runtime 重构 | 本 Epic 只交付 core schema/API/protocol；P2/Epic9 各自实现消费侧 Story |
| schema 过度设计 | 先覆盖 Project/P2/runtime 必需对象，保留 versioned extension point |
| 多套旧模型迁移造成数据丢失 | ONT.3 提供备份、dry-run migration、只读投影和回滚 |
| Agent 绕过 OSDK 写文件 | collaboration-runtime 裁剪工具，ontology data path 写入只开放 Action API |
| Web/Desktop 复制逻辑 | Adapter 层只做参数与错误映射，核心逻辑必须在 core 测试覆盖 |

---

## 当前进度

| 领域 | 当前状态 | ONT 目标状态 |
|------|----------|---------------|
| 本体 schema | 多套结构并存 | core canonical schema |
| 本体存储 | JSON 文件与内存 store 并存 | DataFile JSON + JSONL facts/projections |
| 业务模型 | `business-model.json` 独立结构 | canonical ontology 的兼容投影 |
| 方案契约 | P2 基础 I/O 描述 | ONT contract DTO + P2 编排消费 |
| 运行门控 | 匹配评分为主 | collaboration-runtime 消费 OSDK / Action gate |
| Context Graph | 未形成统一协议 | ONT 定义 projection protocol，下游 runtime 写入 |

Epic 当前处于规格设计阶段，尚未开始代码实施。

---

## 相关文档

- [AGENTS.md](../../../AGENTS.md)
- [Epic 1: 项目初始化 Skill](../epic-1/README.md)
- [Epic P2: AI 解决方案设计](../epic-P2/README.md)
- [Story P2.6: SOP I/O 契约](../epic-P2/story-P2.6/README.md)
- [Epic 9: 多 Agent 协作运行时](../epic-9/README.md)
- [Epic C: 认知系统](../epic-C/README.md)
- [Epic M: Memory Core](../epic-M/README.md)

---

## 变更历史

| 日期 | 版本 | 变更 | 变更人 |
|------|------|------|--------|
| 2026-08-19 | 0.2.0 | 按 startupOS 架构围栏重构 Epic：ONT 收敛为 core ontology bounded context，只交付 schema、store、validator、OSDK、contract API 和 projection protocol；P2/runtime/memory 作为下游消费方 | Codex |
| 2026-07-27 | 0.1.0 | 创建 Epic，覆盖统一 schema、业务聚合、规则与 Action、OSDK 契约门控和多 Agent 运行时 | Codex |
