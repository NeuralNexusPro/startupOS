# OriginOS Harness 架构升级蓝图

- **状态：** Proposed
- **日期：** 2026-08-17
- **分析对象：** OriginOS CE `0.1.47` 与 DeepSeek Harness 当前工作区
- **范围：** Agent 运行时、会话、工具、能力适配、多 Agent、工作流、权限、持久化与可观测性

## 结论

OriginOS 不需要把 DeepSeek Harness 或 Cordis 整体移植进来。OriginOS 已经具备 Pi Agent 适配层、受控 Task Runtime、worker 进程、多 Agent DAG、JSONL 协作事件、技能与本地文件存储；最有价值的升级是把这些能力收敛到一个小型 Harness Kernel，使所有 Agent 类型共享同一套会话事实、工具执行、能力解析和生命周期规则。

目标不是增加更多抽象，而是消除当前的多套真相源和多条运行路径。升级完成后，普通 Agent、RoleAgent、Project Agent、Skill Agent、Task Runtime 与 Collaboration Worker 只在组合配置和能力范围上不同，不再各自拥有一套启动、消息、工具、恢复与销毁逻辑。

建议采用以下原则：

1. **模型可见即入日志。** 任何进入模型请求的消息、注入上下文、工具结果、压缩摘要和子 Agent 回报都必须能从会话事件重建。
2. **一个 Agent 只有一个 inbox、一个 turn driver 和一个取消通道。** UI、定时任务、子 Agent、人工回复和系统注入都通过统一入口排队。
3. **工具只有一条执行管线。** 模型调用、宿主调用、Task Runtime 和工作流调用共享参数校验、权限、超时、取消、结果校验、事件和 UI 投影。
4. **能力以 Definition / Provider / Consumer 三个角色组织。** 业务代码依赖能力定义，不依赖本地文件、Electron、worker 或具体模型实现。
5. **组合替代分支。** Agent 类型由 preset/profile 选择插件、prompt section、工具范围和 provider，不在 API Route 或 manager 中增加类型分支。
6. **运行状态与视图状态分离。** 追加式事件是事实源，消息列表、任务卡片、进度、窗口和指标都是可重建投影。

## 当前架构判断

### 可直接复用的基础

| OriginOS 现有能力 | 判断 | 升级后的角色 |
|---|---|---|
| `@originos/pi-agent-adapter` | 已隔离上游 Pi Runtime，并已有受控 patch 与公开子路径 | LLM/Agent provider 适配器，不作为产品总线 |
| `AgentTaskRuntimeCoordinator` | 已实现 revision、cursor、requestId、幂等与 Evidence Gate | Task capability 的 Consumer/Provider，接入统一 Tool Runtime 和 Session Log |
| `FsEventStore` | 已有按 session 串行写入的 JSONL 与 checkpoint | 统一 SessionStore 的首个文件 provider |
| Collaboration Runtime | 已有 DAG、Supervisor、worker、HITL、blackboard 与事件 | Workflow/Subagent capability 的 provider，不再维护平行会话语义 |
| worker `AgentSpawner` | 已有进程隔离、prompt queue、abort、resume 与 shutdown | ProcessAgentProvider |
| `ToolRegistry` 与 `Tool.md` | 已有注册、scope 和 Agent 白名单 | 迁移为不可绕过的 Tool Runtime 与 scoped restriction |
| Role/Project prompt 构建 | 已有身份、记忆、技能、工作目录与权限分层 | 改为可组合 PromptSection，不再拼接成类型专用大函数 |
| 本地文件数据 | 符合离线优先和当前“禁止数据库”约束 | 保留；先定义存储接口和格式版本，不引入 SQLite |

### 需要优先收敛的问题

以下问题来自当前源码，而不是对产品能力的否定：

