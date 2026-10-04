# Design: refactor-contract-execution（AG.10-T6）

## D1 拆分映射（行号基于拆分前 2611 行版本）

| 目标文件 | 移入内容（源行） | 预估行数 |
|---------|----------------|---------|
| `facade/contract-execution-types.ts` | `WorkItemStatus`（26）、`AttemptStatus`（39）、`CollaborationRunStatus`（53）、`CollaborationRunTerminalStatus`（54）、`WorkItemExecutionStage`（56）、`SolutionTaskBinding`（63）、`WorkItemUsage`（75）、`WorkerReceipt`（80）、`VerifierResult`（88）、`OutcomeReceipt`（98）、`EvidenceReceipt`（107）、`WorkItemReadinessReceipt`（115）、`WorkItemStageClaim`（126）、`WorkItemHandoffCandidate`（136）、`ListWorkItemHandoffCandidatesInput`（142）、`WorkItemHandoffInput`（148）、`WorkItemHandoffReceipt`（156）、`WorkItemHandoffResult`（175）、`HitlTrigger`（180）、`HitlDecision`（181）、`WorkItemHitlRequest`（183）、`AcceptedExternalOutputInput`（204）、`AcceptedExternalOutputResult`（227）、`WorkItemAttempt`（272）、`CollaborationWorkItem`（290）、`CollaborationRunSnapshot`（306）、`StartCollaborationRunInput`（320）、`WorkItemExecutionRequest`（330）、`WorkerExecutionInput`（337）、`WorkItemReadinessInput`（345）、`WorkItemReadinessResult`（353）、`VerifierExecutionInput`（372）、`OutcomeCommitInput`（376）、`EvidenceSubmissionInput`（381）、`HitlOpenInput`（386）、`ResolveWorkItemHitlInput`（392）、7 个端口接口 `WorkItemReadinessPort`…`CollaborationMutationLockPort`（402–428）、`CollaborationExecutionDependencies`（430）、`CollaborationExecutionPort`（443）+ 对应 import | ~420 |
| `facade/contract-execution-shared.ts` | 常量 `IDENTIFIER`（16）、`TERMINAL_ATTEMPT_STATUSES`（17–22）、`DEFAULT_CLAIM_TTL_MS`（24）；错误类 `CollaborationReconciliationError`（234）、`CollaborationMutationConflictError`（247）、`CollaborationWorkItemHandoffError`（255）；模块函数 `identifier`（469）、`nonEmpty`（475）、`assertIntegrity`（479）、`workItemId`（483）、`clone`（487）、`updateItem`（491）、`aggregateRun`（506）、`createWorkItems`（522）+ 对应 import | ~150 |
| `facade/contract-execution-lock.ts` | `FileCollaborationMutationLock` 类（555–607）+ 对应 import | ~65 |
| `facade/contract-execution-ops.ts` | 24 个无状态方法体（提取为模块函数）+ `StageClaimResult` 接口（609–613）+ 预算 3 方法（加 clock 参数）：`item`（2276）、`attempt`（2310）、`locate`（2321）、`handoffCandidates`（2287）、`findHitl`（2330）、`assertRunning`（2349）、`fenceActiveAttempt`（2357）、`assertCurrentLease`（2382）、`assertClaim`（2394）、`stageDone`（2411）、`hitlPolicy`（2422）、`resolvedHitl`（2433）、`hitlQuestion`（2446）、`executionKey`（2459）、`evidenceHash`（2467）、`itemStatusForAttempt`（2485）、`assertWorkerReceipt`（2498）、`validPassedVerification`（2514）、`allIncluded`（2594）、`errorCode`（2602）、`newAttemptBudgetFailure`（2530）、`runtimeBudgetFailure`（2540）、`receiptBudgetFailure`（2561）、`normalizeSnapshot`（2223）+ 对应 import | ~350 |
| `facade/contract-execution-ledger.ts` | `ContractExecutionCtx` 接口 + 6 个方法体 → 模块函数：`mutate`（2170）、`readRun`（2192）、`writeRunCas`（2239）、`runPath`（2264）、`claimAttempt`（1233）、`transition`（2139） | ~220 |
| `facade/contract-execution-stages.ts` | 14 个阶段提交/HITL 方法体 → 模块函数：`claimStage`（1654）、`commitReadiness`（1713）、`commitWorker`（1768）、`commitVerification`（1807）、`commitOutcome`（1846）、`commitEvidence`（1879）、`commitAttemptStage`（1903）、`stageFailure`（1945）、`ensureFailureHitlIfConfigured`（1982）、`ensureHitl`（1997）、`publishPendingHitl`（2065）、`recordUnavailable`（2082）、`recordFailure`（2099）、`failBudget`（2117） | ~500 |
| `facade/contract-execution-advance.ts` | `advanceLedger` 体（1323–1652，330 行五阶段循环）→ 模块函数 `runAdvanceLedger(ctx, ...)` | ~350 |
| `facade/contract-execution.ts`（保留） | imports（收敛）、类骨架：9 字段 + constructor（615–633）、`observers` 声明（635）、13 个公共 API 方法（start 637/inspect 701/findByTask 706/listWorkItemHandoffCandidates 749/handoffWorkItem 766/pause 906/resume 913/cancel 917/executeWorkItem 924/recover 935/resolveHitl 948/recordWorkerReceipt 1037/reconcileAcceptedOutput 1063）、`advance`（1304，observers 注册桥接）、`now`（2607）、`createCtx`（新增）+ 全部公共符号 re-export + 文件头职责注释 | ~670 |

