# SENSE.5 需求

## 来源

Epic SENSE、OpenSpec 3.4、飞书开放平台官方 Node SDK 的 EventDispatcher、request handler 与 AESCipher。

## 详细需求

1. Webhook 模式接受 v2 `schema/header/event`；首版不在 Web API Route 托管长连接。
2. 加密外层 `{encrypt}` 使用 SHA-256(encryptKey) 作为 key，密文 Base64 解码后前 16 字节为 IV，其余为 AES-256-CBC ciphertext。
3. 开启 Encrypt Key 时，按 timestamp + nonce + encryptKey + 原始请求 JSON 计算 SHA-256，并恒定时间比较 `x-lark-signature`。
4. 解密或明文 payload 的 `header.token` 必须匹配 Verification Token。
5. URL verification 返回 `{challenge}`；不得创建感知 event。
6. v2 `header.event_id` 是 sourceEventId；缺失时拒绝，禁止猜测替代 ID。
7. 消息正文从 JSON 字符串 content 中安全提取 text；图片、文件等只保存 `perception://attachment/feishu/...` 引用。
8. 单次回调快速 ACK，Agent 执行异步；重试由 event_id 去重。

## 验收场景

- **Given** 合法 challenge，**When** POST，**Then** 1 秒内返回 challenge 且无 event。
- **Given** 合法加密 v2 消息，**When** gateway 处理，**Then** 得到一个标准事件。
- **Given** 签名、token 或密文篡改，**When** 处理，**Then** inbox 前拒绝。
- **Given** 相同 event_id 以新 nonce 重试，**When** 处理，**Then** 只保留一个 event。

## 边界与非功能

仅支持严格 JSON；正文继续受 perception payload 上限和内容防御。协议处理目标 <100ms。不引入官方 SDK 依赖、数据库、WebSocket supervisor 或真实 secret fixture。
