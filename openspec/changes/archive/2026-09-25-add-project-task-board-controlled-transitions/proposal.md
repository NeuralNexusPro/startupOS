# Proposal

## Why

Story 9.43 要求拖拽与键盘移动通过同一服务端门控。当前看板只有 pause/resume/retry/cancel 按钮，没有目标列意图；若前端直接改列，会绕过 Task revision、Evidence Gate、Blocker 和 9.42 runtime 状态。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T5；Owner：Project Runtime / Web；来源：`docs/specs/epic-9/story-9.43/`。

## What Changes

- 新增 `requestProjectTaskTransition`，输入目标列、requestId、expectedRevision 和必要 lease epoch；Core 将其解析为公开 Task/runtime/review 命令或结构化拒绝。
- `done` 必须经过 Task Runtime Evidence Gate，存在未解决 Blocker、缺失 Criterion/Step Evidence 或无公开完成能力时零写入拒绝。
- 看板拖拽和键盘“移动到”菜单共用同一 transition handler；请求完成前卡片保持原列。
- 成功只用服务端返回投影更新；拒绝、冲突或 unavailable 时保留原投影、筛选、详情和焦点，并播报原因。

## Non-goals

- 不在前端复制状态转换表，不将 WorkItem 完成映射为 Task done。
- 不允许任意列间移动；只有服务端公开 capability 才能执行。
- 不包含 Agent 交接、优先级写入或任务创建。

## Capabilities

### New Capabilities

- `project-task-board-controlled-transitions`: 基于目标状态意图、Task 权威能力和 Evidence Gate 的看板转换协议。

### Modified Capabilities

- 无。

## Impact

影响 Core project task board/source、Task Runtime 公共控制端口、cross-package contract/service、Desktop IPC、Web service/UI 与定向测试。
