# Epic 9: Multi-Agent 协作运行时

**Epic 编号:** 9
**Epic 名称:** Multi-Agent 协作运行时 (Multi-Agent Collaboration Runtime)
**优先级:** 🔴 Critical
**状态:** 🔄 In Progress（Phase 1/2 已完成，Phase 3 持续实施）
**创建日期:** 2026-05-12
**设计文档:** [multi-agent-runtime.md](../../design/multi-agent-runtime.md) | [process-isolation.md](../../design/process-isolation.md)

---

## 📋 概述

将当前运行在 Next.js 进程内的单 Agent 系统拆分为**三层进程隔离架构**（Web → Runtime → Agent 子进程），并在此基础上构建多 Agent 协作运行时，驱动 Solution Manifest 中定义的多个 Agent 按照协作拓扑（trigger/notify/depend）协同工作。

### 核心问题

| 问题 | 现象 | 影响 |
|------|------|------|
| **事件循环阻塞** | LLM 调用（2-60s）在同一个 event loop 中排队 | 多窗体同时使用时，响应延迟叠加 |
| **上下文膨胀** | Agent 对话历史存在进程内存中 | 多项目并发 → 内存持续增长 |
| **崩溃传播** | Agent 未捕获异常 → Next.js 进程崩溃 | 单个 Agent 出错影响所有用户 |
| **资源不可控** | 无法对单个 Agent 做内存/CPU/网络限制 | 失控 Agent 可以耗尽系统资源 |
| **缺少多 Agent 协作** | 单 Agent 独立运行，无法协同 | Solution Manifest 中的协作拓扑无法执行 |

### 解决方案

1. **进程隔离**：Next.js 不再直接运行 LLM 调用，改为调用独立 Agent Runtime 进程
2. **协作引擎**：Runtime 进程内实现 Blackboard + Event Sourcing + DAG Executor，驱动多 Agent 协作
3. **Agent 子进程**：每个 Agent 通过 `@anthropic-ai/sandbox-runtime` 在独立沙箱子进程中运行

---

## 🎯 Epic 目标

### 核心目标

1. **三层进程隔离** — Web (Next.js) → Runtime (独立 Node) → Agent (sandbox 子进程)
2. **共享黑板** — 多 Agent 通过 Blackboard 共享状态，而非点对点硬编码
3. **拓扑驱动执行** — Solution Manifest 中的协作关系决定执行流
4. **两种执行模式** — 统一运行时支持 Workflow（轻量 DAG）和 System（重量协作）
5. **标准化协议** — ACL 消息协议 + 请求/招标/订阅等交互协议
6. **PI Agent 无缝迁移** — prompt 构建和 agent loop 逻辑完全不变

### 成功标准

- ✅ 单 Agent 对话通过 Runtime 中转正常，LLM 调用不阻塞 Next.js
- ✅ Workflow 模式：Solution Manifest 全 trigger 拓扑 → DAG 顺序执行正确
- ✅ System 模式：存在 notify/depend 的拓扑 → 并行执行 + 黑板协作正确
- ✅ Agent 子进程崩溃不影响 Runtime 或其他 Agent
- ✅ SSE 事件流实时推送，前端可查看协作事件时间线
- ✅ 现有 Agent.md/Tool.md/Skill.md 无需修改即可在子进程中加载

---

## 🔗 前置依赖

| 依赖内容 | 来源 Epic | 来源位置 | 状态 |
|---------|----------|---------|------|
| PI Agent 核心 | Epic 0 | `src/lib/integrations/pi-agent/` | ✅ Complete |
| Persistent Agent + Manager | Epic 0 | `persistent-agent.ts`, `persistent-agent-manager.ts` | ✅ Complete |
| Solution Manifest | skills/solution-design | `solutions/solution-{version}.json` | ✅ Available |
| Agent 定义文件 | 项目目录 | `data/projects/{id}/agents/{agentId}/*.md` | ✅ Available |
| @anthropic-ai/sandbox-runtime | learn/sandbox-runtime | npm 包 v0.0.51 | ✅ Available |
| Ontology Data Store | Epic 7/8 | `src/app/api/ontology-data/` | ✅ Complete |

### 被依赖的模块

| 依赖模块 | 目的 |
|---------|------|
| 现有 `/api/chat` 路由 | 需改为调用 Runtime API |
| Solution Design skill | 未来可直接启动协作运行时 |
| 现有 SandboxWindow | 预览协作产出 |

---

## 📝 Stories 列表

