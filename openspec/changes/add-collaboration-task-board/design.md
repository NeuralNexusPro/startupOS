# Design

## Context

见 [proposal.md](proposal.md)。Story 9.44 的完整产品/交互/架构规格见 [docs/specs/epic-9/story-9.44](../../../docs/specs/epic-9/story-9.44)。协作运行时已交付：事件流（`eventStore` + `eventEmitter`，SSE `/api/collaboration/sessions/[id]/events` 与 IPC `COLLAB_EVENT` 双通道）、黑板任务（`blackboard.ts` 持久化）、`WorkspaceTaskSnapshot` 快照（`agent-task-snapshot.ts`，5s 缓存，`GET /api/collaboration/sessions/[id]/snapshot`）与 `NotificationManager` 通知中心。本 change 只做呈现层接线与一条通知挂点，引擎与存储零改动。

## Goals / Non-Goals

**Goals:**

- 协作窗口看板：事件驱动实时更新 + 会话恢复快照对账 + Agent 详情联动。
- HITL 人工确认时写入 OriginOS 通知中心（用户决策 2026-10-12）。
- 恢复范围按用户决策收窄为非全量（活跃任务 + 各 Agent 最近终端任务）。

**Non-Goals:**

- 不打通项目工作区「任务」页签（`project-task-board-*` 体系）。
- 不改 engine/session/protocol 核心子层、黑板写入语义或快照字段。
- 不新增通知中心 UI、通知类型或持久化结构。

## Decisions

### 1. 事件驱动为主、快照仅对账

看板数据以 `addEvent` 内六类 `TASK_*` 事件的增量 upsert 为主路径（与引擎 `blackboard.ts` 的 apply 语义逐条对齐）；快照仅在窗口打开/会话恢复时拉取一次。运行中不轮询快照，避免每次快照读黑板文件的 IO 放大。

备选方案是运行中周期轮询快照对账。该方案 IO 放大且引入漂移窗口的复杂度；事件流本身已是持久化 `eventStore` 回放源，丢事件场景可由「重开窗口拉快照」覆盖，MVP 不需要双写对账。

### 2. 复用零消费的 `tasks` 状态并改形

`store.ts` 既有 `tasks: {id,state,assignee}[]` 与 `setTasks` 当前零消费者，直接改形为 `TaskItem[]` 安全。派生逻辑导出纯函数 `applyTaskEventToTasks` 便于单测；汇总计数在组件内 `useMemo` 派生，不在 store 双写。

备选方案是新增独立 `boardTasks` 状态。该方案留下死状态且两份任务列表易漂移，不如直接改形。

### 3. 恢复范围 = activeTasks + 各 Agent recentTerminalTask（用户决策）

`WorkspaceTaskSnapshot` 既有形态即 `{activeTasks, agents[].recentTerminalTask, summary}`，恢复直接合成展示，不新增快照字段、不改用 blackboard GET、不做全量历史恢复。更早的终端任务不显示属预期行为，已记录为 Story 已知问题 2。

备选方案是快照 API 补全量 `tasks` 字段。该方案扩大快照体积与后端改动面，与用户决策「暂时不用全量快照」相悖，留待未来需求另立 Story。

### 4. HITL 通知挂点消费统一事件而非三条路径

Supervisor tools 直发、Worker `HITL_ESCALATE` 直连转换、旧路径兜底三条 HITL 路径最终都以 `HUMAN_REVIEW_REQUEST` 事件经 `eventEmitter` 广播。挂点通过既有 `addElectronForwarder`（传输无关的进程内回调集合，Web/Electron 同样生效）只消费事件，不感知路径差异，注册在 `facade/dag-runner.ts` 模块组装点（与 `setStartDag` 注入同位置）。幂等用进程内 `Set<event.id>`（挂 `globalThis` 容忍 HMR，参照 `hitlResumerRegistry` 模式）；`createNotification` 包 try/catch + `.catch()`，失败仅 `console.error`，绝不影响协作流程。

备选方案是在三条 HITL 路径分别插通知调用。该方案改 engine 子层且遗漏风险高；备选方案二是在通知中心轮询协作会话文件。该方案引入新的轮询 IO 且时序不可靠。

### 5. 新增一条只读 IPC 通道补齐双通道

`COLLAB_SNAPSHOT_GET: 'collaboration:snapshot:get'`：core 与 desktop 两份 `ipc-protocol.ts` 同步常量，desktop handler 转发 core facade `getSessionTaskSnapshot`（desktop 已依赖该门面，不复制业务逻辑）；Web 走既有 HTTP route 零改动。客户端函数 `getCollaborationTaskSnapshot` 完全套用 `services/collaboration.ts` 既有 `isElectron() → IPC / else fetch + readJsonResponse` 模式。

### 6. 看板会话复用 MultiAgentLauncher

项目任务看板不维护第二套“创建 session + 文件轮询消息”的聊天实现，而以 `conversationOnly` 模式嵌入既有 `MultiAgentLauncher`。该模式保留原来的 session 创建、`preconnect`、SSE/IPC 订阅、Supervisor 连续消息、HITL、Markdown、附件和输入条，只隐藏拓扑与 Worker 详情等全屏布局。折叠仅通过 CSS 隐藏容器，不卸载 Launcher，避免 session 与事件订阅丢失。Launcher 通过 `onRuntimeEvent` 在任务事件到达时通知看板刷新任务投影，聊天内容本身不再依赖投影轮询。

### 7. 产物导航复用项目工作区

文件产物引用先归一化为当前项目根目录内的相对路径。`.md` 使用带 `initialFilePath` 的 `WorkspaceWindow` 打开，由工作区 Markdown 编辑器负责读取和编辑；其他扩展名通过受数据根目录约束的 `FS_OPEN` IPC 调用 Electron `shell.openPath`，交给系统默认应用。业务单据和本体数据变更用独立的 `ProjectWorkspace` 数据窗口查看，避免在任务看板复制数据查询和详情 UI。绝对路径、父目录穿越或无法归属当前项目的引用拒绝打开，并在原卡片下显示原因。

## Risks / Trade-offs

- [TASK_CREATED 与 ASSIGNED 连发导致逐帧跳动] → zustand 更新天然批处理（React 18 自动批）；行渲染直接取最新 status，不做逐事件过渡动画。
- [快照失败] → `console.error` 降级为纯事件驱动，不弹错误 UI。
- [通知 manager 异常] → 全部防御式捕获，仅 console.error；HITL 输入卡（协作窗口内）不依赖通知，流程不受影响。
- [既有零消费 tasks 状态被隐性消费] → 实施时再次全仓 grep 确认零消费；如发现新增消费方，先对齐形状再改。

## Migration Plan

无数据迁移。上线即生效；回滚时移除 TaskBoard 挂载与通知注册调用，新 IPC 通道成为死通道不产生行为。

## 实施边界

- 工作包 A（944-T1-A）：`ui/store.ts`、`ui/TaskBoard.tsx` 及 `ui/__tests__/` 测试。
- 工作包 B（944-T1-B）：`lib/integrations/electron/` 两文件、`packages/desktop/src/main/` 两文件、`ui/MultiAgentLauncher.tsx`。
- 工作包 C（944-T1-C，可与 B 并行）：`facade/hitl-notify.ts`、`facade/__tests__/`、`facade/dag-runner.ts`（仅组装点一行）。
- 工作包 A 与 B/C 有文件重叠（MultiAgentLauncher 依赖 store 改形），B 与 C 写入范围互不重叠可并行；所有应用源码在独立 Task branch/worktree 实施，Proposal 主 worktree 仅编排与集成。
