# SENSE.3 实施计划

## 文件级步骤

- [x] 在 `lib/integrations/perception/email` 定义严格类型的 transport DTO 与 `EmailClientPort`。
- [x] 实现 DataFile `EmailCursorStore` 与 UIDVALIDITY 安全重置。
- [x] 实现 `EmailPoller`：有界拉取、排序、稳定来源标识、inbox/event 写入、逐封提交游标。
- [x] 实现正文清洗/截断和附件受控引用校验。
- [x] 保留 Desktop/Service 具体 adapter 注入缝，不把网络依赖放入 core。
- [x] 补齐单元及重启恢复集成测试，并运行 core typecheck/lint。

## 迁移与兼容

这是新增 Connector，不迁移既有数据。旧环境没有游标文件时从显式 initial UID（默认 0）开始。游标使用版本化 DataFile，损坏时沿用 SENSE.1 的 recovery 机制。

## 审查要点

- 游标是否可能越过失败邮件。
- UIDVALIDITY 变化是否会漏信或制造无限重放。
- Message-ID、正文、附件名是否经过内容防御。
- event 是否只含引用而非附件二进制。
- integration 与 module 的依赖方向是否符合 AGENTS.md。