- `OriginOSAgent` 同时负责模型凭证适配、上下文裁剪、完成度判断、事件翻译、循环保护、UI 状态、工具状态和生命周期，文件超过 1,700 行，策略无法独立替换或按 Agent scope 安装。
- 普通 session、persistent agent、project agent 和 collaboration runtime 分别维护 manager、全局单例、消息流与销毁路径；恢复和停止逻辑需要按 `sessionId`、`projectId` 或模糊匹配补偿。
- 两个 messages API Route 各自实现运行时选择、流事件转换、文本去重、工具事件和持久化，业务逻辑位于 `packages/web/src/app/`，与项目规约冲突。
- `SessionStore` 保存可变 `messages[]` 快照，Collaboration Runtime 另存 `RuntimeEvent` JSONL，Pi Task Runtime 又保存 branch entries。普通会话无法用一个统一事件序列解释模型输入、工具调用和恢复结果。
- 当前 `ToolRegistry` 是可变全局 Map，重复注册覆盖，scope 主要控制模型可见性；除受控 Pi Task 路径外，缺少统一的参数/结果校验、授权、超时、取消和审计管线。
- prompt、工具白名单和权限说明分散在 RoleAgent、Project Agent、Skill launcher、PersistentAgent 与 Collaboration prompt 中，存在“提示词声称禁止，但执行层仍可调用”的风险。
- Collaboration 事件使用开放的 `payload: Record<string, unknown>`，大量事件只适用于协作域；它不能直接成为全产品会话协议，但其中的单调 `seq`、correlation、provenance 和 JSONL 写入可保留。

## DeepSeek Harness 最值得借鉴的机制

### 1. 可组合运行时，而不是一个不断扩大的 Agent 类

DeepSeek Harness 把 agent loop、session、tools、LLM、permissions、compaction、subagent、workflow、UI bridge 都作为可装卸贡献。OriginOS 可以实现更小的内部 Kernel，不必引入 Cordis，但需要保留四个性质：

- 插件通过显式 context 获取依赖；
- 注册返回 disposer，卸载会撤销工具、事件监听和 provider；
- 启动失败按相反顺序回滚已安装贡献；
- preset 只描述组合，不承载业务实现。

建议最小接口：

```ts
interface HarnessPlugin {
  readonly id: string;
  setup(ctx: HarnessContext): void | (() => void) | Promise<void | (() => void)>;
}

interface AgentPreset {
  readonly id: string;
  readonly plugins: readonly HarnessPluginRef[];
  readonly toolRestriction?: ToolRestriction;
  readonly promptSections?: readonly string[];
  readonly executionProvider: string;
}
```

OriginOS 首期只需要进程内插件容器、依赖拓扑、重复 ID 拒绝、安装回滚和逆序释放。动态 npm 安装、自修改插件和复杂配置 patch 不属于首期。

### 2. 追加式 Session Event Log 是唯一交互事实源

DeepSeek Harness 从事件日志派生模型消息、UI、恢复、fork、telemetry 和 transcript。OriginOS 应把普通 session 的 `messages[]` 快照与 Collaboration JSONL 收敛为统一 envelope，并允许各能力扩展 payload。

```ts
interface SessionEvent<K extends SessionEventType = SessionEventType> {
  readonly sessionId: SessionId;
  readonly seq: number;
  readonly id: EventId;
  readonly type: K;
  readonly timestamp: string;
  readonly correlationId?: CorrelationId;
  readonly payload: SessionEventMap[K];
}
```

核心事件至少包括 `session/created`、`turn/start`、`user/message`、`step/start`、`assistant/chunk`、`assistant/message`、`tool/call`、`tool/result`、`step/end`、`turn/end`、`context/injected`、`compaction/summary`、`subagent/linked` 与 `session/ended`。

需要明确区分三类数据：

- **事实事件：** 只追加，不覆盖，参与恢复和审计；
- **投影：** messages、task cards、agent status、blackboard 和 UI timeline，可丢弃后重建；
- **artifact：** 大文件和大工具结果使用稳定引用，日志只保存内容摘要、类型、大小和地址。

