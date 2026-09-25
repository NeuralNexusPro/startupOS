# Spec Delta

## Purpose

为项目任务提供版本化优先级写入和契约约束的 Agent 交接，同时保持 Task/Run/WorkItem 的权威边界。

## ADDED Requirements

### Requirement: 优先级受控写入

系统 SHALL 通过 Task Runtime 公共端口更新 `projectMetadata.priority`，并校验 project、requestId、revision、cursor 和 epoch；系统 MUST NOT 在读取或 UI 中猜测默认优先级。

#### Scenario: 并发优先级更新

- **WHEN** 两个客户端基于同一 Task revision 提交不同优先级
- **THEN** 至多一个请求成功，另一个 MUST 返回 revision conflict 且不得覆盖权威值

### Requirement: 冻结契约约束 Agent 交接

系统 SHALL 只允许将 WorkItem 交接给冻结契约当前节点可用且权限已授权的 Agent，并以稳定 handoff receipt 记录接纳结果。

#### Scenario: 未授权 Agent

- **WHEN** 用户选择不在冻结契约或权限交集中的 Agent
- **THEN** 系统 MUST 零写入拒绝且不得改变 assignedAgentId 或 lease

### Requirement: Lease 隔离迟到结果

成功交接 SHALL 递增 lease epoch 并失效旧 claim；任何旧 epoch Worker、Verifier、Action 或 Evidence 回执 MUST 被拒绝。

#### Scenario: 旧执行者迟到返回

- **WHEN** 新 Agent 已取得新 lease 后旧 Agent 提交结果
- **THEN** 系统 MUST 返回 stale lease，且新 Agent 的 attempt 和状态保持不变

### Requirement: 权威交互反馈

客户端 SHALL 等待服务端接纳后再显示新的优先级或 Agent；失败时 SHALL 保留原卡片、筛选、详情和焦点。

#### Scenario: Handoff 冲突

- **WHEN** handoff 因 revision 或 epoch 冲突被拒绝
- **THEN** 客户端 MUST 显示原因并重新读取权威详情，不得保留乐观值
