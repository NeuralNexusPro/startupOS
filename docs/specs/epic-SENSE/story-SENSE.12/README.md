# SENSE.12：Perception Plugin Host 与 Connector 插件化迁移

- Epic：SENSE；状态：In Progress；Owner：OriginOS Team；创建/更新：2026-09-04

## User Story

作为 OriginOS 用户，我希望邮件、企微、飞书和钉钉以可发现、可配置、可启停的感知插件接入，使新增渠道不需要修改感知内核，并继续遵守统一事件、授权和安全凭据规则。

## 简要验收标准

- [x] Core 已提供平台无关的 Plugin Contract、Registry、Host 与感知运行时。
- [x] 四个渠道接入独立 bundled perception plugins；钉钉已补齐真实 Stream、凭据及回复，真实平台权限与收件验收按测试文档跟踪。
- [x] 感知中心由声明式 schema 渲染配置，不再包含平台条件分支。
- [x] Plugin SDK 限定权限、凭据、生命周期和事件输出边界，并支持 webhook dispatch。
- [ ] 旧 Connector 配置可自动迁移或得到明确提示。

## 文档导航

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)

## 变更历史

| 日期 | 内容 | 变更人 |
|---|---|---|
| 2026-09-04 | 建立 Story 与实施前规格 | Codex |
| 2026-09-07 | 飞书插件改用官方 Node SDK WebSocket 长连接，完成安全配置、重连健康和双工回复 | Codex |
| 2026-09-07 | 飞书回复接入官方 Markdown CardKit 流式更新与纯文本失败降级 | Codex |
| 2026-09-07 | Email 迁入独立 poll plugin，增加隔离 State Port 并清理 Desktop 重复轮询 | Codex |
| 2026-09-07 | 完成声明式 Connector 表单与统一 Plugin provisioning，删除三套平台专用配置通道 | Codex |

## SENSE12-T2 追加修复交付（2026-09-12）

已合入 dev，联合26项回归、桌面构建与实际应用包验证通过。见 [归档提案](../../../../openspec/changes/archive/2026-09-12-fix-email-plugin-activation/proposal.md) 和 [测试证据](testing.md)。

## SENSE12-T3 交付（2026-09-13）

配置与健康热更新修复已合入 dev，回归、构建和实际应用包验收通过。证据见 [testing.md](testing.md)。其余插件迁移工作保持原状态。

## SENSE12-T4 本地验收完成（2026-09-13）

按用户确认，支持在当前企微／飞书／钉钉对话中由 Agent/Skill 发回工作目录文件。实施入口为 add-im-file-replies Proposal；功能与本地包验收已完成，证据见测试文档。

### SENSE12-T4 交付验收完成

87项相关自动化与完整macOS包验收通过，支持当前企微/飞书/钉钉会话文件回传；真实平台权限和收件端仍需人工复核。完整证据及测试包见[testing.md](testing.md)。其他Story迁移和跨平台验收保持独立跟踪。

已合入 dev（2e2319c），[提案已归档](../../../../openspec/changes/archive/2026-09-13-add-im-file-replies/proposal.md)，本轮临时工作区及分支已清理。

## SENSE12-T5 流式积压修复

SENSE12-T5：企微流式积压修复已实施，12项共享派发器与58项插件回归通过；完整产物验收进行中。
