# Multi-Agent Collaboration Runtime — 架构设计

> **v2.0 强约束（2026-05-22）：单前台 Agent 模型** — 协作会话期间用户**只与 Supervisor 对话**，Worker 不直接面对用户。详见 [PRD-collaboration-product.md](../specs/epic-9/PRD-collaboration-product.md) 和 [supervisor-agent.md §0](./supervisor-agent.md)。本文档下文凡涉及 HITL / 用户提问的章节，均以此约束为准。

## 1. 概述

### 1.1 核心定位

本模块不是单 Agent 的简单运行时，而是**多 Agent 协作运行时**——为多个 Agent 提供协同工作的基础设施，使它们能够：

- 共享上下文与知识，而非各自为战
- 按照预定义的协作拓扑（trigger/notify/depend）有序交互
- 动态发现与路由，根据任务需求选择合适的协作 Agent
- 处理冲突与竞争，保证协作过程的一致性
- 跨 Agent 的长时状态同步与事件协调

### 1.2 为什么需要独立的协作运行时

当前项目中每个 Agent 是独立定义的（由 `skills/agent-creator` / `skills/role-agent-creator` 生成），拥有各自的 `Agent.md`、`Tool.md`、`Memory.md` 等。Solution Design 阶段产出了 Agent 协作拓扑（`solutions/solution-{version}.json`）。但**缺少一个运行时来实际驱动这些 Agent 协同工作**。

现有 PI Agent 基座驱动的是单 Agent 对话，无法处理：
- Agent A 的输出如何作为 Agent B 的输入
- 多个 Agent 并行执行时的同步
- Agent 间的消息路由与格式转换
- 协作过程中的冲突检测与消解
- 全局目标的达成判定

### 1.3 设计原则

1. **协作为一等公民**：Agent 间的交互模式、消息协议、协调机制是核心，不是附加功能
2. **拓扑驱动执行**：Solution Manifest 中的协作关系定义执行流
3. **共享上下文**：Agent 通过公共黑板（Blackboard）共享状态，而非点对点硬编码
4. **可组合**：协作模式（Supervisor-Worker / Relay / Blackboard）可自由组合
5. **可观测**：每一步协作都可追踪、可回放、可调试
6. **统一运行时，多模式调度**：一个运行时支持 Workflow（轻量 DAG）和 System（重量协作）两种执行模式，根据协作拓扑自动判定

### 1.4 两种执行模式

#### 术语表

| 术语 | 当前统一含义 |
|------|-------------|
| Workflow mode | 等价于 DAG mode，亦即“模式 A” |
| System mode | 含 `notify` / `depend` 协作边的系统协作模式 |
| Supervisor | 当前实现中的 Phase 1/2 协调原型，能力边界低于 Queen-Led |
| Queen-Led | Phase 3 目标协调机制，语义上是 `Supervisor ≼ Queen-Led` |

本模块统一支持 Agentic Workflow 和 Agentic System 两种模式的运行时需求。

#### 模式判定逻辑

Solution Manifest 中的 Agent 协作关系决定了运行时模式：

| 判定条件 | Workflow 模式 | System 模式 |
|---------|-------------|------------|
| 协作类型 | 全是 `trigger`（单向触发） | 存在 `notify`（广播）或 `depend`（双向依赖） |
| 执行顺序 | 固定 DAG，A → B → C | 依赖满足即可并行，顺序不固定 |
| 上下文传递 | Handoff（A 输出摘要 → B 输入） | 共享黑板（Blackboard），任意读写 |

#### 能力对比

| 维度 | Workflow 模式（轻量） | System 模式（重量） |
|------|---------------------|-------------------|
| 共享黑板 | 不需要 | 需要（Blackboard + Event Sourcing） |
| ACL 协议 | 不需要 | 需要（消息路由 + performative） |
| 事件溯源 | 不需要 | 需要（JSONL 事件流） |
| 冲突检测 | 不需要（严格串行） | 需要（多 Agent 竞争写入） |
| 并行执行 | 不需要 | 需要（DAG 依赖排序 + 并发） |
| 全局目标判定 | 不需要（流程完成即终止） | 需要（所有子任务完成 / 目标达成） |
| 沙箱配置 | 统一配置 | 每个 Agent 独立配置（allow-write/deny-read 等） |

#### Agent 拆分依据（solution-design skill 使用）

**必须拆分**（满足任一条件）：

- **上下文上限** — 该业务域的操作需要 >100k token 的工作数据，单 Agent 上下文窗口装不下
- **专业 prompt 需求** — 不同步骤需要截然不同的 system prompt，合并会导致角色混乱
- **需要并行** — 两个业务步骤可以独立执行，串行会显著增加延迟
- **业务域自然边界** — 业务对象/流程之间存在明确的边界，不同领域由不同角色负责

**保持单 Agent**（满足所有条件）：

- 整个流程 <100k token 工作数据
- 步骤之间是简单的数据传递，不需要不同的专业 prompt
- 顺序执行已经足够快
- 任务简单，拆分带来的协调开销超过价值

> 经验法则：如果一个任务 <20 次工具调用且 <100k token，保持单 Agent。

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App (originos)                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         src/modules/collaboration-runtime/           │   │
│  │         (业务功能层)                                  │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │         Execution Mode Selector                  │ │   │
│  │  │  Workflow 模式 (DAG) │ System 模式 (协作)        │ │   │
│  │  └──────────────────────┬──────────────────────────┘ │   │
│  │                         │                             │   │
│  │     ┌───────────────────┼───────────────────┐        │   │
│  │     ▼                   ▼                   ▼        │   │
│  │ ┌────────┐       ┌────────────┐       ┌──────────┐   │   │
│  │ │Session │       │Collabora-  │       │ Sandbox  │   │   │
│  │ │ Layer  │       │tion Engine │       │  Layer   │   │   │
│  │ │共享黑板 │◄─────►│多Agent编排  │──────►│安全执行   │   │   │
│  │ │事件溯源 │       │拓扑驱动    │       │资源隔离   │   │   │
│  │ └────────┘       └────────────┘       └──────────┘   │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────┐     │   │
│  │  │         Collaboration Protocol Layer         │     │   │
│  │  │  • Message Format (ACL)  [System 模式]       │     │   │
│  │  │  • Conversation Management                  │     │   │
│  │  │  • Shared Blackboard      [System 模式]      │     │   │
│  │  │  • Conflict Resolution    [System 模式]      │     │   │
│  │  │  • Handoff Context        [Workflow 模式]    │     │   │
│  │  └─────────────────────────────────────────────┘     │   │
│  └────────────────────┬──────────────────────────────────┘   │
│                       │                                       │
│                       │ 依赖注入                               │
│                       ▼                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   src/lib/integrations/ (松耦合集成层)                 │   │
│  │                                                       │   │
│  │  • Agent Registry  (加载 Agent.md / Role.md / Tool.md) │   │
│  │  • PI Agent Bridge (注入: LLM 调用 + 工具执行)          │   │
│  │  • Solution Manifest Consumer (消费协作拓扑 + 模式判定) │   │
│  │  • Ontology Data Store (共享数据层)                    │   │
│  │  • FileOps / EventEmitter (适配层)                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.0 模块层与集成层的关系

**Integration 层** (`src/lib/integrations/`) 是 originos 的**松耦合适配层**，负责将外部基础设施适配为接口供业务模块使用。

**collaboration-runtime 模块** (`src/modules/collaboration-runtime/`) 是**业务功能层**，不包含任何对外部基础设施的直接 import。

两者的关系：

```
collaboration-runtime (模块层)
       │
       │  依赖注入
       │  CollaborationRuntimeDeps {
       │    agentEngine,
       │    toolExecutor,
       │    ontologyStore,
       │    fileOps,
       │    eventEmitter,
       │  }
       ▼
Integration 层 (适配层)
       │
       │  实际实现
       ▼
src/lib/integrations/pi-agent/
src/lib/integrations/ontology/
src/app/  (Next.js routes)
```

**集成方式**：
- API routes (`src/app/api/collaboration/`) 负责从 Integration 层组装 `CollaborationRuntimeDeps`，通过构造函数注入到模块
- 模块内部禁止 import `src/lib/` 或 `src/components/` 下的任何模块
- Integration 层的接口变化不会影响模块内部逻辑（依赖倒置原则）

### 2.0.1 目录位置（AGENTS.md 豁免）

**⚠️ 豁免声明**：本模块使用 `src/modules/collaboration-runtime/`，豁免 AGENTS.md "业务逻辑在 `src/lib/`" 约束。豁免原因：模块化隔离需要独立目录边界。

### 2.1 进程隔离架构

**现状问题**：当前 PI Agent 运行在 Next.js 进程内，导致三个硬问题：

```
┌─────────────────────────────────────────┐
│  Next.js 进程（现状）                     │
│                                          │
│  Next.js API routes ──────────────┐     │
│  PersistentAgentManager (单例) ───┤ 同进程
│  PersistentAgent × N ─────────────┤      │
│  @mariozechner/agent ─────────────┘      │
│                                          │
│  问题:                                   │
│  • LLM 调用阻塞事件循环                   │
│  • 多窗体 → 多 session 并发排队           │
│  • Agent 崩溃 = Next.js 崩溃             │
│  • 无法对单个 Agent 做资源限制            │
└─────────────────────────────────────────┘
```

**目标架构**：三层进程隔离。

```
┌──────────────────┐     HTTP/SSE      ┌──────────────────────┐
│  Next.js         │◄────────────────►│  Agent Runtime       │
│  (Web 层)        │                   │  (独立 Node 进程)     │
│                  │                   │                      │
│  src/app/        │                   │  collaboration-runtime │
│  src/components/ │                   │  ├── Engine           │
│  (UI + 路由)      │                   │  ├── Blackboard       │
│                  │                   │  └── Session Manager   │
└──────────────────┘                   │                      │
                                       │  ┌────────────────┐  │
                                       │  │ Agent Process 1 │  │
                                       │  │ (sandbox-exec)  │  │
                                       │  │ @mariozechner/  │  │
                                       │  │ agent           │  │
                                       │  └────────────────┘  │
                                       │  ┌────────────────┐  │
                                       │  │ Agent Process 2 │  │
                                       │  │ (sandbox-exec)  │  │
                                       │  └────────────────┘  │
                                       └──────────────────────┘
```

