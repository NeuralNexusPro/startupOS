# 需求文档 - Story 9.41

**Story:** Agent/RoleAgent 任务入口与 pi-tasks 直接执行
**版本:** 2.1
**最后更新:** 2026-07-29

## 需求来源

用户要求在 Agent/RoleAgent 输入框提供正式任务入口。正式任务与普通聊天不同：需要持久步骤、验收标准、证据门控、阻塞状态和受控续跑，但仍必须在当前 Session 中执行。当前场景不需要 Workflow 或多 Agent 执行。

## 功能需求

### FR1 通用任务入口

- Agent、RoleAgent、系统内置 Agent 和用户创建 Agent 使用同一入口，不按名称硬编码。
- 入口位于当前消息输入框工具栏。
- 点击入口在消息区域插入本地任务草稿卡片，不发送输入框现有文本。
- 当前消息区域最多存在一个未提交草稿；重复点击定位已有草稿。
- 当前 Session 正在处理普通请求或已有非终态 Task 时禁止提交新任务。

### FR2 草稿、规划与提交

- 草稿至少包含标题、目标和可选上下文。
- 草稿只存在 renderer 状态，不创建 taskId、不调用 `pi-tasks`、不发送模型请求。
- 用户点击“提交任务”后进入 `task_planning`，由当前 Agent 在同一 Session 生成 ordered steps 和 acceptance criteria。
- 规划结果必须通过 `task_plan` 建立正式 `pi-tasks` Task，不能由 OriginOS 保存第二份 Task Plan。
- 提交使用稳定 requestId；同一 requestId 的重试必须返回同一 planning reservation 或 taskId。
- 提交成功后草稿原位切换为 planning/Task 状态卡片，不追加重复展示项。
- 规划失败且未创建正式 Task 时回滚为 chat，保留草稿输入并显示可操作原因。
- 首版不提供 direct/auto/workflow 等执行策略选项。

### FR3 pi-tasks 唯一事实源

- 正式任务的 objective、ordered steps、acceptance criteria、evidence、decision、blocker 和 completion 均由 `pi-tasks` 管理。
- OriginOS 只保存执行 lease、requestId 幂等映射、Pi Session/branch 引用和 UI 查询投影。
- Task 是否完成只以 `task_complete` evidence gate 的结果为准。
- 模型自报“已完成”、assistant `stop` 或工具返回 success 均不能绕过门控。
- 首版不提供 force completion；不存在 UI、IPC、快捷键或内部 fallback 绕过。
- Task 状态事件通过 adapter 转换为版本化、只读、有界的产品内部快照。

### FR4 当前 Session 直接执行

- Task 复用创建入口所在的当前 sessionId、Agent/RoleAgent 身份、System Prompt、工具权限、agentBaseDir 和 Pi branch。
- Task 不创建新 Session，不启动 Workflow，不生成 Worker 或子 Agent。
- Task 后续 assistant、tool 和错误消息沿用当前 Session 的消息流。
- 用户停止、继续、补充信息和结果复核都进入同一 Session。
- 同一 Session/branch 同时最多有一个非终态正式 Task。
- active Task 期间首版禁止切换 branch/fork；尝试切换时提示先完成、取消或暂停任务。

### FR5 chat/task completion policy 互斥

```typescript
type SessionExecutionMode = 'chat' | 'task_planning' | 'task_running';
type CompletionPolicy = 'chat_guard' | 'task_runtime';
```

- 普通消息使用 `chat + chat_guard`。
- 接受任务提交 reservation 后原子切换为 `task_planning + task_runtime`。
- `task_plan` 成功后切换为 `task_running + task_runtime`。
- completion policy 必须在 `OriginOSAgent.prompt()` / `continue()` 进入现有 Chat Guard 之前确定。
- Task 模式不得执行 Chat Guard 的语义判断、完成判断或自动 continuation。
- settled 事件路由只调度 Task 下一动作，不能作为关闭 Chat Guard 的唯一位置。
- 切换模式时撤销旧模式尚未派发的 continuation。
- continuation 携带 `sessionId`、`branchId`、`modeEpoch`、`taskId` 和 `taskRevision`，过期请求直接丢弃。
- 只有 Task canonical completed/cancelled 后才切回 chat；waiting_user、paused、recovering 和 execution failed 仍由 task runtime 持有控制权。

### FR6 受控续跑与决策矩阵

- `TaskContinuationController` 只根据 `pi-tasks` 快照、Session idle 状态、执行控制状态和预算决定下一动作。
- 禁止通过匹配 assistant 文本判断 Task 是否完成。
- 控制器必须覆盖以下分支：