| Story | 标题 | 优先级 | 调度 | 状态 |
|-------|------|--------|-----|------|
| **9.1** | 类型定义与事件模型 | Critical | Phase 1 | ✅ Complete |
| **9.2** | 事件存储（文件系统 JSONL） | Critical | Phase 1 | ✅ Complete |
| **9.3** | 共享黑板（Blackboard） | Critical | Phase 1 | ✅ Complete |
| **9.4** | 依赖注入配置（CollaborationRuntimeDeps） | Critical | Phase 1 | ✅ Complete |
| **9.5** | Agent 注册表 | High | Phase 1 | ✅ Complete |
| **9.6** | PI Agent 桥接与子进程入口 | Critical | Phase 1 | ✅ Complete |
| **9.7** | 协作拓扑解析器 | Critical | Phase 1 | ✅ Complete |
| **9.8** | DAG 执行器（Workflow 模式） | Critical | Phase 1 | ✅ Complete |
| **9.9** | ACL 消息协议 | High | Phase 1 | ✅ Complete |
| **9.10** | Node.js 沙箱（MVP） | High | Phase 1 | ✅ Complete |
| **9.11** | Collaboration API Routes | Critical | Phase 1 | ✅ Complete |
| **9.12** | UI：协作查看器（事件时间线） | High | Phase 1 | ✅ Complete |
| **9.13** | Supervisor 模式 | High | Phase 2 | ✅ Complete |
| **9.14** | 招标-投标 + 订阅-通知协议 | High | Phase 2 | ✅ Complete |
| **9.15** | 冲突检测与消解 | High | Phase 2 | ✅ Complete |
| **9.16** | 能力匹配与动态路由 | Medium | Phase 2 | ✅ Complete |
| **9.17** | UI：协作拓扑图 + 黑板可视化 | Medium | Phase 2 | ✅ Complete |
| **9.18** | 生产加固（可观测性） | Low | Phase 3 | ✅ Complete |
| **9.19** | Queen-Led 层级协调（动态治理模式） | High | Phase 3 | ⬜ Pending |
| **9.20** | 黑板 HNSW 语义索引 | High | Phase 3 | ⬜ Pending |
| **9.21** | Agent Pool 预热机制 | Medium | Phase 3 | ⬜ Pending |
| **9.22** | 三层模型路由（Agent Booster → Haiku → Sonnet/Opus） | Medium | Phase 3 | ⬜ Pending |
| **9.23** | 共识投票机制（BFT/Raft/Quorum） | Low | Phase 3 | ⬜ Pending |
| **9.24** | PID 孤儿会话回收 | Medium | Phase 3 | ✅ Complete |
| **9.25** | DAG 执行链路修复（路径/上下文/工具注入） | Critical | Phase 3 | ✅ Complete |
| **9.27** | 架构治理与 HITL 链路修复（Phase 3 门禁）| Critical | Phase 3 | ✅ Complete |
| **9.28** | Swarm/Supervisor 模式生产接线 | High | Phase 3 | ✅ Complete |
| **9.29** | Supervisor 模式协调能力修复（HITL/任务化转写/Artifact 流转） | Critical | Phase 3 | 📋 Planning |
| **9.30** | Supervisor Agent 化（Supervisor as Real Agent，PR-A） | Critical | Phase 3 | 📋 Planning |
| **9.31** | 单前台 Agent 契约（Worker 工具白名单收紧 + 直连拒绝） | Critical | Phase 3 | 📋 Planning |
| **9.32** | Worker 结构化阻塞契约（`report_block` + `WorkerBlock` 类型） | Critical | Phase 3 | 📋 Planning |
| **9.33** | Supervisor HITL 决策器（四路径 + 强制 mergedContext） | Critical | Phase 3 | 📋 Planning |
| **9.34** | 用户回复路由收敛到 Supervisor | Critical | Phase 3 | 📋 Planning |
| **9.35** | Workflow 模式 Lightweight Supervisor 兜底 | High | Phase 3 | 📋 Planning |
| **9.36** | Supervisor/Worker 模式架构改进 | High | Phase 3 | 📋 Planning |
| **9.37** | HITL 直连与协作链路扁平化 | High | Phase 3 | 🔄 In Progress |
| **9.38** | 协作运行时目录收敛 | High | Phase 3 | 📋 Planning |
| **9.39** | collaboration-runtime-bridge 残留清理 | High | Phase 3 | 📋 Planning |
| **9.40** | 协作 UI：多 HITL 并发与消息流对齐 | Medium | Phase 3 | 📋 Planning |
| **9.41** | Agent/RoleAgent 任务入口与 pi-tasks 直接执行 | High | Phase 3 | 📋 Ready（A-02 边界已通过） |
| **9.42** | 多 Agent 任务与解决方案执行契约对齐 | High | Phase 3 | 📋 Planning |

> **当前进度（2026-08-01）：** Epic 9 主运行时已具备 Workflow、Supervisor、黑板、协议和基础 UI；Story 9.41 的 A-02 受控 `pi-tasks` 公共边界已通过，但任务入口、Task 卡片、completion policy、lease、续跑与恢复尚未实施。Phase 3 的 HITL 收敛、链路治理及高级协作能力也未完成，因此 Epic 保持 In Progress，不能按整体 Complete 归档。

> **2026-05-22 重大更新**：基于 [PRD-collaboration-product.md](./PRD-collaboration-product.md) 的"单前台 Agent"产品强约束，新增 9.31–9.35 五个 Story，把 Supervisor 从"协调器（建议）"升级为协作会话期间用户唯一的对话伙伴。9.30 PR-B 范围转移到 9.31–9.34；9.29 SUP-01 验收同步调整。

---

## 🏗️ Story 详情

### Phase 1: 协作基础（Phase 1 — 核心）✅ Complete

#### Story 9.1: 类型定义与事件模型

**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 1-2 天

**职责：** 定义协作运行时的核心类型系统。

**功能需求：**

- `RuntimeEvent` — 事件模型（16+ EventType）
- `Blackboard` — 黑板数据结构（sharedData, messages, tasks, artifacts, locks）
- `ACLMessage` — Agent 通信语言（performative: inform/request/notify/delegate 等）
- `CollaborationTopology` — 拓扑结构（agents map, edges, entryPoints, exitPoints）
- `CollaborationSession` — 会话模型

**技术文件：**

```
src/modules/collaboration-runtime/session/types.ts
```

**验收标准：**

- [ ] 覆盖设计文档 §3.2 全部 EventType
- [ ] Blackboard 数据结构覆盖 §3.3 全部字段
- [ ] ACLMessage 覆盖 §4.1 全部 performative
- [ ] 无 `any` 类型，全部具体类型定义
- [ ] 类型导出公共 API

---

#### Story 9.2: 事件存储（文件系统 JSONL）

**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 1-2 天

**职责：** 实现事件存储接口，通过文件系统 JSONL 持久化事件流。

**功能需求：**

- `EventStore` 接口（append, read, checkpoint, list）
- `FsEventStore` 实现 — 文件系统 JSONL 存储
- 存储路径：`data/projects/{projectId}/collaboration-sessions/{sessionId}/events.jsonl`
- 支持 checkpoint（状态快照 + cursor）
- JSON 文件符合 DataFile 格式约束

**技术文件：**

```
src/modules/collaboration-runtime/session/event-store.ts      # 接口
src/modules/collaboration-runtime/session/fs-event-store.ts   # 实现
```

**验收标准：**

- [ ] Event append 后 JSONL 可读回
- [ ] checkpoint 后 read(cursor) 仅返回增量
- [ ] 并发写入安全（append 原子操作）
- [ ] 所有 JSON 文件符合 `version/createdAt/updatedAt/data` 格式

