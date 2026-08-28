# 需求文档 - Story SENSE.2

**最后更新:** 2026-08-28

## 功能需求

1. Gateway 通过 ConnectorRegistry 解析 connectorId，不允许请求指定任意实现。
2. 默认 replay window 为 5 分钟；Connector 验证结果可提供 replayKey。
3. replayKey 只在认证成功后记录；重复 replayKey 返回 `REPLAY_DETECTED`。
4. Gateway 顺序固定为 size check → connector lookup → verify → replay check → Inbox → normalize → EventStore → ACK。
5. ACK 不等待 Agent/Task；本 Story 不执行目标路由。
6. 握手请求可以由 Connector 返回专用 ACK，但仍须经过 Connector lookup 与协议校验。

## Given / When / Then

- **Given** 未注册 connectorId，**When** 请求到达，**Then** 返回 NOT_FOUND 且不落盘。
- **Given** 验签失败，**When** 请求到达，**Then** 返回 UNAUTHORIZED 并写脱敏审计。
- **Given** replayKey 第二次出现，**When** 请求到达，**Then** 拒绝且不 normalize。
- **Given** 合法事件，**When** 请求到达，**Then** Inbox/Event 已落盘后返回 ACK。
- **Given** normalize 产生两个事件，**When** 保存，**Then** 分别幂等存储并由 ACK 获得 canonical events。

## 非功能需求

- 不含平台网络调用时 Gateway p95 <100ms。
- Connector 间状态隔离；无数据库、无 Web 反向依赖、无 `any`。

