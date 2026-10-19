# Proposal

## Why

多 Agent 协作窗口目前只有聊天流与拓扑图，任务派发与执行进度散落在 Supervisor/Worker 对话中，用户无法一眼看出「哪个 Agent 负责哪个任务、进行到什么状态」，也不能在关闭窗口后恢复看板，更不会在 HITL 人工确认挂起时收到主动提醒。协作运行时已有完整的任务事实（`TASK_*` 事件、黑板任务、`WorkspaceTaskSnapshot` 快照与 `/snapshot` 只读 API），缺少的只是呈现层接线与一条通知挂点。

**可追溯信息：** Epic 9；Story 9.44；任务 944-T1；Owner：Core / Collaboration Runtime；来源：[docs/specs/epic-9/story-9.44](../../../docs/specs/epic-9/story-9.44)。

## What Changes

- 将协作 UI store 的既有 `tasks` 状态（当前零消费）升级为 `TaskItem[]`，在 `addEvent` 中对 `TASK_CREATED/ASSIGNED/STARTED/REPORTED/COMPLETED/FAILED` 六类事件做增量 upsert，语义对齐引擎 `blackboard.ts`。
- 新增纯展示组件 `TaskBoard`（汇总条 + 任务行 + 折叠态），挂载到 `MultiAgentLauncher` 的 Agent 状态条与主区之间；点击任务行联动既有 `WorkerDetailDrawer`。
- 新增 Electron IPC 通道 `COLLAB_SNAPSHOT_GET` 与双通道客户端函数 `getCollaborationTaskSnapshot`，会话恢复时拉取一次快照对账；恢复范围按用户决策收窄为活跃任务 + 各 Agent 最近终端任务，不做全量恢复。
- 新增 facade 级通知挂点 `hitl-notify.ts`：`HUMAN_REVIEW_REQUEST` 事件经既有 `addElectronForwarder` 触发 `NotificationManager.createNotification` 写入 OriginOS 通知中心（按事件 id 幂等，失败仅 console.error，通知中心 UI 零改动）。
- 不改 engine/session/protocol 核心子层，不新增存储与快照字段；项目工作区「任务」页签（`project-task-board-*` 体系）不呈现协作任务，两套体系不打通。
- 项目维度任务看板内嵌既有 `MultiAgentLauncher` Supervisor 会话表面，复用同一会话的 SSE/IPC 事件流、流式消息、HITL、Markdown、附件与连续追问交互；看板不再通过文件轮询模拟聊天响应。
- 任务详情中的文件产物可直接打开并定位到项目工作区；业务单据或本体数据变更可打开当前项目的数据窗口查看。

## Capabilities

### New Capabilities

- `collaboration-task-board`: 协作窗口统一任务看板的数据派生、快照恢复、Agent 详情联动与 HITL 系统通知行为。

### Modified Capabilities

- 无。

## Impact

- 影响 `packages/core/src/modules/collaboration-runtime/ui/`（store、TaskBoard、MultiAgentLauncher）、`facade/`（hitl-notify、dag-runner 组装点）、`packages/core/src/lib/integrations/electron/`（ipc-protocol、services/collaboration）、`packages/desktop/src/main/`（ipc-protocol、collaboration-service handler）与 Web 任务看板会话容器。
- 复用既有 HTTP route `GET /api/collaboration/sessions/[id]/snapshot`、`NotificationManager` 与 MultiAgentLauncher；API route 无需新增聊天协议。
- 不新增持久化、数据库、外部集成；`project-task-board-*` 相关 capability 与文件零改动。
- 依赖 Story 9.41/9.42 已交付的协作事件流与快照基础设施；为 Story 9.43 之后的多 Agent 可观测性补齐看板与通知能力。

## Dependencies

- 无上游未完成依赖；协作事件流（SSE/IPC `COLLAB_EVENT`）、`WorkspaceTaskSnapshot` 快照 API 与 `NotificationManager` 均已交付。

## Rollout / 回滚

- 上线：随常规版本发布，纯前端呈现层 + 一条只读 IPC 通道 + 一个可选通知挂点，无迁移步骤。
- 回滚：移除 TaskBoard 挂载与通知注册调用即可恢复原状；新 IPC 通道保留不影响行为（无 handler 消费时为死通道）。不产生任何需要清理的数据。

## 非目标

- 不实施项目工作区「任务」页签与协作看板的数据打通。
- 不做全量历史任务恢复（用户决策 2026-10-12：仅活跃任务 + 各 Agent 最近终端任务）。
- 不改协作引擎、黑板写入语义或 Supervisor/Worker 协议。
- 不新增通知中心 UI 或新的通知类型。