OriginOS 不必永久记录每个 token。首期可以只在活动连接中发送细粒度 delta，同时持久化有序 chunk 或合并后的 assistant message；但必须规定崩溃时可接受的回放精度，并禁止像当前 `MESSAGE_SENT` 一样在没有替代事实时直接丢弃模型可见内容。

### 3. Turn / Step / Inbox 生命周期

建议统一定义：一个 turn 从一次可唤醒输入开始，到当前请求不再欠工作结束；一个 step 是一次模型请求及其产生的工具调用。所有输入通过 inbox：

```text
human / scheduler / subagent / system injection
                    │
                    ▼
             Agent Inbox (FIFO)
                    │
             turn → step → tools
                    │
          owe more work? ── yes ─┐
                    │            │
                    no ◄─────────┘
                    │
                 turn/end
```

这会替代当前散落的 `prompt()`、`continue()`、`resume()`、`handleMessage()`、SSE 断线补偿和 project/skill 特殊启动逻辑。输入接受后返回稳定 `messageId`；调用方取消只负责“接受之前”，turn 开始后的取消由 Agent handle 管理。

### 4. 不可绕过的 Tool Runtime

DeepSeek Harness 最值得优先借鉴的是工具管线。OriginOS 已在 Task Runtime 中证明“宿主调用也必须经过标准 Pi tool pipeline”，应把该原则推广到所有工具。

```text
resolve scoped definition
  → validate args
  → authorize / approve
  → beforeExecute policies
  → timeout + cancellation
  → provider execute
  → validate canonical result
  → afterExecute policies
  → append tool/result
  → derive model content + UI render intent
```

每个工具定义应同时声明：参数 schema、规范 JSON 结果 schema、超时、并发模式、执行函数、模型内容投影和纯 UI 投影。执行层负责记录最终结果，API Route、UI 和 Task Runtime 不得直接调用工具 body。

工具 scope 必须同时控制 schema 可见性与执行权限。`allowedTools` 空数组不能再隐式表示“允许全部”；应使用显式 `{ mode: "all" }` 或 `{ mode: "allow", names: [...] }`，未知工具和不支持的 provider capability 加载时失败。

### 5. Definition / Provider / Consumer 能力分层

建议将下列能力逐步拆成稳定定义、可替换 provider 和产品 Consumer：

| Capability | Definition | 首个 Provider | Consumer |
|---|---|---|---|
| LLM | `LlmRuntime` | Pi adapter | Agent driver |
| Session | `SessionRepository` | JSONL filesystem | Agent、UI、telemetry |
| Filesystem | `FileSystemRuntime` | local/Electron | file tools、workspace |
| Process | `ProcessRuntime` | local worker | bash、task worker、LSP |
| Tools | `ToolRuntime` | in-process registry | Agent、Task、Workflow |
| Interaction | `InteractionRuntime` | Electron/Web UI | approval、ask-user、HITL |
| Subagent | `SubagentRuntime` | worker / in-process | delegate/control tools |
| Workflow | `WorkflowRuntime` | Collaboration DAG | solution execution |
| Memory | `MemoryRuntime` | existing memory-core | prompt section、recall tools |
| Compaction | `CompactionRuntime` | deterministic basic provider | command/automatic policy |

Consumer 只能依赖 Definition。Electron、Next.js、worker 和具体存储包位于 Provider 侧。这个拆分与 OriginOS 现有单向依赖规约一致，比把所有逻辑继续放入 `packages/core/src/lib/integrations/pi-agent/` 更容易执行依赖检查。

### 6. Agent scope 与 preset

普通 Agent、RoleAgent、Project Agent、Skill Agent 和 Worker 的差异应由 preset 表达：

- 选择 execution provider；
- 安装 prompt sections；
- 解析 workspace、memory 和 credentials；
- 限制继承工具；
- 安装 task、workflow 或 subagent capability；
- 配置完成策略、预算和人工交互策略。

