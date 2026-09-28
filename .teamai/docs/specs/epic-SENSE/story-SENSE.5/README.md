# Story SENSE.5：飞书应用机器人与事件订阅 Connector

**状态：** Complete  
**Owner：** Runtime  
**创建/更新：** 2026-08-28

## User Story

作为 OriginOS 用户，我希望飞书应用机器人事件经过官方协议验签、解密和去重后进入统一感知层，以便私聊、群聊 @ 和卡片操作能够安全触发受授权目标。

## 验收标准

- [x] 支持 POST JSON challenge 并在 ACK 中回传 challenge。
- [x] 支持 Encrypt Key AES-256-CBC 解密与 X-Lark SHA-256 签名校验。
- [x] 校验 v2 `header.token`、`event_id`、`event_type` 和时间字段。
- [x] `im.message.receive_v1` 映射为 message/mention，卡片操作映射为 action。
- [x] 消息资源只形成受控 attachment reference，不下载二进制。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md) · [能力矩阵](../capability-matrix.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-08-28 | 按官方 SDK 协议初始化六件套 |
| 2026-08-28 | 完成 Connector、raw-body 验签、fixtures 与回归验证 |
