# 架构设计文档 - Story SENSE.1

**最后更新:** 2026-08-28

## 模块设计

```text
packages/core/src/modules/perception-runtime/
├── protocol/types.ts       # 平台无关事件与 Connector Contract
├── security/content-defense.ts
├── storage/data-file-store.ts
├── storage/inbox-store.ts
├── storage/event-store.ts
├── storage/lease-store.ts
├── storage/audit-store.ts
└── index.ts                # 公共 API
```

模块只依赖 Node API、`core/types` 和 `core/shared`；不依赖 Web、Desktop、feature 或具体平台集成。后续 `lib/integrations/perception` 实现 Connector Contract。

## 数据策略

- `inbox/{connectorId}/{inboxId}.json`：脱敏后的平台 payload DataFile。
- `events/{eventId}.json`：canonical PerceptionEvent DataFile。
- `events/dedupe-index.json`：幂等键到 eventId 的 DataFile 映射。
- `leases/{leaseId}.json`：后续路由执行租约。
- `audit/events.jsonl`：只追加脱敏审计。
- 每次 DataFile 覆盖前保存 `.recovery`，再使用同目录临时文件原子 rename。

## Connector Contract

Connector 的 verify/normalize/ack 只描述协议行为。Runtime 不接收未经 verify 的输入；Connector 不直接创建 Agent session。

## 安全

- ID 正则白名单；所有解析结果验证仍在 dataRoot 内。
- payload 以 UTF-8 字节数执行硬上限。
- 递归脱敏 key：authorization、token、secret、password、cookie、apiKey 等。
- 审计只保存摘要、hash 和引用，不保存完整内容。

## 围栏证明

- API Route 尚未创建，业务逻辑全部位于 core module。
- 无数据库与后端框架。
- 不修改 scheduler/neural-channel。
- 新增类型独立、公共 API 经 index.ts 导出。

