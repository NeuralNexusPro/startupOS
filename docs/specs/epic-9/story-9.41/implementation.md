# 实施文档 - Story 9.41

**Story:** Agent/RoleAgent 任务入口与 pi-tasks 直接执行
**版本:** 2.2
**最后更新:** 2026-08-01

## 实施目标

实现当前 Agent/RoleAgent Session 的正式任务入口，以 `pi-tasks` 管理步骤、证据和完成门控，并在 `OriginOSAgent.prompt/continue` 入口选择互斥 completion policy，保证普通聊天 Guard 与 Task Runtime 不相互干扰。

## 实施前置门

### A-01 pi-tasks 公共边界验证

- [x] 锁定兼容当前 Pi Runtime 的 `pi-tasks` 版本和完整依赖树。
- [x] 审查扩展入口、注册工具、state event、custom entries、current branch replay 和 compaction 行为。
- [x] 证明宿主可在相同 Pi Session/branch 的受控上下文调用已注册 task tools。
- [x] 验证 schema validation、权限、错误结果和 state event revision。
- [ ] 验证 Electron 开发态及 Windows/macOS 打包态的 CJS/ESM 加载。
- [x] 形成 ADR，记录选定命令边界、版本锁定、迁移和兼容策略。
- [x] 如果宿主 tool invocation 不受支持，停止后续实现，选择上游 API 或受控 fork。

A-01 未通过时禁止以私有 reducer/store、Session 文件解析或 custom entry 伪造替代。

**边界结果：** A-01 于 2026-07-29 拒绝 stock 组合。A-02 于 2026-08-01 完成
受控 Runtime host invoke、`@originos/pi-tasks` v2 ledger/Evidence Gate 和
`@originos/pi-agent-adapter/task-runtime` 公共 bridge，公共契约与普通聊天回归通过。
Story 9.41 产品实现已解阻，后续只允许使用
`docs/architecture/decisions/ADR-010-controlled-pi-task-runtime-boundary.md` 批准的边界。
Windows/macOS 真包结果仍需在 A-02 verification goal 中记录，不能以本地 smoke
替代跨平台发布证据。

## 实施步骤

### 1. Pi Task Runtime integration

- [ ] 在 `task-runtime/` 定义 `PiTaskExecutionScope`、tool name、snapshot 和错误类型。
- [ ] 实现 `PiTaskCommandGateway.invoke()`，只调用 A-01 批准的公开边界。
- [ ] 实现公开 state event 订阅和 current branch replay。
- [ ] 将状态转换为版本化 `PiTaskContractSnapshot`。
- [ ] Mutation 只有在收到匹配 taskId/revision 的 state event 后才成功。
- [ ] 不向上层暴露扩展私有对象。

### 2. Session 持久化与 Lease

- [ ] 扩展 StoredSession，保存 `piSessionRef`、branchId 和版本化 task runtime state。
- [ ] 实现 `SessionExecutionLeaseStore` 和持久 CAS。
- [ ] 定义 modeEpoch、expectedRevision 和 continuation nonce。
- [ ] 实现 requestId -> reservation/taskId 幂等映射。
- [ ] active Task 期间拒绝 branch/fork 切换。
- [ ] 增加 schema migration、损坏状态和不兼容版本处理。

### 3. Task planning coordinator

- [ ] 校验当前 Session、Agent/RoleAgent、branch、CWD和是否已有 active Task。
- [ ] 在模型请求前原子创建 planning reservation。
- [ ] 使用 `completionPolicy=task_runtime` 在当前 Session 发起 planning turn。
- [ ] Planning prompt要求生成原子 steps、可验证 criteria并调用`task_plan`。
- [ ] 收到 state event 后 CAS绑定taskId并切换`task_running`。
- [ ] Planning失败且未创建Task时释放lease并恢复草稿。
- [ ] 处理state event已写入但taskId尚未绑定时的崩溃恢复。

### 4. completion policy

- [ ] 定义`CompletionPolicy = chat_guard | task_runtime`。
- [ ] 在`OriginOSAgent.prompt()`和`continue()`进入Chat Guard前解析policy。
- [ ] 普通聊天保持现有`runWithCompletionGuard`行为。
- [ ] Task planning/running走不包含Chat Guard语义judge/recovery的raw turn路径。
- [ ] 公共日志、异常规范化和可见错误投递抽成不含completion decision的共享层。
- [ ] 增加运行时断言和指标，确保一次turn只进入一个policy。

### 5. TaskContinuationController

- [ ] 实现 execute_step、verify_evidence、wait_for_user、attempt_complete、pause、fail 决策矩阵。
- [ ] 无 pending Step但门控未通过时进入verification，不得停止。
- [ ] 使用task_next/task_resume等紧凑契约。
- [ ] continuation绑定scope、taskId、revision、modeEpoch和持久nonce。
- [ ] 用户消息、abort、retry、compaction和queued continuation期间不重复派发。
- [ ] 以canonical revision和有效Evidence变化判断进展。
- [ ] 增加自动轮数、时间、token和no-progress断路器。

### 6. EvidenceVerifier

- [ ] 定义command/test/file/tool_result/user_confirmation Evidence schema。
- [ ] 校验Task/revision、允许路径、artifact存在性、SHA-256、退出码和toolCallId。
- [ ] 拒绝模型自报、旧revision、错误Task、hash不一致和not_verified。
- [ ] 使用稳定evidenceId保证重复登记幂等。
- [ ] 将验证后Evidence通过task_evidence登记。
- [ ] 映射task_complete结构化拒绝原因。

