# SENSE.5 架构

## 模块

```text
core/lib/integrations/perception/feishu/
  types.ts, crypto.ts, connector.ts, index.ts
       ↓ implements Connector Contract
core/modules/perception-runtime/gateway + stores
       ↓
web app/api/perception/webhooks/[connectorId] (thin POST boundary)
```

integration 只负责平台协议，runtime 负责 replay、inbox、event 去重和 ACK。加密 payload 的签名需要“原始 JSON 序列化”；当前 HTTP 边界以解析后 JSON 再 `JSON.stringify` 作为 canonical body，生产部署必须保持平台发送字段顺序。为消除代理重序列化风险，Connector Contract 增加可选 `rawBody` verification context，Route 读取文本后解析并原样传递。

## 安全与数据

- key、token 构造注入，不持久化真实值。
- AES 使用 Node crypto；严格 Base64、IV 长度与 JSON object 校验。
- header token 恒定时间比较；event_id 形成安全哈希 ID。
- message resource key 编码为受控引用，不下载附件。

## 围栏证明

Layer 1 不依赖 Layer 2 store；runtime 通过公共 Connector Contract 调用 adapter。API Route 只保留 HTTP 解析/响应映射，不含飞书业务逻辑；无数据库、Express 或 `any`。
