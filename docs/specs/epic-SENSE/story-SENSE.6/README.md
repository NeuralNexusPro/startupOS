# Story SENSE.6：钉钉 Stream 机器人与事件 Connector

**状态：** Complete  
**Owner：** Runtime  
**创建/更新：** 2026-08-28

## User Story

作为 OriginOS 用户，我希望钉钉 Stream 中的机器人消息、事件和卡片操作由长驻 supervisor 安全送入统一感知层，以便无需在 Next.js Route 维护长连接，并具备去重、背压和凭据脱敏能力。

## 验收标准

- [x] 定义 Stream frame/client port 与 SUCCESS/LATER ACK 合同。
- [x] 只接受 supervisor 标记为已认证的 frame。
- [x] 机器人消息、@ 与卡片回调归一化为标准事件。
- [x] inner msgId 优先、header messageId 回退形成稳定去重键。
- [x] sessionWebhook 等短期凭据不写入 inbox/event/audit。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md) · [能力矩阵](../capability-matrix.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-08-28 | 按官方 Stream SDK 能力初始化六件套 |
| 2026-08-28 | 完成 Stream contract、runtime ingress、fixtures 与架构修正 |
