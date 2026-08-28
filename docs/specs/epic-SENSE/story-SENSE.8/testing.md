# SENSE.8 测试

自动化验证 Goal：通过 retry、dead-letter、health、audit、facade 和故障隔离测试。

用例：S8-UT-01 退避边界；S8-UT-02 达上限进入 DLQ；S8-UT-03 三种 health 模型；S8-IT-01 单 connector 故障不影响其他来源；S8-IT-02 replay 再授权；S8-SEC-01 secret/异常原文不可检索；S8-IT-03 facade CRUD 保持 DataFile。执行 core Vitest/typecheck、facade integration 与 lint。

## 自动化结果（2026-08-28）

- 感知层 Core 单元/集成回归：10 个测试文件、50 个测试全部通过。
- Core TypeScript 与 Web TypeScript：通过。
- Core 分层依赖、Story 模板占位符与集成层反向依赖扫描：通过。
- 全仓 `pnpm lint`：通过；仓库仍有既有 warning，不构成本 Story 新增 error。

## 厂商控制台人工验证

以下验证依赖真实租户凭据、公网回调地址或邮箱测试账号，当前开发环境未执行：

- Email：真实邮箱增量拉取、游标恢复、限流与凭据失效恢复。
- 企业微信：控制台 URL 验证、加密事件回调、重复投递与密钥轮换。
- 飞书：事件订阅 challenge、签名/加密回调、平台重试与权限撤销。
- 钉钉：Stream 长连接重连、处理超时后的 `LATER`、断网恢复与权限撤销。

上线前按 SENSE.3–SENSE.6 的平台契约用例逐项执行并保存脱敏证据。剩余风险是厂商协议、权限模型或限流策略与测试 fixture 存在差异；失败时只停用对应 connector，不影响其他来源。
