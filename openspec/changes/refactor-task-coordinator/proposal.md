# Proposal: refactor-task-coordinator（AG.10-T3 task-runtime/coordinator.ts 巨型文件拆分）

**epic-id:** AG
**story-id:** AG.10
**task-id:** AG10-T3
**owner:** Archersado
**来源 Story 文档：** `docs/specs/epic-AG/story-AG.10/`（README / requirements / architecture / testing）

## Why

`packages/core/src/lib/integrations/pi-agent/task-runtime/coordinator.ts` 当前 1142 行（与 2026-09-28 Story 基线一致），是 Story AG.10 FR-4 风险序列第 3 个拆分对象。现状盘点（2026-09-30 逐段核对）：

| 区块 | 行范围 | 职责 |
|------|--------|------|
| imports + 类型 | 1–108 | 4 组 import、`TaskBranchEntry`/`TaskHostScope`/`TaskHostTool`/`TaskHostState`/`TaskSessionHost`/`TaskSessionHostFactoryOptions`/`TaskSessionHostFactory`/`AgentTaskRuntimeCoordinatorOptions` |
| 错误类 | 110–116 | `AgentTaskRuntimeConflictError`、`AgentTaskRuntimeProtocolError` |
| 模块级 helper | 118–169 | `toTaskBranchEntries`、`defaultHostFactory`（动态 import adapter）、`internalUserMessage`、`visibleUserMessage`、`taskStatusFromProjection`、`isActiveExecution`、`errorMessage` |
| `AgentTaskRuntimeCoordinator` 类 | 171–1142 | **约 971 行单类**：host 生命周期与订阅（initialize/applyHostState/destroy）、Project metadata mutation（updateProjectTaskMetadata/mutateProjectTaskMetadata）、Evidence（recordVerifiedEvidence）、Review（requestReview/approveCompletion/rejectReview/mutateReview/completionInput）、任务生命周期（createTask/controlTask/submitUserReply/resumeAfterRestore）、任务工具安装（installTaskTools/restoreBaselineTools）、续跑循环（startContinuationLoop/runContinuationLoop/applyContinuationDecision/buildContinuationPrompt/invokeReadOnlyTaskTool）、任务控制（pauseTask/cancelTask/resumeTask/retryTask）、状态与持久化（getSnapshot/getPersistenceState/updateFromProjection/emitCompletionMessage/flushCompletionMessage/fail/requireHost/publishState/queuePersist）、请求校验（assertCreateRequest/assertControlRequest） |

单类混合了 host 桥接、协议门面（Evidence/Review/Metadata 三端口）、任务生命周期控制、续跑循环与持久化五类职责。Story architecture.md T3 方案：「拆出：任务状态机、调度循环、结果聚合」。

消费面（已核查，拆分后全部零改动）：

- 包内：`task-runtime/index.ts` `export * from "./coordinator"`；`agent-manager.ts`、`features/agent/session-service.ts`、`features/project/*`（7 文件）、`modules/collaboration-runtime/facade/task-runtime-evidence-sink.ts` 全部经 `./task-runtime` 或 `../../integrations/pi-agent/task-runtime` 目录导入（零改动）
- core exports：`./lib/integrations/pi-agent/task-runtime/coordinator` 条目 target 指向该文件
- 跨包深路径导入仅 2 处（desktop）：`agent-task-runtime-ipc.ts` 与其测试，导入 `AgentTaskRuntimeCoordinator` 类型
- 测试：`task-runtime/__tests__/coordinator.test.ts`（517 行）相对导入 `from "../coordinator"`

## What Changes