### 7. Task feature与状态投影

- [ ] 区分canonical Task status和execution control status。
- [ ] 定义planning/queued/running/verifying/waiting_user/paused/recovering/failed。
- [ ] failed不伪造canonical completed/cancelled。
- [ ] UI投影增加有界Evidence摘要、branchId、modeEpoch和revision。
- [ ] 同一Session/branch拒绝第二个active Task。
- [ ] 首版不实现force completion。

### 8. 暂停、取消与 waiting_user

- [ ] “停止”abort当前turn并进入paused，保留Task。
- [ ] “取消任务”abort并通过批准mutation将Task标记cancelled。
- [ ] waiting_user答复携带taskId、blockerId、revision和epoch。
- [ ] 用户答复先解决blocker，收到新revision后调用task_resume。
- [ ] 所有路径继续使用task runtime，不调用Chat Guard。
- [ ] 迟到事件不能覆盖terminal/新epoch状态。

### 9. Desktop/API 接线

- [ ] 增加提交、读取、暂停、取消、答复、恢复和状态订阅边界。
- [ ] desktop service只负责IPC、环境和Electron Session。
- [ ] 命令使用requestId和expectedRevision。
- [ ] 错误同时更新Task投影并向当前消息流投递去重反馈。
- [ ] 取消和暂停复用当前Agent abort。

### 10. Web UI

- [ ] 输入框工具栏增加通用任务图标按钮。
- [ ] 消息区域实现稳定key的本地草稿卡片。
- [ ] 不增加执行策略、Workflow、多Agent或force completion控件。
- [ ] 草稿原位切换planning和正式Task状态。
- [ ] 展示Step、Criterion、Evidence、Blocker和结果。
- [ ] waiting_user复用原消息输入框。
- [ ] 区分停止、继续和取消任务。
- [ ] 状态事件按branchId、revision、epoch去重并节流。

### 11. 恢复与可观测性

- [ ] 按Session -> Pi branch -> pi-tasks replay -> lease reconciliation顺序恢复。
- [ ] 恢复期间显示recovering，不盲目续跑。
- [ ] nonce保证reload后continuation最多一次。
- [ ] 状态缺失、损坏、版本不兼容、ownership错误均产生可见诊断。
- [ ] 日志记录模式、taskId、revision、nonce、决策和失败分类。
- [ ] 不打印任务正文、模型正文、凭据和大型工具输出。

### 12. 测试与验证 Goal

- [ ] 先实现`testing.md`中的fixture、fake state event和确定性并发barrier。
- [ ] 运行单元、集成、UI、恢复、E2E和打包smoke。
- [ ] 运行现有Agent/RoleAgent、消息流、Chat Guard和工作目录回归。
- [ ] 创建自动化测试验证Goal，目标为“通过Story 9.41 testing.md中定义的测试case”。
- [ ] Goal输出记录每个AC/TC的Evidence、人工步骤和剩余风险。

## 主要改动范围

- `packages/core/src/lib/features/agent-tasks/`
- `packages/core/src/lib/integrations/pi-agent/task-runtime/`
- `packages/core/src/lib/integrations/pi-agent/core/agent.ts`
- `packages/core/src/lib/integrations/pi-agent/agent-manager.ts`
- `packages/core/src/lib/integrations/pi-agent/session-store.ts`
- `packages/core/src/lib/storage/`
- `packages/desktop/src/main/services/`
- `packages/web/src/components/agent-tasks/`
- `packages/web/src/services/`
- `packages/web/src/store/`
- `packages/agent/` adapter/package manifest

实施时以实际公共边界为准，不修改编译产物。

## 迁移与兼容

- 普通聊天默认保持现有行为，不自动创建Task。
- 现有Goal extension可保留供其他用途，但9.41运行路径不加载或调用它。
- 禁止同一Session同时启用Goal continuation、Chat Guard continuation和Task continuation。
- 首版只支持新建Task，不把历史聊天自动迁移为Task。
- `pi-tasks`不可用时任务入口禁用，普通聊天仍可使用。
- task runtime state使用schemaVersion，升级不兼容时进入recovering/failed，不静默重建。

## 审查要点

- 是否A-01已通过且没有访问`pi-tasks`私有实现。
- 是否completion policy在`prompt/continue`入口互斥。
- 是否仍存在Workflow、auto/direct策略或子Agent入口。
- 是否有两个Task canonical state。
- 是否根据assistant文本而不是Task状态决定完成。
- 是否无pending Step但缺Evidence时进入verification。
- 是否存在force completion或Evidence绕过。
- 是否lease、requestId、branch和nonce可持久恢复。
- 是否用户消息、取消、reload与continuation存在竞态。
- 是否task模式错误只写日志、前台静默。
- 是否integration反向依赖feature/web/desktop。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建初版 |
| 2026-07-28 | 改为 `pi-tasks` 直接任务执行实施计划 |
| 2026-07-28 | Workflow 和多 Agent 实施迁移到 Story 9.42 |
| 2026-07-29 | 增加A-01集成门、planning reservation、policy入口隔离、EvidenceVerifier和持久恢复步骤 |
| 2026-07-29 | 完成A-01审计并判定stock边界Rejected，阻止后续产品实施 |
| 2026-08-01 | A-02 建立受控公共边界并通过完整回归，Story 产品实施解阻 |
