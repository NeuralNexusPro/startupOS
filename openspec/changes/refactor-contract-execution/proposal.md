# Proposal: refactor-contract-execution（AG.10-T6 collaboration-runtime/facade/contract-execution.ts 巨型文件拆分）

**epic-id:** AG
**story-id:** AG.10
**task-id:** AG10-T6
**owner:** Archersado
**来源 Story 文档：** `docs/specs/epic-AG/story-AG.10/`（README / requirements / architecture / testing）

## Why

`packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts` 当前 2611 行（与 2026-09-28 Story 基线一致），是 Story AG.10 剩余 7 文件中最大的一个（T6）。现状盘点（2026-10-04 逐段核对）：

| 区块 | 行范围 | 职责 |
|------|--------|------|
| imports | 1–14 | node:crypto/fs/promises/path、`getDataRoot`、solution 类型（type-only） |
| 常量 | 16–24 | `IDENTIFIER`、`TERMINAL_ATTEMPT_STATUSES`、`DEFAULT_CLAIM_TTL_MS` |
| 公共类型区 | 26–232 + 272–468 | ~50 个 type/interface：状态枚举、WorkItem/Attempt/Snapshot、执行端口（Readiness/Worker/Verifier/Outcome/Evidence/HITL/MutationLock）、`CollaborationExecutionDependencies`/`CollaborationExecutionPort` |
| 错误类 | 234–270 | `CollaborationReconciliationError`、`CollaborationMutationConflictError`、`CollaborationWorkItemHandoffError` |
| 模块级 helper | 469–553 | `identifier`/`nonEmpty`/`assertIntegrity`/`workItemId`/`clone`/`updateItem`/`aggregateRun`/`createWorkItems`（纯函数） |
| `FileCollaborationMutationLock` | 555–607 | 文件锁实现（implements `CollaborationMutationLockPort`） |
| `StageClaimResult` | 609–613 | 内部接口（stage 认领结果） |
| `CollaborationExecutionStore` 类 | 615–2611 | **约 2000 行单类、47 个方法**，混合五类职责：① 公共 API 命令（start/inspect/findByTask/handoff/pause/resume/cancel/executeWorkItem/recover/resolveHitl/recordWorkerReceipt/reconcileAcceptedOutput）；② 阶段状态机（advanceLedger 330 行五阶段循环 + claimStage + commitReadiness/Worker/Verification/Outcome/Evidence + commitAttemptStage）；③ HITL/失败处理（stageFailure/ensureHitl/publishPendingHitl/recordUnavailable/recordFailure/failBudget/stageFailure）；④ Run 账本存储（mutate/readRun/writeRunCas/runPath，CAS + 文件锁）；⑤ 无状态账本运算（item/attempt/locate/handoffCandidates/findHitl/assert*/stageDone/hitlPolicy/evidenceHash/budget 等 24 个纯 helper） |

Story architecture.md T6 方案：「拆出：合同校验、执行编排、消息分发、状态落盘、错误恢复；facade/index.ts 承接导出」。

消费面（已核查，拆分后全部零改动）：

- `facade/index.ts`：47 行 re-export 清单（`CollaborationExecutionStore` + `FileCollaborationMutationLock` + 3 错误类 + ~40 类型）from `"./contract-execution"`——主文件保持全部符号可导入即可
- 包内生产消费：`features/project/contract-bound-runtime-composition.ts`（经 facade 门面导入 `CollaborationExecutionStore`/`FileCollaborationMutationLock`）、`integrations/contract-verifier-registry.ts` 与 `integrations/ontology-outcome-adapter.ts`（`from '../facade/contract-execution'` 类型导入）、facade 兄弟文件 3 处（`run-observation.ts`/`protocol-snapshot.ts`/`task-runtime-evidence-sink.ts`）
- 测试：`facade/__tests__/` 4 文件（contract-execution 627 行 / stage-machine 642 行 / handoff 333 行 / protocol-observation）全部相对导入 `from '../contract-execution'`，当前 29 用例全绿；`integrations/__tests__/contract-verifier-ontology-outcome.test.ts` 深路径导入
- core exports 白名单：**不含** `contract-execution` 深路径条目（仅 `./modules/collaboration-runtime/facade` 指向 facade/index.ts）——package.json 零改动
- web/desktop：零直接导入（web 经 facade 门面动态 import `executeSession`，与 store 无关）

关键依赖事实（设计前提，实测核对）：类全部 9 个字段（contractPort/dataRoot/dependencies/mutationLock/hostId/claimTtlMs/clock/observers）均在 constructor 一次性赋值后不再重绑定（`observers` 为 Map 原地变更、引用稳定）→ ctx 可持直接引用，**无需 T5 式 getter/setter 闭包**；类方法间无 vi.spyOn 锚（3 个测试文件零 spy），方法可安全删除并改为模块函数直接调用。

## What Changes

