# SENSE.4 需求

## 来源与范围

来源为 Epic SENSE、OpenSpec 任务 3.3 及企业微信接收消息/加解密协议。本 Story 支持自建应用 JSON 加密回调；群机器人仅声明 outbound capability，不伪装成入站 Connector。

## 功能需求

1. 通过 secret provider 注入 Token、EncodingAESKey、receiveId，配置文件只保留引用。
2. 签名输入为 token、timestamp、nonce、encrypted 的字典序拼接后 SHA-1。
3. AES key 由 43 字符 EncodingAESKey 补 `=` 后 Base64 解码，使用 AES-256-CBC、key 前 16 字节 IV、PKCS#7 block-size 32。
4. 解密明文必须校验长度和 receiveId；结构错误立即拒绝。
5. GET 握手完成签名、重放时间窗和 echostr 解密，返回无 BOM/换行的明文。
6. POST payload 解密后仅提取允许字段，原始密文保留于 inbox；不直接进入 prompt。
7. MsgId 优先作为 source ID；事件回退为 FromUserName + CreateTime + Event + EventKey 的摘要。

## 验收场景

- **Given** 官方算法生成的 fixture，**When** 验签解密，**Then** 得到原始 JSON 与正确 receiveId。
- **Given** 被篡改签名/密文/receiveId，**When** 接收，**Then** 在 inbox/event 路由前拒绝。
- **Given** 相同 MsgId 重试，**When** gateway 保存，**Then** 只产生一个事件。
- **Given** 群机器人配置，**When** 查询能力，**Then** inboundEvents 为空且 outboundReply=true。

## 非功能与边界

- 回调协议处理目标小于 100ms；ACK 不等待 Agent。
- timestamp 由共用 replay guard 限制；请求体继续受 256 KiB 上限保护。
- 不引入 XML 第三方解析器、数据库或真实平台 secret fixture。
