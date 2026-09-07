## Context

Story 9.41 选择 `pi-tasks` 作为 Task、Step、Criterion、Evidence、Blocker 和完成状态
的事实源。A-01 已确认 `pi-tasks@0.2.0` 能作为 extension 加载并在 current branch
持久化，但 Pi Runtime `0.80.10` 没有公共 host tool invocation API；直接调用
`ToolDefinition.execute()` 会绕过 schema、permission、hooks 和标准 events。

同时，`pi-tasks:state` 只有 `lastUpdatedAt`，没有稳定 revision；现有 reducer 允许
`force_with_reason` 绕过 Blocker、Step、Criterion 和 Evidence Gate，store/replay 也
没有 request 去重与 optimistic concurrency。仅由 Adapter 扫描公共 entry 无法在
崩溃恢复、分支冲突和重复 event 下提供可信事务语义。因此本设计采用三个窄边界：
Pi Runtime 公共单工具执行 primitive、受控 `@originos/pi-tasks` fork，以及
OriginOS Task Runtime Adapter。

精确版本、patch fingerprint、owner 与回滚边界见
[`compatibility-matrix.md`](compatibility-matrix.md)。

## Goals / Non-Goals

**Goals:**

- 在原 Pi Session/current branch 中通过标准 pipeline 调用 task tool。
- 提供稳定 revision/cursor、requestId 幂等和 crash replay。
- 同时约束宿主与模型路径，禁止 `force_with_reason`。
- 维持 `pi-tasks` canonical state ownership，不复制 reducer/store。
- 在不启用产品 Task Runtime 的前提下重新通过 TC-C1、TC-C2、TC-C3。

**Non-Goals:**

- 不实现 Story 9.41 的任务入口、Task 卡片、IPC、lease、continuation 或 UI。
- 不引入 Workflow、多 Agent、DAG、Worker 或新 Session。
- 不改变普通聊天或 Chat Completion Guard。
- 不把 process-local adapter cache 作为事实源。

## Decisions

### 1. 使用精确版本的受控 Runtime patch

通过 pnpm `patchedDependencies` 对
`@earendil-works/pi-coding-agent@0.80.10` 增加
`AgentSession.invokeRegisteredTool()` 公共方法。Patch 必须是最小 diff，进入 Git，
由 `packages/agent` owner 维护，并在 runtime upgrade 时强制重新验证。

该方法在 package 内部复用现有 `_toolRegistry`、参数准备、schema validation、
`agent.beforeToolCall`、`agent.afterToolCall` 和 `_emit`，不在 OriginOS 侧复制
agent-loop 私有算法。它只执行单个工具调用，不追加 assistant/toolResult message，
不伪造 turn/agent events。

**替代方案：**

- 直接调用 `ToolDefinition.execute()`：已被 ADR-009 拒绝，会绕过标准管线。
- 在 `packages/agent` 重写 pipeline：升级时易漂移，无法证明与模型路径一致。
- 长期维护完整 Pi fork：改动面和升级成本过高；当前只需要一个窄公共 primitive。

### 2. 使用精确版本的受控 `pi-tasks` fork

新增 workspace package `@originos/pi-tasks`，以 `pi-tasks@0.2.0` 为明确上游基线，
只维护下列差异：

- event envelope v2：记录 requestId、revision、parentCursor 和 payloadHash；
- current branch replay：重建 request index、revision、cursor 和 state hash；
- state event v2 与 mutation receipt；
- 移除 `force_with_reason` schema、event 字段和 reducer bypass；
- 根级公共类型、extension factory 和 replay contract export。

Task、Step、Criterion、Evidence、Blocker 和完成门禁的业务规则仍以该 fork 内的
上游 reducer 为唯一实现，Adapter 与 Core 不复制状态机。Fork 能读取 v1/v2 ledger，
但只写 v2；旧 v1 forced completion 标记为 `legacy_forced_completion`，不得作为可信
完成证据。

**替代方案：**

- 仅由 Adapter 扫描 branch entries：不能原子地建立 CAS、request 去重和 receipt。
- 在 Adapter 复制 reducer：产生两个事实源并使升级不可审计。
- 继续直接依赖未受控 `pi-tasks@0.2.0`：无法关闭强制完成旁路。

### 3. OriginOS public export 使用独立边界

新增 `@originos/pi-agent-adapter/task-runtime`。它暴露：

```ts
interface PiTaskExecutionScope {
  sessionId: string;
  expectedCursor: string | null;
}

interface PiTaskCommand {
  requestId: string;
  expectedRevision: number;
  scope: PiTaskExecutionScope;
  toolName: PiTaskToolName;
  input: Record<string, unknown>;
}

interface PiTaskCommandResult {
  requestId: string;
  toolCallId: string;
  taskId?: string;
  revisionBefore: number;
  revisionAfter: number;
  cursorBefore: string | null;
  cursorAfter: string;
  eventId: string;
  stateHash: string;
  replayed: boolean;
  snapshot: PiTaskContractSnapshot;
  isError: boolean;
  error?: PiTaskCommandError;
}
```

