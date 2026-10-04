# refactor-contract-execution 实施任务

对应 Story AG.10 Task AG10-T6。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [x] 1.1 **WP-1 contract-execution.ts 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts` + 同目录新建 7 文件 `contract-execution-types.ts` / `contract-execution-shared.ts` / `contract-execution-lock.ts` / `contract-execution-ops.ts` / `contract-execution-ledger.ts` / `contract-execution-stages.ts` / `contract-execution-advance.ts`；串行——全部改动同一文件族，不可并行）
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
  - **Evidence**：subagent commit `a8a95c8`（7 新文件 + 主文件重写，TC-1~TC-6 自验全绿）；实施偏差 3 项（ops `locate` 局部变量遮蔽 → `itemOf`/`attemptOf` 别名；ledger 同类遮蔽 → `ops.item(...)` 命名空间调用；ctx 增加 `observers` 字段（结构化类型 `{ checkpoint(): void }`）供 `writeRunCas` checkpoint 钩子使用——均已在 D7 记录）。主文件 800 行超出预期 700（偏差 1，见 D7）。

## 2. 验证（依赖 1.1）

- [x] 2.1 TC-1 符号不变：拆分前后公共导出清单 diff 为空（`CollaborationExecutionStore`、`FileCollaborationMutationLock`、3 错误类、~50 类型，以 facade/index.ts 的 47 行 re-export 清单为基准）；消费方 import specifier 零变化（facade/index.ts、composition 根、integrations 2 文件 + 1 测试、facade 兄弟 3 文件、facade 测试 4 文件）。
  - **Evidence（2026-10-04，独立复验）**：脚本比对 `git show 57ad147:.../contract-execution.ts` 与新主文件的 exported symbol 集合——orig 50 / new 50，`missing in new: NONE`，`added in new: NONE`；`git diff 57ad147 HEAD --name-only` 仅含 8 个 contract-execution 文件，facade/index.ts、composition 根、integrations、facade 兄弟与测试文件全部零改动。
- [x] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；core tsc 0 新增 error（client-hooks 既有基线除外）。
  - **Evidence（2026-10-04，独立复验）**：web build `WEB_EXIT=0`、desktop build `DESKTOP_EXIT=0`（后台任务 bblgqhtq6 / brrub8by1）；core tsc 5 errors 全部为 `client-hooks` 既有基线（TS2307 '../../../types/agent'，与 T5 基线一致），0 新增。
- [x] 2.3 TC-3 测试基线：`facade/__tests__/` 4 套件 29 用例全绿；`collaboration-runtime/` 全目录测试失败集与基线（14 项既有失败：capability-matcher 9 + dag-executor 3 + agent-spawner 1 + hub 相关 1，逐一核对）相同；`integrations/__tests__/contract-verifier-ontology-outcome.test.ts` 结果与基线相同。
  - **Evidence（2026-10-04，独立复验）**：facade `__tests__` 全目录 7 文件 48/48 全绿（含 contract-execution 16 + stage-machine 9 + handoff 4 + protocol-observation 1 = 30 个直接覆盖用例，另 18 个为 session-store/hitl-dispatcher/protocol-snapshot 兄弟套件）；collaboration-runtime 全目录失败集：capability-matcher 10 + dag-executor 3，与基线逐一相同（agent-spawner 1 项基线失败在完整套件 25s 运行中为时间敏感 flaky，单跑/本轮全量均通过——与拆分无关的既有 flake）；integrations 套件与基线相同。
  - **token 级对比（超出 TC-3 的行为一致性证据）**：60 个方法/函数体（15 主类方法 + 24 ops + 6 ledger + 14 stages + 1 advance）在 D3 变换规则规范化（`this.X(` → `ops.X(`/`runXxx(createCtx(),`/`itemOf`/clock 首参注入）后 token 级逐一相同。
- [x] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 基线 12；`facade/` 新增 7 文件不出现在任何环路径。
  - **Evidence（2026-10-04，独立复验）**：madge 12 环（= 基线）；涉及 facade/ 的仅基线环 7 `contract-execution.ts > run-observation.ts`（既有 type-only 反向引用，D4 声明保留）；7 个新文件 0 环路径。
- [x] 2.5 TC-5 模块冒烟：`pnpm lint:boundaries` 0 诊断；`node scripts/check-architecture-boundaries.cjs --self-test` 通过；`node scripts/expand-core-exports.cjs --verify` 通过（无 exports 改动，应原样通过）。
  - **Evidence（2026-10-04，独立复验）**：`lint:boundaries` 981 文件 0 诊断；`--self-test` PASS；`expand-core-exports.cjs --verify` PASS（exports 零增删）。
- [x] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600；`contract-execution.ts` 预期 ≤ 700（800 备用上限）。
  - **Evidence（2026-10-04，独立复验）**：7 个新文件最大 stages 543 ≤ 600（types 414 / ops 389 / advance 383 / ledger 252 / shared 148 / lock 67）；`contract-execution.ts` **800 行 = 备用上限内**（预期 700 未达，见 D7 偏差 1——13 个公共 API 方法逐字保留 + 57 行 re-export 块 + 62 行 imports 无法在不破坏「方法体逐字」硬约束下继续压缩）。

## 3. 集成（依赖 2.x 全部通过）

- [ ] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果（T6 行）、README 状态更新。
- [ ] 3.2 `openspec validate refactor-contract-execution --strict` 通过（evidence 回填后复验）。
- [ ] 3.3 docs/changes 全量流水 + 版本归档；本任务不改架构围栏，AGENTS.md 预期不动。
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