**职责划分**：

| 层 | 进程 | 职责 | 当前代码对应 |
|----|------|------|-------------|
| **Web 层** | Next.js | UI 渲染、SSE 推送、路由控制、API routes | `src/app/`, `src/components/` |
| **Runtime 层** | 独立 Node 进程 | 多 Agent 编排、黑板、事件流、拓扑驱动 | `src/modules/collaboration-runtime/` |
| **Agent 层** | 子进程（每个 Agent 一个） | LLM 调用、工具执行、对话管理 | `src/lib/integrations/pi-agent/` → 迁移为子进程 |

**通信机制**：

| 路径 | 协议 | 说明 |
|------|------|------|
| Next.js ↔ Agent Runtime | HTTP + SSE | Next.js 发送用户消息，Runtime 通过 SSE 推送事件流 |
| Agent Runtime ↔ Agent 子进程 | stdio + `@anthropic-ai/sandbox-runtime` | Runtime 通过 sandbox 启动/停止 Agent，传入命令和配置 |
| Agent ↔ LLM | SDK 直连 | Agent 子进程直接调用 `@mariozechner/pi-ai` |

**优势**：

- LLM 调用（秒到分钟级）不阻塞 Next.js 事件循环
- 单个 Agent 崩溃不影响 Next.js 或其他 Agent
- 通过 sandbox 可对每个 Agent 子进程做独立资源限制（内存、超时、网络）
- Agent Runtime 可独立水平扩展（多实例 + 消息队列）

### 2.1.1 PI Agent 组件与三层架构映射

当前 PI Agent 技术栈中每个组件在三层隔离架构中的归属。

#### 现状调用链路

```
src/app/api/chat/route.ts
  → persistentAgentManager.startAgent(projectId)
    → new PersistentAgent({ ... })
      → agent.initialize()
        → createOriginOSAgent(config)
          → new OriginOSAgent(config)
            → new Agent({ ... })        // @mariozechner/agent
              → agent.prompt(message)    // LLM 调用
```

全部在同一个 Next.js event loop 中。

#### 目标：三层归属

| PI Agent 组件 | 当前所在 | 目标归属 | 迁移方式 |
|-------------|---------|---------|---------|
| **`Agent.md` / `Tool.md` / `Skill.md`** | Next.js 进程 | **Agent 子进程** | 文件路径通过 stdio 传入，子进程自己读取 |
| **`loadWorkspaceFiles()`** | Next.js 进程 | **Agent 子进程** | 同上 |
| **`parseAgentDefinition()` / `parseToolDefinition()` / `parseSkillDefinition()`** | Next.js 进程 | **Agent 子进程** | 移到子进程 bootstrap 流程 |
| **`buildProjectPromptLayers()` / `assembleProjectPrompt()`** | Next.js 进程 | **Agent 子进程** | 7 层 prompt 构建在子进程中完成 |
| **`CognitiveManager` / `PracticeLogger` / `KnowledgeProvider` / `PatternProvider`** | Next.js 进程 | **Agent 子进程** | 认知系统属于 Agent 内部能力 |
| **`KnowledgeIngest.ingestBusinessModel()`** | Next.js 进程 | **Agent 子进程** | 知识摄入是 Agent 初始化的一部分 |
| **`PersistentAgent`** | Next.js 进程 | **Agent 子进程** | 作为子进程核心包装类保留 |
| **`OriginOSAgent`** | Next.js 进程 | **Agent 子进程** | 包装 `@mariozechner/agent`，保留在子进程 |
| **`createOriginOSAgent()`** | Next.js 进程 | **Agent 子进程** | 工厂函数随 OriginOSAgent 迁移 |
| **`Agent`（`@mariozechner/agent`）** | Next.js 进程 | **Agent 子进程** | 底层 SDK，不改变 |
| **`streamSimple()` / `getModel()`（`@mariozechner/pi-ai`）** | Next.js 进程 | **Agent 子进程** | LLM SDK 调用在子进程执行 |
| **`HealthMonitor`** | Next.js 进程 | **Agent 子进程** | 子进程自监控 |
| **`setToolContext()` / `getToolContextManager()`** | Next.js 进程 | **Agent 子进程** | 工具上下文属于 Agent 执行环境 |
| **`getAgentTools()` / `initializeBuiltInTools()`** | Next.js 进程 | **Agent 子进程** | 工具注册在子进程中完成 |
| **模型配置逻辑（`server-config.ts`）** | Next.js 进程 | **Agent 子进程** | 模型配置传入子进程 |
| **类型定义**（`OriginOSAgentConfig` / `ToolRegistration` / `SessionData`） | `src/lib/` | **共享** | 提取为公共类型，Runtime 和 Agent 子进程共用 |
| **`agentSessionService`** | Next.js 进程 | **Runtime 层** | Session 管理上移到 Runtime |
| **`PersistentAgentManager`（单例）** | Next.js 进程 | **Runtime 层** | 从"本地单例"转为 Runtime 的 Agent 生命周期调度器 |
| **`PersistentAgentManager.getAllAgentStatus()`** | Next.js 进程 | **Runtime 层** | Runtime 提供 Agent 状态查询 API |
| **`PersistentAgentManager.reloadAgent()`** | Next.js 进程 | **Runtime 层** | Runtime 负责 Agent 热重载 |
| **API routes（`/api/chat` 等）** | Next.js 进程 | **Web 层** | 不变，保留在 Next.js |
| **UI 组件** | Next.js 进程 | **Web 层** | 不变 |

#### 迁移后的调用链

```
Web 层 (Next.js)
  POST /api/chat → fetch(`${AGENT_RUNTIME_URL}/sessions/{id}/message`)
                       ↓
Runtime 层 (独立 Node 进程)
  CollaborationEngine.handleMessage(sessionId, message)
    ├── 从黑板获取上下文
    ├── spawnAgentProcess(agentId, config)           // 通过 sandbox 启动子进程
    │   ↓
Agent 子进程 (sandbox)
    ├── bootstrap: 读取 Agent.md/Tool.md/Skill.md
    ├── buildProjectPrompt()
    ├── init CognitiveManager
    ├── new PersistentAgent()
    ├── new OriginOSAgent()
    ├── new Agent()
    └── agent.prompt(message) → LLM call
        ↓ (stdio 输出事件流)
Runtime 层
    ├── 接收 stdio 事件 → 转为 RuntimeEvent
    ├── 写入黑板 / 事件日志
    ├── SSE 推送给 Web 层
    └── 判定是否需要触发下游 Agent
```

#### 组件迁移优先级

| 优先级 | 组件组 | 原因 |
|--------|-------|------|
| P0 | `@mariozechner/agent` + `@mariozechner/pi-ai` + LLM 调用 | 阻塞事件循环的根源 |
| P0 | `PersistentAgent` + `OriginOSAgent` | Agent 核心包装类 |
| P1 | `CognitiveManager` + Providers | 随 Agent 迁移 |
| P1 | 文件加载 + prompt 构建 | 随 Agent 迁移 |
| P2 | `PersistentAgentManager` → Agent 生命周期调度 | 转为 Runtime 功能 |
| P2 | `agentSessionService` → Session Service | 转为 Runtime 功能 |
| P3 | `HealthMonitor` | 子进程自监控 |

### 2.2 与单 Agent 运行的本质区别

| 维度 | 单 Agent 运行（现状） | Workflow 模式 | System 模式 |
|------|---------------------|-------------|------------|
| Agent 数量 | 1 | N（≥2） | N（≥2） |
| 运行位置 | Next.js 进程内 | 独立子进程 | 独立子进程 |
| 状态管理 | 单 session 对话历史 | Handoff 传递上下文摘要 | 多 Agent 共享黑板 + 各自记忆 |
| 执行流 | 线性：用户→Agent→用户 | 固定 DAG：A→B→C→输出 | 网状：Agent↔Agent↔用户 |
| 路由 | 固定 prompt 链 | 拓扑排序，按序执行 | 基于协作拓扑的动态路由 + 并行 |
| 通信 | 无 | Handoff（输出→输入） | 结构化消息协议（ACL） |
| 冲突 | 无 | 无（严格串行） | 需要冲突检测与消解 |
| 终止条件 | 单次任务完成 | 流程完成 | 全局目标达成 or 所有子任务完成 |
| 可观测 | 单条对话流 | 固定流程 DAG | 多 Agent 交互时序图 |

### 2.3 数据存储

协作运行时的数据存储**不属于模块本身**，而是通过依赖注入的 `fileOps` 接口访问调用方指定的项目目录。数据存储遵循项目的目录规约，存放在对应项目目录下：

```
data/projects/{projectId}/
├── collaboration-sessions/          # 该项目的协作会话数据
│   └── {sessionId}/
│       ├── events.jsonl             # 事件日志
│       ├── blackboard.json          # 黑板快照
│       └── artifacts/               # 产出工件
├── agents/                          # Agent 定义（已有）
├── skills/                          # Skill 定义（已有）
└── solutions/                       # Solution Manifest（已有）
```

模块内部不硬编码任何存储路径，路径由调用方通过注入的 `fileOps` 接口和配置参数提供。

所有 JSON 文件必须符合 AGENTS.md 的 DataFile 格式约束：
```typescript
{ version: string; createdAt: string; updatedAt: string; data: unknown; }
```

### 2.4 技术栈合规（AGENTS.md 强制约束）

| 设计决策 | AGENTS.md 约束 | 合规方案 |
|---------|---------------|---------|
| 数据库 | MVP 禁止数据库 | 使用文件系统 JSONL + JSON，不引入 PostgreSQL |
| 框架 | Next.js App Router | API routes 使用 App Router |
| UI | React 函数式 + Tailwind + shadcn/ui | 所有 UI 组件遵守 |
| 状态管理 | Zustand | 运行时状态使用 Zustand store |
| TypeScript | 严格模式，禁止 any | 所有类型定义必须具体类型 |
| 沙箱 | 未定义 | 使用 `@anthropic-ai/sandbox-runtime` 包（v0.0.51）作为沙箱执行器 |

