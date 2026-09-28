# Story SENSE.3：Email Connector 增量轮询、游标与附件引用

**状态：** Complete  
**Owner：** Runtime  
**创建/更新：** 2026-08-28

## User Story

作为 OriginOS 用户，我希望系统以只读、可恢复的方式增量感知邮箱新邮件，以便邮件能够进入统一感知链路，且不会重复触发、泄漏凭据或把附件二进制直接送入 Agent。

## 验收标准

- [x] 通过注入的 `EmailClientPort` 拉取邮件，core 不依赖具体 IMAP/邮箱 SDK。
- [x] 游标包含 mailbox、UIDVALIDITY 与 last UID，并且只在事件成功持久化后推进。
- [x] 邮件归一化为 `mail.received`，Message-ID 或 UID 形成稳定来源标识。
- [x] 正文经过清洗与 64 KiB 上限控制，附件仅保存受控引用和元数据。
- [x] UIDVALIDITY 变化、重复投递、单封失败和重启恢复均有自动化测试。

## 文档导航

- [需求](requirements.md)
- [交互](interaction.md)
- [架构](architecture.md)
- [实施](implementation.md)
- [测试](testing.md)
- [Epic SENSE](../README.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-08-28 | 初始化并补齐 Story 六件套，进入实施 |
| 2026-08-28 | 完成实现、16 项 perception 回归测试、core typecheck 与全仓 lint |
