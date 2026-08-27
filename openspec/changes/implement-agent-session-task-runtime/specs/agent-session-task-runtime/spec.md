## ADDED Requirements

### Requirement: Agent 与 RoleAgent 提供当前会话任务入口
系统 SHALL 仅在 Agent 与 RoleAgent 会话输入框工具栏显示创建任务入口；点击入口 MUST 在当前消息区建立未提交任务草稿卡片，不得创建新 Session、Workflow 或正式 Task。

#### Scenario: 创建并取消任务草稿
- **WHEN** 用户在 Agent 或 RoleAgent 会话点击创建任务并填写目标后取消
- **THEN** 系统移除 renderer 草稿，不写入 Session，不调用 `task_plan`，当前聊天保持可用

#### Scenario: Skill 会话不显示任务入口
- **WHEN** 用户打开普通 Skill 会话
- **THEN** 输入框不得显示 Story 9.41 的创建任务入口

### Requirement: 提交草稿后在原 Session 建立唯一正式 Task
系统 MUST 在用户提交任务草稿后，在当前 Session 与当前 Pi branch execution context 中进入 planning lease，并通过受控 task tool 创建唯一正式 Task。

#### Scenario: 成功提交任务
- **WHEN** 用户提交有效目标且当前 Session 没有 active 或 planning Task
- **THEN** 系统进入 `task_planning`，由当前 Agent 调用 `task_plan`，并在同一 Session 中返回 canonical Task snapshot

#### Scenario: 重复提交相同请求
- **WHEN** renderer 因重试使用同一 `requestId` 重复提交任务
- **THEN** 系统返回首次请求对应的同一 Task 或 planning lease，不得创建第二个 Task

#### Scenario: 已有活动任务时提交新请求
- **WHEN** 当前 Session 已有 planning 或 active Task，用户提交不同 `requestId`
- **THEN** 系统返回可识别的冲突错误，并保持现有 Task 不变

### Requirement: Task Runtime 与普通聊天 completion policy 互斥
系统 MUST 保证一个 Session 同时只运行一种 completion policy：`chat` 模式只使用 Chat Completion Guard，`task_planning` 与 `task_running` 只使用 Task Runtime controller。

#### Scenario: 普通聊天不进入 Task Runtime
- **WHEN** 用户通过普通发送按钮发送消息且未提交任务草稿
- **THEN** 系统不得创建 Task、安装 task tools 或触发 Task continuation

#### Scenario: Task 运行时不触发 Chat Completion Guard
- **WHEN** Task Runtime 中模型以 `stop` 结束一个未完成 turn
- **THEN** 系统只依据 canonical Task snapshot 运行 Task continuation 决策，不得同时注入 Chat Completion Recovery

### Requirement: canonical Task 状态由 pi-tasks 管理
系统 SHALL 将当前 branch 的 `pi-tasks` entries 作为 plan、step、criterion、evidence、decision、blocker 和完成状态的唯一事实源；OriginOS MUST NOT 维护第二套可变 Task plan。

#### Scenario: 状态更新后投影
- **WHEN** `task_update`、`task_evidence`、`task_decision` 或 `task_complete` 成功并产生新 revision
- **THEN** 系统从 canonical snapshot 生成新的有界 UI projection，并向当前 Session 的 renderer 发送一次状态事件

#### Scenario: stale revision 被拒绝
- **WHEN** 控制命令携带的 revision、cursor 或 bridge epoch 已过期
- **THEN** 系统拒绝命令，重新返回最新 canonical snapshot，不覆盖新状态

### Requirement: Task 卡片展示可验证进度
系统 SHALL 在消息区显示 Task 卡片，并展示任务目标、状态、ordered steps、验收标准、evidence 状态、blocker、总体进度和当前可执行操作。

#### Scenario: 任务规划完成
- **WHEN** `task_plan` 成功创建包含步骤和验收标准的 Task
- **THEN** Task 卡片从 planning 状态切换为 running，并按 canonical 顺序展示步骤和验收标准

#### Scenario: 大型 Task 状态投影
- **WHEN** canonical snapshot 包含超过 UI 上限的步骤、证据或长文本
- **THEN** 系统对 projection 做确定性截断并标记省略，不通过 IPC 发送无界 raw entries 或 tool output

### Requirement: 任务完成必须通过 Evidence Gate
系统 MUST 通过受控 `task_complete` 执行完成操作；当步骤、验收标准、evidence 或 blocker 不满足时，系统 MUST 保持 Task 未完成并显示缺失条件。

#### Scenario: 证据充分时完成
- **WHEN** 所有 required steps 与 criteria 已完成且具有有效 evidence，且不存在未解决 blocker
- **THEN** `task_complete` 成功，Task 卡片显示 completed，Task tools 被卸载，Session 返回 `chat` 模式