**沙箱技术选型调整**：使用 `@anthropic-ai/sandbox-runtime` 作为安全执行器。该包是 Anthropic 开源的 OS 级沙箱运行时（Apache-2.0），已被 Claude Code 用于生产环境：
- macOS: `sandbox-exec` + Seatbelt profile 动态生成
- Linux: `bubblewrap` + seccomp BPF + network namespace
- 网络隔离: HTTP + SOCKS5 代理 + 域名白/黑名单
- 文件系统: allow-write（默认拒绝）+ 读写路径模式匹配
- 超时控制: 原生 `AbortSignal` 支持
- 越权审计: `SandboxViolationStore` 追踪所有违规事件

源码位于 `learn/sandbox-runtime/`，npm 包 `@anthropic-ai/sandbox-runtime`。

## 3. Session 层 — 共享黑板 + 事件溯源

### 3.1 核心概念：共享黑板（Blackboard）

多 Agent 协作的核心是**共享上下文**。Session 层不仅记录事件，更是所有 Agent 可读写的"黑板"：

```
┌─────────────────────────────────────────────┐
│              Blackboard (Session)             │
│                                             │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │   Global State   │  │  Message Board   │ │
│  │  (全局共享数据)   │  │  (Agent 间消息)   │ │
│  └──────────────────┘  └──────────────────┘ │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Task Queue      │  │  Artifact Store  │ │
│  │  (待处理子任务)    │  │  (产出的工件)     │ │
│  └──────────────────┘  └──────────────────┘ │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Event Log       │  │  Consensus State │ │
│  │  (完整事件历史)    │  │  (一致性状态)     │ │
│  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────┘
         ▲           ▲            ▲
    Agent A 读/写  Agent B 读/写  Agent C 读/写
```

### 3.2 事件模型

协作运行时需要更丰富的事件类型：

```typescript
interface RuntimeEvent {
  id: string;
  sessionId: string;
  seq: number;
  type: EventType;
  payload: Record<string, unknown>;
  source: string;          // Agent ID or 'user' or 'system'
  target?: string;         // 目标 Agent ID（定向消息）
  broadcast?: boolean;     // 是否广播
  correlationId?: string;  // 关联同一协作对话的多个事件
  timestamp: string;
}

type EventType =
  // === 生命周期 ===
  | 'SESSION_CREATED'        // 协作会话创建
  | 'SESSION_COMPLETE'       // 全局目标达成
  | 'SESSION_ABORTED'        // 会话终止
  | 'CHECKPOINT'             // 状态快照

  // === 用户交互 ===
  | 'USER_INPUT'             // 用户发起任务
  | 'USER_RESPONSE'          // 用户回复 Agent 请求

  // === Agent 活动 ===
  | 'AGENT_REGISTERED'       // Agent 加入协作
  | 'AGENT_UNREGISTERED'     // Agent 离开
  | 'AGENT_THINKING'         // Agent 正在思考（LLM 调用开始）
  | 'AGENT_ACT'              // Agent 产出行动意图
  | 'AGENT_COMPLETE_TASK'    // Agent 完成分配的子任务
  | 'AGENT_FAIL_TASK'        // Agent 子任务失败

  // === Agent 间通信 ===
  | 'AGENT_MESSAGE'          // Agent A → Agent B 的消息
  | 'AGENT_BROADCAST'        // Agent → All 广播
  | 'AGENT_REQUEST'          // Agent A 向 Agent B 请求数据/能力
  | 'AGENT_RESPONSE'         // Agent B 回复 Agent A
  | 'AGENT_DELEGATE'         // Agent A 委托任务给 Agent B

  // === 协作协调 ===
  | 'TASK_CREATED'           // 创建子任务（进入任务队列）
  | 'TASK_ASSIGNED'          // 任务分配给某个 Agent
  | 'TASK_STARTED'           // Agent 开始处理任务
  | 'TASK_COMPLETED'         // 任务完成
  | 'TASK_FAILED'            // 任务失败
  | 'TASK_REASSIGNED'        // 任务重新分配

  // === 黑板操作 ===
  | 'BLACKBOARD_WRITE'       // 写入共享数据
  | 'BLACKBOARD_UPDATE'      // 更新共享数据
  | 'BLACKBOARD_LOCK'        // 锁定某个数据段
  | 'BLACKBOARD_RELEASE'     // 释放锁

  // === 冲突 ===
  | 'CONFLICT_DETECTED'      // 检测到冲突
  | 'CONFLICT_RESOLVED'      // 冲突已解决

  // === 沙箱执行 ===
  | 'TOOL_CALL'              // Agent 调用工具
  | 'TOOL_RESULT'            // 工具执行结果
  | 'TOOL_FAILURE';          // 工具执行失败
```

### 3.3 黑板数据结构

```typescript
interface Blackboard {
  sessionId: string;

  // 全局任务描述
  globalGoal: {
    description: string;
    constraints: string[];
    successCriteria: string[];
  };

  // 共享数据区 — Agent 可读写的公共数据
  sharedData: Record<string, unknown>;

  // 消息板 — Agent 间的定向消息
  messages: Array<{
    id: string;
    from: string;     // 发送方 Agent ID
    to: string;       // 接收方 Agent ID（* 表示广播）
    type: 'inform' | 'request' | 'propose' | 'accept' | 'reject' | 'cfp';
    content: unknown;
    seq: number;
    readBy: string[]; // 已读 Agent 列表
  }>;

  // 任务队列
  tasks: Array<{
    id: string;
    description: string;
    status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
    assignedTo?: string;
    dependsOn?: string[];     // 依赖的其他任务
    input?: unknown;          // 输入数据
    output?: unknown;         // 输出结果
    createdAt: string;
    completedAt?: string;
  }>;

  // 工件存储 — 协作过程中产出的文件/数据
  artifacts: Record<string, {
    name: string;
    producer: string;   // 产生的 Agent
    data: unknown;
    createdAt: string;
  }>;

  // 锁机制 — 防止并发写冲突
  locks: Record<string, {
    holder: string;     // 持有锁的 Agent
    expiresAt: string;
  }>;
}
```

### 3.4 事件存储

**MVP**：文件系统（JSONL），每个 session 一个目录：
```
data/projects/{projectId}/collaboration-sessions/{sessionId}/
├── events.jsonl          # 事件日志
├── blackboard.json       # 黑板当前状态
└── artifacts/            # 产出的工件文件
```

**生产**：如需要可切换为更高效的文件系统索引方案（保持无数据库）。在 AGENTS.md 解除"禁止数据库"约束后，可评估 PostgreSQL 作为生产存储选项。

### 3.5 黑板安全 — 防 Memory Poisoning

> 来源：ai-engineering-from-scratch Phase 16 · Lesson 13 (Shared Memory Blackboard)

多 Agent 共享黑板存在**记忆中毒**风险：一个 Agent 的幻觉写入黑板后，下游 Agent 将其当作事实采纳，导致精度逐步衰减且难以定位根因。这是 MAST 失败分类中最常见的结构性失败之一。

#### 3.5.1 Provenance — 每次写入必须记录来源

黑板 `sharedData` 的每次写入必须附带 provenance 元数据：

```typescript
interface BlackboardEntry {
  key: string;
  value: unknown;
  writer: string;          // 写入方 Agent ID
  timestamp: string;
  source_uri?: string;     // 引用的外部来源（如有）
  tool_calls_cited?: string[]; // 引用的工具调用 ID 列表
  version: number;         // 递增版本号
}
```

下游 Agent 读取时应带 skepticism — 根据 provenance 的可信度决定采信程度。

#### 3.5.2 Append-Only — 纠错是新条目而非原地覆盖

黑板日志必须是 **append-only** 的。当某个 Agent 需要纠正之前写入的内容时：
- 不修改已有条目
- 写入新条目，引用被纠正的条目 ID
- 保留完整审计轨迹

```
# 错误示例（禁止）：
sharedData["order.status"] = "completed"  // 原地覆盖

# 正确示例（必须）：
appendEntry({
  key: "order.status",
  value: "completed",
  supersedes: "entry-42",  // 引用之前的错误条目
  reason: "payment confirmed"
})
```

#### 3.5.3 Read-Only Verifier — 至少一个不可写的验证 Agent

黑板协调模式必须部署至少一个 **read-only verifier**：
- Verifier 能读取黑板（与所有 Agent 相同的视图）
- Verifier **不能写入黑板** — 只有独立的 verification channel
- Verifier 独立验证黑板条目的来源（如重新调用工具、交叉引用）
- Verifier 的输出路由到人类或独立的决策 Agent，**不回流到黑板**

如果不做此分离，被毒化的黑板会毒化 Verifier，Verifier 的输出又成为新条目，形成正反馈循环。

## 4. 协作协议层（新增）

这是多 Agent 协作运行时的**核心创新**——定义 Agent 间的标准化通信协议。

### 4.1 Agent 通信语言（ACL）

基于 FIPA ACL 的简化版本，适配本项目场景：

```typescript
interface ACLMessage {
  performative: Performative;  // 言语行为类型
  sender: string;              // 发送方 Agent ID
  receiver: string;            // 接收方 Agent ID（* 表示广播）
  ontology?: string;           // 使用的本体（领域上下文）
  content: unknown;            // 消息内容
  replyWith?: string;          // 用于匹配 request-response
  inReplyTo?: string;          // 回复哪条消息
  conversationId?: string;     // 会话标识
  protocol?: string;           // 交互协议
  replyBy?: string;            // 期望回复的截止时间
}

type Performative =
  | 'inform'      // 告知事实
  | 'request'     // 请求执行动作
  | 'query'       // 查询信息
  | 'propose'     // 提出建议
  | 'accept'      // 接受建议
  | 'reject'      // 拒绝建议
  | 'cfp'         // Call For Proposal（招标）
  | 'subscribe'   // 订阅事件
  | 'notify'      // 通知事件
  | 'failure'     // 执行失败通知
  | 'refuse'      // 拒绝执行
  | 'agree'       // 同意执行
  | 'delegate';   // 委托任务
```

### 4.2 协作协议（Interaction Protocols）

> **接线状态：** `ContractNetProtocol`、`SubscribeNotifyProtocol`、`AclProtocol` — **Not-wired（Phase 3 保留）**。三个协议已实现并通过单测；`notify` 边的最简事件分发（Story 9.27 ARCH-RT-07）已在 DagExecutor 接线，完整协议语义待 Phase 3 System 模式执行器接入。

