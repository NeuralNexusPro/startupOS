# Story SENSE.13：感知中心首页入口与连接状态面板

- Epic：SENSE — Perception Layer & External Event Triggers
- 状态：Done
- Owner：OriginOS Team
- 创建/更新：2026-09-07

## User Story

作为 OriginOS 用户，我希望像打开系统应用一样找到感知中心，并随时看见外部连接是否正常，以便无需理解 Connector 技术概念就能配置和排查消息入口。

## 简要验收标准

- [x] “感知与连接”位于首页应用启动器，点击打开既有感知中心窗体，并可固定到 Dock。
- [x] 删除首页独占整行的感知中心横幅，避免压过项目与常用应用。
- [x] 顶部系统栏提供连接健康入口，展示未配置、正常、部分异常和中断状态。
- [x] 快速面板只显示连接摘要、最近事件和“管理感知中心”，通知仍负责事件结果。
- [x] 支持键盘、屏幕阅读器、窄屏及失败降级，不泄露 Secret 或连接内部错误。
- [x] 应用启动器的创建入口组包含“创建技能”，复用已有系统 Skill 和 Dock 身份。

## 文档导航

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)

## 变更历史

| 日期 | 内容 | 变更人 |
|---|---|---|
| 2026-09-07 | 新增 Story，显式替代 SENSE.9 “不得进入应用启动器”的入口决策 | Codex |
| 2026-09-07 | 完成应用入口、Dock action、顶部健康面板与自动化验证 | Codex |
| 2026-09-07 | 补充“创建技能”应用入口并复用既有启动链路 | Codex |