**职责单句（FR-3，写入各文件顶部注释）：**

- `contract-execution-types.ts`：协作执行账本的公共类型面——运行/工作项/阶段状态、执行端口与依赖注入契约。
- `contract-execution-shared.ts`：协作执行账本的常量、领域错误与模块级纯 helper。
- `contract-execution-lock.ts`：协作执行账本的文件互斥锁实现（`FileCollaborationMutationLock`）。
- `contract-execution-ops.ts`：Run 账本的无状态运算——定位/校验/HITL 判定/预算核算/聚合等纯函数。
- `contract-execution-ledger.ts`：Run 账本的持久化边界——CAS 读写、互斥 mutate、租约意图认领与运行状态迁移。
- `contract-execution-stages.ts`：WorkItem 阶段提交——stage 认领、五阶段 commit、HITL 保障与失败登记。
- `contract-execution-advance.ts`：WorkItem 状态机推进——五阶段调度循环（readiness→worker→verifier→outcome→evidence）。
- `contract-execution.ts`：`CollaborationExecutionStore` 主类——公共执行 API、observers 桥接与模块组装（ctx 工厂）。

## D2 放置位置与导入方向

**决策**：7 个新文件与 contract-execution.ts 平铺同放 `facade/`，不建子目录。理由：facade/ 现有 9 个平铺文件（contract-execution/dag-runner/event-bus/hitl-dispatcher/index/protocol-snapshot/run-observation/session-store/task-runtime-evidence-sink），平铺是该目录既有形态；文件名前缀 `contract-execution-` 已表达分组；消费方零路径变化是最高优先级（facade/index.ts 的 `from "./contract-execution"` 与 integrations 的 `from '../facade/contract-execution'` 均不动）。

**依赖方向（单向，无横向环）**：

```
contract-execution.ts (主类)
  → types / shared / lock / ops / ledger / stages / advance
contract-execution-advance.ts → ledger? 否 — advance 经 ctx 回调调用 stages 与 ops，不直接 import stages
contract-execution-stages.ts → ops / ledger(mutate 签名经 ctx) / shared / types
contract-execution-ledger.ts → shared / types
contract-execution-ops.ts → shared / types
contract-execution-lock.ts → shared / types
```

- `Ctx` 接口定义在 ledger（存储边界），stages/advance 只消费接口，不 import ledger 实现 → 无环。
- 主文件对 7 个新文件 re-export：`FileCollaborationMutationLock`（lock）+ 3 错误类（shared）+ 全部类型（types）。常量/helper（IDENTIFIER/updateItem 等）不 re-export——它们本就不是公共符号。
- madge 计边注意：stages 不 import advance；advance 不 import stages（经 ctx 回调）；杜绝横向 import 环。

## D3 方法体外移变换规则（唯一非逐字变换）

**前提事实（实测）**：类 9 字段 constructor 一次性赋值后不重绑定；`observers` Map 原地变更（引用稳定）；测试零 spy、零 `(store as any)` 内部锚 → ctx 直接持引用即可，**无需 T5 式 getter/setter 闭包**。

