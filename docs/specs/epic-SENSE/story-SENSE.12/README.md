# SENSE.12：Perception Plugin Host 与 Connector 插件化迁移

- Epic：SENSE；状态：In Progress；Owner：OriginOS Team；创建/更新：2026-09-04

## User Story

作为 OriginOS 用户，我希望邮件、企微、飞书和钉钉以可发现、可配置、可启停的感知插件接入，使新增渠道不需要修改感知内核，并继续遵守统一事件、授权和安全凭据规则。

## 简要验收标准

- [x] Core 已提供平台无关的 Plugin Contract、Registry、Host 与感知运行时。
- [ ] 四个渠道迁入独立 bundled perception plugins（当前 WeCom 已迁移，Feishu/DingTalk 已接入 Host 适配器，Email 仍由旧 supervisor 承载）。
- [ ] 感知中心由声明式 schema 渲染配置，不再包含平台条件分支。
- [x] Plugin SDK 限定权限、凭据、生命周期和事件输出边界，并支持 webhook dispatch。
- [ ] 旧 Connector 配置可自动迁移或得到明确提示。

## 文档导航

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)

## 变更历史

| 日期 | 内容 | 变更人 |
|---|---|---|
| 2026-09-04 | 建立 Story 与实施前规格 | Codex |
