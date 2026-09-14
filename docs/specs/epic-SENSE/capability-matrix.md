# Epic SENSE Connector Capability Matrix

**更新：** 2026-08-28。能力必须按平台模式分别声明，不得因同品牌存在出站机器人就推断其具备入站能力。

## Email

| 模式 | 入站 | 出站 | 状态/认证 | 部署 | OriginOS 决策 |
|---|---|---|---|---|---|
| IMAP/Provider 只读轮询 | 新邮件与附件元数据 | 本 Epic 不发送邮件 | UIDVALIDITY + UID cursor；secret reference | Desktop/Service supervisor | 增量 poll，单批 50，附件仅引用 |

邮箱不使用 Webhook replay 观察模型；以 mailbox cursor、UIDVALIDITY reset、轮询健康和单封提交位置观察。

## 企业微信

| 模式 | 入站 | 出站 | 握手 | 加密 | ACK / 重试 | OriginOS 决策 |
|---|---|---|---|---|---|---|
| 自建应用“接收消息” | 消息与订阅事件 | 可调用主动消息 API | GET `echostr` | Token SHA-1 签名 + EncodingAESKey AES | GET 1 秒；POST 5 秒，失败最多重试三次 | SENSE.4 入站 Connector |
| 群机器人 Webhook | 不提供通用入站事件 | 支持向群发送 | 无 | Webhook key 属于 secret | 依平台发送 API | 仅 outbound capability，不作为感知源 |

去重：有 MsgId 时使用 MsgId；事件使用 FromUserName + CreateTime，并叠加 connectorId。凭据只保存 secret reference。

## 来源

- [企业微信：接收消息与事件概述](https://wdk-docs.github.io/wework-docs/server/basic/message-push/receive-messages-and-events/)
- [企业微信：加解密方案说明](https://wdk-docs.github.io/wework-docs/appendix/encryption-and-decryption/)
- [企业微信：官方回调 SDK 与返回码](https://wdk-docs.github.io/wework-docs/resources/encryption-and-decryption-library/)

## 飞书

| 模式 | 入站 | 出站 | 握手 | 安全 | 时限 | OriginOS 决策 |
|---|---|---|---|---|---|---|
| 事件订阅 Webhook | v2 事件，如 `im.message.receive_v1` | 应用机器人 API | POST JSON challenge | Verification Token；可选 Encrypt Key、请求 SHA-256 签名 | challenge 1 秒 | SENSE.5 首版入站 Connector |
| 长连接 | 事件订阅，不支持回调订阅 | 应用机器人 API | 建连时鉴权 | SDK 管理连接，后续事件为明文 | 处理 3 秒，超时重推 | 后续 Desktop/Service adapter，不放 API Route |
| 自定义机器人 Webhook | 无通用入站事件 | 群消息出站 | 无 | webhook secret/signature | 发送 API 约束 | 仅 outbound capability |

v2 事件以 `header.event_id` 去重；附件只保留 message resource key 受控引用，不主动下载。

来源：[飞书官方 Node SDK](https://github.com/larksuite/node-sdk)、[官方 request handler](https://github.com/larksuite/node-sdk/blob/main/dispatcher/request-handle.ts)、[官方 AES cipher](https://github.com/larksuite/node-sdk/blob/main/utils/aes-cipher.ts)。

## 钉钉

| 模式 | 入站 | 出站 | 鉴权/ACK | 部署 | OriginOS 决策 |
|---|---|---|---|---|---|
| Stream 应用机器人 | 机器人消息、事件、卡片回调 | session webhook / OpenAPI | 建连时 ClientID/ClientSecret；EVENT `SUCCESS/LATER`，CALLBACK ACK | 长连接，支持重连与背压 | SENSE.6 首选；Desktop/Service supervisor 托管 |
| HTTP 事件回调 | 已配置的组织事件 | OpenAPI | 平台回调协议 | 公网回调 | 后续按事件类型扩展，不与 Stream 混用 |
| 自定义机器人 Webhook | 无通用入站 | 群消息出站 | webhook secret/signature | 无长连接 | 仅 outbound capability |

Stream frame 使用 `headers.messageId`，机器人消息内含 `msgId`；OriginOS 优先用业务 `msgId` 去重。`sessionWebhook` 是短期凭据，必须在 inbox/audit 中脱敏。

来源：[钉钉官方 Stream Node SDK](https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs)、[钉钉官方 Stream Python SDK](https://github.com/open-dingtalk/dingtalk-stream-sdk-python)、[自定义机器人文档](https://open.dingtalk.com/document/orgapp/custom-robot-access)。