---

#### Story 9.3: 共享黑板（Blackboard）

**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 2-3 天

**职责：** Blackboard 类 — 从事件流重建状态，提供读写共享数据、ACL 消息路由、任务队列管理。

**功能需求：**

- 从事件流重建黑板状态（Event Sourcing）
- sharedData 读写（带锁机制）
- ACL 消息收发与路由
- 任务队列管理（create/assign/start/complete/fail/reassign）
- artifacts 管理
- 锁机制（BLACKBOARD_LOCK / RELEASE，超时自动释放）
- **Provenance 追踪** — 每次写入记录 `{ writer, timestamp, source_uri, tool_calls_cited, version }`
- **Append-Only 日志** — 纠错为新条目而非原地覆盖（`supersedes` 字段引用旧条目）
- **Read-Only Verifier 支持** — 独立验证 Agent 可读取黑板但不能写入

**防 Memory Poisoning（来自 Lesson 13）：**
- 每个 Agent 的幻觉写入黑板后，下游 Agent 会当作事实采纳，导致精度衰减
- 必须实现 provenance + append-only + read-only verifier 三道防线

**技术文件：**

```
src/modules/collaboration-runtime/session/blackboard.ts
```

**验收标准：**

- [ ] 从 events.jsonl 重建 Blackboard 状态
- [ ] 并发写同一 key 时锁生效
- [ ] 消息路由正确（定向 vs 广播）
- [ ] 任务状态机流转正确
- [ ] 每次写操作附带 provenance 元数据
- [ ] 纠错操作不覆盖旧条目（append-only）

---

#### Story 9.4: 依赖注入配置

**状态:** Planning
**优先级:** Critical
**估计工时:** 1 天

**职责：** 定义 `CollaborationRuntimeDeps` 接口，模块内部禁止 import `lib/` 或 `components/` 下的任何模块。

**功能需求：**

- `agentEngine` — LLM 调用 + Agent 生命周期
- `toolExecutor` — 工具执行
- `ontologyStore` — 本体数据存储
- `fileOps` — 文件读写
- `eventEmitter` — SSE 事件推送

**技术文件：**

```
src/modules/collaboration-runtime/config.ts
```

**验收标准：**

- [ ] 模块内部无任何 `src/lib/` 或 `src/components/` import
- [ ] 全部依赖通过 `CollaborationRuntimeDeps` 注入
- [ ] 接口可 mock（支持单元测试）

---

#### Story 9.5: Agent 注册表

**状态:** Planning
**优先级:** High
**估计工时:** 1-2 天

**职责：** 从 Solution Manifest + `data/projects/{id}/agents/{agentId}/*.md` 加载 Agent 定义。

**功能需求：**

- 解析 Solution Manifest JSON 提取 Agent 列表
- 加载 `Agent.md` / `Tool.md` / `Skill.md`
- 提取 Agent 能力列表（从 responsibility 中解析）
- 构建 AgentNode 注册到拓扑
- **Agent Card 生成** — 为每个 Agent 生成标准化发现元数据（id, name, description, skills, capabilities, endpoints, modalities）

**技术文件：**

```
src/modules/collaboration-runtime/bridge/agent-registry.ts
```

**验收标准：**

- [ ] 从 solution-v1.0-manifest.json 正确解析 Agent 列表
- [ ] 加载 Agent.md 失败时优雅降级
- [ ] 能力提取准确

---

#### Story 9.6: PI Agent 桥接与子进程入口

**状态:** Planning
**优先级:** Critical
**估计工时:** 3-4 天

**职责：** 实现 Agent 子进程的启动、stdio 通信、以及现有 PI Agent 代码在子进程中的运行。

**功能需求：**

- **Agent Worker 子进程**（`agent-worker.ts`）：通过 stdio 与 Runtime 通信
  - 接收 `initialize` → 读取 Agent.md/Tool.md/Skill.md → 构建 prompt → 创建 PersistentAgent
  - 接收 `prompt` → 调用 LLM → 输出事件流到 stdout
  - 接收 `abort` / `shutdown`
- **Runtime 侧**：通过 `@anthropic-ai/sandbox-runtime` 包装启动
- **stdio 协议**：JSON Line 格式，每行一个事件
- 现有 prompt 构建逻辑（`buildProjectPromptLayers`, `assembleProjectPrompt`）在子进程中运行
- CognitiveManager hooks 在子进程中运行
- 事件（turn_end, agent_end）通过 stdout 传给 Runtime

**技术文件：**

```
src/modules/collaboration-runtime/sandbox/agent-spawner.ts    # Runtime 侧：启动子进程
src/lib/integrations/pi-agent/agent-worker.ts                  # 子进程入口
```

**迁移约束（来自设计文档 §2.1.1）：**

- `PersistentAgent`, `OriginOSAgent`, `@originos/pi-agent-adapter` → Agent 子进程
- `CognitiveManager`, `PracticeLogger`, `KnowledgeProvider`, `PatternProvider` → Agent 子进程
- 文件加载 + prompt 构建 → Agent 子进程
- prompt 构建逻辑和 agent loop **完全不变**，仅执行位置改变
- 唯一需要新开发：`agentSessionService` 跨进程调用 → 子进程通过 stdio 发事件 → Runtime 中转

**验收标准：**

- [ ] 单 Agent 通过子进程运行正常
- [ ] prompt 构建结果与迁移前一致
- [ ] agent loop（prompt → tool_call → tool_result → loop）正常
- [ ] 子进程崩溃不影响 Runtime
- [ ] stdio 事件流格式符合 RuntimeEvent 类型

---

#### Story 9.7: 协作拓扑解析器

**状态:** Planning
**优先级:** Critical
**估计工时:** 1-2 天

**职责：** 解析 Solution Manifest JSON → `CollaborationTopology`。

**功能需求：**

- 解析 agents map（ID → AgentNode）
- 解析 collaboration edges（from/to/type/description）
- 识别 entryPoints（无入边的 Agent）
- 识别 exitPoints（无出边的 Agent）
- 自动判定执行模式（Workflow vs System）
- 检测循环依赖

