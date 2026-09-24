# Spec Delta

## Purpose

为多 Agent 运行提供由已批准执行契约约束的可恢复执行闭环，使 Worker 结果、验证结论和父任务证据可以可靠对账，并防止过期或未验证输出改变任务状态。

## ADDED Requirements

### Requirement: 冻结契约驱动的 WorkItem 执行
系统 SHALL 仅在 Run 绑定的已批准、完整性校验通过的执行契约范围内启动 WorkItem。每次执行 MUST 记录独立 attempt 与单调递增的 lease epoch，并在 Run 暂停、取消、依赖未满足、输入事实不满足或输出来自旧 epoch 时拒绝执行或接纳。

#### Scenario: 迟到 Worker 输出
- **WHEN** 已重试或取消的 WorkItem 收到旧 attempt 或旧 lease epoch 的输出
- **THEN** 系统 MUST 拒绝该输出且不得改变当前 WorkItem、Run 或父任务状态

### Requirement: 可验证的 Worker 回执
系统 SHALL 持久化每个 WorkItem 的执行意图、Worker 回执、输出引用与状态转换，使相同请求可恢复原结果、不同内容复用同一请求标识时返回冲突。未知且无法查询的外部副作用 MUST 标记为人工核对，系统不得自动重发。

#### Scenario: Action 接纳后进程中断
- **WHEN** Worker 回执已持久化但验证或证据登记尚未完成时进程退出并恢复
- **THEN** 系统 MUST 复用已有回执继续后续对账，且不得再次调用该 Worker Action

### Requirement: Verifier 与 Evidence Gate
系统 SHALL 只将已通过、具有验证方法、产物引用、结果引用、内容哈希和契约哈希的验证结果提交为 Evidence。验证器缺失、占位、失败或输出不满足契约验证策略时 MUST 保持 WorkItem 和父任务未完成。

#### Scenario: Verifier 失败
- **WHEN** Worker 产出完成但确定性 Verifier 返回失败
- **THEN** 系统 MUST 将 WorkItem 置于 revision 或 blocked 状态，且不得登记 passed Evidence 或完成父任务

### Requirement: Run 恢复与生命周期隔离
系统 SHALL 从持久化 Run ledger 恢复未完成 WorkItem、attempt、lease、验证与证据对账状态。暂停的 Run MUST 保持暂停，取消的 Run MUST 不复活，恢复过程不得用最新方案版本替换冻结契约。

#### Scenario: 暂停后重启
- **WHEN** 用户暂停 Run 后关闭并重新打开应用
- **THEN** 系统 MUST 恢复原 contract snapshot 与 paused 状态，并且不得自动启动 Worker
