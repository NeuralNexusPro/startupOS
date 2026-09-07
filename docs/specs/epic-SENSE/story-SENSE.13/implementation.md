# SENSE.13 实施计划

- [x] S13-T1：先补首页入口、动作分发、状态聚合和面板交互测试。
- [x] S13-T2：在 `HOME_APPS` 增加“感知与连接”，接入 action 并移除独占横幅。
- [x] S13-T3：实现顶部连接健康按钮、快速面板、空/错/加载及可访问性状态。
- [x] S13-T4：运行 Web 测试、typecheck、lint、依赖检查和自动化验证 Goal。
- [x] S13-T5：增加“创建技能”应用配置，复用系统 Skill 和 Dock 应用 ID，并补配置回归测试。

保留 `openSenseCenter()`、窗体 ID 和内部四区不变；已运行窗体不重复创建。SENSE.9 历史文档不改写，由本 Story 覆盖其入口决策。审查确保首页不解析平台类型、通知与状态职责分离、无 inline style/CSS Module/any。
