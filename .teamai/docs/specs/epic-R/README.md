# Epic R: RoleAgent pi-agent 循环重构

**状态:** ✅ Completed
**优先级:** High
**创建日期:** 2026-04-27
**完成日期:** 2026-04-28

---

## 📋 概述

为 RoleAgent 引入明确的思维循环机制，将 Agent.md（身份）、Role.md（状态机）、Taste.md（风格）、Memory.md（记忆）、Tool.md（工具箱）有机整合到 pi-agent 运行框架中。采用**混合方案**：提示词引导 LLM 思考方向 + 代码自动执行状态管理和持久化。

**核心原则：**
- 仅在 RoleAgent 路径生效，不影响其他 Agent 类型
- 运行记忆由 pi-agent 消息历史承载，Memory.md 每 N 轮落盘
- 技能优先于系统工具使用

---

## Stories

| Story | 标题 | 状态 | 优先级 |
|-------|------|------|--------|
| R.1 | 角色上下文加载器 | ✅ Done | Critical |
| R.2 | 状态机解析与推进 | ✅ Done | Critical |
| R.3 | 技能扫描器 | ✅ Done | High |
| R.4 | 分层 System Prompt 构建器 | ✅ Done | Critical |
| R.5 | Turn 行为分析与 Memory Tracker | ✅ Done | High |
| R.6 | 重构 RoleAgent Launcher | ✅ Done | Critical |

---

## 🔗 相关文档

- [设计方案](../../../.claude/plans/roleagent-pi-agent-loop.md)
- [AGENTS.md 架构规约](../../../AGENTS.md)