预定义几种标准交互模式，Harness 根据 Solution Manifest 中的协作关系自动选择：

#### 协议 1：请求-响应（Request-Response）

用于 `trigger` 关系 — Agent A 触发 Agent B 执行：

```
Agent A                          Agent B
   │                                │
   │──── request(action) ──────────►│
   │                                │ 执行动作
   │◄──── inform(result) ───────────│
   │                                │
```

#### 协议 2：招标-投标（Contract Net）

用于动态任务分配 — Supervisor 向多个 Worker 招标：

```
Supervisor                    Worker A    Worker B    Worker C
   │                             │           │           │
   │──── cfp(task) ─────────────►│           │           │
   │──── cfp(task) ──────────────────────────►│           │
   │──── cfp(task) ─────────────────────────────────────►│
   │                             │           │           │
   │◄──── propose(bid) ─────────│           │           │
   │◄──── propose(bid) ─────────────────────►│           │
   │                             │           │           │
   │──── accept(bid=B) ─────────────────────►│           │
   │──── reject(bid≠B) ─────────│                       │
   │                             │           │           │
   │◄──── inform(result) ────────────────────│           │
   │                             │           │           │
```

#### 协议 3：订阅-通知（Subscribe-Notify）

用于 `notify` 关系 — Agent A 关注 Agent B 的事件：

```
Agent A                          Agent B
   │                                │
   │──── subscribe(event_type) ────►│
   │                                │ 事件发生
   │◄──── notify(event_data) ──────│
   │                                │ 事件发生
   │◄──── notify(event_data) ──────│
   │                                │
```

#### 协议 4：委托-确认（Delegate-Confirm）

用于 Agent 间的任务委派：

```
Agent A                          Agent B
   │                                │
   │──── delegate(task, deadline) ─►│
   │                                │ 评估
   │◄──── agree ────────────────────│  (或 refuse)
   │                                │ 执行
   │◄──── inform(result) ───────────│
   │                                │
```

### 4.2.1 Supervisor 模式强制 Verifier 角色

> **接线状态：** `SupervisorMode` — **Wired（Story 9.28 / 9.29）**。当前生产路径已存在静态拓扑驱动的 Supervisor 执行链路：`executeSupervisorDag()` 使用 manifest 中的 Agent/协作边构建静态子任务、执行 verifier 校验、支持 HITL resume 与 Blackboard artifact 引用。它仍不是 Story 9.19 所定义的完整 Queen-Led 动态分解协调器，后者将在现有链路上继续增强。

> 来源：ai-engineering-from-scratch Phase 16 · Lesson 08 (Role Specialization)

MAST 统计 21.3% 的失败来自 Verification Gap。PwC 报告加 verification loop 带来 7× 精度提升。

**约束：**
- Supervisor 分解任务时，**必须**至少指定一个 Agent 作为 **deterministic verifier**
- Verifier 的检查必须是**非 LLM 的**：代码测试运行、schema 验证、类型检查、单元测试
- 禁止 all-LLM 输出 — 每个 Agent 产出至少经过一个确定性检查
- **Communicative dehallucination**：Executor 缺少信息时必须向 Supervisor/Planner 提问，而非自行编造
- Critic（LLM 审查）和 Verifier（确定性检查）是两个独立角色，必须分别存在
- _revision loop budget_：Critic-Executor 修订循环最多 2 轮，超过则上报人类

### 4.3 协作冲突检测与消解

> **接线状态：** `ConflictDetector` — **Wired（Story 9.27 ARCH-RT-05）**。已在 `DagExecutor.runReadyNodes` 前调用；`CostController` 已在 spawn 前调用 `checkBudget`。`CapabilityMatcher`、`CircuitBreaker` 等进阶组件保留 Phase 3。

```typescript
interface ConflictDetector {
  // 检测冲突
  detect(blackboard: Blackboard, newEvent: RuntimeEvent): Conflict | null;
}

type Conflict =
  | {
      type: 'resource_conflict';   // 多个 Agent 争抢同一资源
      agents: string[];
      resource: string;
      resolution: 'first_come_first_serve' | 'priority_based' | 'negotiation';
    }
  | {
      type: 'data_conflict';       // 多个 Agent 同时写同一数据
      agents: string[];
      key: string;
      resolution: 'lock_based' | 'last_write_wins' | 'merge';
    }
  | {
      type: 'goal_conflict';       // Agent 目标不一致
      agents: string[];
      goals: string[];
      resolution: 'supervisor_decision' | 'negotiation' | 'voting';
    }
  | {
      type: 'deadlock';            // 循环依赖导致死锁
      agents: string[];
      cycle: string[];
      resolution: 'break_cycle' | 'timeout';
    };
```

**消解策略**：
- `first_come_first_serve`：先来的 Agent 优先
- `priority_based`：按 Agent 优先级（Solution Manifest 中定义）
- `negotiation`：启动协商协议，Agent 间协商
- `supervisor_decision`：由 Supervisor Agent 仲裁
- `timeout`：超时自动释放

### 4.3.1 Circuit Breaker — 重试风暴防护

> 来源：ai-engineering-from-scratch Phase 16 · Lesson 23 (Failure Modes — MAST)

MAST 统计 36.94% 的失败来自 Coordination Failures。经典场景：一个 Agent 失败后触发重试，重试引发下游连锁失败，负载在数秒内放大 10×。

**约束：**
- 每个 outbound 调用必须配置 Circuit Breaker — 当目标 Agent 错误率超过 5-10%，自动熔断
- 熔断后返回降级结果（缓存 / 默认值），而非重试
- 每个请求有 **capped retry budget** — 最多 3 次重试，指数退避
- Circuit Breaker 状态作为 `RuntimeEvent` 写入事件日志

### 4.3.2 Slow-Failure Proxy — 慢失败检测

立即失败（超时、schema 不匹配、auth 错误）容易检测。慢失败（记忆中毒、单模型崩溃、角色模糊）昂贵且难以定位。

**慢失败代理指标：**
- `agreement_rate` — 多 Agent 输出一致性比例，骤降时触发告警
- `retry_rate` — 重试频率异常升高
- `output_length_distribution` — 输出长度分布异常
- `edit_distance_between_versions` — 连续 Agent 版本间编辑距离异常

### 4.3.3 MAST 分类审计

每季度对协作运行时执行 MAST（Cemri et al., arXiv:2503.13657）分类审计：
1. 采集 ~1000 条真实执行 trace
2. 映射到 MAST + Groupthink 分类
3. 计算每类失败率
4. 排名消除率最高的 2-3 类
5. 实施对应缓解措施

## 5. 协作引擎（Collaboration Engine）

> ⚠️ **2026-05-20 接线状态声明（Story 9.27 已部分更新）：**
> - **Wired（Story 9.27）**：`ConflictDetector`（`runReadyNodes` 前调用）、`CostController`（spawn 前 `checkBudget`）、Blackboard 节点 input/output 写入、`notify` 边事件分发
> - **Not-wired（Phase 3 保留）**：`SubscribeNotifyProtocol`、`AclProtocol`（protocol/，`notify` 最简分发除外）、`NodeSandboxExecutor`（sandbox/）、`Tracer`（observability/）
> - **Partially wired（静态链路）**：`CapabilityMatcher`、`SupervisorMode`（engine/）、`ContractNetProtocol`。当前用于静态 manifest 驱动的 Supervisor / verifier 路径，尚未演进为 Queen-Led 动态分解与真实竞标。
>
> 完整偏离清单见 [架构审查 ARCH-RT-05/06/07](./multi-agent-runtime-architecture-review-2026-05-20.md)。

### 5.1 核心职责

协作引擎是运行时的大脑，负责：
1. 解析 Solution Manifest 中的协作拓扑
2. 初始化协作环境（注册 Agent、创建黑板、设置协作协议）
3. 驱动协作流程（根据拓扑和协议路由消息）
4. 监控协作状态（检测冲突、死锁、进度）
5. 判定全局目标是否达成

### 5.2 协作拓扑解析

```typescript
interface CollaborationTopology {
  agents: Map<string, AgentNode>;
  edges: CollaborationEdge[];
  entryPoints: string[];   // 入口 Agent（外部 trigger 的起点）
  exitPoints: string[];    // 出口 Agent（最终产出物）
}

interface AgentNode {
  id: string;
  name: string;
  type: 'agent' | 'role-agent' | 'supervisor';
  responsibility: string;
  domain: string;
  skills: string[];
  capabilities: string[];    // 从 Agent.md 中提取的能力列表
}

interface CollaborationEdge {
  from: string;
  to: string;
  type: 'trigger' | 'notify' | 'depend';
  description: string;
  protocol?: 'request-response' | 'subscribe-notify' | 'contract-net';
}
```

### 5.3 执行模型

协作引擎支持三种执行模式，可组合使用：

#### 模式 A：DAG 执行（静态拓扑）

适用于 `depend` + `trigger` 关系明确的场景：

```
          用户输入
             │
             ▼
        ┌─────────┐
        │ Agent A  │  (入口)
        └────┬─────┘
             │ trigger
      ┌──────┴──────┐
      ▼             ▼
 ┌─────────┐   ┌─────────┐
 │ Agent B  │   │ Agent C  │  (并行)
 └────┬─────┘   └────┬─────┘
      │ trigger      │ trigger
      └──────┬───────┘
             ▼
        ┌─────────┐
        │ Agent D  │  (汇总)
        └────┬─────┘
             │ trigger
             ▼
        ┌─────────┐
        │ Agent E  │  (出口)
        └─────────┘
```

执行流程：
1. 将拓扑转为 DAG
2. 拓扑排序确定执行顺序
3. 无依赖的 Agent 并行执行
4. 有依赖的 Agent 等待上游完成后触发
5. 所有出口 Agent 完成后判定任务完成

#### 反饥饿与优先级队列

> 来源：ai-engineering-from-scratch Phase 16 · Lesson 09 (Parallel/Swarm Networks)

纯拓扑排序在任务时长差异大时可能导致长任务饥饿。增强措施：

- **优先级队列 + aging** — 任务等待时间越长，优先级自动提升（`priority += age_weight`）
- **长任务 Worker 标记** — 可变时长的任务可标记为 `dedicated`，不参与短任务抢占
- **Back-pressure** — 当待执行队列长度超过阈值，暂停上游 trigger，防止队列堆积

