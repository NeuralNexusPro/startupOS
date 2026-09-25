# Proposal

## Why

项目任务看板当前只能接收测试用内存数据，无法读取当前项目的权威 `pi-tasks` 投影，也无法在索引丢失后恢复。先完成真实数据源，才能让后续看板和协同图显示同一份 Task/Run/WorkItem 状态。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T1；Owner：Project Runtime / Core；来源：`docs/specs/epic-9/story-9.43/`。

## What Changes

- 新增受控项目任务源，从现有 Task Runtime 持久化投影读取项目内任务并按 50 条分页。
- 从既有 Run ledger 关联 Task 与 Run，不创建第二份 Task 状态或索引事实源。
- 仅允许通过现有 Task Runtime 命令控制 pause/resume/retry/cancel，并保留 revision 与 requestId 门控。
- 提供索引缺失时的重建读取路径和定向回归测试。

## Capabilities

### New Capabilities
- `project-task-board-source`: 项目级权威任务投影、分页查询、控制与可重建索引行为。

### Modified Capabilities
- 无。

## Impact

影响 `packages/core` 的 project feature 与 Task Runtime 公共接口，并由 Desktop IPC 服务装配该受控任务源；不修改 Web UI、`pi-tasks` 私有实现或持久化事实源。
