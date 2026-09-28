# SENSE.3 架构设计

## 架构目标

把邮件协议能力与感知编排分层：基础 integration 只声明邮件客户端端口和传输 DTO；Layer 2 的 perception-runtime 负责游标、内容防御、inbox/event 持久化与增量提交。

```text
Desktop/Service EmailClientAdapter
  -> Layer 1 EmailClientPort
  -> Layer 2 perception-runtime/connectors/email/EmailPoller
       -> EmailCursorStore
       -> InboxStore
       -> PerceptionEventStore
```

## 影响模块

```text
packages/core/src/lib/integrations/perception/email/
  types.ts               # transport DTO 与 EmailClientPort
  index.ts
packages/core/src/modules/perception-runtime/connectors/email/
  email-cursor-store.ts  # DataFile 游标
  email-poller.ts        # 增量处理编排
packages/core/src/modules/perception-runtime/__tests__/
  email-connector.test.ts
```

真实 IMAP/API adapter 属于 `packages/desktop/src/main/services/` 或 `packages/service/`，不进入 core。本 Story 先完成可注入边界，后续部署切片接具体 provider。

## 数据与接口

- Cursor：`data/perception/connectors/{connectorId}/email-cursor.json`，符合统一 DataFile envelope。
- Inbox：保存经过递归脱敏和大小限制的邮件传输记录。
- Event：`type=mail.received`；sourceEventId 优先使用 Message-ID 的不可逆摘要，否则使用 UIDVALIDITY + UID。
- Attachment：仅 `{id,name,mimeType,size,contentRef,blocked}`，`contentRef` 必须是受控引用，禁止网络 URL 和本地绝对路径。

`EmailClientPort` 只暴露 `listSince(request)`；凭据由 adapter 通过 secret reference 解析，不进入请求 DTO。

## 一致性、性能与安全

- 邮件按 UID 排序串行提交；每封 event 成功后才原子更新游标。
- EventStore 的 source index 提供跨重启去重。
- UIDVALIDITY 变化使用 adapter 返回的 `safeBaselineUid`；同时暴露 reset 结果供后续审计。
- 正文限制 64 KiB，移除危险控制字符和远程 HTML 语义；批量最大 50。
- 附件内容不进入 prompt，后续必须由显式授权的附件处理流程读取。

## 架构围栏证明

- Layer 1 integration 不依赖 Layer 2 module；依赖方向为 module → integration。
- core 不依赖 Web、Desktop、Service 或具体邮箱 SDK。
- 不在 Next.js API Route 放轮询业务逻辑，不引入数据库。
- 公共接口经各自 `index.ts` 导出，未跨 feature 导入内部实现。