#### 输入标准（HITL 判定标准）

DAG 协作中，每个 Agent 的执行结果由 **DAG 执行编排层**（`multi-agent-executor.ts`）判定为以下三种状态之一，以决定是否触发下游节点。Worker 层（`agent-worker.mts`）不负责判定，只返回原始执行结果。

| 状态 | 触发条件 | 下游行为 |
|------|---------|---------|
| `completed` | Agent 正常完成，且输出包含明确产出 | 触发下游 trigger 边 |
| `blocked` | Agent 通过 `report_block` 抛出结构化阻塞（need_input / decision_required / conflict_detected / capability_missing） | 路由 `WORKER_BLOCK` 到 Supervisor（Workflow 模式惰性挂载 Lightweight Supervisor），Worker 进程挂起待 resume |
| `failed` | Agent 抛出异常或超时 | 标记下游为失败 |

> 详细判定规则、职责归属、未来扩展方向见 [DAG HITL 输入判定标准](./dag-hitl-decision-standard.md)。
>
> **v2.0 变更**：原 `waiting` 状态（以问号结尾的自由文本提问）已被 `blocked` 取代。原 `HUMAN_REVIEW_REQUEST` 事件保留为 deprecated，运行时自动包装为 `WORKER_BLOCK{type:'need_input'}` 并强制路由到 Supervisor，不再冒泡到用户。

#### 模式 B：Supervisor-Worker（动态分解）

适用于复杂任务需要动态分解的场景：

```
Supervisor Agent
  ├─ 接收全局目标
  ├─ 分解为子任务
  ├─ 为每个子任务选择合适的 Worker（基于能力匹配）
  ├─ 通过 Contract Net 协议分配任务
  ├─ 监控 Worker 进度
  ├─ 处理 Worker 失败（重新分配）
  └─ 汇总结果，判定是否达成全局目标
```

#### 模式 C：Blackboard（涌现式协作）

适用于边界不明确、需要 Agent 自主贡献的场景：

```
1. 所有 Agent 注册到黑板
2. 每个 Agent 持续关注黑板状态
3. 当黑板出现自己能处理的任务/数据时，Agent 主动贡献
4. 多个 Agent 可同时看到机会，通过锁机制避免冲突
5. 黑板状态持续演进，直到全局目标达成
```

### 5.4 Agent 能力匹配与动态路由

> **接线状态：** `CapabilityMatcher` — **Not-wired（Phase 3 保留）**。接口已定义并通过单测，但生产 DAG 执行路径未调用。Phase 3 Story 9.16 将在 Queen-Led 协调引入时接线。

```typescript
interface CapabilityMatcher {
  // 根据任务需求匹配最合适的 Agent
  match(task: TaskDescription, availableAgents: AgentNode[]): AgentNode[];
}

// 匹配维度：
// 1. domain 匹配 — 任务领域 vs Agent 领域
// 2. skill 匹配 — 任务需要的 skill vs Agent 拥有的 skill
// 3. capability 匹配 — 从 Agent.md 的 responsibility 提取的能力
// 4. 当前负载 — Agent 正在处理的任务数
// 5. 历史表现 — 该 Agent 处理同类任务的成功率
```

#### Agent Card — 标准化发现元数据

> 来源：ai-engineering-from-scratch Phase 16 · Lesson 12 (A2A Protocol)

Agent Registry 为每个 Agent 生成标准化 Agent Card 元数据，用于能力发现和动态路由：

```typescript
interface AgentCard {
  id: string;
  name: string;
  description: string;         // 从 Agent.md responsibility 提取
  skills: string[];            // 已安装技能列表
  capabilities: string[];      // 从 Agent.md 提取的能力
  endpoints: {                 // Agent 可调用的端点
    tasks: string;             // 任务接收端点
    events?: string;           // 事件订阅端点
  };
  modalities: string[];        // 支持的模态：text, structured, code, etc.
  workingDirectory: string;    // 工作目录
}
```

**收益：**
- 标准化 Agent 发现协议，避免硬编码路由
- 为未来跨系统 A2A 调用预留协议兼容性
- `CapabilityMatcher` 可基于 Agent Card 做 discovery

### 5.5 依赖注入

协作运行时模块内部**禁止直接 import `src/lib/` 或 `src/components/` 下的任何模块**。所有外部依赖通过依赖注入接口传入：

```typescript
// src/modules/collaboration-runtime/config.ts
export interface CollaborationRuntimeDeps {
  // LLM 与 Agent 引擎 — 由调用方注入
  agentEngine: {
    startAgent(config: AgentConfig): Promise<AgentInstance>;
    stopAgent(id: string): Promise<void>;
    getAgent(id: string): AgentInstance | null;
  };

  // 工具执行 — 由调用方注入
  toolExecutor: {
    execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
    listTools(): ToolRegistration[];
  };

  // 本体数据存储 — 由调用方注入
  ontologyStore: {
    query(entityType: string, filter: Record<string, unknown>): Promise<unknown[]>;
    save(entityType: string, data: unknown): Promise<void>;
    delete(entityType: string, id: string): Promise<void>;
  };

  // 文件读写 — 由调用方注入（隔离文件系统访问）
  fileOps: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    listDir(path: string): Promise<string[]>;
  };

  // 事件发射 — 用于向外部推送 SSE 事件
  eventEmitter: {
    emit(event: RuntimeEvent): void;
  };
}

// 模块初始化
class CollaborationRuntime {
  constructor(private deps: CollaborationRuntimeDeps) {}
  // ...
}
```

**注入时机**：启动协作运行时的调用方（如 API route 或应用层）负责组装所有依赖并传入。模块内部只使用接口，不关心具体实现来自哪个库。

**好处**：
- 模块完全独立，可独立测试（mock 所有 deps）
- 不依赖 `lib/` 的任何具体模块，消除隐式耦合
- 未来替换 LLM 引擎、存储层、工具集时只需换注入实例

### 5.6 PI Agent 桥接

通过注入的 `agentEngine` 和 `toolExecutor` 接口与现有 PI Agent 基础设施集成：

```typescript
interface PiAgentBridge {
  // 依赖来自 CollaborationRuntimeDeps（注入）
  constructor(deps: CollaborationRuntimeDeps);

  // 为协作中的 Agent 创建个体上下文
  createContext(agent: AgentNode, sessionId: string): Promise<AgentContext>;

  // 单 Agent 思考（LLM 调用）— 内部调用 deps.agentEngine
  think(ctx: AgentContext, blackboardContext: string): Promise<AgentAct>;

  // 执行 Agent 的工具调用 — 内部调用 deps.toolExecutor
  executeTool(ctx: AgentContext, toolName: string, args: unknown): Promise<unknown>;
}
```

每个 Agent 在协作中的执行循环：

```
1. 从黑板获取最新消息/任务
2. 构建思考上下文（Agent 自身 prompt + 黑板相关数据 + 消息历史）
3. 调用 LLM（通过 PiAgentBridge）获得行动意图
4. 将行动转化为：
   a. 黑板操作（写数据、创建任务）
   b. ACL 消息（发送消息给其他 Agent）
   c. 工具调用（执行具体操作）
5. 执行行动，将结果写入事件日志
6. 回到步骤 1，继续观察黑板
```

### 5.6 协作引擎 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/collaboration/sessions` | POST | 创建协作会话 |
| `/api/collaboration/sessions` | GET | 列出所有协作会话 |
| `/api/collaboration/sessions/:id` | GET | 获取会话状态（含黑板快照） |
| `/api/collaboration/sessions/:id/events` | GET | 获取协作事件流（SSE） |
| `/api/collaboration/sessions/:id/blackboard` | GET | 获取当前黑板状态 |
| `/api/collaboration/sessions/:id/agents` | GET | 列出参与协作的 Agent |
| `/api/collaboration/sessions/:id/topology` | GET | 获取协作拓扑图 |
| `/api/collaboration/sessions/:id/abort` | POST | 终止协作 |

## 6. Sandbox 层

> **接线状态：** `NodeSandboxExecutor`（`sandbox/node-executor.ts`）— **Not-wired（Phase 3 保留）**。接口已实现并通过单测；当前生产路径由 `AgentSpawner`（`sandbox/agent-spawner.ts`）直接管理子进程，`NodeSandboxExecutor` 保留用于 Phase 3 容器隔离升级。

### 6.1 现状分析

当前 `src/components/sandbox/` 是 **iframe 前端预览窗口**，用于展示 Agent 生成的 Web 应用。不是代码执行沙箱。

### 6.2 沙箱方案

直接使用 `@anthropic-ai/sandbox-runtime` 包（`learn/sandbox-runtime`，v0.0.51）作为安全执行器。
该包是 Anthropic 开源的 OS 级沙箱运行时，已被 Claude Code 用于生产环境。

**核心能力**：

- **macOS**: `sandbox-exec` + Seatbelt profile（动态生成）
- **Linux**: `bubblewrap` + seccomp BPF + network namespace
- **网络隔离**: HTTP + SOCKS5 代理 + 域名白名单/黑名单
- **文件系统**: allow-write（默认拒绝）+ allow-read/deny-read/deny-write 路径模式
- **超时控制**: 原生 `AbortSignal` 支持
- **违规追踪**: `SandboxViolationStore` 记录所有越权行为

**集成方式**：

```
┌──────────────────────────────────────────────────┐
│  CollaborationRuntimeDeps                        │
│                                                   │
│  sandboxExecutor: SandboxManager                 │
│    ├── initialize(config)                        │
│    ├── wrapWithSandbox(command, config?, signal) │
│    ├── updateConfig()                            │
│    └── cleanupAfterCommand()                     │
│                                                   │
│  每个 Agent 工具调用通过 wrapWithSandbox() 包装，│
│  传入该 Agent 的特定权限配置。                     │
└──────────────────────────────────────────────────┘
```

**配置示例**（per-Agent）：

```typescript
const config: SandboxRuntimeConfig = {
  network: {
    allowedDomains: ["api.example.com", "*.internal"],
    deniedDomains: ["*.telemetry.com"],
    httpProxyPort: 8080,
    socksProxyPort: 8081,
  },
  filesystem: {
    allowWrite: ["data/projects/proj-123/**"],
    allowRead: ["data/projects/proj-123/**", "skills/**"],
    denyWrite: ["~/.claude/**", "~/.ssh/**", "~/.gitconfig"],
  },
};

const wrappedCommand = await sandboxManager.wrapWithSandbox(
  "node scripts/agent-tool.js",
  undefined,
  config,
  abortSignal
);
```