**技术文件：**

```
src/modules/collaboration-runtime/engine/topology-parser.ts
```

**验收标准：**

- [ ] 全 trigger 拓扑 → Workflow 模式
- [ ] 存在 notify/depend → System 模式
- [ ] 循环依赖检测正确
- [ ] 入口/出口 Agent 识别正确

---

#### Story 9.8: DAG 执行器（Workflow 模式）

**状态:** Planning
**优先级:** Critical
**估计工时:** 2-3 天

**职责：** 核心协作引擎 — 拓扑排序 → 并行执行 → trigger 自动触发下游 → 全局目标判定。

**功能需求：**

- 拓扑排序（Kahn 算法或 DFS）
- 无依赖 Agent 并行执行
- 有依赖 Agent 等待上游完成后触发（trigger 关系）
- 全局目标达成判定
- 超时与最大迭代次数限制
- **优先级队列 + aging** — 任务等待时间越长优先级越高，防止长任务饥饿
- **Back-pressure** — 队列积压超过阈值时暂停上游触发

**技术文件：**

```
src/modules/collaboration-runtime/engine/dag-executor.ts
```

**验收标准：**

- [ ] A→B→C 线性拓扑正确顺序执行
- [ ] B/C 并行 + D 汇总拓扑正确并行后汇总
- [ ] 上游失败时下游不触发
- [ ] 超时后终止执行
- [ ] 所有事件写入 EventStore

---

#### Story 9.9: ACL 消息协议

**状态:** Planning
**优先级:** High
**估计工时:** 1-2 天

**职责：** 实现 Agent 通信语言（ACL Message）和基础交互协议。

**功能需求：**

- ACLMessage 数据结构（performative, sender, receiver, content, etc.）
- 请求-响应协议（trigger 关系）
- 消息路由（定向 vs 广播）
- conversationId 管理多轮对话
- replyWith / inReplyTo 匹配

**技术文件：**

```
src/modules/collaboration-runtime/protocol/acl.ts
```

**验收标准：**

- [ ] request → inform 消息匹配正确
- [ ] 广播消息送达所有注册的 Agent
- [ ] conversationId 隔离不同对话流

---

#### Story 9.10: Node.js 沙箱（MVP）

**状态:** Planning
**优先级:** High
**估计工时:** 2 天

**职责：** 使用 Node.js `child_process` + `@anthropic-ai/sandbox-runtime` 实现沙箱隔离。

**功能需求：**

- 每个 Agent 子进程通过 sandbox 包装启动
- 文件系统权限（allow-write 默认拒绝）
- 超时控制（AbortSignal）
- 违规追踪（SandboxViolationStore）
- per-Agent 独立配置

**技术文件：**

```
src/modules/collaboration-runtime/sandbox/node-executor.ts
```

**验收标准：**

- [ ] 子进程无法写入 deny-write 路径
- [ ] 超时后子进程被 kill
- [ ] 违规事件可查询

---

#### Story 9.11: Collaboration API Routes

**状态:** Planning
**优先级:** Critical
**估计工时:** 2 天

**职责：** API 路由层，仅做 HTTP 处理，业务逻辑委托给 `collaboration-runtime` 模块。

