# 架构设计文档 - Story SENSE.2

**最后更新:** 2026-08-28

## 模块

```text
core/modules/perception-runtime/gateway/
├── connector-registry.ts
├── replay-guard.ts
├── webhook-gateway.ts
└── errors.ts

web/src/app/api/perception/webhooks/[connectorId]/route.ts
```

Route 只将 headers/query/body 转为 core 输入并映射响应。ConnectorRegistry 由运行时启动边界注入；默认 registry 不包含凭据或平台实现。ReplayGuard 使用 DataFile 存储 replayKey hash 和过期时间，不保存签名。

Gateway 依赖同模块的 Inbox/Event/Audit store；不依赖 Agent、Web 或 Desktop。后续 facade 在 feature/integration 边界组装 registry 和 gateway。

## 安全

- Content-Length 只作提前拒绝，最终以解析后 UTF-8 bytes 为准。
- 验签采用 Connector 实现的 constant-time 比较。
- receivedAt 由服务器生成，不能信任 payload 时间作为 replay 判断唯一依据。
- ACK body 仍经过 JSON value 限制。

## 围栏证明

业务流程位于 core module；API Route 无规则、Agent 创建或文件路径逻辑；core module 不导入 web/desktop/features。

