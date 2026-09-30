# pi-agent-task-coordinator-structure Specification

## Purpose
TBD - created by archiving change refactor-task-coordinator. Update Purpose after archive.

## Requirements

### Requirement: coordinator 目录结构单一职责

`packages/core/src/lib/integrations/pi-agent/task-runtime/coordinator.ts`（1142 行）SHALL 拆分：host 桥接与配置类型、错误类与模块级 helper、协议命令方法体（Project metadata / Evidence / Review）、任务控制动作方法体各自独立成文件，`AgentTaskRuntimeCoordinator` 主类 SHALL 保留 host 生命周期、任务生命周期、续跑循环编排与状态机/持久化；公共导出符号（`AgentTaskRuntimeCoordinator`、`AgentTaskRuntimeConflictError`、`AgentTaskRuntimeProtocolError`、`AgentTaskRuntimeCoordinatorOptions`）MUST 保持从 `coordinator.ts` 可导入，全仓调用方 import 零改动。

#### Scenario: 目录划分与行数

- **WHEN** 查看 `packages/core/src/lib/integrations/pi-agent/task-runtime/` 并执行 `wc -l`
- **THEN** SHALL 存在 coordinator-types/coordinator-shared/coordinator-commands/coordinator-controls 文件，每个新文件 SHALL ≤ 600 行且首部有一句话职责注释，coordinator.ts SHALL ≤ 800 行（编排类）

#### Scenario: 导出符号与调用方不变

- **WHEN** 对比拆分前后 coordinator 公共导出清单，并检查 desktop 深路径导入（`agent-task-runtime-ipc.ts` 及其测试）与 `task-runtime/index.ts`
- **THEN** 符号集合 diff SHALL 为空，消费方 import specifier SHALL 零变化，`index.ts` 的 `export * from "./coordinator"` 不变

### Requirement: 方法体外移不改行为

外移方法体 SHALL 通过显式 ctx 对象访问原 `this.*` 成员；方法体内部局部变量、错误类型与消息、`structuredClone` 调用位置、`metadataMutationQueue` 串行队列语义 SHALL 逐字保持；可变字段（`continuationGeneration`/`runningPromise`）MUST 通过访问器或留主类处理，不得引入值拷贝语义偏差。

#### Scenario: 协议命令与控制动作回归

- **WHEN** 执行 `task-runtime/__tests__/coordinator.test.ts`（5 describe）与 desktop `agent-task-runtime-ipc.test.ts`、TC-5 冒烟（Agent 会话内任务执行一次）与 `npx madge --circular packages/core/src --extensions ts,tsx`
- **THEN** 测试 SHALL 全绿，任务创建/推进/完成 SHALL 行为一致，madge 循环数 SHALL ≤ 基线 12 且 `task-runtime/` 内部无环

#### Scenario: 双端编译

- **WHEN** 执行 `pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build`
- **THEN** 双端 SHALL 0 error
