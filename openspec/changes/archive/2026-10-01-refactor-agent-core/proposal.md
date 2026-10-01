# Proposal: refactor-agent-core（AG.10-T5 pi-agent/core/agent.ts 巨型文件拆分）

**epic-id:** AG
**story-id:** AG.10
**task-id:** AG10-T5
**owner:** Archersado
**来源 Story 文档：** `docs/specs/epic-AG/story-AG.10/`（README / requirements / architecture / testing）

## Why

`packages/core/src/lib/integrations/pi-agent/core/agent.ts` 当前 1912 行，是 Story AG.10 FR-4 风险序列第 5 个拆分对象。现状盘点（2026-09-30 逐段核对）：

| 区块 | 行范围 | 职责 |
|------|--------|------|
| imports | 1–73 | pi-agent-adapter、health/server-config/llm-config、loop-detector/bash-tools、prompt-boundary、completion-guard/judge、runtime-history、tool-event-status 等 20+ 组 |
| 模块级 helper | 75–196 | `EventEmitter<T>` 类、`normalizeStreamProvider`、`hashText`、`previewText`、`previewToolResult`、`getMessageText`、`getPromptText`、`redactErrorForLogging`、`logInfo`（模块私有，1 处 this 无关） |
| Completion Judge 支撑 | 198–251 | 常量 `COMPLETION_JUDGE_*`、`CompletionJudgeFailureCategory`、`CompletionJudgeAttemptError`、`SyntheticSystemMessage`/`SyntheticUserMessage` 类型 |
| `AgentCompletionPolicy`/`AgentExecutionOptions` | 236–250 | 导出类型 |
| `OriginOSAgent` 类 | 252–1743 | **约 1492 行单类**：38 个字段 + 构造器（322–340）、`initialize`（341–601，262 行——streamFn 包装/模型装配/Agent 实例化）、事件路由（`routeAgentEvent`/`emitUiEvent` 602–727）、completion guard/judge（`resetCompletionGuard`/`throwIfModelStreamFailed`/`judgePendingCompletion` 728–912，285 行 + `runWithEmptyStopRecovery`/`runWithCompletionGuard`/`emitCompletionFailureReport` 905–1045）、生命周期与执行（`start`/`handleAgentEvent`/`applyLoopProtection`/`prompt`/`continue` 1046–1509）、set/get 工具与上下文 API（1510–1743） |
| 导出类型与工厂 | 1745–1912 | `SessionData`、`CreateOriginOSAgentParams`、`createOriginOSAgent`（模型选择分支树 ~95 行） |

单类混合了流式事件路由、completion 判定/恢复、模型与凭证装配、执行编排、上下文注入七类职责。Story architecture.md T5 方案：「拆出：模型装配、流式事件处理、completion guard」。

消费面（已核查，拆分后全部零改动）：

- 包内：`core/index.ts` `export * from "./agent"`（零改动）；`agent-manager.ts`/`persistent-agent.ts`/`store.ts`/`health.ts`/`session-store.ts` 经 `./core/agent` 导入（零改动）
- 测试：15 处相对导入/动态导入/vi.mock（`store.test.ts` mock `"./core/agent.js"`、hooks 测试 mock `"../../core/agent.js"`、`agent.test.ts` 导入 `../agent` 等）——主文件路径与符号集合不变则全部零改动
- 跨包：desktop `agent-worker-runtime-deps.ts` 1 处 side-effect 导入 `@originos/core/lib/integrations/pi-agent/core/agent`（零改动）
- core exports：`./lib/integrations/pi-agent/core/agent` 条目 target 指向该文件（零改动）

## What Changes

