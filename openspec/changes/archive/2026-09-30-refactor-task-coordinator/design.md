# Design: refactor-task-coordinator（AG.10-T3）

## D1 拆分映射（行号基于拆分前 1142 行版本）

| 目标文件 | 移入内容（源行） | 预估行数 |
|---------|----------------|---------|
| `task-runtime/coordinator-types.ts` | `TaskBranchEntry`（31）、`RuntimeAgentTool`（32）、`TaskHostScope`（34–39）、`TaskHostTool`（41–53）、`TaskHostState`（54–57）、`TaskSessionHost`（59–78）、`TaskSessionHostFactoryOptions`（80–97）、`TaskSessionHostFactory`（90–92）、`AgentTaskRuntimeCoordinatorOptions`（94–108）+ 对应 import | ~110 |
| `task-runtime/coordinator-shared.ts` | `AgentTaskRuntimeConflictError`（110–112）、`AgentTaskRuntimeProtocolError`（114–116）、`toTaskBranchEntries`（118–123）、`defaultHostFactory`（125–132）、`internalUserMessage`（134–139）、`visibleUserMessage`（141–146）、`taskStatusFromProjection`（148–161）、`isActiveExecution`（163–165）、`errorMessage`（167–169）+ 对应 import | ~90 |
| `task-runtime/coordinator-commands.ts` | `mutateProjectTaskMetadata` 体（272–363）、`recordVerifiedEvidence` 体（365–413）、`mutateReview` 体（427–497）、`completionInput` 体（499–558）→ 模块级 `runXxx(ctx, input)` | ~380 |
| `task-runtime/coordinator-controls.ts` | `pauseTask` 体（955–971）、`cancelTask` 体（973–1003）、`resumeTask` 体（1005–1016）、`retryTask` 体（1018–1045）、`buildContinuationPrompt`（1047–1056）、`invokeReadOnlyTaskTool` 体（1058–1085）→ 模块级函数 | ~180 |
| `coordinator.ts`（保留） | imports、4 个公共符号 re-export、主类骨架：字段声明（172–186）、constructor、initialize、getSnapshot、getPersistenceState、updateProjectTaskMetadata（薄委托）、requestReview/approveCompletion/rejectReview（薄委托）、createTask、controlTask、submitUserReply、resumeAfterRestore、destroy、applyHostState、updateFromProjection、installTaskTools、restoreBaselineTools、startContinuationLoop、runContinuationLoop、applyContinuationDecision、emitCompletionMessage、flushCompletionMessage、assertCreateRequest、assertControlRequest、fail、requireHost、publishState、queuePersist | ~450 |

**职责单句（FR-3，写入各文件顶部注释）：**

- `coordinator-types.ts`：task-runtime coordinator 的 host 桥接与配置类型定义。
- `coordinator-shared.ts`：task-runtime coordinator 的错误类型与模块级纯 helper。
- `coordinator-commands.ts`：coordinator 协议命令方法体（Project metadata / Evidence / Review），纯函数，接收 coordinator ctx。
- `coordinator-controls.ts`：coordinator 任务控制动作方法体（pause/cancel/resume/retry），纯函数，接收 coordinator ctx。
- `coordinator.ts`：AgentTaskRuntimeCoordinator 主类——host 生命周期、任务生命周期与续跑循环编排、状态机与持久化。

**有争议项的归属判定：**

- `runContinuationLoop`/`applyContinuationDecision`/`startContinuationLoop` 留主类：Story T3 方案把「调度循环」列为拆出对象，但循环体与 `this.controller`/`this.continuationGeneration`/`publishState` 交织极深，外移 ctx 字段超过 12 个且含可变回调，改写面大于收益；拆出「循环消费的决策执行与控制动作」（controls 文件）与「循环产出的命令聚合」（commands 文件）已覆盖该方案的实质——状态机 helper（`taskStatusFromProjection`→shared）、调度循环消费的控制动作（controls）、结果聚合命令（commands）。偏差已在 proposal 记录。
- `emitCompletionMessage`/`flushCompletionMessage`/`fail` 留主类：均为单行级状态翻转，被多个保留方法与外移 ctx 共同消费，外移只增噪音。
- `assertCreateRequest`/`assertControlRequest` 留主类：仅被保留的 createTask/controlTask 消费。
- `updateFromProjection`/`applyHostState`/`installTaskTools`/`restoreBaselineTools` 留主类：状态机与 host 桥接核心，被外移 ctx 透传消费（如 `updateFromProjection` 由 mutateReview 体调用）。

## D2 放置位置：`task-runtime/` 同目录平铺文件

**决策**：新建 4 个 `coordinator-*.ts` 文件与 coordinator.ts 同级（不再建子目录）。理由：task-runtime 已有 types/projection/continuation-controller 平铺结构；子目录会迫使 index.ts 与全部相对导入路径加深，改动面变大且与既有目录惯例不一致。导入形态：coordinator.ts 与新文件之间 `./coordinator-types` 相对导入；新文件对 types.ts/projection.ts/continuation-controller.ts 用 `./types` 等（目录不变，仅 coordinator.ts 内原有 `./` 前缀在部分文件中保持）。

## D3 方法体外移的变换规则（唯一非逐字变换）

