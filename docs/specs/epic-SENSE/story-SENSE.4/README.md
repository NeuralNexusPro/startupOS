# Story SENSE.4：企业微信应用与机器人 Connector

**状态：** Complete  
**Owner：** Runtime  
**创建/更新：** 2026-08-28

## User Story

作为 OriginOS 用户，我希望企业微信自建应用的加密回调能安全进入感知层，并能清楚区分群机器人仅出站能力，以便外部消息不会因能力误判或伪造请求触发 Agent。

## 验收标准

- [x] Token 签名使用排序后 SHA-1，并采用恒定时间比较。
- [x] EncodingAESKey 解密遵循 random + length + message + receiveId 布局并校验 receiveId。
- [x] GET URL 验证返回解密后的 echostr；无效签名/时间戳被拒绝。
- [x] JSON 回调归一化为稳定 `PerceptionEventV1`，MsgId 或事件复合键用于去重。
- [x] 自建应用入站和群机器人仅出站 capability 分开声明。

## 文档导航

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md) · [能力矩阵](../capability-matrix.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-08-28 | 依据当前平台协议初始化六件套 |
| 2026-08-28 | 完成协议实现、Gateway GET 握手与自动化验证 |