**依赖**：

| 平台 | 依赖 | 说明 |
|------|------|------|
| macOS | `sandbox-exec` | macOS 内置，无需额外安装 |
| Linux | `bubblewrap`, `seccomp-tools`, `unshare` | 需要安装，`checkDependencies()` 可检测 |
| Node.js | `@anthropic-ai/sandbox-runtime` | npm 包，Apache-2.0 |

### 6.3 与现有 SandboxWindow 的关系

| 组件 | 职责 | 保留？ |
|------|------|--------|
| `SandboxWindow.tsx` | 前端应用 iframe 预览 | 保留 |
| `@anthropic-ai/sandbox-runtime` | 代码安全执行 | 新增 |

## 7. 协作流程示例

### 7.1 Workflow 模式示例（固定 DAG）

Solution Manifest 定义的拓扑（全是 trigger）：
```
订单接收 Agent ──trigger──→ 订单处理 Agent ──trigger──→ 报告生成 Agent
```

执行流程：
```
1. 拓扑排序: [订单接收 Agent, 订单处理 Agent, 报告生成 Agent]
2. 按序执行:
   - 执行 订单接收 Agent → 等待完成 → Handoff 上下文摘要
   - 执行 订单处理 Agent → 接收摘要 → 处理 → Handoff
   - 执行 报告生成 Agent → 接收摘要 → 生成报告
3. 完成: 流程结束
```

Handoff 传递：A 的输出摘要作为 B 的输入，无需黑板。

### 7.2 System 模式示例（协作拓扑）

Solution Manifest 定义的拓扑：

协作执行过程：

```
事件序列:
─────────────────────────────────────────────────────────

1. USER_INPUT: "处理新订单 ORD-001"
   source: user → 黑板

2. TASK_CREATED: { desc: "处理订单 ORD-001" }
   source: system → 任务队列

3. TASK_ASSIGNED: task → 订单接收 Agent
   source: system

4. AGENT_THINKING: 订单接收 Agent 开始思考
   source: 订单接收 Agent

5. AGENT_ACT: 提取订单信息，验证完整性
   source: 订单接收 Agent

6. TOOL_CALL: validate_order("ORD-001")
   source: 订单接收 Agent → Sandbox

7. TOOL_RESULT: { valid: true, items: [...], total: 500 }
   source: Sandbox

8. AGENT_MESSAGE: inform(订单验证通过，进入处理)
   from: 订单接收 Agent → to: 订单处理 Agent

9. TASK_COMPLETED: "处理订单 ORD-001" (by 订单接收 Agent)

10. TASK_CREATED: { desc: "处理订单支付与分配", dependsOn: [9] }

11. TASK_ASSIGNED: task → 订单处理 Agent
    (自动触发，因为 9 已完成)

12. AGENT_THINKING → AGENT_ACT → TOOL_CALL → TOOL_RESULT
    订单处理 Agent 执行支付处理...

13. AGENT_MESSAGE: inform(支付完成，扣减库存)
    from: 订单处理 Agent → to: 库存 Agent

14. TASK_COMPLETED: 订单处理 Agent

15. TASK_CREATED + TASK_ASSIGNED → 库存 Agent
    (trigger 关系自动触发)

16. AGENT_THINKING → TOOL_CALL(knockdown_stock) → TOOL_RESULT
    库存 Agent 执行库存扣减...

17. AGENT_BROADCAST: notify(库存已更新)
    from: 库存 Agent → to: *
    (notify 关系，广播给所有订阅者)

18. AGENT_MESSAGE: inform(订单 ORD-001 处理完成)
    from: 库存 Agent → to: 通知 Agent

19. SESSION_COMPLETE: 所有任务完成，全局目标达成
```

### 7.2 冲突示例

```
场景：订单处理 Agent 和库存 Agent 同时尝试修改同一订单状态

事件:
  BLACKBOARD_WRITE: { key: "order.ORD-001.status", by: "订单处理 Agent" }
  BLACKBOARD_WRITE: { key: "order.ORD-001.status", by: "库存 Agent" }

检测: CONFLICT_DETECTED {
  type: "data_conflict",
  agents: ["订单处理 Agent", "库存 Agent"],
  key: "order.ORD-001.status",
  resolution: "lock_based"
}

消解:
  BLACKBOARD_LOCK: { key: "order.ORD-001.status", holder: "订单处理 Agent" }
  → 库存 Agent 的写入被排队
  → 订单处理 Agent 完成后释放锁
  → 库存 Agent 获得锁，执行写入
```

## 8. 模块目录结构

> ⚠️ **2026-05-20 架构审查补充：** 实际代码不止 `src/modules/collaboration-runtime/` 一个目录。
> 还存在两个与之配对的 `src/lib/` 子目录，三者共同构成「集成边界三件套」（详见 [架构审查报告 ARCH-RT-02](./multi-agent-runtime-architecture-review-2026-05-20.md)）：

### 8.0 集成边界三件套（必读）

| 目录 | 角色 | 允许依赖 |
|------|------|---------|
| `src/modules/collaboration-runtime/` | **纯模块** — 协作引擎/沙箱/协议/可观测性，与 OriginOS 解耦，可独立测试 | 仅 `node:*`、第三方 npm、模块内部相对路径；**禁止 import `@/lib/**` 或 `@/components/**`** |
| `src/lib/collaboration-runtime-service/` | **会话/SSE/持久化集成层** — 衔接 API ↔ 模块；维护 sessions/eventStores/blackboards Map 与 SSE 客户端 | 可 import `@/modules/collaboration-runtime/**` |
| `src/lib/collaboration-runtime-bridge/` | **多 Agent 执行编排层** — manifest 加载、拓扑构建、子进程 spawn、Human-in-the-Loop 暂停管理 | 可 import `@/modules/collaboration-runtime/**`、`@/lib/integrations/**` |

> 自 Story 9.27 起，模块内 `bridge/` 已改名为 `integrations/`，避免与 `src/lib/collaboration-runtime-bridge/` 二义。

```
src/modules/collaboration-runtime/
│
├── index.ts                          # 模块入口，通过 index.ts 导出公共 API
├── config.ts                         # 运行时配置
│
├── session/
│   ├── event-store.ts                # 事件存储接口
│   ├── fs-event-store.ts             # 文件系统实现
│   ├── blackboard.ts                 # 共享黑板
│   ├── types.ts                      # 事件/类型定义
│   └── session-service.ts            # Session CRUD
│
├── protocol/                         # ★ 协作协议层
│   ├── acl.ts                        # Agent 通信语言 (ACL Message)
│   ├── protocols/
│   │   ├── request-response.ts       # 请求-响应协议
│   │   ├── contract-net.ts           # 招标-投标协议
│   │   ├── subscribe-notify.ts       # 订阅-通知协议
│   │   └── delegate-confirm.ts       # 委托-确认协议
│   ├── conflict.ts                   # 冲突检测与消解
│   └── conversation.ts               # 多轮对话管理
│
├── engine/                           # ★ 协作引擎
│   ├── collaboration-engine.ts       # 主编排引擎
│   ├── topology-parser.ts            # 解析 Solution Manifest 拓扑
│   ├── dag-executor.ts               # DAG 模式执行器
│   ├── supervisor.ts                 # 监督者模式
│   ├── blackboard-coordinator.ts     # 黑板协调模式
│   ├── capability-matcher.ts         # Agent 能力匹配
│   ├── task-manager.ts               # 任务队列管理
│   └── context-builder.ts            # 构建 Agent 思考上下文
│
├── sandbox/
│   ├── sandbox-manager.ts            # 沙箱管理器
│   ├── node-executor.ts              # Node.js 沙箱 (MVP)
│   ├── docker-executor.ts            # Docker 沙箱 (生产，需 AGENTS.md 更新)
│   └── resource-limiter.ts           # 资源限制
│
├── integrations/                     # 模块内集成适配
│   └── agent-registry.ts             # Agent 定义加载（解析器由 service 注入）
│
├── __tests__/
│   ├── acl.test.ts
│   ├── collaboration-engine.test.ts
│   ├── conflict-detector.test.ts
│   └── dag-executor.test.ts
```

**UI 组件位置（豁免 AGENTS.md `src/components/` 约束）**：
```
src/modules/collaboration-runtime/ui/
├── CollaborationViewer.tsx       # 协作过程可视化
├── BlackboardViewer.tsx          # 黑板状态查看器
└── EventTimeline.tsx             # 事件时间线
```

UI 组件与模块内部直接耦合，不经过 `src/components/` 目录。

## 9. API Routes

**API 位置遵循 AGENTS.md 的 `src/app/api/` 目录规约：**

```
src/app/api/collaboration/
├── sessions/
│   ├── route.ts                    # POST 创建 / GET 列出
│   └── [id]/
│       ├── route.ts                # GET 会话详情
│       ├── events/
│       │   └── route.ts            # GET 事件流 (SSE)
│       ├── blackboard/
│       │   └── route.ts            # GET 黑板状态
│       ├── agents/
│       │   └── route.ts            # GET 参与 Agent 列表
│       ├── execute/
│       │   └── route.ts            # POST 启动执行
│       └── abort/
│           └── route.ts            # POST 终止
├── topology/
│   └── route.ts                    # GET 从 Solution Manifest 解析拓扑
└── sandbox/
    ├── execute/
    │   └── route.ts                # POST 执行代码
    └── health/
        └── route.ts                # GET 健康检查
```

**API 路由依赖方向（AGENTS.md Layer 5 → Layer 2）**：
- `src/app/api/collaboration/` 仅做 HTTP 请求/响应处理
- 所有业务逻辑委托给 `src/modules/collaboration-runtime/`
- 禁止在 API route 中定义业务逻辑

## 10. 与现有系统集成

> 详细的 PI Agent 组件逐条映射到三层架构的归属见 **§2.1.1 PI Agent 组件与三层架构映射**。