| 条件 | 动作 |
|------|------|
| 有 pending/active Step，且无 blocker | 执行或恢复下一 Step |
| 所有 Step 完成，但 Criterion/Evidence 未通过 | 进入 verification turn，补充或校验证据 |
| 存在未解决 blocker | 进入 waiting_user，不自动续跑 |
| evidence gate 全部通过 | 调用 `task_complete` |
| 用户暂停、预算耗尽或 usage limit | 保存进度并进入 paused |
| 不可恢复错误 | 停止自动执行并进入 failed，投递前台错误；保留 task lease，等待重试恢复或取消 |

- pending user message、用户停止、provider retry、compaction 和已排队 continuation 时不得重复派发。
- 连续两轮 canonical revision 和有效证据均无进展时暂停并显示原因。
- 自动轮数、运行时间和 token 使用必须有上限。
- 续跑使用 `task_next`/`task_resume` 等紧凑契约，不重放完整对话。

### FR7 Evidence 与完成门控

- Task 必须有可验证的 acceptance criteria 和有序步骤。
- Step 完成和 Criterion 满足必须关联 required evidence。
- Evidence 只保存稳定引用、摘要、hash、来源、验证器和验证状态，不复制大型正文。
- 允许的验证来源：
  - 测试/命令结果：退出码、结构化摘要和结果 hash。
  - 文件/产物：规范化路径、大小、SHA-256 和存在性校验。
  - 工具结果：toolCallId、工具名、成功状态和结果摘要 hash。
  - 用户确认：当前 sessionId、taskId、criterionId 和确认时间。
- 仅由模型声称“已验证”的 Evidence 不得单独满足关键 Criterion。
- Evidence 必须匹配当前 taskId 和 expected revision；旧 Task、旧 revision、缺失 artifact、hash 不一致和 `not_verified` 均拒绝。
- 重复 evidence 以稳定 evidenceId 幂等登记。
- `task_complete` 被拒绝时，Task 保持非终态并展示结构化 rejection reasons。

### FR8 waiting_user、暂停、失败和取消

- 缺少输入、授权、决策或遇到不可自动绕过的 blocker 时进入 waiting_user。
- waiting_user 通过原 Session 消息输入框答复；答复必须关联当前 taskId 和 blockerId。
- 用户答复先更新/解决 blocker，再调用 `task_resume`；全过程仍使用 task runtime。
- provider 或工具暂时错误允许有限重试；业务错误应由 Agent 尝试替代方法。
- 恢复次数耗尽或不可恢复时必须向用户发送结构化失败消息，不能只记录后台日志。
- “停止”表示暂停当前执行：abort 当前 turn、撤销 continuation，保留 Task 供继续。
- “取消任务”表示终止 Task：abort、撤销 continuation，并通过受支持的 task mutation 标记 cancelled。
- completed、cancelled 等 canonical 终态拒绝迟到事件回写。
- failed 是 OriginOS 自动执行终止状态，不伪造 `pi-tasks` completed；保留 task lease 和最后 canonical Task 状态，直到用户重试恢复或取消。

### FR9 持久化与恢复

- OriginOS Session 必须持久化 `piSessionRef`、`branchId`、`SessionExecutionLease`、requestId 映射和 projection revision。
- `SessionExecutionLease` 使用版本化 schema 和 compare-and-swap 更新。
- reload/resume 后先恢复 Pi Session branch，再由 `pi-tasks` custom entries/state event 重建 canonical Task。
- 上次进程中的 running 不得直接推断为成功，也不得立即盲目续跑。
- 恢复必须执行 reconciliation：核对 branch、Task ownership、revision、pending user message、预算、queued continuation 和 lease epoch。
- continuation 使用稳定 nonce；进程重启后同一 nonce 最多派发一次。
- 状态缺失、损坏或版本不兼容时进入 recovering/failed 并显示诊断，不创建替代 Task。

### FR10 可观测性与性能

- 记录 taskId、sessionId、branchId、modeEpoch、状态迁移、Step、耗时、预算、continuation nonce 和失败分类。
- 日志不打印任务正文、模型完整输出、凭据或大型工具结果。
- Task 状态事件按 revision 去重并节流，不以每个 token/delta 更新任务卡片。
- 前台失败事件至少投递一次且可在 reload 后从状态投影恢复。

## 状态模型

`pi-tasks` canonical state 与 OriginOS execution control state 必须分开：

```typescript
type TaskExecutionControlStatus =
  | 'planning'
  | 'queued'
  | 'running'
  | 'verifying'
  | 'waiting_user'
  | 'paused'
  | 'recovering'
  | 'failed'
  | 'idle';
```

任务卡片状态是 `canonicalTaskStatus + executionControlStatus` 的只读映射。`failed`、`paused`、`recovering` 不得反向改写 canonical Task 为 completed。

## 验收标准

### AC1 草稿不触发运行

