# refactor-contract-execution 实施任务

对应 Story AG.10 Task AG10-T6。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [ ] 1.1 **WP-1 contract-execution.ts 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts` + 同目录新建 7 文件 `contract-execution-types.ts` / `contract-execution-shared.ts` / `contract-execution-lock.ts` / `contract-execution-ops.ts` / `contract-execution-ledger.ts` / `contract-execution-stages.ts` / `contract-execution-advance.ts`；串行——全部改动同一文件族，不可并行）
  - 按 design.md D1 清单移动：types/shared/lock 逐字；ops 21 个零 this 依赖函数直移 + 3 个预算函数加 `clock` 首参；ledger/stages/advance 按 D3 ctx 变换（`this.X` → `ctx.X` / 模块函数直调）。
  - 主类保留：9 字段 + constructor、observers 声明、13 个公共 API 方法体（逐字）、`advance`（observers 桥接，逐字）、`now`、新增 `createCtx()`；全部公共符号 re-export。
  - Ctx 接口唯一定义于 ledger；stages/advance 仅 `import type` 复用。
  - 每个新文件顶部一句话职责注释（FR-3）；contract-execution.ts 顶部补单句职责注释。
  - 符号映射表（subagent 必须逐条对照，主类调用点逐字）：
    | 类方法 | 去向 | 调用形态 |
    |--------|------|---------|
    | `item`/`attempt`/`locate`/`handoffCandidates`/`findHitl`/`assertRunning`/`fenceActiveAttempt`/`assertCurrentLease`/`assertClaim`/`stageDone`/`hitlPolicy`/`resolvedHitl`/`hitlQuestion`/`executionKey`/`itemStatusForAttempt`/`assertWorkerReceipt`/`validPassedVerification`/`allIncluded`/`errorCode`/`normalizeSnapshot` | ops | 模块函数直调（零 this 依赖） |
    | `newAttemptBudgetFailure`/`runtimeBudgetFailure`/`receiptBudgetFailure` | ops | 首参加 `clock`，主类传 `this.clock` |
    | `evidenceHash` | ops | 零 this 依赖（createHash 已有 import） |
    | `mutate`/`readRun`/`writeRunCas`/`runPath`/`claimAttempt`/`transition` | ledger | `runXxx(ctx, ...)`；ctx.mutate/readRun 由 createCtx 回调注入 |
    | `claimStage`/`commitReadiness`/`commitWorker`/`commitVerification`/`commitOutcome`/`commitEvidence`/`commitAttemptStage`/`stageFailure`/`ensureFailureHitlIfConfigured`/`ensureHitl`/`publishPendingHitl`/`recordUnavailable`/`recordFailure`/`failBudget` | stages | `runXxx(ctx, ...)` |
    | `advanceLedger` | advance | `runAdvanceLedger(ctx, runId, workItemId, attemptId)` |
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-5 / TC-6（命令见第 2 节）。

## 2. 验证（依赖 1.1）

- [ ] 2.1 TC-1 符号不变：拆分前后公共导出清单 diff 为空（`CollaborationExecutionStore`、`FileCollaborationMutationLock`、3 错误类、~50 类型，以 facade/index.ts 的 47 行 re-export 清单为基准）；消费方 import specifier 零变化（facade/index.ts、composition 根、integrations 2 文件 + 1 测试、facade 兄弟 3 文件、facade 测试 4 文件）。
- [ ] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；core tsc 0 新增 error（client-hooks 既有基线除外）。
- [ ] 2.3 TC-3 测试基线：`facade/__tests__/` 4 套件 29 用例全绿；`collaboration-runtime/` 全目录测试失败集与基线（14 项既有失败：capability-matcher 9 + dag-executor 3 + agent-spawner 1 + hub 相关 1，逐一核对）相同；`integrations/__tests__/contract-verifier-ontology-outcome.test.ts` 结果与基线相同。
- [ ] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 基线 12；`facade/` 新增 7 文件不出现在任何环路径。
- [ ] 2.5 TC-5 模块冒烟：`pnpm lint:boundaries` 0 诊断；`node scripts/check-architecture-boundaries.cjs --self-test` 通过；`node scripts/expand-core-exports.cjs --verify` 通过（无 exports 改动，应原样通过）。
- [ ] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600；`contract-execution.ts` 预期 ≤ 700（800 备用上限）。

## 3. 集成（依赖 2.x 全部通过）

- [ ] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果（T6 行）、README 状态更新。
- [ ] 3.2 `openspec validate refactor-contract-execution --strict` 通过（evidence 回填后复验）。
- [ ] 3.3 docs/changes 全量流水 + 版本归档；本任务不改架构围栏，AGENTS.md 预期不动。
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