每个 live Agent 拥有子 scope。注册到子 scope 的 prompt、tool 和 policy 在 Agent 销毁时自动释放。这样可以删除当前全局 registry 加类型过滤、多个 manager 和 `globalThis` HMR 单例之间的隐式耦合。

### 7. Subagent 与 Workflow 分离

DeepSeek Harness 将“启动/继续一个子 Agent”和“执行一个 DAG/后台工作流”作为不同能力。OriginOS 当前 Collaboration Runtime 同时承担 worker 生命周期、DAG、消息、HITL、blackboard 和 UI，建议拆分但保留实现：

- `SubagentRuntime` 管理父子 lineage、深度、工具限制、取消、恢复和消息；
- `WorkflowRuntime` 管理 DAG、task dependency、checkpoint、预算和最终聚合；
- `AgentProvider` 决定子 Agent 在进程内、worker 进程或未来远端运行；
- blackboard 作为 workflow projection/artifact index，不再成为第二套会话消息系统。

子 Agent session 必须记录 `parentSessionId`，授权依据 durable lineage 与当前 live handle，不依据请求中的任意 sender 字符串。父 Agent 只通过显式 report 或 runtime settlement notice 接收结果。

### 8. 压缩、守卫与人工交互都是插件策略

当前 `OriginOSAgent` 内置字符数估算、截断、recent trace compression、completion judge 和 loop detector。建议迁移为独立策略：

- Compaction 从日志生成带来源范围的 summary event，不直接改写 canonical history；
- Tool result pruning 只改变后续模型投影，不删除原始结果或 artifact；
- repeat-call、deadline、budget 和 completion policy 独立安装；
- approval 与 ask-user 分开：approval 决定能否执行动作，ask-user 获取完成任务所需信息；
- 所有策略决定记录为事件或 telemetry，避免只存在日志文本中。

## 目标架构

```text
┌──────────────────────── Web / Electron / SDK ────────────────────────┐
│ commands · conversation projection · approvals · windows · artifacts │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ application ports
┌───────────────────────────────▼───────────────────────────────────────┐
│                         Harness Kernel                               │
│ plugin lifecycle · scopes · presets · service registry · typed events│
└──────────┬──────────────┬───────────────┬───────────────┬─────────────┘
           │              │               │               │
     Agent Runtime   Session Runtime   Tool Runtime   Interaction Runtime
     inbox/turn/step append/projection policy/execute approval/questions
           │              │               │               │
┌──────────▼──────────────▼───────────────▼───────────────▼─────────────┐
│                      Capability Providers                            │
│ Pi LLM · JSONL FS · local process · worker agent · DAG · memory-core │
└───────────────────────────────────────────────────────────────────────┘
```

建议新增包边界：

```text
packages/
  harness/             # context、plugin lifecycle、scope、preset loader
  runtime-agent/       # Agent Definition、inbox、turn/step driver、handle
  runtime-session/     # event types、repository、projection、JSONL provider
  runtime-tools/       # definition、schema、pipeline、policy、presentation
  runtime-interaction/ # approval、question、command definitions/providers
  runtime-subagent/    # lineage、provider registry、continuation/control
  runtime-workflow/    # workflow definition；适配现有 collaboration DAG
  providers-pi/        # 现有 Pi adapter 的 Harness provider
```

这些包可以先作为 `packages/core/src/runtime/` 内部模块落地，接口稳定后再物理拆包。不要在第一阶段同时移动所有文件。

## 分阶段迁移

### Phase 0：冻结语义并建立架构门禁

**目标：** 在重构前固定真实行为，避免把当前偶然行为当作新协议。

- 为普通聊天、RoleAgent、Project Agent、Skill、Task 与 Collaboration 各录制一条 keyless transcript fixture。
- 建立依赖检查：API Route 不得导入具体 manager/spawner；Consumer 不得导入 provider；禁止新增 `globalThis` runtime singleton。
- 定义 branded `SessionId`、`AgentId`、`MessageId`、`ToolCallId`、`EventId`，禁止在跨进程和持久化接口中使用裸字符串。
- 形成 Session Event、Tool Runtime 与 Agent lifecycle 三份 ADR；明确格式版本和拒绝旧格式策略。

