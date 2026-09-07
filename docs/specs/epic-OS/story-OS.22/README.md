# Story OS.22：统一 Agent Channel 消息入口与多 Runtime 双工输出协议

- Epic：OS — Phase 0 OS 交互基础
- 状态：In Progress
- Owner：OriginOS Team
- 创建/更新：2026-09-04

## User Story

作为 OriginOS 用户，我希望系统输入框、企微、飞书、钉钉、邮件及未来渠道都通过同一消息入口连接系统内所有 Agent 能力，使普通 Agent、RoleAgent、Project Agent、Skill 和项目 Multi-Agent Runtime 获得一致的会话、流式输出、行动确认与结果回传能力。

## 简要验收标准

- [x] 已定义统一 `MessageIngress`、FBP `FlowPacket`/有界 Port、`OutputEvent`、Runtime Registry 与验证边界；渠道迁移进行中。
- [x] 支持 Agent、RoleAgent、Project Agent、Skill、Project Multi-Agent/Collaboration Runtime 的统一适配与 Desktop 组合；渠道迁移进行中。
- [ ] 感知层只负责标准化、规则、授权与目标选择，不直接调用 `agent.prompt()`。
- [ ] 渠道支持稳定会话绑定、双工流、幂等回复、HITL、取消、错误与投递回执。
- [ ] 平台原始 frame/token 仅留在插件内，Agent Runtime 不依赖渠道 SDK。

## 文档导航

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)

## 依赖

OS.20（会话恢复）、SENSE.12（感知插件宿主）、Collaboration Runtime 与现有 Agent Session 流协议。

## 当前进度

- OS22-T1-T7 已完成：协议、FBP Packet/有界 Port、统一 Ingress、全部 Runtime、Session 并发控制、Desktop 组合根、OS 输入框及感知主路径迁移。
- OS 输入框通过 Desktop Channel Adapter 保持原渲染协议，并继续复用 Task Runtime 等待态、流式去重、工具状态与解决方案产物刷新。
- OS22-T5 已完成：Session Binding 支持复用、过期、重置、并发创建合并，同 Session 消息由协调器串行执行。
- 已合入 Task Runtime 完整基线并保留 Channel Task-aware 执行 Port；OS 输入框主链已切换，任务续跑和控制域专项回归通过。
- 当前 Channel、Task Runtime 与感知专项 110 项、Desktop Channel/Task 17 项、企微插件 8 项通过；Desktop TypeScript 构建通过。
- T8/T9 仍待完成：真实渠道 Delivery/receipt、fan-out/取消闭环、其他渠道独立插件迁移及最终验证 Goal。

## 变更历史

| 日期 | 内容 | 变更人 |
|---|---|---|
| 2026-09-04 | 建立系统级统一 Channel Story，覆盖全部单体与多 Agent Runtime | Codex |
| 2026-09-04 | 完成 T1 并建立兼容迁移回归基线 | Codex |
| 2026-09-04 | 按 FBP 范式补充有界流、背压、顺序、取消与唯一终态协议 | Codex |
| 2026-09-04 | 完成 T2-T4：接入真实 Launcher/Session/AgentManager 与 Collaboration facade | Codex |
| 2026-09-05 | 完成 T5/T7：会话串行化；企微与邮件感知迁移到 Channel，删除 Session 差值桥接 | Codex |
| 2026-09-07 | 合入 dev Task Runtime 基线，修复当前 feature 分支的 Channel UI 构建与测试断层 | Codex |
