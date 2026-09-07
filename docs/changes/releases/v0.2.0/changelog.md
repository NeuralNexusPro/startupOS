# OriginOS CE v0.2.0 Changelog

发布日期：2026-09-07

## 感知中心与统一 Channel

- 新增感知中心，支持感知源、规则、目标授权、事件链路与运行状态管理。
- 建立统一双工 Channel Runtime，将外部渠道输入接入 OriginOS Agent、Skill、Role Agent 与项目多 Agent Runtime，并将流式回复送回原渠道。
- 支持事件、规则触发和目标处理结果的分层追踪，以及通知详情与人工行动入口。

## 感知插件

- Email、企业微信、飞书和钉钉迁移为独立感知插件，由通用 Plugin Host 管理生命周期、权限、健康状态和回复通道。
- Email 支持 IMAP 增量采集、完整正文传递、UID 游标隔离与安全凭据存储。
- 企业微信使用智能机器人 WebSocket 双工连接，支持 Agent 回复回传。
- 飞书使用官方 Node SDK WebSocket 长连接，支持 Markdown CardKit 流式回复及纯文本降级。
- 感知中心根据插件声明的 Schema 生成统一配置表单，敏感字段仅进入 Desktop safeStorage。

## 桌面与交互

- 优化感知中心首页和应用启动器入口。
- 系统通知支持点击查看完整详情，并可直接执行关联行动。
- 事件记录支持折叠展示，便于查看完整感知与处理链路。

## Runtime 与发布

- Electron 构建显式包含四个感知插件及飞书、企微、Email 的完整运行时依赖。
- Windows 与 macOS 安装包新增插件模块加载 smoke test；缺少插件、SDK 或邮件依赖时阻止发布。
- GitHub Actions 固定使用 Node.js 24、pnpm 9.15.9 和 frozen lockfile 构建 Windows、macOS arm64/x64 产物。

## 验证

- 通过 Core Plugin Host、Email、企业微信、飞书与感知中心表单专项测试。
- 通过 frozen-lockfile 安装、四插件编译、Next.js production build、Desktop TypeScript 构建及 Agent Worker 产物检查。
- 发布 workflow 完成三平台构建、安装包依赖校验、七牛同步和 GitHub Release 资产上传后视为正式发布完成。
