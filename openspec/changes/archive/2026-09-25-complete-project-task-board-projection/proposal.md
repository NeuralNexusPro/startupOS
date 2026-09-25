# Proposal

## Why

Story 9.43 的基础任务源和看板已能显示 Task、Run 与 WorkItem，但列表仍没有权威优先级、执行 Agent、运行徽标和真实 cursor 追加能力。当前 UI 的 Agent/优先级筛选只是占位，无法满足完整 Story 的 B09、B12 和需求 1、5、8。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T3；Owner：Project Runtime / Web；来源：`docs/specs/epic-9/story-9.43/`。

## What Changes

- 为 Task Runtime 增加可选、版本化的项目任务元数据，并从同一持久投影提供优先级、语义引用和输入版本；缺失时明确返回未设置，不猜测默认值。
- 从绑定 Run 的 WorkItem 聚合当前执行 Agent、运行状态和恢复徽标，保持 Task 完成状态仍只来自 `pi-tasks`。
- 扩展任务看板摘要和详情，展示产物引用、执行 Agent、优先级、语义引用与执行状态。
- 实现 Agent/优先级组合筛选和 cursor“加载更多”，只追加服务端返回的当前页并按 taskId/revision 去重。

## Non-goals

- 不新增任务状态事实源，不修改 Task 完成状态。
- 不实现任务创建、优先级写入、Agent 交接、拖拽、协同图或实时订阅；这些由 943-T4 及后续任务处理。

## Capabilities

### New Capabilities

- `project-task-board-projection`: 从权威 Task/Run/WorkItem 投影生成可分页、可筛选的项目任务摘要和详情。

### Modified Capabilities

- 无。

## Impact

影响 Core Task Runtime 公共类型、project task source/board、Web project task board service/UI 及定向测试。数据仍存于现有 JSON 会话和 Run ledger，不引入数据库或第二任务状态。