- **C1 模块级 helper 拆出**：`EventEmitter` 类 + 8 个纯函数（`normalizeStreamProvider`/`hashText`/`previewText`/`previewToolResult`/`getMessageText`/`getPromptText`/`redactErrorForLogging`/`logInfo`）+ `COMPLETION_JUDGE_*` 常量与 judge 类型/错误类 + `SyntheticSystemMessage`/`SyntheticUserMessage` 类型移至 `core/agent-internals.ts`，逐字移动；被 agent.ts 消费的符号在此文件导出（internal，不经 index.ts 对外包出）。
- **C2 模型装配拆出**：`createOriginOSAgent` + `CreateOriginOSAgentParams` + `SessionData` 移至 `core/agent-factory.ts`，逐字移动（3 个公共符号经 agent.ts re-export 保持可导入）。
- **C3 completion judge/guard 拆出（D3 ctx 变换，唯一非逐字变换）**：`judgePendingCompletion`（728–911）、`runWithEmptyStopRecovery`（912–952）、`runWithCompletionGuard`（953–1012）、`emitCompletionFailureReport`（1013–1045）四个方法体提升为 `core/agent-completion.ts` 模块级函数（`runJudgePendingCompletion(ctx)` 等），`this.*` → `ctx.*`；`COMPLETION_JUDGE_*` 常量与 judge 错误类随迁（从 agent-interals.ts 导入或直接定义于本文件，以不重复为准——judge 专属常量/类型放本文件）。主类保留薄委托（`protected async judgePendingCompletion(): Promise<void> { return runJudgePendingCompletion(this.createCompletionCtx()); }`），不改方法可见性与调用方。
- **C4 主类收敛**：`OriginOSAgent` 保留在 `agent.ts`——字段/constructor/initialize/事件路由/生命周期/执行/set-get API 不外移；`AgentCompletionPolicy`/`AgentExecutionOptions` 类型留主文件（与类强耦合）；文件顶部补单句职责注释（FR-3）。
- **C5 导出符号不变**：6 个公共符号（`AgentCompletionPolicy`/`AgentExecutionOptions`/`OriginOSAgent`/`SessionData`/`CreateOriginOSAgentParams`/`createOriginOSAgent`）保持从 `agent.ts` 可导入；`core/index.ts` 的 `export * from "./agent"` 不变。
- **C6 每个新文件顶部一句话职责注释**（FR-3）。

## 硬约束（来自 Story requirements / testing）

- 除 D3 ctx 变换（C3 四个方法体）外，其余全部逐字移动；不改任何逻辑、调用顺序、事件语义。
- **导出符号不变**：6 个公共符号集合与语义不变；全仓消费方 import 零改动（15 处测试导入/vi.mock + 5 处包内生产导入 + 1 处 desktop side-effect 导入全部原样）。
- `core/__tests__/agent.test.ts`（88 用例）全绿；`agent-token-estimate`/`runtime-history-restore`/`completion-guard`/`completion-judge` 测试全绿；web/desktop 测试基线不回退。
- madge 循环数 ≤ 基线 12（core）。
- 行数达标：新文件单文件 ≤ 600 行；`agent.ts` 预期 ≤ 1500（编排类上限 1600 备用——1492 行类体减去外移 4 方法 ~370 行后约 1120 行 + re-export/import，预期不触发备用）。

## 非目标

- 不改 completion 判定语义（`assessCompletion` 调用、`piAi.completeSimple` judge 请求、deferred 事件时序原样）。
- 不改 `initialize` 的 streamFn/凭证装配逻辑（本任务不外移 initialize——262 行与 14 个 this 字段交织，外移 ctx 改写面大于收益，偏差已在 design 记录）。
- 不动 `completion-guard.ts`、`completion-judge.ts`、`runtime-history.ts`、`skills.*` 兄弟文件。
- 不新增/删除 exports 条目。

## Capabilities

### 新增

- `pi-agent-core-agent-structure`：pi-agent core agent 的文件结构约束——内部 helper、agent 工厂、completion judge/guard 分文件存放，`OriginOSAgent` 主类保留事件路由与执行编排；公共导出符号与行为不变。

## Impact

- **修改**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`（1912 → 预期 ~1500 行）
- **新增**：`core/` 下 3 个新文件（agent-internals / agent-factory / agent-completion）
- **不改**：`core/index.ts`、全部消费方 import、core exports 条目（零风险）
- **风险**：completion 4 方法体外移引入 this 绑定偏差（D3 ctx + 88 用例 agent.test 兜底）；judge 方法是 `protected`（薄委托保留可见性）；vi.mock 路径以主文件为锚不受影响

## 依赖

- 无前置 Proposal 依赖（T1–T4 已合并，无共享文件）。T6/T7 与本 Proposal 无交集（contract-execution.ts 与 supervisor-dag.ts 在 collaboration-runtime 模块）。

## 上线方案

单一 Proposal 集成分支 `proposal/refactor-agent-core`（从 `refactor/arch-governance` 创建，沿用既定偏差——dev 落后 114+ 提交）；应用源码在 subagent Task worktree 实施；完成后按 TC-1~TC-6 全量验证，合并回 `refactor/arch-governance`（需用户授权）。

## 回滚方案

全部为 git 可逆操作：revert 拆分 commit 即恢复单文件形态。拆分期间每步移动后立即验证 core 类型检查与 agent 测试，不存在中间态上线窗口。
