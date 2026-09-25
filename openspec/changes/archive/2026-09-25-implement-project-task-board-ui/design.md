# Design

## Context

943-T1 已在 Core 提供项目级任务投影，并在 Desktop main 装配真实数据源。项目工作区尚无消费该协议的界面。详见 `proposal.md` 与 `docs/specs/epic-9/story-9.43/`。

## Goals / Non-Goals

**Goals:**

- 在 Web 组件层实现可嵌入项目工作区的看板与任务详情。
- 通过 Web service 适配已有 Desktop IPC，不让组件依赖 Electron 或 Core 私有实现。
- 只显示查询返回的权威状态；控制完成后以返回投影覆盖界面。

**Non-Goals:**

- 不做拖拽写状态、任务创建、指派、优先级写入、实时订阅或 Web 服务端实时控制。
- 不修改 Task Runtime、跨包协议或 Run/WorkItem 持久化。

## Decisions

### 以项目工作区子视图承载看板

在 `packages/web/src/components/os/workspace/` 增加项目任务看板组件，并由既有项目工作区传入项目 ID。该位置属于 Web 组件层，可使用 Web service 与 Zustand 局部状态；不在 App Router route 写业务逻辑。

替代方案是在独立页面或新 Electron 窗口实现。前者增加导航与状态恢复成本，后者不利于与当前项目上下文和协同图联动，因此不采用。

### 单一 Desktop IPC service 适配

在 `packages/web/src/services/` 增加窄适配器，优先通过 preload 的跨包 invoke 调用；缺少桌面能力时返回结构化 unavailable。组件不直接 `fetch` Web API，因为 Web 服务进程没有真实 Agent Runtime，调用它会产生不一致的控制语义。

替代方案是复用 `/api/ontology/cross-package`。该 API 当前有意注入 unavailable Task source，不能满足实时控制，故不采用。

### 独立的项目任务列表请求

跨包协议新增 `list_project_tasks` 请求，仅接受 projectId、cursor 与最大 50 条的 limit，并调用既有 `ProjectTaskBoardService.listProjectTasks`。列表不依赖本体版本；任务详情和控制继续复用已有请求。Desktop IPC controller 维持可信 sender 与请求结构校验，Web API 保持 unavailable 以避免把运行时读取错误地暴露到 Next 进程。

替代方案是让项目工作区猜测 canonical ontologyVersion 后调用 `read_semantic_context`。本体版本不是该视图可验证的输入，且将任务列表耦合到不需要的本体查询，故不采用。

### 以查询响应作为 UI 事实源

看板局部状态仅保存当前页、筛选草稿、选中项与请求中状态；Task、Run、WorkItem 由查询结果替换。操作请求使用任务返回的 revision 与随机 requestId，拒绝后重新读取当前任务或列表。

替代方案是在浏览器维护乐观任务状态。它会形成第二份状态并在恢复或冲突后误导用户，故不采用。

### 可控的并发写入范围

Protocol subagent 仅写 Core 跨包契约/服务、Desktop IPC controller 及其定向测试。service subagent 仅写 `packages/web/src/services/project-task-board.ts`、其测试和必要类型；UI subagent 仅写 `packages/web/src/components/os/workspace/project-task-board/`、项目工作区入口与组件测试。三者以该最小协议交互，不改 Task Runtime 与持久化事实源。

## Risks / Trade-offs

- [任务运行时尚未恢复] → 将操作显示为不可用并展示恢复提示，不能通过 Web API 代替。
- [列表仅当前页 50 条] → 显示“加载更多”并仅对已加载任务筛选，避免浏览器全量加载。
- [跨进程能力缺失] → 提供明确桌面环境提示，不吞掉错误或显示成功。
- [轮询与编辑冲突] → 本次不引入后台轮询；用户操作后刷新权威投影，后续订阅独立设计。

## Migration Plan

1. 在项目工作区增加入口，默认不改动现有项目页面。
2. 由桌面应用加载时使用既有 IPC 能力；Web 开发态显示不可用说明。
3. 回滚仅移除入口与组件，任务运行时、会话投影和跨包协议保持不变。