**规则**：类私有方法体提升为模块级 `runXxx(ctx, ...)`；凡方法体中引用的 `this.<member>` 一律改为 `ctx.<同名>`；方法体内声明的局部变量逐字不动。

ctx 接口（字段与类成员同名一一对应，只读透传）：

```ts
// coordinator-commands.ts
interface CoordinatorCommandsCtx {
  options: AgentTaskRuntimeCoordinatorOptions;
  state: AgentTaskRuntimePersistenceV1;          // 读写经 ctx.state.execution 直接改写（与 this.state 语义一致——对象引用共享）
  initialize(): Promise<AgentTaskRuntimeSnapshotV1>;
  requireHost(): TaskSessionHost;
  updateFromProjection(projection: AgentTaskProjectionV1, mode: ..., baseline?: string): void;
  publishState(): Promise<void>;
  getSnapshot(): AgentTaskRuntimeSnapshotV1;
  completionInput(projection: AgentTaskProjectionV1, snapshot: PiTaskSnapshotLike): {...};
}
// coordinator-controls.ts
interface CoordinatorControlsCtx {
  options: AgentTaskRuntimeCoordinatorOptions;
  state: AgentTaskRuntimePersistenceV1;
  requireHost(): TaskSessionHost;
  installTaskTools(): void;
  restoreBaselineTools(): void;
  publishState(): Promise<void>;
  startContinuationLoop(): void;
  createTask(request: CreateAgentTaskRequestV1): Promise<AgentTaskRuntimeSnapshotV1>;
  fail(code: string, message: string, retryable: boolean, retainTaskLease?: boolean): void;
  continuationGeneration: number;                 // 可变字段经 getter/setter 或直接对象引用传递
  runningPromise: Promise<void> | null;
}
```

**注意**：`continuationGeneration`/`runningPromise` 是类可变字段。为避免值拷贝语义偏差，controls ctx 采用**单字段访问器**：`ctx.getContinuationGeneration()`/`ctx.bumpContinuationGeneration()`（自增唯一入口）与 `ctx.setRunningPromise(v)`——subagent 实施时按「原方法体对该字段的操作类型」选择最小访问器集合，并在 ctx 接口注释中标明对应原语句。若实施中发现访问器方案改写面大于预期，允许降级为「pauseTask/cancelTask/resumeTask/retryTask 整体留在主类」并记录偏差（controls 文件仅承载 `buildContinuationPrompt`+`invokeReadOnlyTaskTool`）。

**保持不变的行为要点（subagent 验收时逐条对照）：**

- 公共方法薄委托：`updateProjectTaskMetadata` → `runMutateProjectTaskMetadata(ctx, input)` 等，委托处不包裹 try/catch、不改变 await 语义。
- 错误类实例化位置不变（命令体内 throw 的错误类型/消息逐字）。
- `metadataMutationQueue` 串行队列语义不变（`updateProjectTaskMetadata` 薄委托保留原 then/catch 链）。
- `structuredClone` 调用位置与对象逐字。

**备选被拒**：把 coordinator 类拆成多个 mixin/组合类——会改变 `AgentTaskRuntimeCoordinator` 的实例化契约与类型结构，违反调用方零改动；把命令体直接移到 features/project——跨层依赖违规。

## D4 循环依赖预防

依赖方向单向：`coordinator.ts` → `coordinator-commands.ts`/`coordinator-controls.ts` → `coordinator-shared.ts`/`coordinator-types.ts` → `types.ts`/`projection.ts`/`continuation-controller.ts`。新文件之间无横向导入（commands 与 controls 互不依赖；`completionInput` 仅被 commands 内 mutateReview 与主类薄委托消费 → 放 commands 并由主类导入）。`index.ts` 仍只 `export * from "./coordinator"`，新文件不经 index 导出（除 coordinator.ts re-export 的公共符号）。移动完成后 `npx madge --circular packages/core/src --extensions ts,tsx` 验证 ≤ 基线 12，且 task-runtime/ 内部无环。

## D5 实施边界（subagent work packages）

单一写入范围（`packages/core/src/lib/integrations/pi-agent/task-runtime/` 5 个文件），设置 1 个 subagent Task worktree 串行实施：

- **WP-1（唯一实施包）**：按 D1 清单移动 + D3 变换规则外移方法体；写入范围 `task-runtime/coordinator*.ts`。验收命令：TC-1 符号 diff、TC-2 双端 build、TC-3 测试基线、TC-4 madge、TC-6 行数。

## D6 风险

| 风险 | 缓解 |
|------|------|
| ctx 字段遗漏 → 运行时 undefined | TypeScript 编译期全量校验（TC-2 tsc）；ctx 接口逐一对照 D3 清单 |
| 可变字段（continuationGeneration/runningPromise）值拷贝语义 | 访问器方案（D3 注明）；若改写面过大允许降级留主类并记录偏差 |
| queuePersist 串行链被拆散 | publishState/queuePersist 留主类，外移方法只经 ctx.publishState 调用 |
| 控制动作执行顺序被顺手调整 | subagent 指令「方法体内部逐字」；coordinator.test.ts 5 个 describe + agent-task-runtime-ipc.test 兜底 |
| 新文件超 600 行 | D1 预估最大 commands ~380；TC-6 wc -l 验证 |
| 拆块互引成环 | D4 单向依赖 + madge 验证 |
