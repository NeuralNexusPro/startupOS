# SENSE.4 架构

## 模块与依赖

```text
packages/core/src/lib/integrations/perception/wecom/
  crypto.ts       # 平台算法，无 runtime 依赖
  connector.ts    # PerceptionConnector adapter
  types.ts
packages/core/src/modules/perception-runtime/
  gateway/...     # 复用认证、replay、inbox、dedupe、ACK
packages/web/src/app/api/perception/... # 薄 HTTP 边界
```

依赖方向是 runtime → integration contract；integration 只依赖 core types/shared 与 Node crypto，不依赖 Web、Desktop、feature 或 runtime store。真实 secret 通过构造参数注入。

## 数据与安全

- 外层 JSON 只接受 `Encrypt` 字符串；查询只接受 msg_signature/timestamp/nonce。
- 解密采用无自动 padding 的 AES-256-CBC，严格验证 PKCS#7(1..32)、消息长度和 receiveId。
- 比较签名与 receiveId 时避免普通早退字符串比较造成时序泄漏。
- normalize 只映射发送者、会话、文本、事件、时间和附件受控引用。

## 围栏证明

无 API Route 业务逻辑、无数据库、无 `any`、无平台 SDK；平台协议实现封装在 Layer 1，事件存储与业务决策仍位于 Layer 2。
