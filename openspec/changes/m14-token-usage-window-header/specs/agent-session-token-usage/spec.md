# Spec Delta

## MODIFIED Requirements

### Requirement: 现有会话界面展示紧凑统计

Agent、RoleAgent、Project Agent 和 Skill 的现有会话界面 SHALL 在消息窗体顶部展示本会话 Token 汇总，并在 assistant message 完成后更新；系统 MUST 不在每条消息内或每个流式 delta 中展示该汇总。

#### Scenario: 有真实 usage 的已完成会话

- **WHEN** 会话至少有一条带真实 usage 的已完成 assistant message
- **THEN** 窗体消息区上方显示 total、input、output、cacheRead 与 cacheWrite 的会话汇总
- **AND THEN** 消息滚动区内不显示同一份汇总

#### Scenario: 完成一条回复

- **WHEN** assistant message 完成并带 usage
- **THEN** 界面更新顶部 total、input、output、cacheRead 和 cacheWrite

#### Scenario: 用户查看上下文估算

- **WHEN** 用户展开顶部 Token 汇总
- **THEN** 系统显示最近的上下文分区估算并明确标识为估算

#### Scenario: 旧会话无 usage

- **WHEN** 会话没有带真实 usage 的 assistant message
- **THEN** 系统不显示 Token 汇总或全零占位
