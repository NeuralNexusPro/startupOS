# SENSE.11：企业微信 Connector Provisioning 与运行闭环

- Story：SENSE.11
- 状态：Complete
- Owner：OriginOS Team
- 创建日期：2026-09-04

## User Story

作为 OriginOS 用户，我希望像 Hermes 一样使用企业微信 AI 智能机器人的 Bot ID 与 Secret 建立长连接，无需公网回调地址即可让单聊和群聊消息进入已授权目标。

## 简要验收标准

- 配置页明确区分可公开的 Receive ID 与只在服务端解析的 Token/AESKey。
- Desktop 常驻 supervisor 可装载已启用的企微机器人，维持 WebSocket、心跳与自动重连。
- 支持文本与语音转文字消息归一化、幂等和统一规则路由。
- 配置、管理响应、日志和事件中均不出现明文 Token/AESKey。

## 文档导航

- [需求](requirements.md)
- [交互](interaction.md)
- [架构](architecture.md)
- [实施](implementation.md)
- [测试](testing.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-04 | 建立 Story 并开始实施 |
| 2026-09-04 | 完成企微环境密钥引用、XML 回调、配置自动装载与感知中心交互 |
