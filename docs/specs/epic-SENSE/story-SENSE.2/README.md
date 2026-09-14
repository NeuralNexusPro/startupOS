# Story SENSE.2: Webhook Gateway：验签、去重、重放防护与快速 ACK

**Epic:** SENSE  
**状态:** ✅ Complete  
**Owner:** OriginOS Runtime Team  
**创建/更新:** 2026-08-28

## User Story

作为 Connector 开发者，我需要统一的 Webhook Gateway 在平台回调进入业务层前完成认证、重放防护、Inbox 持久化和快速 ACK，以便 Agent 执行与平台协议安全解耦。

## 验收标准

- [x] 未注册、禁用或认证失败的 Connector 不产生 Inbox/Event。
- [x] 时间戳超出 replay window 或 replayKey 已使用时拒绝。
- [x] 合法请求先落 Inbox，再 normalize/save Event，返回 Connector ACK。
- [x] 重复 source event 返回成功 ACK，但不产生第二个 Event。
- [x] Next API Route 只解析 HTTP 并调用 core facade。

## 文档导航

[需求](./requirements.md) · [交互](./interaction.md) · [架构](./architecture.md) · [实施](./implementation.md) · [测试](./testing.md)

## 变更历史

| 日期 | 变更 | 变更人 |
|---|---|---|
| 2026-08-28 | 初始化实施规格 | Codex |