**变换规则**：

1. 类私有方法体提升为模块级函数（命名：ops 去 this 语义保留原名如 `item(snapshot, id)`；ledger/stages/advance 加 `run` 前缀或保留原名，以调用点可读为准）；首参为 `ctx: ContractExecutionCtx`（ops 纯函数按实际参数直接传值，不持 ctx——见第 4 条）。
2. 方法体中 `this.<member>` → `ctx.<member>`（ledger/stages/advance）或直接参数（ops）。
3. 局部变量逐字不动；错误消息、日志格式、`as const` 断言逐字。
4. **ops 特殊化**：24 个无状态方法中，多数不依赖任何 this 字段（item/attempt/locate/handoffCandidates/findHitl/assertRunning/fenceActiveAttempt/assertCurrentLease/assertClaim/stageDone/hitlPolicy/resolvedHitl/hitlQuestion/executionKey/itemStatusForAttempt/assertWorkerReceipt/validPassedVerification/allIncluded/errorCode/normalizeSnapshot 共 21 个零 this 依赖）→ 直接模块函数，签名按实际参数；3 个预算方法依赖 `this.clock()` → 增加 `clock: () => Date` 首参，主类调用点传 `this.clock`。
5. **ledger/stages/advance 的 ctx**：

```ts
// contract-execution-ledger.ts（Ctx 唯一定义点；stages/advance import type 复用）
export interface ContractExecutionCtx {
  readonly contractPort: SolutionExecutionContractPort;
  readonly dataRoot: string;
  readonly dependencies: CollaborationExecutionDependencies;
  readonly mutationLock: CollaborationMutationLockPort;
  readonly hostId: string;
  readonly claimTtlMs: number;
  readonly clock: () => Date;
  now(): string;
  readRun(runId: string): Promise<CollaborationRunSnapshot>;
  assertRunning(snapshot: CollaborationRunSnapshot): void;
  // ctx 内部自引用（模块函数互调经 ctx，保持调用点逐字）
  mutate(runId: string, operation: (snapshot: CollaborationRunSnapshot) => CollaborationRunSnapshot | Promise<CollaborationRunSnapshot>): Promise<CollaborationRunSnapshot>;
  item(snapshot: CollaborationRunSnapshot, workItemId: string): CollaborationWorkItem;
  attempt(item: CollaborationWorkItem, attemptId: string): WorkItemAttempt;
  locate(snapshot: CollaborationRunSnapshot, workItemId: string, attemptId: string): { item: CollaborationWorkItem; attempt: WorkItemAttempt };
  findHitl(snapshot: CollaborationRunSnapshot, requestId: string): { item: CollaborationWorkItem; attempt: WorkItemAttempt; request: WorkItemHitlRequest };
  ...（ops 其余函数按消费面登记，见 tasks.md 1.1 符号映射表）
}
```

6. **主类 `createCtx()`**：一次性组装全部 ctx 字段与回调；ctx 回调直接绑定 ops/ledger 模块函数（如 `item: (snapshot, id) => item(snapshot, id)`）与主类保留方法（`now: () => this.now()`、`readRun: (runId) => this.readRun(runId)`、`mutate` 薄包装指向 ledger 模块函数）。
7. **互调保持调用点逐字**：`this.mutate(...)` → `ctx.mutate(...)`、`this.commitAttemptStage(...)` → `runCommitAttemptStage(ctx, ...)`、`this.item(...)` → `item(...)`（ops 零 this 依赖函数直接调用）。

**保持不变的行为要点（subagent 验收时逐条对照）：**

- CAS 协议：`mutate` 的 revision +1 校验、`writeRunCas` 的 expectedRevision 比对、临时文件 + rename/link 原子写、`observers.get(runId)?.observer.checkpoint()` 钩子——逐字。
- lease 协议：`assertCurrentLease`/`fenceActiveAttempt` 的 leaseEpoch 比对与 fence 赋值、`claimStage` 的 TTL 过期判定与 idempotencyKey 构造——逐字。
- 五阶段循环：`advanceLedger` 的 12 次 guard、每阶段 `claimStage → dependencies.X → stageFailure/commitX → continue` 结构、`TERMINAL_ATTEMPT_STATUSES` 早退、waiting_hitl 分支——逐字。
- HITL：`ensureHitl` 的幂等查找（policyId+trigger）、`hitlQuestion` 中文文案、`publishPendingHitl` 的 Promise.all、`resolveHitl` 的 decision 状态机——逐字。
- 预算：3 个 budget 方法的 token/duration/attempts 计算与错误码字符串——逐字。
- 错误：3 个错误类的 code/message 结构与全部 throw 点——逐字。

