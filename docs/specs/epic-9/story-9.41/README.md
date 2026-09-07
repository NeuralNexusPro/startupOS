# Story 9.41: Agent/RoleAgent 任务入口与 pi-tasks 直接执行

**Epic:** 9 - Multi-Agent 协作运行时
**状态:** Ready（A-02 公共边界已通过，产品实现待独立 Proposal）
**优先级:** High
**Owner:** Product / Agent Runtime
**创建日期:** 2026-07-28
**最后更新:** 2026-08-01

## User Story

作为 Agent 或 RoleAgent 的用户，我希望从当前会话创建一个有明确步骤、验收标准和证据门控的持续任务，并在同一会话中执行、暂停、恢复和查看结果，以便模型不能因为一次 `stop` 或未经验证的自报完成而提前结束任务。

## 目标

- 在 Agent 与 RoleAgent 输入框工具栏提供统一“创建任务”入口。
- 点击入口后在当前消息区域插入草稿卡片，只有用户明确提交才启动正式任务规划。
- 使用 `pi-tasks` 作为 Task、Step、Criterion、Evidence、Blocker 和完成状态的唯一事实源。
- 任务只由当前 Agent/RoleAgent 在当前 Session 直接执行，不创建独立任务会话。
- 普通聊天与正式任务采用互斥执行策略，`ChatCompletionGuard` 与 Task Runtime 不得同时控制同一次模型调用。
- 正式任务由状态驱动的 `TaskContinuationController` 受控续跑。
- 只有 `pi-tasks` evidence gate 通过后才能完成任务；首版不存在强制完成入口。
- 等待用户、失败、取消、预算暂停和恢复必须在原 Session 提供明确反馈。
- reload/resume 后恢复相同 Pi Session branch、Task contract 和执行 lease。

## 已确认设计决策

1. 普通聊天不进入 Task Runtime，继续使用现有 Chat Completion Guard。
2. 同一 Session 同一时刻只能由一种 completion policy 控制。
3. 用户提交的是任务目标草稿；ordered steps 和 acceptance criteria 由当前 Agent 在 task planning 阶段生成并通过 `task_plan` 建立。
4. Task 运行过程留在当前 Session，不创建 Workflow、Worker、子 Agent 或新 Session。
5. `pi-tasks` 是任务事实源；OriginOS 只持久化执行 lease、幂等映射、Pi Session 引用和有界 UI 投影。
6. 首版禁止 force completion，任何 UI、IPC 或内部命令都不能绕过 evidence gate。
7. active Task 期间首版禁止切换 Pi branch/fork；恢复时必须匹配原 branch identity。

## 非目标

- 不提供执行策略选择。
- 不在本 Story 启动 Workflow、多 Agent、Worker、DAG 或子 Agent。
- 不维护自定义 Goal 状态机、第二套 Task Plan 或第二套 completion criteria。
- 不把普通聊天自动升级为 Task。
- 不开放强制完成。
- 多 Agent 对正式任务的复用由 [Story 9.42](../story-9.42/README.md) 单独实现。

## 架构实施门

在进入产品实现前必须完成公共 Task Runtime 边界门：

- 锁定兼容版本并验证 `pi-tasks` 的公开 extension/tool/state event 边界。
- 优先通过同一 Pi Session 的受支持工具调用上下文执行 `task_plan`、`task_update`、`task_evidence`、`task_resume` 和 `task_complete`。
- 如果当前 Pi Runtime 不支持宿主安全调用已注册工具，必须选择“上游补充公共命令 API”或“维护受控 fork”，更新 ADR 后才能继续。
- 禁止导入 `pi-tasks` 私有 reducer/store、解析其 Session 文件或直接修改 custom entry。

**当前结果：** A-01 于 2026-07-29 拒绝 stock 组合；A-02 于 2026-08-01 建立并验证
受控 Runtime patch、`@originos/pi-tasks` 与
`@originos/pi-agent-adapter/task-runtime` 公共边界，见
[ADR-010](../../../architecture/decisions/ADR-010-controlled-pi-task-runtime-boundary.md)。
Story 已解除集成阻塞，但任务入口、Task 卡片、completion policy、lease、受控续跑和
恢复仍未实现，必须通过后续独立 Proposal 推进。

## 简要验收标准

- [ ] Agent 与 RoleAgent 复用同一任务入口和消息区域任务卡片。
- [ ] 草稿不会创建 Task、发送模型消息或改变当前输入内容。
- [ ] 提交先原子保留 task planning lease，再由当前 Session 幂等创建一个 `pi-tasks` Task。
- [ ] 正式 Task 必须包含 ordered steps 和可验证 acceptance criteria。
- [ ] Task planning/运行时绕过 Chat Completion Guard；普通聊天不加载 Task Runtime。
- [ ] Task Step、Criterion、Evidence 和 Blocker 能以有界投影映射到任务卡片。
- [ ] 未满足 evidence gate 时，assistant `stop`、工具 success 或自报完成不能结束任务。
- [ ] 无 pending Step 但 evidence 不足时进入 verification，而不是停止或死循环。
- [ ] blocker、用户停止、预算耗尽和不可恢复错误都能在前台显示原因。
- [ ] reload/resume 后恢复同一 Pi branch 和 Task，不重复创建、续跑或登记 evidence。

## 文档导航

- [需求](./requirements.md)
- [交互](./interaction.md)
- [架构](./architecture.md)
- [实施](./implementation.md)
- [测试](./testing.md)
- [返回 Epic 9](../README.md)

## 依赖

- Epic 0 Pi Agent、Persistent Agent 与 AgentManager。
- Story 9.18 可观测性基础。
- 锁定版本的 `pi-tasks` extension、task tools、state event 和 Pi custom entry 恢复能力。
- OriginOS SessionStore 对 Pi Session reference、branch identity 和执行 lease 的版本化持久化。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建 Story，定义 Agent/RoleAgent 通用任务入口 |
| 2026-07-28 | 任务入口调整到输入框工具栏，使用消息区域内联任务卡片 |
| 2026-07-28 | 任务确定在当前 Agent/RoleAgent Session 中执行 |
| 2026-07-28 | 选型调整为 `pi-tasks`，增加证据门控和任务状态契约 |
| 2026-07-28 | 移除 Workflow 和执行策略选择，多 Agent 接入迁移到 Story 9.42 |
| 2026-07-29 | 根据审查修订 completion policy、创建协议、公开集成边界、持久化恢复和 evidence gate |
| 2026-07-29 | A-01 判定 Rejected，Story 状态调整为 Blocked |
| 2026-08-01 | A-02 公共边界通过，ADR-010 取代 ADR-009，Story 调整为 Ready |