**功能需求：**

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/collaboration/sessions` | POST | 创建协作会话 |
| `/api/collaboration/sessions` | GET | 列出会话 |
| `/api/collaboration/sessions/[id]` | GET | 会话详情 + 黑板快照 |
| `/api/collaboration/sessions/[id]/events` | GET | 事件流（SSE） |
| `/api/collaboration/sessions/[id]/blackboard` | GET | 黑板状态 |
| `/api/collaboration/sessions/[id]/execute` | POST | 启动执行 |
| `/api/collaboration/sessions/[id]/abort` | POST | 终止 |

- 组装 `CollaborationRuntimeDeps` 并注入模块
- 禁止在 route 中定义业务逻辑

**技术文件：**

```
src/app/api/collaboration/sessions/route.ts
src/app/api/collaboration/sessions/[id]/route.ts
src/app/api/collaboration/sessions/[id]/events/route.ts
src/app/api/collaboration/sessions/[id]/blackboard/route.ts
src/app/api/collaboration/sessions/[id]/execute/route.ts
src/app/api/collaboration/sessions/[id]/abort/route.ts
```

**验收标准：**

- [ ] POST 创建 session 返回正确 ID
- [ ] GET events 返回 SSE 流
- [ ] SSE 事件格式符合 RuntimeEvent
- [ ] route 中无业务逻辑，全部委托模块
- [ ] deps 组装正确注入

---

#### Story 9.12: UI — 协作查看器

**状态:** Planning
**优先级:** High
**估计工时:** 3-4 天

**职责：** 事件时间线 + SSE 实时更新 + Agent 活动展示。

**功能需求：**

- 事件时间线（按时间排序展示 RuntimeEvent）
- SSE 实时更新（连接 `/api/collaboration/sessions/[id]/events`）
- Agent 活动卡片（thinking / tool_call / complete / fail）
- 黑板状态简视图
- 位于 `src/modules/collaboration-runtime/ui/`（豁免 AGENTS.md `src/components/` 约束）

**技术文件：**

```
src/modules/collaboration-runtime/ui/CollaborationViewer.tsx
src/modules/collaboration-runtime/ui/EventTimeline.tsx
src/modules/collaboration-runtime/ui/BlackboardViewer.tsx
```

**验收标准：**

- [ ] SSE 连接后实时显示事件
- [ ] Agent 活动卡片状态正确
- [ ] 重连后不丢失事件（Last-Event-ID）
- [ ] 函数式组件 + Hooks + Tailwind

---

### Phase 2: 高级协作（Phase 2）✅ Complete

#### Story 9.13: Supervisor 模式

**估计工时:** 3-4 天
**优先级:** High
**依赖:** 9.8, 9.9

Supervisor-Worker 协作模式 — Supervisor 分解任务、通过 Contract Net 协议分配给 Worker、监控进度、处理失败重分配。

**强制约束（来自 Lesson 08 + 06）：**
- **至少一个 deterministic Verifier** — 每个 Supervisor 任务分配必须包含一个非 LLM 的验证角色
- **Communicative dehallucination** — Executor 缺少信息时必须向 Supervisor 提问，不可编造
- **树深度 ≤ 2** — Supervisor 嵌套最多 2 层，超过则可观测性崩溃
- **Revision loop budget** — Critic-Executor 修订最多 2 轮，超时上报人类
- **每层 Canary Question** — 每个 sub-manager 保留一个始终被问原始问题的 worker，检测分解漂移
- **Provenance Chain** — 每个合成节点必须追溯到 leaf 输出

---

#### Story 9.14: 招标-投标 + 订阅-通知协议

**估计工时:** 2-3 天
**优先级:** High
**依赖:** 9.9

实现 Contract Net 协议（cfp → propose → accept/reject → inform）和 Subscribe-Notify 协议（subscribe → notify 流）。

---

#### Story 9.15: 冲突检测与消解

**估计工时:** 2-3 天
**优先级:** High
**依赖:** 9.3

实现 ConflictDetector — 检测 resource_conflict, data_conflict, goal_conflict, deadlock，并应用消解策略。

**增强（来自 Lesson 23 — MAST）：**
- **Circuit Breaker** — 当 Agent 错误率超过 5-10% 自动熔断，返回降级结果
- **Retry Storm 防护** — capped retry budget（最多 3 次），指数退避
- **Slow-Failure Proxy** — 监控 agreement_rate、retry_rate、output_length_distribution 等慢失败指标
- **STRATUS 三人组** — Detection + Diagnosis + Validation Agent，生产环境中持续监控

---

#### Story 9.16: 能力匹配与动态路由

**估计工时:** 2 天
**优先级:** Medium
**依赖:** 9.5, 9.13

CapabilityMatcher — 根据任务需求（domain, skill, capability, 当前负载, 历史表现）匹配最合适的 Agent。

**增强（来自 Lesson 12 — A2A Protocol）：**
- 基于 **Agent Card** 元数据做发现，而非硬编码路由
- Agent Card 包含：skills, capabilities, endpoints, modalities
- 为未来跨系统 A2A 调用预留协议兼容性

---

#### Story 9.17: UI — 协作拓扑图 + 黑板可视化

**估计工时:** 3 天
**优先级:** Medium
**依赖:** 9.12

协作拓扑 DAG 图可视化 + 黑板状态详细查看器 + 锁状态展示。

---

### Phase 3: 生产加固与持续演进（Phase 3）🔄 In Progress

基础可观测性、资源配额和部分运行时加固已经完成；HITL 收敛、任务入口、链路治理、任务证据契约及高级协作能力仍按 Story 9.29-9.42 持续实施。Docker/PostgreSQL 项受外部基础设施和当前架构规约约束，不计为当前完成条件。

#### Story 9.18: 生产加固

**估计工时:** TBD
**优先级:** Low
**依赖:** Phase 1+2 全部完成

- Docker 容器沙箱（需外部 Docker 环境）
- PostgreSQL 事件存储（需 AGENTS.md 解除"禁止数据库"约束）
- ✅ 成本控制与资源配额（cost-controller.ts）
- ✅ 完整可观测性（logging.ts, metrics.ts, tracing.ts）

---

#### Story 9.19: Queen-Led 层级协调（动态治理模式）

**估计工时:** 3-4 天
**优先级:** High
**依赖:** 9.8, 9.13, 9.3

**职责：** 将 §5.3 Supervisor-Worker 模式增强为 Queen-Led 层级协调——Queen 不仅是任务分解者，还是共享内存命名空间的管理者，维护协作权威状态。

**功能需求：**

- **三种治理模式**：
  - `hierarchical` — 正常状态，Queen 直接调度 Worker（≤8 Agent）
  - `democratic` — 复杂决策，Worker 投票决策（8-15 Agent）
  - `emergency` — 故障状态，Queen 紧急接管（Worker 崩溃/超时/错误率超阈值）
- **动态模式切换** — 根据协作复杂度、Agent 数量、故障率自动切换
- **权威状态维护** — Queen 作为唯一事实来源（SSOT），防止 Agent 漂移
- **Scout Agent 支持** — 信息探索型 Agent，预扫描任务环境并报告给 Queen
- **Memory Manager 支持** — 共享内存命名空间管理器，维护黑板状态同步

**技术文件：**

```
src/modules/collaboration-runtime/engine/queen-coordinator.ts
src/modules/collaboration-runtime/engine/governance-mode.ts
```

**验收标准：**

- [ ] hierarchical 模式下 Queen 直接调度所有 Worker
- [ ] democratic 模式下 Worker 对提案投票多数决通过
- [ ] emergency 模式下 Worker 失败后 Queen 紧急接管并重新分配
- [ ] 治理模式根据 Agent 数量和错误率自动切换
- [ ] Queen 维护协作权威状态，Worker 不可覆盖 Queen 的决策

---

#### Story 9.20: 黑板 HNSW 语义索引

**状态:** Planning
**估计工时:** 3-4 天
**优先级:** High
**依赖:** 9.3

**职责：** 在黑板 `sharedData` 中增加语义索引——Agent 可从黑板**语义检索**相关上下文，而非精确匹配。借鉴 Ruflo 的 AgentDB + HNSW 方案。

**功能需求：**

- **ONNX embeddings**（384 维）— 使用 all-MiniLM-L6-v2 模型，推理 <50ms
- **HNSW 向量索引** — 多层图结构，顶层"高速公路"长距离连接，底层精细连接；搜索复杂度 O(log n)
- **写入时编码** — 黑板条目写入时自动生成 embedding → Int8 量化（75% 内存减少）→ HNSW 图插入
- **SmartRetrieval** — RRF 融合（Reciprocal Rank Fusion：语义得分 + 时间衰减 + 标签权重）+ MMR 多样性（diversity=0.7 去重）
- **持久化** — 索引 + 向量存到 sql.js（WASM SQLite），无需外部数据库服务
- **语义搜索 API** — `searchSemantic(query, limit, namespace)`

**黑板扩展：**

```typescript
interface Blackboard {
  // ... 现有字段 ...
  /** HNSW 语义索引 — 支持 Agent 从黑板语义检索相关上下文 */
  semanticIndex?: {
    embeddings: Map<string, Float32Array>;  // entryId → embedding
    hnswIndex: HNSWIndex;                   // 向量索引
  };
}
```

**技术文件：**

```
src/modules/collaboration-runtime/session/semantic-index.ts     # ONNX 编码 + Int8 量化
src/modules/collaboration-runtime/session/hnsw-index.ts         # HNSW 图构建 + 搜索
src/modules/collaboration-runtime/session/rrf-mmr.ts            # RRF 融合 + MMR 去重
```

**验收标准：**

- [ ] 黑板条目写入时自动生成 embedding 并插入 HNSW 索引
- [ ] 语义搜索返回相关度排序结果，10 万条目 <100ms
- [ ] RRF 融合（语义得分 + 时间衰减 + 标签权重）结果正确
- [ ] MMR 去重后结果多样性达标
- [ ] Int8 量化后内存占用减少 50-75%
- [ ] 索引持久化到 sql.js，重启后可恢复

---

#### Story 9.21: Agent Pool 预热机制

**状态:** Planning
**估计工时:** 2-3 天
**优先级:** Medium
**依赖:** 9.6, 9.10

**职责：** 预生成 warm pool 的 Agent 实例，跳过冷启动开销（读取 Agent.md/Tool.md/Skill.md，构建 prompt，初始化 sandbox）。

**功能需求：**

- **预热池** — 启动时按配置预创建 Agent 实例，保持空闲待机（prompt 已构建，sandbox 已初始化，仅未发送 LLM 请求）
- **按需获取** — `get(agentId, type?)` 命中则返回预热实例（<100ms），miss 则新建（~2s）
- **TTL 管理** — 预热实例记录 `lastUsedAt`，超过 `ttlMs`（默认 5 分钟）未使用则淘汰释放
- **容量控制** — `minPoolSize`（至少保持 N 个空闲实例）/ `maxPoolSize`（上限，超过则等待）
- **健康检查** — 每 30s ping 池中实例，异常（无响应/内存超标）立即淘汰并补充
- **类型隔离** — 按 Agent 类型维护独立子池（coder-pool、architect-pool），避免类型不匹配
- **Metrics 暴露** — 命中率、平均获取延迟、池大小变化曲线

**技术文件：**

```
src/modules/collaboration-runtime/sandbox/agent-pool.ts        # 预热池核心
src/modules/collaboration-runtime/sandbox/pool-metrics.ts      # 指标收集
```

**验收标准：**

- [ ] 预热 Agent 实例获取延迟 < 100ms（vs 冷启动 ~2s）
- [ ] TTL 超时后实例被淘汰并重新预热
- [ ] 池满时新请求等待，池空时新建实例
- [ ] 健康检查淘汰异常实例

---

#### Story 9.22: 三层模型路由

**估计工时:** 2 天
**优先级:** Medium
**依赖:** 9.6

**职责：** 在 `PiAgentBridge.think()` 中增加复杂度评估和模型路由——多 Agent 协作会产生大量 LLM 调用，按复杂度路由到不同模型以控制成本。借鉴 Ruflo ADR-026 方案。

**三层路由表：**

| Tier | Handler | 延迟 | 成本 | 适用 |
|------|---------|------|------|------|
| 1 | Agent Booster | <1ms | $0 | 简单转换（var→const、加类型） |
| 2 | Haiku | ~500ms | $0.0002 | 低复杂度任务 |
| 3 | Sonnet/Opus | 2-5s | $0.003-0.015 | 架构、安全、复杂推理 |

**Agent 类型默认映射：**

| Agent 类型 | 默认模型 | 说明 |
|-----------|---------|------|
| architect | opus | 复杂推理、架构设计 |
| coder | sonnet | 代码生成、实现 |
| formatter | haiku | 格式化、简单转换 |
| verifier | haiku | 确定性验证 |
| queen | sonnet | 协调、决策 |

**功能需求：**

- **复杂度评估** — 基于 token 量、操作类型、依赖深度评估任务复杂度
- **动态路由** — 根据复杂度 + Agent 类型选择模型
- **回退机制** — 模型过载时自动降级到下一 Tier

**技术文件：**

```
src/modules/collaboration-runtime/bridge/model-router.ts
```

**验收标准：**

- [ ] 低复杂度任务路由到 Haiku（成本 < $0.001）
- [ ] 复杂任务路由到 Sonnet/Opus
- [ ] Agent Booster 处理简单转换（成本 $0）
- [ ] 模型过载时自动降级

---

#### Story 9.23: 共识投票机制（BFT/Raft/Quorum）

**估计工时:** 2-3 天
**优先级:** Low
**依赖:** 9.15, 9.19

**职责：** 在 §4.3 冲突消解中增加共识投票策略——对于关键协作场景（如本体结构变更、技能部署），引入多 Agent 投票共识替代 `supervisor_decision` 单点决策。

**三种共识策略：**

| 策略 | 容错 | 适用场景 |
|------|------|---------|
| `byzantine` (BFT) | 容忍 f < n/3 恶意 Agent | 关键决策、安全敏感 |
| `raft` | 容忍 f < n/2 故障 | 一般协作、高可用 |
| `quorum` | 可配置法定人数 | 灵活场景 |

**功能需求：**

- **提案/投票协议** — Agent 提交提案 → 其他 Agent 投票 → 多数/法定通过
- **拜占庭检测** — 跨提案检测不一致投票，标记潜在恶意 Agent
- **共识结果持久化** — 写入事件日志，可搜索历史
- **`consensus_vote` 冲突消解策略** — 当 Agent 数量 ≥ 3 且目标冲突时触发
- **防重复投票** — 同一 Agent 同一提案不可重复投票

**技术文件：**

```
src/modules/collaboration-runtime/protocol/consensus.ts
```

**验收标准：**

- [ ] BFT 模式下 n=4 可容忍 1 个恶意 Agent
- [ ] Raft 模式下 n=3 可容忍 1 个故障 Agent
- [ ] Quorum 模式可配置通过比例
- [ ] 拜占庭检测标记异常投票行为
- [ ] 共识结果持久化并可查询

---

#### Story 9.24: PID 孤儿会话回收

**估计工时:** 1-2 天
**优先级:** Medium
**依赖:** 9.2, 9.11

**职责：** 借鉴 Ruflo #1799 方案——协作会话启动时记录 host 进程 PID，后续加载时检测孤儿会话并清理。

**回收策略：**

- **PID-based** — `process.kill(pid, 0)` 检测：ESRCH → 进程已死，标记 orphan；EPERM → 存活但属其他用户，不回收
- **TTL fallback** — 无 PID 的旧条目，`updatedAt` 超过 24h 则回收

**功能需求：**

- **PID 记录** — 创建协作会话时记录 `hostPid`
- **孤儿检测** — 每次 `loadCollaborationStore()` 时检查 running 会话的 PID 存活
- **自动标记** — 孤儿会话标记为 `terminated` 并记录原因
- **持久化** — 检测结果写回状态文件

**会话状态扩展：**

```typescript
interface CollaborationSession {
  // ... 现有字段 ...
  hostPid?: number;         // 创建会话的进程 PID
  terminationReason?: string; // 孤儿回收原因
}
```

**技术文件：**

```
src/modules/collaboration-runtime/session/orphan-reconciler.ts
```

**验收标准：**

- [ ] 进程退出后，下次加载时检测到孤儿会话
- [ ] 孤儿会话标记为 terminated 并记录原因
- [ ] 存活进程（EPERM）的会话不被回收
- [ ] 24h TTL 兜底回收无 PID 的旧条目

---

#### Story 9.25: DAG 执行链路修复（路径/上下文/工具注入）

**状态:** ✅ Complete
**估计工时:** 1 天
**优先级:** Critical
**依赖:** 9.6, 9.8

**职责：** 修复多 Agent DAG 执行中的三个关键缺陷——工作目录路径错误、下游 Agent 缺少上游产出上下文、工具注入不完整。

**根因分析：**

| 缺陷 | 根因 | 影响 |
|------|------|------|
| workingDirectory 路径错误 | `multi-agent-executor.ts` 设置路径为 `data/projects/{id}/data/agents/{agentId}/`，多了一层 `data/` | `loadWorkspaceFiles()` 读不到 Agent.md/Tool.md → `allowedTools` 为空 → 工具调用失败 |
| 下游 Agent 缺少上游产出 | `proc.prompt()` 只传 `globalGoal`，没有上游 Agent 的完成结果 | DAG 顺序执行正确但 Agent 内容不连贯，下游不知道上游做了什么 |
| 工具注入 scope 过滤 | `getAgentToolsForScope(agentType)` 按 scope 过滤工具 | 部分 agent 类型缺少文件、bash 等基础工具 |

**修复方案：**

1. **workingDirectory 路径修正** — 改为 `data/projects/{id}/agents/{agentId}/`（去掉多余 `data/` 段），确保配置文件加载路径正确
2. **上游产出注入 prompt** — 新增 `buildAgentPrompt(agentId, globalGoal)` 函数：
   - 注入 Agent 自身职责（从 agents.json 解析 `responsibility` 字段）
   - 根据拓扑 trigger 依赖关系，查找所有上游已完成 Agent 的产出
   - 将上游产出以 `【上游 Agent 产出】` section 追加到 prompt
3. **Agent 输出捕获** — 每个 Agent 执行后从本地事件缓存中提取 `ASSISTANT_MESSAGE` / `AGENT_COMPLETE_TASK`，存入 `Map<agentId, output>` 供下游使用
4. **工具注入改为完整集合** — `getAgentTools()` 替代 `getAgentToolsForScope()`，不做 scope 过滤

**技术文件：**

```
src/lib/collaboration-runtime-bridge/multi-agent-executor.ts    # 修复：路径 + prompt 构建 + 输出捕获
src/modules/collaboration-runtime/sandbox/agent-worker.mts      # 修复：getAgentTools() 完整工具注入
```

**验收标准：**

- [ ] workingDirectory 下存在 Agent.md / Tool.md 等配置文件
- [ ] 下游 Agent 的 prompt 中包含上游 Agent 的产出内容
- [ ] 所有 Agent 获得完整的底层工具集（file tools, bash tools, ontology tools）
- [ ] `Tool read_file not found` 错误不再出现
- [ ] DAG 执行顺序与拓扑一致

```
Phase 1:
9.1 (类型) ───────┐
9.2 (事件存储) ◄──┤
9.3 (黑板)   ◄────┤
9.4 (DI配置)      │
                  │