## D4 循环依赖预防

依赖方向单向（D2 图）：主文件 → 7 新文件；stages → ops/shared/types/ledger(仅 type)；advance → types/ledger(仅 type)；ledger → shared/types；ops → shared/types；lock → shared/types。**stages 与 advance 互不 import**（advance 经 ctx 回调消费 stages 函数——主类 createCtx 注入）。**run-observation.ts → contract-execution.ts 的既有 type 环**（基线环 5：`facade/contract-execution.ts > facade/run-observation.ts`）不受影响：主文件仍 `import { RunObserver } from "./run-observation"`，run-observation 仍 type-only 反向引用——该环在基线内，不新增不消除。完成判定：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 基线 12，且 `facade/` 新增 7 文件不出现在任何环路径。

## D5 实施边界（subagent work packages）

单一写入范围（`facade/` 下 contract-execution.ts + 7 个新文件），设置 1 个 subagent Task worktree 串行实施：

- **WP-1（唯一实施包）**：按 D1 清单移动（types/shared/lock 逐字；ops 21 函数零 this 依赖直移 + 3 预算加 clock 参数；ledger/stages/advance ctx 变换）+ 主类收敛 + re-export。写入范围 8 个文件（1 改 + 7 新建）。验收命令：TC-1 符号 diff、TC-2 双端 build、TC-3 测试基线、TC-4 madge、TC-5 边界、TC-6 行数。

## D6 风险

| 风险 | 缓解 |
|------|------|
| ctx 组装遗漏字段/回调 → 编译失败或运行时 undefined | TS 严格模式接口全量必填 + TC-2 双端编译 + TC-3 29 用例（覆盖五阶段/HITL/handoff/预算全路径）兜底 |
| ops 与 ctx 函数签名漂移（参数序/返回类型） | D3 第 7 条「调用点逐字」约束 + token 级对比（canon: `this.X(` → ctx 等价形态） |
| 模块私有常量升级为跨文件导出后意外扩散 | 常量仅由同目录新文件导入；TC-1 公共符号清单 diff 为空（经 facade/index.ts 视角核查） |
| `observers` Map 桥接偏差（advance 的注册/注销时序） | `advance` 留主类不外移（仅 advanceLedger 循环体外移）——observers 读写全部保持在主类内；TC-3 protocol-observation 用例覆盖 |
| stages/advance 横向 import 成环 | D2/D4 方向约束；TC-4 madge 环集合对比（新增 0 环） |
| 预算方法 clock 参数注入后 this.clock 语义偏差 | clock 由主类 createCtx 传 `this.clock`（同一引用）；TC-3 预算用例 |
| 移动时顺手改逻辑 | 「逐字移动 + 仅 D3 变换」指令；token 级对比 + 测试基线兜底 |
| 新文件超 600 行 | D1 预估最大 stages ~500；TC-6 wc -l 验证 |

## D7 偏差记录（与 Story architecture.md T6 方案的对照）

Story T6 方案列「拆出：合同校验、执行编排、消息分发、状态落盘、错误恢复」五项，对照如下：

- **合同校验** → start() 内联校验链 + assertIntegrity（留主类 start 体，逐字）+ shared 校验 helper ✅
- **执行编排** → advance.ts（五阶段循环）+ stages.ts（阶段提交）✅
- **消息分发** → 对应 publishPendingHitl/ensureHitl（stages.ts）✅
- **状态落盘** → ledger.ts（CAS/mutate/runPath）✅
- **错误恢复** → stageFailure/recordUnavailable/recordFailure/failBudget（stages.ts）+ 3 错误类（shared.ts）✅
- **「facade/index.ts 承接导出」** → 实施为 contract-execution.ts 承接导出（facade/index.ts re-export 清单零改动）——保持主文件作为唯一导入锚点，消费方 import 零变化，优于改 index.ts 导入源（会牵动 5 个消费方路径）。

全部方案项覆盖，无偏差。
