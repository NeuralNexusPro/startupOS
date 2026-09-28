# Story 0.7: Pi Runtime 0.80.x 升级与 pi-agent-goal 兼容迁移

**Epic:** 0 - 技术架构实施层  
**状态:** Verification  
**优先级:** Critical  
**Owner:** Platform Runtime  
**创建日期:** 2026-07-28  
**最后更新:** 2026-07-28

---

## User Story

作为 OriginOS Runtime 维护者，
我希望将已弃用的 Mario Zechner Pi 0.55.3 依赖迁移到 Earendil Works Pi 0.80.10 兼容基线，
以便保持现有 Agent 行为和桌面打包稳定，并为 `pi-agent-goal` 的正式接入提供受验证的运行时基础。

## 目标

1. 将 Pi Runtime 统一到 `@earendil-works/*@0.80.10`。
2. 通过 OriginOS 自有适配层隔离上游 API 与包名变化。
3. 保持普通 Agent、RoleAgent、Project Agent、工具调用、流式事件和会话恢复行为兼容。
4. 验证 `pi-agent-goal@2026.7.18` 可以装载并完成最小 Goal 生命周期。
5. 通过开发态、单元/集成测试及 Windows、macOS 桌面包验证。

## 非目标

- 不在本 Story 中实现 Agent/RoleAgent 的 Goal 任务入口 UI。
- 不在本 Story 中设计 Goal 阶段状态机、任务 DAG 或多 Agent 编排协议。
- 不升级到与 `pi-agent-goal@2026.7.18` peer dependency 不兼容的 Pi 0.82.x。

## 简要验收标准

- [x] 锁文件中生产运行时不再包含 `@mariozechner/pi-agent-core`、`@mariozechner/pi-ai` 或 `@mariozechner/pi-coding-agent`。
- [x] Pi 运行时依赖精确锁定为 0.80.10，Node.js 基线明确为 `>=22.19.0`。
- [x] 现有 Agent 事件、工具调用、终止、恢复和会话持久化定向回归测试通过。
- [x] `pi-agent-goal@2026.7.18` 的扩展装载和最小 Goal 生命周期测试通过。
- [x] `pnpm install --frozen-lockfile`、Lint、类型检查和相关定向测试通过。
- [ ] Windows 与 macOS 打包产物通过模块解析和启动烟雾验证，不出现 `Cannot find module`。

## 依赖关系

- 前置：Story 0.1 至 0.6 已完成。
- 后续：Story 9.41 的 Goal 任务入口依赖本 Story 提供的运行时兼容基线。

## 文档导航

- [需求](./requirements.md)
- [交互](./interaction.md)
- [架构](./architecture.md)
- [实施](./implementation.md)
- [测试](./testing.md)
- [Epic 0](../README.md)

## 当前进度

- [x] Story 规格初始化
- [x] 兼容版本矩阵确认
- [x] 需求、架构和测试方案完成
- [x] 依赖与适配层迁移
- [x] 自动化测试验证 Goal 执行
- [ ] 跨平台桌面包验证

## 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-07-28 | 完成 0.80.10 适配迁移、Goal 生命周期、CI 回归和 Windows zip 包验证；进入 macOS/NSIS 验证阶段 | Codex |
| 2026-07-28 | 创建 Story，确定 Pi 0.80.10 与 pi-agent-goal 兼容基线 | Codex |
