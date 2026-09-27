## Purpose
使 OriginOS 的协同协议运行时接入能够在真实产品入口生效，并确保方案、任务与本体状态保持同一语义，通过可重复的成功、失败和恢复场景验证，避免只有孤立实现而无法被用户使用。

## ADDED Requirements
### Requirement: 活跃执行持续可观测
协同执行 SHALL 自动记录 Supervisor 60 秒状态、120 秒报告及 Worker 45 秒进度，阻塞与结束立即报告；退出与暂停 MUST 释放计时器。
#### Scenario: 执行后取消
- **WHEN** 正在执行的会话被取消
- **THEN** 后续 SHALL 不再写入该会话周期心跳且无残留计时器
### Requirement: 执行前校验上游
Worker 启动前 MUST 确认上游已满足依赖，缺失或未完成时报告 blocked，不启动副作用。
#### Scenario: 上游仅报告未验证
- **WHEN** 上游为 reported 且尚未验收
- **THEN** 下游 MUST 保持阻塞，不把上游视作 completed
### Requirement: 快照可查询和恢复
会话快照 SHALL 返回活跃任务和每 Agent 最近终端任务、结构化进度及阻塞信息，并从持久化会话恢复；未知会话返回 404。
#### Scenario: 重启后查询
- **WHEN** 宿主重启后读取已有会话快照
- **THEN** 系统 SHALL 返回持久化任务投影而不重新执行任务
### Requirement: 观测不改变业务事实
心跳、记忆索引和 Worker 汇报 MUST 不覆盖 Run/WorkItem 事实，只有既有验证及接纳链路可以宣告业务完成。
#### Scenario: Worker 返回成功
- **WHEN** Worker 已返回但验证尚未通过
- **THEN** 观测结果 SHALL 保留 reported 语义且不推进业务为完成
### Requirement: 匹配和查询可解释
能力匹配 SHALL 结合可用能力与实际任务负载，未知资源指标不得伪造；10 Agent 快照查询 MUST 小于 100ms。
#### Scenario: 相同能力不同负载
- **WHEN** 多个 Agent 满足必需能力而当前任务数量不同
- **THEN** 分配 SHALL 按既定负载规则选择并可由输入与结果复核
