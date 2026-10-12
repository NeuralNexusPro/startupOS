# Spec Delta

## Purpose

为多 Agent 协作窗口提供统一任务看板（Multica 模式）：以协作运行时既有 `TASK_*` 事件流与 `WorkspaceTaskSnapshot` 快照为唯一数据源，实时呈现「哪个 Agent 负责哪个任务、进行到什么状态」，支持会话恢复对账与 Agent 详情联动；并在人工确认（HITL）挂起时向 OriginOS 通知中心发送系统通知。本 capability 不改变协作引擎执行语义，也不与项目工作区「任务」页签（`project-task-board-*`）打通。

## ADDED Requirements

### Requirement: 看板任务实时派生

协作窗口 UI SHALL 从 `TASK_CREATED`、`TASK_ASSIGNED`、`TASK_STARTED`、`TASK_REPORTED`、`TASK_COMPLETED`、`TASK_FAILED` 六类事件增量派生任务列表，语义 MUST 与引擎黑板 apply 一致：同 id 任务不重复创建，缺 `taskId`/`task` payload 的事件 MUST 被静默跳过且不抛异常。事件到达到看板更新 MUST 在 500ms 内完成（纯内存 zustand 更新）。

#### Scenario: Supervisor 派发任务后看板出现条目

- **WHEN** Supervisor 执行 dispatch 并依序发出 `TASK_CREATED`、`TASK_ASSIGNED`、`TASK_STARTED` 事件
- **THEN** 看板 MUST 在 1 秒内出现该任务条目（描述 + Agent 名 + 状态 running），且不得因连续事件产生重复条目

#### Scenario: 非任务事件不影响看板

- **WHEN** 事件流到达 `ASSISTANT_MESSAGE` 或缺 payload 的异常 `TASK_*` 帧
- **THEN** 任务列表 MUST 保持不变且不抛出异常

### Requirement: 汇总统计与 Agent 详情联动

看板 SHALL 展示汇总条（任务总数、活跃数、已完成数、失败数）并支持折叠/展开；点击任务行 MUST 通过既有 Agent 详情抽屉（`WorkerDetailDrawer`）打开对应 Agent 的事件轨迹。空会话 SHALL 显示「暂无任务，等待 Supervisor 分派」占位。

#### Scenario: 点击任务行打开 Agent 抽屉

- **WHEN** 用户点击看板中某任务行
- **THEN** 系统 MUST 打开该任务负责 Agent 的详情抽屉，且不改变任务状态

### Requirement: 会话恢复快照对账（非全量）

会话恢复（窗口重开/刷新）时，系统 SHALL 拉取一次 `WorkspaceTaskSnapshot` 并将活跃任务（`activeTasks`）与各 Agent 最近终端任务（`agents[].recentTerminalTask`）合并为看板初始状态；后续事件 MUST 正常增量更新。恢复 MUST NOT 呈现全量历史任务（用户决策 2026-10-12），且快照拉取失败时 MUST 降级为仅事件驱动、不弹出错误界面。快照获取 MUST 支持 Electron IPC 与 Web HTTP 双通道，任一通道失败不得影响另一通道。

#### Scenario: 重开窗口恢复活跃任务

- **WHEN** 协作会话存在 running 任务时用户关闭并重新打开协作窗口
- **THEN** 看板 MUST 显示该活跃任务及各 Agent 最近终端任务，且更早的终端任务不出现（属预期非全量行为）

#### Scenario: 快照接口失败降级

- **WHEN** 会话恢复时快照 IPC/HTTP 请求失败
- **THEN** 系统 MUST 仅记录控制台错误，看板以本次已接收事件派生的任务继续工作

### Requirement: 项目工作区任务页签范围排除

项目工作区「任务」页签 MUST NOT 呈现协作黑板任务；`project-task-board-*` 既有 capability 的文件与行为 MUST 保持零改动。两套任务体系在本 change 范围内不打通。

#### Scenario: 协作任务不出现在项目工作区

- **WHEN** 协作会话产生任务且用户打开项目工作区「任务」页签
- **THEN** 该页签 MUST 仅显示既有 pi-tasks 体系任务，不出现协作看板任务

### Requirement: HITL 人工确认系统通知

当协作会话产生 `HUMAN_REVIEW_REQUEST` 事件（覆盖 Supervisor 工具直发、Worker `HITL_ESCALATE` 直连转换、旧路径兜底三条路径）时，系统 MUST 向 OriginOS 通知中心写入一条「多 Agent 协作等待回复」系统通知，正文取事件 `payload.question` 并截断至 120 字符，payload MUST 记录 `hitlEventId`、`sessionId` 与 `source`。同一事件 id MUST 只产生一条通知（进程内幂等）；通知创建失败 MUST 仅记录控制台错误，不得影响协作流程、HITL 输入卡或事件流。通知中心 UI MUST 零改动（既有轮询自动消费）。

#### Scenario: HITL 挂起触发通知

- **WHEN** Supervisor 或 Worker 发起人工确认并广播 `HUMAN_REVIEW_REQUEST` 事件
- **THEN** 通知中心 MUST 出现一条未读系统通知，且同一事件重复广播时不得产生第二条通知

#### Scenario: 通知创建失败不阻断协作

- **WHEN** 通知写入因存储或权限异常失败
- **THEN** 系统 MUST 仅记录控制台错误，协作窗口的 HITL 输入卡 MUST 正常出现且用户可继续回复
