# SENSE.10 测试

自动化验证 Goal：通过 Story SENSE.10 定义的 Mail 配置、安全凭据、连接测试、常驻轮询和故障隔离用例。

| ID | 层级 | 场景 | 预期 |
|---|---|---|---|
| S10-UT-01 | Core | profile 合法/边界 | 接受合法值，拒绝越界及 credential 字段 |
| S10-SEC-01 | Desktop | bind/resolve safeStorage | 仅密文与 secretRef 落盘，明文不可检索 |
| S10-SEC-02 | API | 请求含 password/token | 400，不写配置、不记录原值 |
| S10-IT-01 | Desktop | 有效 TLS/账号/INBOX | test success，生成有界 receipt，不启动 poll |
| S10-IT-02 | Desktop | 密码/证书/超时/目录错误 | 稳定安全码，无原始异常泄漏 |
| S10-IT-03 | Runtime | test→enable→UID 10–12 | 增量事件进入既有路由，成功后推进 cursor |
| S10-IT-04 | Runtime | 重启/UIDVALIDITY 改变 | 恢复或安全重建游标，不重复 lease |
| S10-IT-05 | Runtime | 首次连接、邮箱已有历史邮件 | 以 `UIDNEXT - 1` 建立基线，不生成历史事件，后续新 UID 正常处理 |
| S10-ISO-01 | Runtime | 一个邮箱持续失败 | 其他 Connector 正常处理 |
| S10-UI-01 | Web | Electron 添加/测试/启用/重绑 | 状态正确，secret 永不回显 |
| S10-UI-02 | Web | 浏览器模式 | 凭据操作禁用并提示桌面版 |
| S10-LIFE-01 | Desktop | 退出/停用 | timer 和 IMAP client 释放 |
| S10-BODY-01 | Desktop | multipart text/plain + HTML 邮件 | 完整解码 text/plain 并传入 `EmailTransportMessage.text` |
| S10-BODY-02 | Desktop | 仅 HTML、quoted-printable/base64、中文编码正文 | 转换为完整可读文本，不包含 MIME header 或附件字节 |
| S10-BODY-03 | Core | 邮件正文进入事件与目标 prompt | `content.text` 原样保留在不可信内容边界内 |
| S10-HITL-01 | Core/Desktop | 目标最终结果带 `[PERCEPTION_ESCALATE]` | 同一 lease 仅触发一条原生系统通知 |
| S10-HITL-02 | Core/Desktop | 通知不支持或投递失败 | 目标执行仍完成，不触发整体重试或第二条通知 |

执行 Core、Desktop、Web Vitest，IPC integration、三端 typecheck 和 `pnpm lint`。真实 Gmail/Outlook/自建 IMAP 作为人工验收，使用应用授权码，不使用主密码。

## 2026-08-31 验证记录

- Core 相关用例：23 passed；Desktop 全量：90 passed；Web 全量：255 passed。
- Core、Web、Desktop TypeScript 检查通过；Next lint 通过（仓库既有 warning 保留）。
- 运行数据目录未发现测试 secret marker，`git diff --check` 通过。
- 当前环境未提供真实邮箱账号，因此 Gmail、Outlook 与自建 IMAP 的在线验证未执行。人工验证时在 Windows Desktop 中分别使用应用授权码，确认“测试成功 → 启用 → 收到新邮件 → 规则审计出现”的闭环；剩余风险主要是不同供应商的认证策略、证书链和 IMAP capability 差异。

## 验收门禁

- 成功、失败、边界、安全、跨进程和生命周期用例全部通过。
- 仓库与运行数据扫描找不到测试 secret marker。
- 真实邮箱验证记录账号类型、TLS 模式、结果、脱敏证据和剩余风险。

## 2026-09-04 正文与人工升级修复验证

- Desktop Mail 相关：4 个测试文件、13 个测试通过；覆盖 multipart/base64 中文正文、HTML-only/quoted-printable 降级以及首次基线。
- Core 感知与目标 adapter：9 个测试文件、52 个测试通过；覆盖正文进入事件、显式人工升级单次通知和通知失败不重试。
- Core、Desktop TypeScript：通过；相关 ESLint 为 0 error（保留仓库既有 warning）；`git diff --check` 通过。
- 真实 QQ 邮箱仍需在 Windows Desktop 重启后发送一封新邮件验收；已入库的旧事件不会回填正文。
