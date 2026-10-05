# Spec Delta: collaboration-supervisor-dag-structure（AG.10-T7）

## ADDED Requirements

### Requirement: supervisor-dag 文件结构单一职责

`packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts`（2166 行）SHALL 拆分：类型面、manifest 与拓扑、verifier、HITL 注册表、workflow 路径、协调工具（dispatch_worker 独立文件）各自独立成文件（`engine/supervisor-dag-*.ts` 共 7 个），主文件 SHALL 保留 `executeSupervisorDag` 编排主体（manifest 加载、Blackboard + ProtocolObserver 装配、Worker 状态与 ctx 组装、`onSupervisorEvent` 事件接线、Supervisor spawn/prompt/等待/汇总、`stopProtocolObserver` 清理）与 `executeCollaborationRuntime` mode 路由，并 re-export 全部 11 个公共符号；`engine/index.ts` 的 re-export、`facade/dag-runner.ts` 的深路径 import、2 个 engine 测试文件的 import、`facade/index.ts` 与模块 index MUST 零改动。

#### Scenario: 目录划分与行数

- **WHEN** 查看 `packages/core/src/modules/collaboration-runtime/engine/` 并执行 `wc -l`
- **THEN** SHALL 存在 supervisor-dag-types/supervisor-dag-manifest/supervisor-dag-verifier/supervisor-dag-hitl/supervisor-dag-workflow/supervisor-dag-dispatch/supervisor-dag-tools 7 个文件，每个新文件 SHALL ≤ 600 行且首部有一句话职责注释，`supervisor-dag.ts` SHALL ≤ 700 行（800 备用上限）

#### Scenario: 导出符号与调用方不变

- **WHEN** 对比拆分前后经 `supervisor-dag.ts` 可导入的公共符号清单（11 个导出），并检查 `engine/index.ts`、`facade/dag-runner.ts`、`facade/hitl-dispatcher.ts`、2 个 engine 测试文件与 `__tests__/public-api-boundary.test.ts` 的约束
- **THEN** 公共符号集合 diff SHALL 为空，全部消费方 import specifier SHALL 零变化，core exports 白名单条目零增删，`facade/index.ts` 仍 MUST NOT 导出 `loadProjectTopology`

### Requirement: 纯机械移动不改行为

拆分 SHALL 为逐字搬移加受限变换：types/manifest/verifier/hitl/workflow 逐字（跨模块消费的私有符号加 export 为唯一改动）；tools/dispatch 的 case 体按 ctx 变换规则外移（闭包捕获状态经 `SupervisorDagCtx` 首参传递、`resultJson=<expr>;break;` → `return <expr>;`、裸 `break;` → `return JSON.stringify({ status: "ok" });`），Supervisor 决策语义、dispatch/wait/verifier/HITL 协议、Blackboard 写入格式、事件 payload、prompt 文本与调用顺序 SHALL 逐字保持；新文件间依赖 SHALL 单向，不得出现新环。

#### Scenario: 执行引擎回归

- **WHEN** 执行 `engine/__tests__/` 中 `supervisor-dag-hitl.test.ts` 与 `supervisor-protocol.integration.test.ts`，以及 `engine/__tests__/` 全目录与 `collaboration-runtime/` 全目录测试
- **THEN** 2 个 supervisor-dag 套件 SHALL 全绿，引擎与协作运行时全目录失败集 SHALL 与基线（capability-matcher 10 + dag-executor 3）逐一相同

#### Scenario: 循环依赖与边界

- **WHEN** 执行 `npx madge --circular packages/core/src --extensions ts` 与 `pnpm lint:boundaries`
- **THEN** madge 循环数 SHALL ≤ 基线 12 且 `engine/` 新增 7 文件 SHALL 不出现在任何环路径，边界扫描 SHALL 0 诊断

#### Scenario: 双端编译

- **WHEN** 执行 `pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build`
- **THEN** 双端 SHALL 0 error 且 `node scripts/expand-core-exports.cjs --verify` 通过
