# Proposal：持久化并展示真实 Token usage

## 可追溯信息

- epic-id：M
- story-id：M.14
- task-id：M14-T5
- owner：Agent Session / Web UI
- 来源：`docs/specs/epic-M/story-M.14/`

## Why

Pi assistant message 已返回完整 usage，但 Desktop/Web 流适配只保存文本，历史会话无法统计 input、output 和缓存 token，协作成本也仍使用粗略推算。

## What Changes

- 在 Core 会话消息增加可选 provider-neutral usage 与上下文 token 估算字段。
- Desktop/Web 在最终 `message_end` 透传并随 assistant message 写入现有 session JSON。
- Session 汇总从消息纯计算，旧会话显示 unavailable，不把恢复时的零 usage 当真实数据。
- Agent/RoleAgent/Skill/Project 现有会话区域显示紧凑汇总，消息完成时更新，不订阅 token delta。
- 协作 CostController/Metrics 记录真实 input/output/cache usage，provider cost 缺失时才估算。

## 非目标

- 不新增统计数据库、累计文件或 tokenizer 依赖。
- 不按每个流式 delta 更新 UI。
- 不伪造 provider 未返回的 cost/reasoning。

## Capabilities

### New Capabilities

- `agent-session-token-usage`：Agent 会话可持久化、恢复、聚合并展示真实 provider usage 和明确标记的上下文估算。

### Modified Capabilities

无。

## Impact

- packages：`packages/core`、`packages/desktop`、`packages/web`。
- public APIs：AgentMessage、stream final event 和 session summary 增加可选字段，向后兼容。
- persistence：现有 session JSON 可选增量字段，无迁移和双写。
- IPC：最终 assistant/done payload 增加可选 usage。
- packaging：Desktop build 与 worker bundle 需要回归。
- 依赖：M14-T4 提供缓存关联，但 usage 基础透传可独立实现。

## 上线方案

新旧会话混合读取；字段缺失时 UI 显示暂无数据。完成 Web/Desktop/Core 定向测试后随版本发布。

## 回滚方案

UI 停止读取可选字段并回滚写入代码；旧 session 中多出的字段由宽松 JSON 读取自然忽略。