**验收：** 当前六类入口有可重复基线；架构违规在 CI 中可失败；不改变用户行为。

### Phase 1：统一 Session Event Log 与投影

**目标：** 先统一事实，不先统一执行。

- 在 `runtime-session` 定义 typed event map、JSONL repository、连续 seq、原子 checkpoint、replay 与 projection。
- 普通 `AgentSessionService` 双写新事件日志和旧 messages snapshot；读取结果做一致性比较。
- 把 Collaboration `RuntimeEvent` 映射到统一 envelope；领域 payload 仍由 collaboration capability 拥有。
- UI 消息列表改读 projection；确认稳定后停止写旧 `messages[]`，迁移器一次性导入旧 session。

**验收：** 同一日志可重建模型 messages、UI transcript、tool timeline 和 session status；崩溃尾部与重复事件有确定处理；旧数据迁移失败会显式报错且不覆盖原文件。

### Phase 2：统一 Tool Runtime 与 Interaction

**目标：** 消除工具执行旁路。

- 将现有 registry 包装成 `ToolDefinition`，新增 output schema、timeout、concurrency 和 presentation。
- 把 Pi Task 的受控 host invoke 作为首个底层 dispatcher，所有调用入口改走 `ToolRuntime.execute()`。
- 将 `allowedTools` 迁移为显式 restriction；scope 同时控制 prompt schema 与 execute。
- 接入 approval、ask-user、abort signal、结构化错误和 `tool/call` / `tool/result` 事件。

**验收：** 模型、Task、Workflow、宿主命令调用同一工具时产生相同验证、权限和事件；未授权工具无法通过直接调用 execute 绕过；超时后进程和句柄达到静止。

### Phase 3：引入 Harness Kernel、scope 与 preset

**目标：** 用组合替代 manager 分支。

- 实现插件安装、回滚、disposer、service registry 与 agent child scope。
- 把 prompt 分层改为注册式 sections，按稳定 key 排序；每个 model request 从当前 scope 组装。
- 定义 `chat`、`role`、`project`、`skill`、`task`、`worker` presets，先代理现有实现。
- 逐步删除全局 `ToolRegistry`、`AgentManager`、`PersistentAgentManager` 和 spawner 的产品直接访问。

**验收：** 创建与销毁 1,000 次 Agent 后无残留注册、timer、listener 或 worker；未知插件、重复 provider、缺失 capability 在启动时失败；preset dump 可解释每个 Agent 实际获得的能力。

### Phase 4：统一 Agent Runtime 与 API 边界

**目标：** 所有 Agent 类型共享 inbox、turn/step 与 handle。

- 从 `OriginOSAgent` 抽出 Pi provider，保留模型事件适配；Kernel driver 拥有排队、turn/step、工具调度和 durable event。
- Role/Project/Skill 只提供 prompt、workspace、memory 与 tool restriction 插件。
- Web API Route 只做输入解析、调用 application service 和 SSE/HTTP 映射；合并两套 messages route 的流转换。
- Electron IPC、Web SSE 与未来 SDK 共享同一 application service，不直接持有 agent/spawner。

**验收：** 每个 accepted input 有一个稳定 messageId 和唯一顺序；恢复后模型历史与日志投影一致；abort、close、reload 和 disconnect 不依赖 fuzzy ID 查找。

### Phase 5：收敛 Subagent、Workflow、Compaction 与可观测性

**目标：** 复用现有多 Agent 能力，同时去掉平行控制面。

- 用 `SubagentProvider` 适配现有 worker spawner，记录 lineage、depth、capabilities 和 settlement。
- 用 `WorkflowProvider` 适配现有 DAG/Supervisor；Task 与 blackboard 变为统一日志的领域事件和投影。
- 将 memory-core、completion、loop guard、compaction 和 cost controller 注册为策略插件。
- telemetry 从 Session Event 派生 trace/cost/latency，日志中只保留必要诊断，不作为事实源。

