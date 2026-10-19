# Spec Delta

## ADDED Requirements

### Requirement: 验收结果门控下游推进
系统 SHALL 先执行契约指定的 verifier，再按冻结的产出验收策略决定自动接纳或创建持久人工确认；只有结果被接纳后，依赖该 WorkItem 的下游才可进入可执行状态。

#### Scenario: 自动验收后推进下游
- **WHEN** 上游 WorkItem 的 verifier 通过且策略为自动验收
- **THEN** 系统 SHALL 自动完成该 WorkItem，并调度所有依赖已满足的下游 WorkItem

#### Scenario: 等待用户确认
- **WHEN** 上游 WorkItem 的 verifier 通过且策略为用户确认
- **THEN** 系统 SHALL 进入 `waiting_hitl`、持久化确认请求，并保持下游未启动

#### Scenario: 用户退回修改
- **WHEN** 用户对产出选择退回修改
- **THEN** 系统 SHALL 将当前 WorkItem 进入 `revision`，保留原产出与审核记录，并不得推进下游

### Requirement: 看板区分验证、确认、修订和阻塞
系统 SHALL 在任务看板中分别显示待自动验证、待用户确认、待指定角色确认、退回修改和受阻状态，不得把阻塞任务归入待验收。

#### Scenario: 任务等待人工确认
- **WHEN** WorkItem 存在待处理的人工确认请求
- **THEN** 看板 SHALL 显示确认主体和可用操作，并在用户答复后只推进绑定的 attempt 一次
