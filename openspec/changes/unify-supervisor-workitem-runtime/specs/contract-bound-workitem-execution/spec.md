# Spec Delta

## ADDED Requirements

### Requirement: Supervisor 协作必须使用正式 WorkItem 账本
系统 SHALL 将自然语言 Supervisor 协作中派发给 Agent 的每个执行单元绑定到已发布执行契约创建的正式 WorkItem，并以正式运行快照作为执行状态、尝试次数、租约、验收结果和失败原因的唯一事实源。共享黑板中的任务记录只能作为会话展示或历史兼容投影，不得覆盖正式 WorkItem 的状态。

#### Scenario: 派发到正式 WorkItem
- **WHEN** Supervisor 根据用户目标选择一个满足前置条件的 Agent 执行单元
- **THEN** 系统 MUST 执行与该 Agent 和已发布契约节点精确绑定的正式 WorkItem attempt
- **AND** 看板 SHALL 显示该 WorkItem 的负责 Agent、输入引用、输出引用和当前阶段

#### Scenario: 模型未主动触发验收
- **WHEN** Worker 已返回输出但 Supervisor 模型没有继续调用验收工具
- **THEN** 运行时 SHALL 按正式 WorkItem 状态机确定性进入 verifier、outcome 与 evidence 阶段
- **AND** 不得因模型缺少后续工具调用而把已有输出记为失败或遗留在 running

#### Scenario: 黑板状态与正式账本冲突
- **WHEN** 历史黑板任务状态与对应正式 WorkItem 的状态不一致
- **THEN** 系统 MUST 采用正式 WorkItem 状态、失败原因和证据结果
- **AND** 黑板记录不得推进、回退或完成正式 WorkItem

#### Scenario: 进程恢复期间避免重复执行
- **WHEN** 应用在 Worker 返回、验收或证据提交阶段退出后恢复同一运行
- **THEN** 系统 SHALL 从持久化的 attempt、阶段 claim 与幂等请求恢复
- **AND** 不得重复派发已被接收的 Worker attempt 或重复提交已接纳的证据

### Requirement: WorkItem 失败必须保留可诊断阶段
系统 MUST 在正式 WorkItem 账本中保留失败发生的执行阶段、结构化失败代码、可读原因以及可恢复动作，并将这些信息投影到任务看板。

#### Scenario: Worker 执行失败
- **WHEN** Worker 进程、模型调用或工具执行失败
- **THEN** 对应 attempt SHALL 记录 worker 阶段失败及具体原因
- **AND** 看板不得只显示通用“任务失败”或空响应错误

#### Scenario: 验收失败
- **WHEN** Worker 已产生输出但 verifier 拒绝该输出
- **THEN** WorkItem SHALL 进入 revision、needs_review 或 failed 中符合策略的状态
- **AND** 系统 SHALL 保留 verifier 的验证方法、失败理由和相关产物引用
