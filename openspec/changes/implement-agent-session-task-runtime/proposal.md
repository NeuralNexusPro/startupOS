## Why

Story 9.41 已完成受控 `@originos/pi-tasks` 公共边界，但产品中仍没有创建正式任务的入口，也没有同一 Session 内的任务规划、证据门控、受控续跑和状态恢复。用户只能使用普通聊天，模型即使只返回计划性内容也无法获得可见、可恢复且有证据约束的长期任务执行体验。

追溯信息：`epic-id: epic-9`，`story-id: story-9.41`，`task-id: 9.41-B01-agent-session-task-runtime`，`owner: Agent Runtime Owner / Web Experience Owner`，来源：`docs/specs/epic-9/story-9.41/`。

## What Changes

- 在 Agent 与 RoleAgent 共用的输入组件增加“创建任务”入口，在当前消息区域建立只存在于 renderer 的任务草稿卡片。
- 用户提交草稿后，通过版本化 IPC/API 边界在当前 Pi Session/branch 建立 planning lease，并由当前 Agent 调用 `task_plan` 创建唯一正式 Task。
- 新增 Session 级 `chat`、`task_planning`、`task_running` 执行模式与互斥 completion policy；普通聊天只运行 Chat Completion Guard，正式任务只运行 Task Runtime。
- 新增 Task 状态事件投影和消息区 Task 卡片，展示 ordered steps、criteria、evidence、blocker、状态及可执行操作。
- 新增有界 `TaskContinuationController`，基于 canonical `pi-tasks` snapshot、Session idle 状态、预算和 no-progress 保护决定继续、验证、等待用户、暂停或失败。
- 持久化最小执行 lease、幂等 request 映射、Pi Session/branch 引用和有界 UI 投影；恢复时仍以 `pi-tasks` current branch replay 为事实源。
- 为创建、重复提交、evidence gate、chat/task 互斥、失败反馈、停止、重载恢复和 Agent/RoleAgent 复用补充单元、集成与 UI 测试。
- 上线随 Core、Web 和 Desktop 常规构建发布；若出现兼容问题，可禁用 Task Runtime capability，保留普通聊天，并回滚本 Proposal 的产品接入提交，不删除 canonical `pi-tasks` entries。

非目标：不启动 Workflow、多 Agent、Worker、DAG 或新 Session；不实现 Story 9.42；不维护第二套 Task Plan/criteria；不开放 force completion；不修改 `@originos/pi-tasks` Evidence Gate 语义；不把普通聊天自动升级成任务。

## Capabilities

### New Capabilities

- `agent-session-task-runtime`: 定义 Agent/RoleAgent 当前 Session 的任务草稿、正式规划、互斥执行模式、状态投影、证据门控续跑与恢复行为。

### Modified Capabilities

无。

## Impact

- Core：`packages/core/src/lib/integrations/pi-agent/` 新增产品 Task Runtime coordinator、lease/store、状态投影与 completion policy；复用 `@originos/pi-agent-adapter/task-runtime` 公共 API。
- Web：`packages/web/src/components/ui/chat-input-bar.tsx`、Agent/RoleAgent 会话容器和消息渲染新增任务入口与 Task 卡片；不在 `app/` 放业务逻辑。
- Desktop：`packages/desktop/src/main/services/agent-session-service.ts` 和 IPC protocol 增加任务创建、查询、控制与事件边界。
- 持久化：扩展 Session JSON 的版本化 execution control 字段，不复制 canonical Task ledger；保持本地文件存储。
- API/IPC：新增版本化 Task Runtime 请求、响应和事件类型；旧客户端普通聊天协议保持兼容。
- 依赖：复用已锁定的 `@originos/pi-tasks@0.2.0-originos.1`、Pi Runtime `0.80.10` 与 ADR-010 公共 adapter，不新增第三方依赖。
- 平台：需要 Electron 开发态、Windows x64、macOS x64/arm64 module-resolution 与恢复 smoke；不修改签名、notarization 或发布协议。