| 现有组件 | 集成方式 | 归属 |
|---------|---------|------|
| **Solution Manifest** (`solutions/solution-{version}.json`) | 核心输入 — 消费 Agent 列表和协作拓扑，驱动协作引擎初始化 | Runtime 层 |
| **Agent 定义** (`data/projects/{id}/agents/{id}/*.md`) | `AgentRegistry` 加载 Agent.md、Tool.md、Memory.md 等作为每个 Agent 的系统提示和工具集 | Agent 子进程（bootstrap 读取） |
| **PI Agent** (`src/lib/integrations/pi-agent/`) | 整体迁移为 Agent 子进程。详见 §2.1.1 映射表 | Agent 子进程 |
| **PersistentAgentManager** | 从 Next.js 单例转为 Runtime 层的 Agent 生命周期调度器 | Runtime 层 |
| **agentSessionService** | 从 Next.js 侧转为 Runtime 层的 Session Service | Runtime 层 |
| **Ontology Data Store** | 作为共享数据层，Agent 通过黑板操作本体数据 | Web 层（API）+ Agent 子进程（工具） |
| **SolutionDesign 组件** | 用户可从 SolutionDesign 直接启动协作运行时 | Web 层 |
| **现有 SandboxWindow** | 保留作为前端预览，协作产出可在此预览 | Web 层 |

### 集成流程

```
1. 用户选择 Solution Version
   → 加载 solution-{version}.json
   → 提取 Agent 列表 + 协作拓扑

2. 初始化协作运行时
   → 创建 Session（黑板）
   → 注册所有 Agent（加载 .md 文件）
   → 解析拓扑 → 构建 DAG / 设置 Supervisor

3. 用户输入任务目标
   → 写入黑板
   → 协作引擎开始驱动

4. 每个 Agent 通过 PiAgentBridge 与 LLM 交互
   → 读取黑板 → 思考 → 行动 → 写黑板

5. 协作过程通过 SSE 推送给前端
   → CollaborationViewer 实时展示

6. 全局目标达成 → SESSION_COMPLETE
   → 产出物存入 artifacts
```

## 11. 安全模型

### 11.1 纵深防御

```
L1: ACL 消息验证
    - 验证消息来源 Agent 身份
    - 验证 performative 合法性
    - 拒绝未授权的 Agent 间调用

L2: 沙箱隔离
    - 每次工具调用独立进程/容器
    - 文件系统只读挂载
    - 网络白名单

L3: 黑板访问控制
    - Agent 只能读写其领域内的数据
    - 锁机制防止并发冲突
    - 写入操作记录审计日志

L4: 凭证隔离
    - API keys 不暴露给沙箱
    - 外部调用通过代理转发
```

### 11.2 防恶意协作

- Agent 不能直接调用其他 Agent 的 LLM（只能通过 ACL 消息）
- Agent 不能修改协作拓扑（拓扑由 Solution Manifest 定义）
- Agent 不能删除其他 Agent 的产出物（只能追加或更新自己的）

## 12. 可观测性

> **接线状态：** `Tracer`（`observability/tracing.ts`）— **Not-wired（Phase 3 保留）**。`CostController` 已在 spawn 前接线（Story 9.27 ARCH-RT-05）；`Tracer`、`MetricsCollector` 等完整可观测性组件保留 Phase 3 Story 9.18。

### 12.1 协作过程可视化

```
┌──────────────────────────────────────────────────────┐
│                   协作过程查看器                       │
│                                                      │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐  │
│  │  拓扑图     │    │  事件时间线  │    │  黑板状态   │  │
│  │            │    │            │    │            │  │
│  │ A → B → C  │    │ t1: A 思考  │    │ sharedData: │  │
│  │     ↕      │    │ t2: A→B 消息│    │   order: {} │  │
│  │     D      │    │ t3: B 思考  │    │   tasks: []  │  │
│  └────────────┘    │ t4: B 执行  │    │ messages: 3  │  │
│                    │ t5: C 思考  │    └────────────┘  │
│                    └────────────┘                     │
└──────────────────────────────────────────────────────┘
```

### 12.2 运行指标

- 每个 Agent 的思考次数、工具调用次数
- Agent 间消息总数、平均响应时间
- 任务完成率、失败率、重新分配率
- 冲突检测次数、消解方式分布
- LLM Token 消耗（按 Agent 维度）

## 13. 实施路径

### Phase 1: 协作基础（核心）✅ Complete

- ✅ Session 层：文件系统事件溯源（JSONL） + 共享黑板（含 provenance + append-only）
- ✅ 协议层：ACL Message + 请求-响应协议 + Verifier 角色约束
- ✅ 引擎层：DAG 执行器（基于 Solution Manifest 拓扑，含优先级队列 + 反饥饿）
- ✅ 桥接：依赖注入配置 — 调用方注入 `agentEngine`、`toolExecutor`、`ontologyStore`、`fileOps`
- ✅ API：创建/查询协作会话（`src/app/api/collaboration/`）
- ✅ UI：基础协作查看器（事件时间线），位于 `src/modules/collaboration-runtime/ui/`（豁免 AGENTS.md `src/components/` 约束）
- ✅ 沙箱：Node.js `@anthropic-ai/sandbox-runtime` 沙箱（MVP）
- ✅ Agent 注册表：从 Solution Manifest 加载 Agent 定义
- ✅ PI Agent 桥接：子进程入口 + stdio 通信

**Stories 9.1-9.12：全部完成**

### Phase 2: 高级协作 ✅ Complete

- ✅ 协议层：招标-投标 + 订阅-通知
- ✅ 引擎层：Supervisor 模式（深度 ≤ 2，强制 Verifier） + 黑板协调（含 read-only Verifier）
- ✅ 冲突检测与消解 + Circuit Breaker + Retry Storm 防护
- ✅ 能力匹配与动态路由（基于 Agent Card）
- ✅ UI：协作拓扑图 + 黑板状态可视化
- ✅ MAST 分类审计首次执行

**Stories 9.13-9.18：全部完成**

### Phase 3: 生产加固 ⬜ Pending（6 Stories 待实施）

| Story | 特性 | 状态 |
|-------|------|------|
| 9.18 | Docker 容器沙箱 / PostgreSQL（需外部基础设施） | ⬜ 依赖外部环境 |
| 9.18 | 成本控制与资源配额（cost-controller.ts） | ✅ 已实现 |
| 9.18 | 完整可观测性（logging/metrics/tracing） | ✅ 已实现 |
| 9.19 | Queen-Led 层级协调（动态治理模式） | ⬜ Pending |
| 9.20 | 黑板 HNSW 语义索引 | ⬜ Pending |
| 9.21 | Agent Pool 预热机制 | ⬜ Pending |
| 9.22 | 三层模型路由（Agent Booster → Haiku → Sonnet/Opus） | ⬜ Pending |
| 9.23 | 共识投票机制（BFT/Raft/Quorum） | ⬜ Pending |
| 9.24 | PID 孤儿会话回收 | ⬜ Pending |

## 14. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Agent 间无限消息循环 | 设置最大消息深度 + 循环检测 |
| 死锁（循环依赖） | 拓扑排序阶段检测环 + 超时自动打破 |
| LLM 幻觉导致无效协作 | ACL 消息格式验证 + 语义检查 + Verifier 角色 |
| 黑板数据竞态 | 锁机制 + 乐观并发控制 + provenance |
| 上下文窗口溢出 | 黑板相关性过滤 + 消息摘要 |
| Agent 不终止 | 设置全局超时 + 最大迭代次数 |
| 协作成本失控 | Token 预算 + 按 Agent 维度成本追踪 |
| 层级分解错误（Supervisor 委派错误任务） | **树深度限制 ≤ 2** + 每层 canary question 检测分解漂移 |
| 记忆中毒（Hallucination 在共享状态传播） | Append-only 日志 + provenance + read-only Verifier |
| 单模型崩溃（所有 Agent 犯相同错误） | 异构模型池 + monoculture 检测 |
| 重试风暴（下游服务过载） | Circuit Breaker + retry budget + back-pressure |

---

## 16. Ruflo Hive/Blackboard 模式借鉴

基于对 Ruflo 多 Agent 编排平台（`v3/@claude-flow/cli`）的架构分析，提取以下可借鉴方案。

### 16.1 Ruflo 架构概要

Ruflo 采用三层执行模型：
- **MCP 协调层**：CLI 工具负责策略制定（swarm init、hive-mind、consensus）
- **Task 执行层**：Claude Code 的 Task tool 负责真实 Agent 执行
- **持久存储层**：AgentDB + JSON 文件状态持久化

关键发现：工作流和 Hive-Mind 两条路径**不互通**——workflow 不触发 swarm 协调，swarm 不驱动 workflow。真实执行依赖 Claude Code 的 Task tool + SendMessage。

### 16.2 可借鉴方案

#### 16.2.1 Queen-Led 层级协调（推荐采纳）

**Ruflo 方案**：`queen-coordinator` 作为权威编排者，Worker 各自执行，通过 `SendMessage` 实时通信。三种治理模式：

| 模式 | 适用场景 | 控制方式 |
|------|---------|---------|
| hierarchical | 小型团队（≤8 Agent） | Queen 直接控制 Worker |
| democratic | 中型团队（8-15 Agent） | 分布式投票决策 |
| emergency | 故障恢复 | Queen 紧急接管 |

**对 OriginOS 的意义**：本文档 §5.3 的 Supervisor-Worker 模式可以增强为 Queen-Led 层级协调——Queen 不仅是任务分解者，还是共享内存命名空间的管理者，维护协作权威状态。

**采纳建议**：将 §5.3 模式 B（Supervisor-Worker）增强为：
```
Queen Agent (权威编排者)
  ├── Worker Agents (执行子任务)
  ├── Scout Agents (信息探索)
  └── Memory Manager (黑板状态同步)

治理模式动态切换：
  正常状态 → hierarchical（Queen 直接调度）
  复杂决策 → democratic（Worker 投票）
  故障状态 → emergency（Queen 紧急接管）
```

#### 16.2.2 共享内存命名空间 + HNSW 向量搜索（推荐采纳）

**Ruflo 方案**：
- AgentDB + sql.js 后端 + HNSW 向量索引
- ONNX embeddings（384 维），实现跨 Agent 语义记忆
- SmartRetrieval：RRF 融合 + MMR 多样性
- 内存减少 50-75%（Int8 量化）

