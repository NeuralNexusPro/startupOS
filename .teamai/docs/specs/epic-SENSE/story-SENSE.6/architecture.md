# SENSE.6 架构

```text
Desktop/Service DingTalk Stream Adapter (Layer 6 / service boundary)
  -> Email-like injected Stream client port (Layer 1 integration)
  -> DingTalkStreamIngress (Layer 2 perception-runtime)
       -> InboxStore -> DingTalkStreamNormalizer -> EventStore
```

协议类型已下沉到 `core/src/types/perception.ts`，因此 integrations 与 runtime 都只依赖 Layer 1 types，消除 integration → module 反向依赖。Stream normalizer 位于 `lib/integrations/perception/dingtalk`；存储编排位于 `modules/perception-runtime/connectors/dingtalk`。

inbox 保存解析后的安全 frame，而不是含 sessionWebhook 的原始 `data` 字符串。source ID 对业务 msgId 做 SHA-256；附件 key 同样哈希为 `perception://attachment/dingtalk/...`。

无 Web Route 长连接、无 SDK/数据库、无跨 feature 内部导入，符合 AGENTS.md 单向依赖围栏。
