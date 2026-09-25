# Proposal

## Why

Story 9.43 要求所有列表、详情和命令在读取正文前验证项目权限，并要求后台状态变化实时更新且不打断用户输入。当前 actor 由 transport 注入，但 Core 没有统一项目授权端口；看板仅在手动刷新或本次命令后更新，无法满足 B02、B13。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T9；Owner：Project Runtime / Desktop / Web。

## What Changes

- 在 Core project service 注入 `ProjectAccessPort`，list/get/mutation/subscription 均先校验 actor 与 project capability，拒绝时不读取 Task/Run/WorkItem 正文。
- 复用现有 Task Runtime/Collaboration 事件源形成 project-scoped、带 sequence/revision 的订阅投影，不新增第二事件总线。
- Desktop preload 提供精确 subscribe/unsubscribe；Web 状态层按 revision 合并更新，sequence gap 时重新读取当前页。
- 后台更新保留搜索、筛选、创建/编辑草稿、选择和焦点；卸载与项目切换必须清理监听器。

## Non-goals

- 不广播消息正文、凭据或其他项目数据。
- 不依赖定时 5 秒全量轮询，不在 renderer 做授权判断。
- 不持久化第二份任务事件日志。

## Capabilities

### New Capabilities

- `project-task-board-authorization-live-updates`: 项目权限先行的查询/命令和可恢复实时投影订阅。

### Modified Capabilities

- 无。

## Impact

影响 Core project authorization/subscription ports、Desktop IPC/preload、Web service/store/component 与安全/生命周期测试。