#### Scenario: 证据不足时拒绝完成
- **WHEN** Agent 调用 `task_complete` 但至少一个 required criterion 没有有效 evidence
- **THEN** Evidence Gate 拒绝完成，Task 保持 running 或 paused，并在卡片中显示待补证据项

### Requirement: Task continuation 有界且尊重用户控制
系统 SHALL 只在 Agent idle、无 pending user input、lease 与 canonical revision 匹配且预算允许时续跑。系统 MUST 提供自动续跑上限、no-progress 保护和停止操作。

#### Scenario: 未完成任务受控续跑
- **WHEN** 当前 turn 已 settle、canonical Task 未完成且 progress fingerprint 已变化
- **THEN** controller 在当前 Session 中调度下一轮继续执行，不创建独立 Session

#### Scenario: 用户消息优先
- **WHEN** Task 等待续跑期间存在 pending user message
- **THEN** controller 不注入内部 continuation，并将控制权交给用户消息

#### Scenario: 连续无进展
- **WHEN** 连续达到配置上限的 turn 没有 canonical revision 或 progress fingerprint 变化
- **THEN** 系统暂停 Task，显示无进展原因和恢复操作，不得无限续跑

#### Scenario: 用户停止任务
- **WHEN** 用户在 Task 卡片点击停止
- **THEN** 系统中止当前模型或工具调用，更新 Task execution 状态为 cancelled 或 paused，并禁止后续自动续跑

### Requirement: 错误与等待状态必须对用户可见
系统 MUST 将 planning 失败、tool 失败、兼容性失败、预算耗尽、等待用户和恢复失败映射为稳定状态与可理解提示，不得只写后台日志后静默结束。

#### Scenario: Planning 工具失败
- **WHEN** 创建 Task 时 `task_plan` 返回错误或模型未创建 Task
- **THEN** 草稿内容被保留，Task 卡片显示失败原因和重试/返回聊天操作

#### Scenario: 等待用户输入
- **WHEN** canonical Task 存在需要用户处理的 blocker 或明确 handoff
- **THEN** controller 停止自动续跑并显示 `waiting_user` 状态与原因

#### Scenario: 运行时不兼容
- **WHEN** Pi Runtime、adapter 或 `pi-tasks` compatibility matrix 不匹配
- **THEN** Task Runtime fail closed 并显示不可用原因，普通聊天仍可使用

### Requirement: Task Runtime 可随 Session 持久化和恢复
系统 MUST 持久化 actual canonical branch entries、最小 execution lease、幂等 request 映射和有界 projection；窗口重开或应用重启后 MUST 先 replay 当前 branch，再恢复 Task 卡片和执行状态。

#### Scenario: 重开活动任务窗口
- **WHEN** 用户关闭并重新打开包含 running Task 的 Agent/RoleAgent 窗口
- **THEN** 系统在原 Session 中 replay entries，恢复同一 Task 卡片、revision 和进度，不创建新 Task

#### Scenario: projection 与 canonical 状态不一致
- **WHEN** 持久化 projection 过期但 branch replay 得到更新 snapshot
- **THEN** 系统以 replay snapshot 替换 projection，并以 canonical revision 继续

#### Scenario: 恢复数据损坏
- **WHEN** branch entries 无法 replay、schema 不支持或 branch 引用不存在
- **THEN** 系统将 Task 标记为 failed 或 paused，显示诊断信息，且不破坏 Session 普通聊天历史

### Requirement: 跨进程契约必须版本化并保持兼容
系统 SHALL 通过 Core 定义的版本化 command、snapshot 与 event DTO 连接 Web 和 Desktop；旧客户端与没有 Task state 的旧 Session MUST 保持普通聊天兼容。

#### Scenario: Desktop 创建并推送 Task 状态
- **WHEN** renderer 发送合法的版本化创建命令
- **THEN** Desktop 校验参数、调用 Core coordinator，并只在 revision 变化时向对应 Session 推送版本化 Task event

#### Scenario: 未知协议版本
- **WHEN** renderer 使用不支持的 Task Runtime protocol version
- **THEN** Desktop 返回稳定的协议不兼容错误，不执行状态变更

### Requirement: Agent 与 RoleAgent 共用同一 Task Runtime
系统 MUST 通过公共 Agent 会话边界复用 Task Runtime，不得为 RoleAgent 复制一套 reducer、IPC 或 UI 状态机。

#### Scenario: RoleAgent 创建任务
- **WHEN** 用户在 RoleAgent 输入框提交任务草稿
- **THEN** 系统使用该 RoleAgent 当前 Session、工作目录、工具权限和角色上下文创建并执行 Task

#### Scenario: Agent 创建任务
- **WHEN** 用户在普通 Agent 输入框提交任务草稿
- **THEN** 系统使用该 Agent 当前 Session、工作目录和工具权限创建并执行 Task

