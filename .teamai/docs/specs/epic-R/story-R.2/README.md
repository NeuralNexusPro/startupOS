# Story R.2: 状态机解析与推进

**Epic:** R - RoleAgent pi-agent 循环重构
**状态:** 🔴 Not Started
**优先级:** Critical
**创建日期:** 2026-04-27

---

## 概述

从 Role.md 中解析角色状态机，并在 turn_end 后判断是否需要状态转换，让角色在不同阶段（准备/执行/复盘）展现不同的行为特征。

---

## 📂 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、验收标准（6 项）、依赖关系 |
| [architecture.md](./architecture.md) | RolePhase / TransitionRule / StateMachine 类型定义 |

---

## 🔗 相关文档

- [Epic R README](../README.md)
- [设计方案](../../../../.claude/plans/roleagent-pi-agent-loop.md#372-state-machinets)