调用方只依赖该 export，不接触 runtime patch 类型、extension store 或 reducer。
Adapter 仅允许 Story 9.41 所需 task tools，并在调用前校验 Session、branch、idle、
expectedRevision 和 requestId。

### 4. Revision、cursor 与 mutation receipt 由 fork 原子维护

受控 fork 在 Session 级 mutex 内执行“校验、reduce、append、receipt”，并遵守：

- `revision`：current branch 上已接受 task mutation 的单调序号；
- `cursor`：最后一个已接受 task event 的 Pi Session entry id；
- `expectedRevision`：optimistic concurrency guard；
- `expectedCursor`：current branch leaf/CAS 位置；
- 每个成功 mutation 恰好增加一次 revision，并返回可关联的 receipt。

Fork 从 current branch entry 顺序重建 revision 和 request index，不依赖时间戳或
process-local counter。Compaction snapshot 保存 revision、request index 摘要和
state hash，但 compaction 本身不伪装为业务 mutation。

**替代方案：**

- 使用 `lastUpdatedAt`：时钟碰撞、回拨和重放都不满足单调性。
- process-local counter：重启和 branch replay 后不可恢复。

### 5. 公共 state event v2

受控 fork 通过公共 Pi extension event bus 发出：

```ts
interface PiTaskStateEventV2 {
  version: 2;
  reason: "session_start" | "session_tree" | "task_mutation" | "compaction";
  scope: {
    sessionId: string;
    cursor: string | null;
    revision: number;
  };
  mutation?: {
    requestId: string;
    command: PiTaskToolName;
    eventId: string;
  };
  stateHash: string;
  state: PiTaskContractSnapshot;
}
```

Adapter 只消费公共 v2 event/receipt，不读取 fork 私有 store/reducer。

### 6. 通过 companion extension 约束 permission

Adapter 提供 `createPiTaskRuntimeBridge()`，返回需要与 `pi-tasks` 一起加载的 inline
extension 和 host gateway。Inline extension 同时监听 `tool_call`：

- 对 task tool 执行 OriginOS allowlist；
- 对不符合 fork v2 command scope 的调用 fail closed；
- 不修改合法参数，不绕过其他 permission handler。

Bridge 生命周期绑定 AgentSession。Session reload/switch 后旧 bridge epoch 失效，
stale gateway 调用必须失败。

### 7. requestId 幂等由 canonical ledger 实现

受控 fork 的 v2 task event 与 mutation receipt 共同记录 requestId 和 payloadHash：

- 同一 requestId 与相同 payloadHash：返回原 receipt，不追加 entry；
- 同一 requestId 与不同 payloadHash：返回 `DUPLICATE_REQUEST_CONFLICT`；
- expectedRevision 不匹配：返回 `REVISION_CONFLICT`；
- expectedCursor 不匹配：返回 `BRANCH_CONFLICT`；
- 重启后从 current branch entries 重建 request index。

不再由 Adapter 写 reservation/commit custom entry，避免 task ledger 与 adapter ledger
发生无法原子提交的双写窗口。

### 8. 完成门控不提供强制旁路

受控 fork 从 `task_complete` schema 删除 `force_with_reason`，从 v2 completion event
删除对应字段，并让 reducer completion validation 不再接收 bypass 参数。旧 v1
forced completion 仅为迁移读取，必须标记 integrity 风险。

### 9. Session busy 与事件语义

`AgentSession.invokeRegisteredTool()` 在执行期间进入 Session busy 状态，使
`isIdle`/`waitForIdle()` 与 prompt、reload、compaction、branch 操作互斥。事件顺序：

```text
tool_execution_start
schema / beforeToolCall / permission
tool_execution_update*
tool execute
afterToolCall
tool_execution_end
```

Schema 或 permission 失败也必须产生配对 end event。Host command 不产生
`message_start/end`、`turn_start/end` 或 `agent_start/end`。

### 10. 架构和 subagent 写入边界

- Runtime patch worker：`patches/`、`pnpm-workspace.yaml`、runtime patch contract。
- Task fork worker：`packages/pi-tasks/`，不修改 Adapter/Core/Desktop。
- Adapter worker：`packages/agent/src/task-runtime-*`、public entry、types、build/export。
- Contract worker：Core A-01 harness/tests，不修改 adapter 实现。
- Packaging worker：Desktop scripts/workflow，不修改 runtime/core。
- Integration owner：Proposal artifacts、ADR、Story 状态和冲突处理。

依赖方向保持 `desktop/core -> @originos/pi-agent-adapter -> patched upstream runtime`；
adapter 不依赖 core/web/desktop，core 不导入 `pi-tasks` 私有实现，符合
AGENTS.md 单向依赖规约。

## Concurrency and Recovery

