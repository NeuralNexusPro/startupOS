# Proposal

## 追溯信息

- **epic-id:** 9
- **story-id:** 9.42
- **task-id:** 942-T4-A
- **owner:** Core Runtime
- **来源 Story 文档：**
  - `docs/specs/epic-9/story-9.42/README.md`
  - `docs/specs/epic-9/story-9.42/requirements.md`
  - `docs/specs/epic-9/story-9.42/architecture.md`
  - `docs/specs/epic-9/story-9.42/testing.md`

## Why

当前自然语言 Supervisor 运行路径仍以 Blackboard `TaskItem` 维护派发、阻塞、上报和验收状态，而正式运行契约已经由 `CollaborationExecutionStore` 的 `CollaborationWorkItem` 与父 Session 的 `pi-tasks` Evidence Gate 管理。两套可变状态会在 Supervisor 漏调 verifier、进程重启或命令超时后产生“Worker 已完成但 Run 显示失败”的分叉。

## What Changes

- 让自然语言 Supervisor 派发产生或绑定正式父 `pi-tasks` Task/Step，并把每个 Worker 执行映射为契约约束的 `CollaborationWorkItem` attempt。
- 以 `CollaborationExecutionStore` 的 WorkItem/attempt/lease/verifier/evidence 状态作为 Supervisor 执行权威；Blackboard 只保留消息、共享数据、产物和旧会话兼容投影。
- Worker 上报后由运行时确定性推进 verifier 与 evidence 阶段，Supervisor 模型不再拥有遗漏最终验收的能力。
- 看板从同一 WorkItem 投影读取状态、执行者、输入、输出、失败阶段和产物；旧 `TASK_*` 事件仅用于读取历史会话，不再驱动新任务终态。
- 为旧 Supervisor 会话提供显式、幂等的运行时绑定恢复；不静默重写历史事件文件。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `contract-bound-workitem-execution`：自然语言 Supervisor 路径必须使用正式 WorkItem 账本、确定性 verifier/evidence 推进和单一终态投影。
- `agent-session-task-runtime`：多 Agent 协作运行必须绑定当前 Session 的父 `pi-tasks` Task/Step，且父任务完成仍由 Evidence Gate 决定。

## 非目标

- 不把并行 WorkItem 转换为 `pi-tasks` ordered steps。
- 不让 Blackboard、Supervisor 或 Worker直接完成父 Task。
- 不修改冻结的 SolutionExecutionContract 或在运行时生成新 Workflow。
- 不迁移或删除旧会话的 `events.jsonl`、`blackboard.json`。
- 不修改 Web、Desktop 以外的新后端或引入数据库。

## Impact

- **Packages：** `packages/core/src/modules/collaboration-runtime/engine/`、`facade/`，以及任务看板投影和定向测试。
- **Public APIs：** 增加 Supervisor 到 WorkItem runtime 的 core 内部装配端口；不暴露 `pi-tasks` 私有状态。
- **Persistence：** 新执行写入既有 `collaboration-runs/*.json` 与当前 Session 的 canonical task entries；Blackboard task 数组降为兼容投影。
- **IPC：** 复用现有协作事件和任务运行时协议，不新增未版本化通道。
- **Dependencies：** 复用 `@originos/pi-tasks`、`AgentTaskRuntimeCoordinator` 和 `CollaborationExecutionStore`，不新增依赖。
- **Platform packaging：** 继续由现有 macOS/Windows runtime verifier 覆盖。

## 依赖

- Story 9.41 的受控 Pi Task Runtime 与 Evidence Port。
- Story 9.42 的 `CollaborationExecutionStore`、WorkItem 五阶段状态机和 contract-bound composition。
- Story P2.8 的已发布 SolutionExecutionContract。

## 上线方案

1. 先引入可测试的 Supervisor WorkItem binding/completion guard，并让新会话使用。
2. 保留旧事件投影读取，验证重启恢复和看板一致性。
3. 通过定向 runtime、看板、架构边界和 Desktop 开发态回归后随 0.4.x 发布。

## 回滚方案

- 回滚装配入口即可恢复旧 Supervisor DAG；不删除新旧持久数据。
- 已写入的 canonical Pi Task 和 CollaborationRun 保留为审计事实，不回写为 Blackboard Task。
- 回滚版本读取未知的新运行投影时降级为只读，不自动续跑或伪造完成。