9.5 (注册表) ──► 9.7 (拓扑) ──► 9.8 (DAG) ──► 9.12 (UI)
                  │                     ▲
9.6 (PI桥接) ─────┘                     │
9.9 (ACL)  ─────────────────────────────┘
9.10 (沙箱) ──► 9.6
9.11 (API)  ──► 依赖 9.1~9.4, 9.8

Phase 2:
9.8 ──► 9.13 (Supervisor) ──► 9.16 (能力匹配)
9.9 ──► 9.14 (招标/订阅)
9.3 ──► 9.15 (冲突检测)
9.12 ──► 9.17 (UI 拓扑/黑板)

Phase 3 (Ruflo 借鉴):
9.8, 9.13, 9.3 ──► 9.19 (Queen-Led 协调)
9.3              ──► 9.20 (HNSW 语义索引)
9.6, 9.10        ──► 9.21 (Agent Pool 预热)
9.6              ──► 9.22 (三层模型路由)
9.15, 9.19       ──► 9.23 (共识投票)
9.2, 9.11        ──► 9.24 (PID 孤儿回收)
9.6, 9.8         ──► 9.25 (DAG 执行链路修复)
9.13, 9.6, 9.3   ──► 9.28 (Swarm/Supervisor 生产接线)
```

---

#### Story 9.28: Swarm/Supervisor 模式生产接线

**状态:** 📋 Planning
**估计工时:** 3–4 天
**优先级:** High
**依赖:** 9.13, 9.27, 9.6, 9.8

**职责：** 将已实现但未接线的 SupervisorMode、ContractNetProtocol、CapabilityMatcher 接入生产执行路径，为复杂拓扑提供动态任务分解与完成判定能力。新增 `executionMode` 配置支持 DAG / Supervisor 双模式运行。

**核心问题：** 当前所有 Swarm 组件（SupervisorMode 503 行、ContractNetProtocol 300 行、CapabilityMatcher、AclProtocol）均有代码和测试，但 0 生产引用。含回边的拓扑（如 3 个并行 reviewer）在 DAG 路径下因 `extractEdges` 降级回边为 `notify` 而丢失 barrier/gather 语义。

**实施要点：**
1. 新建 `TaskOrchestrator` 桥接 SupervisorMode ↔ AgentSpawner
2. 从 agents.json 推断静态 DecompositionPlan（跳过 LLM 分解）
3. ContractNet 简化为 Blackboard 消息载体 + 唯一匹配自动 accept
4. 新增 `executeSupervisorDag()` 作为 DAG 替代路径
5. 会话配置 `executionMode: "workflow" | "system"` 模式分发
6. 模式路由器自动识别含回边拓扑切换 Supervisor

**技术文件：**
```
src/modules/collaboration-runtime/engine/task-orchestrator.ts    # NEW: Supervisor ↔ Spawner 桥接
src/modules/collaboration-runtime/engine/mode-router.ts          # NEW: 模式选择路由
src/lib/collaboration-runtime-bridge/multi-agent-executor.ts     # MODIFY: 新增 executeSupervisorDag + 模式分发
src/modules/collaboration-runtime/engine/supervisor.ts           # MODIFY: decompose() 静态映射
src/modules/collaboration-runtime/session/blackboard.ts          # MODIFY: ContractNet 消息载体
src/app/api/collaboration/sessions/[id]/execute/route.ts         # MODIFY: 接受 executionMode
```

**验收标准：**
- [ ] `executeSupervisorDag()` 可执行 7-agent 完整拓扑（含 3 并行 reviewer）
- [ ] Supervisor 路径下 report-generator 在所有 reviewer 完成后才触发
- [ ] 模式自动路由识别含回边拓扑
- [ ] tsc / lint 全绿，≥3 个新测试用例

**详细规格：** [story-9.28/README.md](story-9.28/README.md)

---

## 🚨 关键约束与决策

### 进程隔离约束

| 决策 | 内容 |
|------|------|
| **LLM 调用位置** | Agent 子进程中执行，不在 Next.js 或 Runtime 中 |
| **Prompt 构建** | 子进程 bootstrap 阶段自行读取 Agent.md 等文件构建 |
| **Agent loop** | `@originos/pi-agent-adapter` 封装的 Pi Runtime 在子进程中运行 |
| **CognitiveManager** | 在子进程中运行，hooks 不变 |
| **Session 持久化** | 子进程无法直连 → 通过 stdio 发事件 → Runtime 中转 |

### AGENTS.md 豁免

| 约束 | 豁免内容 |
|------|---------|
| 业务逻辑在 `src/lib/` | 使用 `src/modules/collaboration-runtime/` |
| UI 在 `src/components/` | 使用 `src/modules/collaboration-runtime/ui/` |
| MVP 禁止数据库 | Phase 1 用文件系统 JSONL，Phase 3 可评估 PostgreSQL |

### 技术决策

| 决策 | 内容 |
|------|------|
| 沙箱 | `@anthropic-ai/sandbox-runtime`（v0.0.51） |
| 事件存储 | 文件系统 JSONL（Phase 1），可升级 PostgreSQL（Phase 3） |
| 通信 | HTTP + SSE（Web↔Runtime），stdio（Runtime↔Agent 子进程） |
| 依赖注入 | `CollaborationRuntimeDeps` 接口，模块内部不 import 外部模块 |
| 状态管理 | Zustand（前端 UI），事件溯源（后端状态） |

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-12 | Epic 9 初始化 — 基于 multi-agent-runtime.md 设计 | AI |
| 2026-05-13 | **全部 18 Stories 实现完成** — 代码已交付，180 个测试通过，零 TS 编译错误 | AI |
| 2026-05-19 | **修复 DAG 执行关键缺陷** — workingDirectory 路径修复 + 上游产出传递 + 完整工具注入 | AI |
| 2026-05-21 | **新增 Story 9.29** — Supervisor 模式协调能力修复（基于 proj-1778321075425-gmv0zt4h8 实证审查，9 项 SUP-XX 缺陷）| AI |
| 2026-05-21 | **新增 Story 9.30** — Supervisor Agent 化（Supervisor as Real Agent，承接 9.29 SUP-04 治本方案，铺垫 9.19 Queen-Led） | AI |
| 2026-05-22 | **PRD + 5 Story 重分拆** — 新增 [PRD-collaboration-product.md](./PRD-collaboration-product.md) 单前台 Agent 强约束；新增 9.31–9.35（单前台契约 / 结构化阻塞 / HITL 决策器 / 用户回复路由 / Workflow 兜底）；9.30 PR-B 转移；9.29 SUP-01 验收同步 | AI |

---

## 📚 相关文档

- [Multi-Agent Runtime 架构设计](../../design/multi-agent-runtime.md) — 完整技术设计
- [进程隔离设计](../../design/process-isolation.md) — Next.js 与 PI Agent 分离
- [AGENTS.md 架构规约](../../AGENTS.md) — 项目约束
- [Solution Design Skill](../../skills/solution-design/SKILL.md) — Agent 拆分依据
- [MAST 失败模式](../../learn/ai-engineering-from-scratch/phases/16-multi-agent-and-swarms/) — 多 Agent 失败模式参考