- **C1 类型拆出**：全部公共 type/interface（26–232 + 272–468，~50 个符号）移至 `contract-execution-types.ts`，逐字移动。
- **C2 常量/错误/模块 helper 拆出**：常量（16–24）、3 个错误类（234–270）、8 个模块级函数（469–553）移至 `contract-execution-shared.ts`，逐字移动（常量在本文件内从「模块私有」升级为「跨模块共享导出」，但主文件不 re-export——公共符号集合不变）。
- **C3 文件锁拆出**：`FileCollaborationMutationLock`（555–607）移至 `contract-execution-lock.ts`，逐字移动；主文件 re-export 该类。
- **C4 无状态账本运算拆出**：24 个纯 helper 方法（item/attempt/locate/handoffCandidates/findHitl/assertRunning/fenceActiveAttempt/assertCurrentLease/assertClaim/stageDone/hitlPolicy/resolvedHitl/hitlQuestion/executionKey/evidenceHash/itemStatusForAttempt/assertWorkerReceipt/validPassedVerification/allIncluded/errorCode/normalizeSnapshot）+ 3 个预算方法（newAttemptBudgetFailure/runtimeBudgetFailure/receiptBudgetFailure，增加 clock 首参）移至 `contract-execution-ops.ts`，变换规则见 design.md D3。
- **C5 Run 账本存储拆出**：mutate/readRun/writeRunCas/runPath/claimAttempt/transition 6 个方法体移至 `contract-execution-ledger.ts` 模块函数（ctx 首参），`ContractExecutionCtx` 接口定义于此。
- **C6 阶段状态机拆出**：claimStage + 5 个 commit* + commitAttemptStage + stageFailure/ensureFailureHitlIfConfigured/ensureHitl/publishPendingHitl/recordUnavailable/recordFailure/failBudget（14 个方法）移至 `contract-execution-stages.ts`；advanceLedger（330 行五阶段循环）单独移至 `contract-execution-advance.ts`。
- **C7 主类收敛**：`CollaborationExecutionStore` 保留在 `contract-execution.ts`——全部 9 个字段 + constructor、13 个公共 API 方法、`advance`（observers 注册桥接）、`now`、`createCtx`，对全部公共符号 re-export；文件顶部补单句职责注释（FR-3）。

## 硬约束（来自 Story requirements / testing）

- 纯机械移动：除 D3「this.* → ctx./模块函数/clock 参数」改写外，不改任何逻辑、不改调用顺序、不新增抽象接口。
- **公共导出符号集合不变**：`CollaborationExecutionStore`/`FileCollaborationMutationLock`/3 错误类/~50 类型全部保持从 `contract-execution.ts` 可导入；`facade/index.ts` re-export 清单零改动；全部消费方 import specifier 零改动。
- 4 个 facade 测试套件（29 用例）保持全绿；collaboration-runtime 全目录测试失败集与基线（14 项既有失败，均为 capability-matcher/dag-executor/agent-spawner 存量）逐一相同。
- madge 循环数 ≤ 基线 12（core 全仓）；`facade/` 新增 7 文件无环。
- 行数达标：新文件单文件 ≤ 600 行；`contract-execution.ts` 预期 ≤ 700（编排主类备用上限 800）。

## 非目标

- 不改契约校验语义、CAS/lease/stage-claim 并发协议、HITL 幂等语义、预算规则（全部逐字）。
- 不改持久化格式（collaboration-runs/*.json）与文件锁协议（.collaboration-locks）。
- 不动 facade/ 其他文件（index/dag-runner/event-bus/session-store/hitl-dispatcher/protocol-snapshot/run-observation/task-runtime-evidence-sink）与 integrations/。
- 不新增/删除 core exports 条目。

## Capabilities

### 新增

- `collaboration-contract-execution-structure`：facade/contract-execution 的文件结构约束——类型/共享常量与 helper/文件锁/无状态运算/账本存储/阶段提交/状态机循环分文件存放，主类保留公共 API 与 observers 桥接；公共导出符号与行为不变。

## Impact

- **修改**：`packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts`（2611 → 预期 ~670 行）
- **新增**：`facade/` 下 7 个新文件（types ~420 / shared ~150 / lock ~65 / ops ~350 / ledger ~220 / stages ~500 / advance ~350）
- **不改**：facade/index.ts、全部消费方 import（包内门面/相对导入原样）、core exports、web/desktop
- **风险**：方法体外移引入 this 绑定偏差（D3 符号映射表 + 29 用例全绿 + token 级对比兜底）；`TERMINAL_ATTEMPT_STATUSES` 等模块私有常量升级为跨模块导出（仅包内新文件消费，不经 facade/index 对外包出——公共面不变）

## 依赖

- 无前置 Proposal 依赖（T1–T5 已合并）。T7（supervisor-dag.ts）与本 Proposal 无文件交集。

## 上线方案

单一 Proposal 集成分支 `proposal/refactor-contract-execution`（从 `refactor/arch-governance` 创建，沿用既定偏差——dev 落后 114+ 提交）；应用源码在 subagent Task worktree 实施；完成后按 TC-1~TC-6 全量验证，合并回 `refactor/arch-governance`（需用户授权）。

## 回滚方案

全部为 git 可逆操作：revert 拆分 commit 即恢复单文件形态。拆分期间每步移动后立即验证 core 类型检查与 4 个 facade 测试套件，不存在中间态上线窗口。