- Runtime gateway 与 fork mutation 使用同一 Session 级 mutex；busy 时 fail fast，不排队。
- `expectedRevision` 是 optimistic concurrency guard。
- `requestId + payloadHash` 是幂等键。
- Cursor 在 reduce 前、entry append 后、receipt 返回前均校验。
- Mutation、checkpoint 与幂等 replay 在使用内存投影前，必须确认该投影对应当前
  `SessionManager.getBranch()` 上最新合法 Task ledger；切换 sibling branch 后未 replay 的
  stale store 必须 fail closed，禁止把旧分支状态写入或返回给新分支。
- State event wait 有固定 timeout，结束后移除 listener。
- Reload/switch 递增 bridge epoch，旧调用和迟到 event 被隔离。

Pi Runtime `0.80.10` 的 Session branch entry 在进程内不可变且存储是 append-only；compaction entry 只改变发送给 LLM 的
context 构造，不删除 `getBranch()` 上已持久化的 custom entries。因此正常 restart、branch
和 compaction replay 必须读取完整 current branch，所有历史 requestId 仍可由原 mutation
envelope 恢复。仅剩单个 checkpoint 的 snapshot-only bootstrap 属于降级恢复路径，只承诺
`receiptWindow` 明示的近期幂等窗口，不得等同于正常 compaction 语义。

Store 在初始化、reload 和 branch switch 时执行完整 replay；稳定 branch 的 mutation 热路径
使用已验证 tail anchor 并只扫描新增 entry。进程外改写 anchor 之前的历史、同时伪装未变化
的 tail，违反可信 append-only 存储边界，不属于 A-02 的攻击模型。

## Performance and Security

- 每次 mutation 只 replay current branch 的 task entries；实现须维护有界索引并在
  Session 恢复时一次构建，不能在 text delta 热路径运行。
- Snapshot 最大 64KB，诊断只记录 id、revision、cursor、hash 和错误分类。
- Session JSONL 在本地数据模型中是可信 canonical storage；checkpoint hash 用于发现
  accidental corruption、partial write 和字段漂移，不提供针对可任意修改并重新计算 hash
  的本地攻击者的密码学认证。
- 禁止记录 prompt、task 正文、凭据、用户 home path 和完整 tool output。
- `inputHash` 使用稳定 JSON canonicalization 与 SHA-256。
- Tool allowlist 和 force policy 均 fail closed。

## Risks / Trade-offs

- [Risk] Runtime patch 可能在升级时无法应用 → 锁定精确版本与 patch hash，升级前
  运行 clean install 和 contract suite。
- [Risk] 当前 runtime 的 `tool_call` hook 可修改参数后不再次 schema validation →
  本 Proposal 保持既有模型路径语义，并禁止 adapter policy 修改参数；后续向上游
  单独提出二次校验改进。
- [Risk] 受控 fork 与上游演进分叉 → 保存 upstream commit、差异清单和兼容矩阵，
  每次升级重新执行 A-01/A-02 contract。
- [Risk] Crash 发生在 entry append 与 receipt 返回之间 → requestId/payloadHash 已在
  canonical event 中持久化，重试从 replay 返回原 receipt。
- [Risk] Task canonical state 自身超过 64KB 时，即使移除全部 receipt 仍无法写入单个
  checkpoint → extension 必须返回明确的 `CHECKPOINT_TOO_LARGE`，不得写入部分 snapshot；
  分片或外部 canonical state 引用不在 A-02 范围，作为后续存储演进项保留。
- [Risk] snapshot-only bootstrap 的 receipt window 会淘汰旧 requestId → 正常 Pi
  compaction/restart 必须使用 append-only full branch replay；降级 bootstrap 只对窗口内
  requestId 提供原 receipt replay，并通过 retained/omitted 元数据暴露边界。
- [Risk] pnpm patch 修改发布包 dist → patch 文件是唯一源码，禁止直接提交
  node_modules；package smoke 必须验证 CJS/ESM 和 ASAR。

## Migration Plan

1. 添加 runtime patch、patch hash verification 和公共单工具 contract。
2. 添加受控 `@originos/pi-tasks` fork、v1/v2 replay 与 Evidence Gate contract。
3. 添加 adapter public export 和 bridge。
4. 更新 A-01 Core contract 与 Desktop package smoke。
5. 在 Windows/macOS release artifact 上验证。
6. 新建 superseding ADR；全部门禁通过后将 Story 9.41 从 blocked 改为 ready。

回滚时移除 public export、patch 配置和验证 wiring，恢复 ADR-009；不迁移用户数据。

## Open Questions

- 上游是否接受 `AgentSession.invokeRegisteredTool()` API；A-02 合并不以等待上游发布
  为前提，但必须记录 upstream issue/PR。
- Windows/macOS artifact 验证需要在 Proposal 合并前由现有 release workflow 执行；
  本地 contract 不能替代平台证据。