**验收：** 子 Agent 可冷恢复、父子权限不可伪造、父进程释放按 child-first 顺序；Workflow 重放不重复完成 Task；压缩前后任务事实、工具结果引用和 UI transcript 可追溯。

## 不建议照搬的部分

- **不整体引入 Cordis。** OriginOS 的首要问题是统一语义，不是框架选型；先实现满足自身需求的最小 Kernel。
- **不立即拆成数十个 npm 包。** 先建立接口和依赖门禁，再根据独立发布、独立 provider 或依赖重量拆包。
- **不引入 SQLite。** 当前项目明确采用文件存储；JSONL、checkpoint、索引投影和内容寻址 artifact 足够支撑本阶段。
- **不开放运行时自修改。** 动态安装第三方插件扩大供应链和权限风险，应在签名、权限与隔离模型成熟后单独设计。
- **不把全部流 token 永久保存作为硬要求。** 根据 UI 回放和崩溃恢复目标选择 chunk 粒度，但最终 assistant 内容与模型可见输入必须可重建。
- **不同时重写 Pi Agent、Task Runtime 和 Collaboration DAG。** 它们作为 provider 逐步接入新 Kernel，先加适配层，再删除旧控制面。

## 风险与控制

| 风险 | 控制措施 |
|---|---|
| 双写期间日志与旧快照不一致 | 每次 turn 后对 projection 做 hash 比较；差异阻止切换读路径 |
| 新抽象只包裹旧全局单例 | 架构测试禁止 application/consumer 导入 concrete manager；scope disposal 必须可测 |
| 事件类型演变破坏旧数据 | 单调 `SESSION_FORMAT_VERSION`；未知 required event 拒绝加载；可忽略事件显式标记 |
| 工具取消后后台工作仍运行 | Tool contract 要求传播 signal；subprocess provider 负责进程树终止并等待静止 |
| prompt section 顺序改变模型行为 | 稳定 key 与优先级；每个 preset 使用 keyless snapshot 固定 model-visible transcript |
| 多 Agent 状态再次分叉 | Workflow/blackboard 只保存领域事件或投影，不再保存独立聊天历史 |
| 一次性迁移范围过大 | 每 Phase 独立 Story / Proposal；旧路径只在双写验证期保留，切换后立即删除 |

## 架构完成定义

以下条件全部满足，才可以认为 Harness 升级完成：

- 任意 Agent 的下一次模型请求都能由 session log + 当前 preset 确定性重建；
- 所有工具调用都经过同一 Tool Runtime，执行权限与模型可见性一致；
- Agent 类型只由 preset 和 provider 组合决定，API Route 中没有 Agent 类型运行分支；
- sessionId、agentId、projectId 的用途明确，不再通过模糊匹配查找 runtime；
- reload、abort、close、worker crash 与 host shutdown 有一套可测试的生命周期语义；
- 普通聊天、Task、Workflow 和 Subagent 共享会话 envelope、artifact 引用与 telemetry；
- 新增模型、文件系统、进程、Subagent 或 Workflow provider 不需要修改 Agent loop；
- 每个非平凡用户可见变更都有真实入口的 keyless transcript、失败路径和恢复测试。

## 建议的首个实施切片

第一个 Proposal 只做 **Phase 0 + Phase 1 的普通聊天 vertical slice**：定义 Session Event v1，把 `POST /api/agent/sessions/{sessionId}/messages` 的 user message、assistant message、tool call/result 和 turn end 双写到新 JSONL，并用投影与现有 `AgentSessionService` 结果做 hash 对比。它不改变 UI、不迁移 Collaboration、不重写 Pi Agent，也不删除旧存储。

这个切片能最快验证最关键的架构判断：统一事件日志能否成为 OriginOS 的产品事实源。通过后再推进 Tool Runtime；如果它不能稳定重建普通聊天，就不应继续搭建插件 Kernel。
