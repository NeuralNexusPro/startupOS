# Story SENSE.8：运维、重试与管理 Facade

**状态：** Complete  
**Owner：** Runtime  
**创建/更新：** 2026-08-28

## User Story

作为用户，我希望每个感知源可独立观察、重试、停用和恢复，以便一个来源故障不会影响其他来源，并能追溯事件到执行结果。

## 验收标准

- [x] 有界指数退避、最大尝试次数和 dead-letter。
- [x] Email/Webhook/Stream 使用各自健康模型。
- [x] 审计查询始终脱敏并关联 connector/rule/lease/result。
- [x] Facade 管理连接、规则、授权和手工重放，不泄漏 secret。
- [x] 单 Connector 故障隔离。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-08-28 | 完成实施前规格 |
| 2026-08-28 | 完成运维存储、重试/DLQ、健康模型、审计查询、管理 Facade 与自动化验证 |
