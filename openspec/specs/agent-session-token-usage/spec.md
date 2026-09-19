# agent-session-token-usage Specification

## Purpose

让 Agent 会话保留模型供应商返回的真实 Token usage，跨 Web、Desktop、历史恢复和协作运行聚合展示，并区分真实统计与上下文估算。

## Requirements

### Requirement: 最终 assistant message 保留真实 usage
系统 SHALL 在 provider 返回 usage 时保留 input、output、cacheRead、cacheWrite、totalTokens、可选 reasoning 和 cost，并随最终 assistant message 写入现有会话存储。

#### Scenario: Desktop 流式消息完成
- **WHEN** Desktop 收到带 usage 的 assistant `message_end`
- **THEN** 最终消息和 session JSON 保留相同 usage 且只保存一次

#### Scenario: Web 流式消息完成
- **WHEN** Web route 收到带 usage 的 assistant `message_end`
- **THEN** 最终 SSE 事件和持久消息保留相同 usage

### Requirement: 会话汇总由消息计算
系统 MUST 从会话内有真实 usage 的 assistant messages 逐字段聚合，不得维护第二份持久累计值。

#### Scenario: 多轮会话
- **WHEN** 会话包含多条有 usage 的 assistant messages
- **THEN** session total 等于各消息对应字段之和且不会因恢复重复累计

#### Scenario: 旧会话无 usage
- **WHEN** 历史消息没有 provider usage
- **THEN** 系统显示无统计数据，不得使用恢复运行时补齐的零 usage

### Requirement: 上下文分区估算明确标识
系统 SHALL 使用现有字符启发式记录 stable system、session context、turn recall 和 history 的估算 token，且 MUST 标记为 estimated。

#### Scenario: 展开上下文统计
- **WHEN** 用户查看本会话 Token 详情
- **THEN** provider usage 与上下文估算分区展示，不合并为同一个真实总数

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

### Requirement: 协作运行时使用真实 usage
协作 CostController 与 Metrics SHALL 记录 provider 的真实 input/output/cache usage；只有 provider 未返回 cost 时才允许使用现有价格估算。

#### Scenario: Worker 返回 provider cost
- **WHEN** 协作 worker 的 assistant message 带完整 usage cost
- **THEN** 成本报告使用该真实 cost 并保留各 token 分类