- **C1 类型拆出**：`TaskBranchEntry`/`TaskHostScope`/`TaskHostTool`/`TaskHostState`/`TaskSessionHost`/`TaskSessionHostFactoryOptions`/`TaskSessionHostFactory`/`AgentTaskRuntimeCoordinatorOptions`（1–108 中的类型部分）移至 `task-runtime/coordinator-types.ts`，逐字移动（`AgentTaskRuntimeCoordinatorOptions` 保持导出）。
- **C2 错误类与模块级 helper 拆出**：两个 Error 类（110–116）与 7 个模块级函数（118–169）移至 `task-runtime/coordinator-shared.ts`，逐字移动（错误类保持导出）。
- **C3 Project metadata / Evidence / Review 命令拆出**：`mutateProjectTaskMetadata`、`recordVerifiedEvidence`、`mutateReview`、`completionInput` 四个方法体移为模块级函数（`coordinator-commands.ts`），闭包对 `this.*` 的引用改为显式 ctx 对象字段（变换规则见 design.md D3，本 Proposal 唯一允许的非逐字变换）；对应公共方法保留在类内作薄委托。
- **C4 任务控制动作拆出**：`pauseTask`/`cancelTask`/`resumeTask`/`retryTask`/`invokeReadOnlyTaskTool`/`buildContinuationPrompt` 移至 `coordinator-controls.ts`（同 D3 变换规则）。
- **C5 主类收敛**：`AgentTaskRuntimeCoordinator` 保留在 `coordinator.ts`——host 生命周期、initialize/createTask/controlTask/submitUserReply、续跑循环（runContinuationLoop 等）、状态机与持久化不外移（与 Story T3「调度循环保留」语义一致：拆出的是状态机 helper 与控制动作，循环编排仍在主类）；文件顶部补单句职责注释（FR-3）。
- **C6 导出符号不变**：全部 4 个公共符号（`AgentTaskRuntimeCoordinator`、`AgentTaskRuntimeConflictError`、`AgentTaskRuntimeProtocolError`、`AgentTaskRuntimeCoordinatorOptions`）保持从 `coordinator.ts` 可导入（re-export 或原位）；`index.ts` 的 `export * from "./coordinator"` 不变。
- **C7 每个新文件顶部一句话职责注释**（FR-3）。

## 硬约束（来自 Story requirements / testing）

- 纯机械移动：除 D3「this.* 引用 → ctx 字段」改写外，不改任何逻辑、不改方法调用顺序、不新增抽象接口。
- **导出符号不变**：4 个公共符号集合与语义不变；全仓调用方 import 零改动（2 处 desktop 深路径 + 包内目录导入全部原样）。
- `coordinator.test.ts`（517 行，5 个 describe）全绿；desktop `agent-task-runtime-ipc.test.ts` 全绿。
- madge 循环数 ≤ 基线 12（core）。
- 行数达标：新文件单文件 ≤ 600 行；`coordinator.ts` 预期 ≤ 700（原 971 行类减去外移方法体，编排类上限 800 备用，预期不触发）。

## 非目标

- 不改任务状态机语义（`taskStatusFromProjection`/fingerprint/续跑决策逻辑原样）。
- 不动 `types.ts`、`projection.ts`、`continuation-controller.ts`、`index.ts`。
- 不改 IPC 协议、持久化格式（`AgentTaskRuntimePersistenceV1`）。
- 不新增/删除 exports 条目。

## Capabilities

### 新增

- `pi-agent-task-coordinator-structure`：task-runtime coordinator 的文件结构约束——类型/共享 helper/命令方法体/控制动作分文件存放，主类保留 host 生命周期与续跑循环编排；公共导出符号与行为不变。

## Impact

- **修改**：`packages/core/src/lib/integrations/pi-agent/task-runtime/coordinator.ts`（1142 → 预期 ~650 行）
- **新增**：`task-runtime/` 下 3 个新文件（coordinator-types / coordinator-shared / coordinator-commands / coordinator-controls，共 4 个）
- **不改**：`index.ts`、types/projection/continuation-controller、全部消费方 import（包内目录导入 + desktop 2 处深路径均原样）
- **风险**：方法体外移引入 this 绑定偏差（D3 ctx 只读字段 + 现有 517 行测试兜底）；exports 深路径 target 不变无需改 package.json（零风险）

## 依赖

- 无前置 Proposal 依赖（T1/T2 已合并，无共享文件）。T4–T7 与本 Proposal 无交集。

## 上线方案

单一 Proposal 集成分支 `proposal/refactor-task-coordinator`（从 `refactor/arch-governance` 创建，沿用既定偏差——dev 落后 114+ 提交）；应用源码在 subagent Task worktree 实施；完成后按 TC-1~TC-6 全量验证，合并回 `refactor/arch-governance`（需用户授权）。

## 回滚方案

全部为 git 可逆操作：revert 拆分 commit 即恢复单文件形态。拆分期间每步移动后立即验证 core 类型检查与 coordinator 测试，不存在中间态上线窗口。