**对 OriginOS 的意义**：本文档 §3 的黑板（Blackboard）设计是结构化 KV 存储，缺少语义搜索能力。对于多 Agent 协作场景，Agent 需要从黑板中**语义检索**相关上下文，而非精确匹配。

**采纳建议**：在黑板 `sharedData` 中增加语义索引：
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

#### 16.2.3 Agent Pool 预热机制（推荐采纳）

**Ruflo 方案**：预生成 warm pool 的 Agent 实例，跳过冷启动开销。`agent pool` 命令管理预生成的 Agent 池。

**对 OriginOS 的意义**：本文档 §2.1 的进程隔离架构中，每个 Agent 启动需要独立的 sandbox 子进程初始化（读取 Agent.md/Tool.md/Skill.md，构建 prompt）。对于频繁触发的协作场景（如 trigger 链），每次冷启动会增加显著延迟。

**采纳建议**：在 Runtime 层增加 Agent Pool：
```typescript
interface AgentPool {
  warmAgents: Map<string, {
    instance: AgentInstance;
    lastUsedAt: string;
    ttlMs: number;
  }>;
  get(agentId: string): Promise<AgentInstance>;  // 命中则返回预热实例
  warm(agentId: string): Promise<void>;           // 预热
  evict(agentId: string): void;                   // 淘汰过期实例
}
```

#### 16.2.4 三层模型路由（推荐采纳）

**Ruflo 方案**（ADR-026）：
| Tier | Handler | 延迟 | 成本 | 适用 |
|------|---------|------|------|------|
| 1 | Agent Booster | <1ms | $0 | 简单转换（var→const、加类型） |
| 2 | Haiku | ~500ms | $0.0002 | 低复杂度任务 |
| 3 | Sonnet/Opus | 2-5s | $0.003-0.015 | 架构、安全、复杂推理 |

Agent 类型默认映射：architect→opus, coder→sonnet, formatter→haiku

**对 OriginOS 的意义**：本文档 §5.6 PI Agent 桥接中 `think()` 方法调用 LLM，但未区分任务复杂度选择模型。多 Agent 协作会产生大量 LLM 调用，成本可能失控。

**采纳建议**：在 `PiAgentBridge.think()` 中增加复杂度评估和模型路由：
```typescript
async think(ctx: AgentContext, blackboardContext: string): Promise<AgentAct> {
  const complexity = assessTaskComplexity(ctx.currentTask);
  const model = routeModel(complexity, ctx.agentType);  // haiku/sonnet/opus
  return this.deps.agentEngine.think(ctx, blackboardContext, { model });
}
```

#### 16.2.5 共识机制与拜占庭容错（可选参考）

**Ruflo 方案**：
- BFT（Byzantine Fault Tolerance）：容忍 f < n/3 恶意 Agent
- Raft：容忍 f < n/2 故障
- Quorum：可配置法定人数
- 共识结果持久化到 AgentDB，可搜索历史

**对 OriginOS 的意义**：本文档 §4.3 冲突消解中 `supervisor_decision` 是单点决策。对于关键协作场景（如本体结构变更、技能部署），可以引入多 Agent 投票共识。

**采纳建议**：在 §4.3 冲突消解中增加 `consensus_vote` 策略：
```
goal_conflict 场景:
  触发条件: 多个 Agent 目标冲突
  策略选择: consensus_vote（当 Agent 数量 ≥ 3 时）
  流程: 各 Agent 提交提案 → 多数决 → 平局时 Queen 仲裁
```

#### 16.2.6 PID 孤儿回收机制（推荐采纳）

**Ruflo 方案**（#1799）：
- Swarm 启动时记录 host 进程 PID
- 后续加载时检查 PID 存活（`process.kill(pid, 0)`）
- ESRCH → 进程已死，标记 orphan
- EPERM → 进程存活但属其他用户，不回收
- TTL 兜底：无 PID 的条目，24h 未更新则回收

**对 OriginOS 的意义**：本文档 §2.3 数据存储中 `collaboration-sessions/` 目录可能在 Agent 异常退出后留下孤儿会话。需要类似的回收机制。

**采纳建议**：在 Session 层增加孤儿检测：
```typescript
function reconcileOrphanSessions(sessions: SessionRecord[]): number {
  // 对每个 running session 检查 hostPid 存活
  // 标记死亡进程创建的会话为 'terminated'
}
```

### 16.3 决策框架

Ruflo 的三种执行路径在 OriginOS 中的映射：

| Ruflo 路径 | OriginOS 对应 | 使用场景 |
|-----------|--------------|---------|
| Workflow（顺序 DAG） | §5.3 模式 A（DAG 执行） | 预定义的顺序 Agent 链 |
| Hive-Mind（Queen + 共识） | §5.3 模式 B（Supervisor-Worker）增强版 | 需要集体决策的复杂协作 |
| 直接 Task 工具（简单并行） | 不纳入协作运行时 | 独立一次性子任务，由主 Agent 直接 spawn |

**决策规则**：
- 如果 Agent 协作全是单向 trigger → 使用 Workflow 模式（轻量 DAG）
- 如果存在 notify/depend 关系 + 需要共享上下文 → 使用 System 模式（黑板 + Queen-Led）
- 如果任务简单且独立 → 不需要协作运行时，主 Agent 直接并行 spawn 子 Agent

### 16.4 Ruflo 对本文档的总体影响

| 本文档章节 | Ruflo 借鉴 | 优先级 |
|-----------|-----------|--------|
| §3 Session 层 | HNSW 语义索引 + 孤儿回收 | P1 |
| §5.3 执行模型 | Queen-Led 层级协调（增强 Supervisor 模式） | P1 |
| §5.6 PI Agent 桥接 | 三层模型路由 | P1 |
| §5.4 能力匹配 | Agent Pool 预热 | P2 |
| §4.3 冲突消解 | 共识投票策略 | P2 |

---

## 15. AGENTS.md 合规检查报告

> ⚠️ **2026-05-20 架构审查更新（Story 9.27 已完成 Critical/High 治理）：**
> - **已解决（Story 9.27）**：ARCH-RT-01（围栏修复，`bridge/` → `integrations/`，无 `@/lib` 反向 import）、ARCH-RT-09（bridge 层 any 清零）、ARCH-RT-04（HITL 三处 bug）、ARCH-RT-06（Blackboard 写入）、ARCH-RT-07（notify 分发）、ARCH-RT-08（buildCollaborationPrompt 接线）
> - **Deferred（Phase 3）**：ARCH-RT-03（DI 接口空壳化，待 9.19 前重构）
>
> 完整偏离清单见 [多 Agent 协作运行时架构审查（2026-05-20）](./multi-agent-runtime-architecture-review-2026-05-20.md)。

### 15.1 合规项

| AGENTS.md 约束 | 设计是否合规 | 说明 |
|----------------|-------------|------|
| 必须使用 App Router | ✅ | API routes 位于 `src/app/api/collaboration/` |
| React 函数式组件 + Hooks | ✅ | 所有 UI 组件为函数式组件 |
| TypeScript 严格模式，禁止 any | ✅ | 设计中的类型定义均为具体类型 |
| Tailwind CSS（禁止内联样式） | ✅ | UI 组件设计说明明确使用 Tailwind |
| Zustand 状态管理 | ✅ | 运行时会话状态使用 Zustand store |
| MVP 禁止数据库 | ✅ | 事件存储使用文件系统 JSONL，不引入任何数据库 |
| 禁止在 `src/app/` 放业务逻辑 | ✅ | API routes 仅做 HTTP 层，业务逻辑在模块内 |
| Feature 通过 index.ts 导出公共 API | ✅ | 模块入口 `index.ts` 导出公共 API |
| 数据文件符合 DataFile 格式 | ✅ | 明确说明 JSON 文件需包含 `version/createdAt/updatedAt/data` |

### 15.2 架构围栏豁免项

| AGENTS.md 约束 | 设计决策 | 说明 |
|----------------|---------|------|
| 业务逻辑在 `src/lib/` | `src/modules/collaboration-runtime/` | 模块目录豁免 AGENTS.md 位置约束 |
| 组件在 `src/components/` | `src/modules/collaboration-runtime/ui/` | UI 目录豁免 AGENTS.md 位置约束 |

### 15.3 需更新的 AGENTS.md 项（Phase 3 前）

| 未来特性 | 当前 AGENTS.md 约束 | 需要的变更 |
|---------|-------------------|-----------|
| Docker 容器沙箱 | 未定义沙箱技术 | 在"必须使用的技术"或新增章节中增加 Docker 支持 |
| 更复杂的沙箱隔离 | 未定义 | 定义沙箱的安全模型和权限约束 |
| PostgreSQL（如必要） | MVP 禁止数据库 | 在 Post-MVP 部分增加数据库使用条件 |

### 15.4 当前合规状态（2026-05-16）

| AGENTS.md 约束 | Phase 1+2 是否合规 | 说明 |
|----------------|-------------------|------|
| 业务逻辑在 `src/lib/` | ✅ 豁免 | `src/modules/collaboration-runtime/` 已获豁免 |
| UI 在 `src/components/` | ✅ 豁免 | `src/modules/collaboration-runtime/ui/` 已获豁免 |
| MVP 禁止数据库 | ✅ | 事件存储使用文件系统 JSONL |
| 禁止 `any` 类型 | ✅ | 所有类型均为具体类型 |
| 单向依赖 | ✅ | 模块内部不 import 外部模块，通过 DI 注入 |
| DataFile 格式 | ✅ | JSON 文件包含 version/createdAt/updatedAt/data |

**Phase 1+2 实施结果：18/18 Stories 完成，180 测试通过，0 TS 编译错误**

### 15.4 目录对齐变更总结

| 原始设计 | 变更后 | 原因 |
|---------|--------|------|
| Deno 沙箱 | Node.js `vm` + `child_process` | Deno 不在 AGENTS.md 批准的技术栈中 |
| 生产 PostgreSQL | 文件系统索引（暂定） | AGENTS.md MVP 禁止所有数据库 |
| `data/projects/{projectId}/collaboration-sessions/` | `data/projects/{projectId}/collaboration-sessions/` | 项目内协作会话唯一路径 |
| API 业务逻辑在 route.ts | API route → lib/ 桥接 | AGENTS.md 禁止在 `src/app/` 中放置业务逻辑 |
