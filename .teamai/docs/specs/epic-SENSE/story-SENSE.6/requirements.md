# SENSE.6 需求

## 来源与范围

Epic SENSE、OpenSpec 3.5、钉钉官方 Stream Node/Python SDK。首版实现 Stream transport contract、frame normalization 与 runtime ingress；真实 WebSocket/凭据连接由 Desktop/Service supervisor 后续装配。

## 需求

1. integration 定义 Stream frame、client port、ACK 和 normalizer，不依赖 runtime module。
2. runtime ingress 只接受 `{authenticated:true}` 的内部 frame；拒绝 HTTP 客户端伪造信任标志。
3. `/v1.0/im/bot/messages/get` 数据解析 sender、conversation、text、at、msgId、createAt。
4. card callback/event topic 映射为 `action.invoked`。
5. source ID 优先 inner `msgId`，否则使用 header `messageId`，缺失时拒绝。
6. sessionWebhook、access token 和 client secret 在持久化前脱敏；附件仅生成受控引用。
7. 成功持久化后返回 SUCCESS；失败由 supervisor 映射为 LATER/不 ACK 以触发重投。

## Given / When / Then

- 已认证机器人 frame → inbox + 一个标准事件 + SUCCESS。
- 未认证 frame → 无 inbox/event。
- 同 msgId 不同 transport messageId → 一个 event。
- sessionWebhook 输入 → 所有感知文件中不可检索到 URL/token。
- 达到 supervisor 并发上限 → adapter 不调用 ingress，返回 LATER。

## 非功能

单 frame normalize <20ms；不在 Web Route 建立 WebSocket；不持久化 ClientSecret；不引入数据库或钉钉 SDK依赖。
