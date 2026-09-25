# Proposal

## Why

943-T1 已提供项目级权威任务投影和受控操作，但用户仍无法在项目工作区查看、筛选或操作这些任务。943-T2 需要将同一投影呈现为看板与协同图入口，且不能在前端创建第二份任务状态。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T2；Owner：Project Runtime / Web；来源：`docs/specs/epic-9/story-9.43/`。

## What Changes

- 在项目工作区新增任务看板，按受控 Task 投影展示待执行、进行中、阻塞、待审核、已完成与已取消任务。
- 扩展 Desktop IPC 的跨包协议，提供仅按项目、cursor 和 limit 查询的任务列表；保留 requestId、expectedRevision、项目隔离和结构化拒绝反馈。
- 提供搜索、Agent/优先级筛选、任务详情、WorkItem 摘要和 pause/resume/retry/cancel 操作；控制结果以权威投影回写界面。
- 由同一任务详情状态承载协同图定位入口；不实现任务创建、指派、优先级编辑、拖拽改状态或独立订阅总线。

## Non-goals

- 不创建第二套用户任务、任务索引或完成状态。
- 不绕过 Desktop Runtime 到 Web 服务端执行实时任务控制。
- 不修改 pi-tasks 私有实现、Run 恢复算法、外部 Linear 同步或审批流。

## Capabilities

### New Capabilities

- `project-task-board-ui`: 项目工作区内基于权威任务投影的看板、详情和受控操作体验。

### Modified Capabilities

- 无。

## Impact

影响 `packages/core` 跨包契约与服务、`packages/desktop` IPC 控制器、`packages/web/src/components/os/workspace/`、Web 的 Desktop IPC service 适配与项目工作区导航。无需新增数据库、持久化事实源或平台打包配置。

上线时随桌面应用发布；若出现问题，可移除项目工作区入口，底层 Task Runtime 与持久投影不受影响。