**Given** 用户打开 Agent 或 RoleAgent 当前 Session
**When** 点击“创建任务”并编辑草稿
**Then** 系统不创建 Task、不发送模型消息、不创建新 Session
**And** 输入框原文本保持不变。

### AC2 提交后规划并创建 Task

**Given** 草稿字段合法且当前 Session 可获取 planning reservation
**When** 用户点击“提交任务”
**Then** 当前 Session 使用 task runtime 生成 steps 和 criteria 并幂等调用 `task_plan`
**And** 只创建一个正式 Task，不创建新 Session。

### AC3 completion policy 互斥

**Given** 当前 Session 处于 task planning/running
**When** 调用 `prompt()`、`continue()` 或处理 settled
**Then** 只使用 task runtime
**And** Chat Completion Guard 不执行语义判断或续跑。

### AC4 evidence gate

**Given** assistant 返回“完成”或 `stop`
**When** Task 仍有 pending Step、缺失/无效 evidence 或 blocker
**Then** Task 不完成
**And** 控制器执行下一 Step、verification、waiting_user 或明确失败分支。

### AC5 正常完成

**Given** 所有 Step 和 acceptance criteria 均有当前 Task/revision 的合格 evidence
**When** `task_complete` 通过
**Then** 卡片显示 completed，当前 Session 回到 chat 模式
**And** 不再派发 Task continuation。

### AC6 waiting_user

**Given** Task 存在未解决 blocker
**When** Agent settled
**Then** Task 显示 waiting_user 且不续跑
**And** 用户通过原输入框答复相同 taskId/blockerId 后才恢复。

### AC7 暂停、取消与预算

**Given** 用户停止、取消，或 Task 达到预算
**When** 控制器处理命令
**Then** 停止仅暂停并保留 Task，取消更新 canonical Task 状态，预算进入 paused
**And** 三种情况均撤销当前 turn/continuation 并显示原因。

### AC8 重启恢复

**Given** 应用在 Task 非终态时重启
**When** 用户重新打开原 Agent/RoleAgent Session
**Then** 恢复相同 Pi branch、Task、lease 和 projection
**And** 不重复创建 Task、Step、evidence 或 continuation。

### AC9 普通聊天隔离

**Given** 当前 Session 没有 active Task
**When** 用户发送普通消息
**Then** 不加载或创建 `pi-tasks` Task
**And** 仅使用 Chat Completion Guard。

### AC10 公开集成边界

**Given** `pi-tasks` adapter 执行 mutation
**When** 创建、更新、登记 evidence、恢复或完成 Task
**Then** 只通过经 A-01 验证的公开工具/命令边界
**And** 不访问私有 reducer、store 或 Session 文件格式。

## 边界与异常

- `pi-tasks` 加载失败或版本不兼容：禁用提交并显示诊断原因，普通聊天可继续使用。
- 重复 requestId：返回原 planning reservation/taskId，不重复创建。
- planning reservation 成功但 `task_plan` 失败：释放 lease 回到 chat，保留草稿。
- `task_plan` 成功但首次执行失败：保留 Task 和 task lease，进入 waiting_user/paused/failed。
- 用户消息与 continuation 同时到达：用户消息优先，递增 epoch 或 revision，过期 continuation 丢弃。
- Task 终态后迟到 tool/assistant/state 事件：记录诊断后丢弃。
- Session、Agent 或原 Pi branch 已删除：Task 投影可查看但不能继续。
- Task Plan 不合法或粒度门控失败：保持 planning，由 Agent 在预算内修正；耗尽后回退草稿并显示原因。
- active Task 期间 branch/fork 切换：拒绝并显示先暂停、取消或完成任务。

## 依赖

- `pi-tasks` 及其 Pi Runtime 兼容版本。
- 当前 AgentManager、SessionStore、消息流、abort 和工作目录能力。
- 经 A-01 验证的 task mutation gateway。
- Story 9.42 是未来多 Agent 执行扩展，不是本 Story 完成前置。

## 非功能需求

- 提交反馈在 500ms 内进入 planning/queued 可见状态。
- Task 状态更新异步、节流，不阻塞 Electron main 或 renderer。
- 核心状态、模式路由、幂等和 continuation 分支覆盖率不低于 80%。
- 关键跨进程 Task 创建、状态、取消和恢复链路必须有集成测试。
- main event-loop p95 lag 在 Task 状态高频测试中不超过 50ms；单次 Task projection IPC payload 不超过 64KB。
- 不引入数据库、Redux、MobX 或新的后端框架。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建初版 |
| 2026-07-28 | 改用 `pi-tasks`，明确 chat/task 互斥和证据门控 |
| 2026-07-28 | 删除 Workflow 和策略选择，任务仅在当前 Session 直接执行 |
| 2026-07-29 | 修订 planning 协议、completion policy、状态模型、证据验证和恢复语义 |
