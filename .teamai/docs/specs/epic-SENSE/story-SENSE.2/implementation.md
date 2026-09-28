# 实施文档 - Story SENSE.2

**最后更新:** 2026-08-28

- [x] 实现 ConnectorRegistry 与启停状态。
- [x] 实现持久 ReplayGuard 与过期清理。
- [x] 实现 WebhookGateway 固定处理顺序和结构化错误。
- [x] 实现可注入的 Webhook facade，供 Web/Desktop 组装。
- [x] 实现薄 Next API Route；未配置 gateway 时返回 503。
- [x] 完成认证、replay、duplicate、ACK 和 route 测试。

兼容策略：纯新增版本化 API；未注册 Connector 不影响现有应用。审查重点是 ACK 时序、secret 泄露、Route 业务逻辑和并发幂等。
