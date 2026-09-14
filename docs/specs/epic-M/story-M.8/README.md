# Story M.8: 记忆链路收敛 — 围栏修复 + 新旧合并 + DataFile 对齐

**Epic:** M — Memory Core 记忆核心
**状态:** ✅ Complete
**优先级:** Critical（M.7 启动前的强制门禁）
**估计工时:** 4–6 天
**依赖:** M.1–M.6（实现）、`src/modules/memory-core/`、`src/lib/integrations/pi-agent/role-agent/`
**源依据:** [Memory Core 架构审查（2026-05-20）](../../../design/memory-core-architecture-review-2026-05-20.md)（ARCH-MC-01/03/05/06/07/08/10/11）

---

## 概述

将 memory-core 模块从「Planning 文档 + 已上线代码 + 旧链路并存」的混合状态收敛为单一权威实现：修复模块围栏（消除反向 import）、统一所有 Agent 类型的记忆链路、合并 Dream/Consolidator 双入口、对齐 DataFile 规约、清理 any 类型。

---

## 📂 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、8 项问题分析（ARCH-MC-01~11） |
| [架构文档](./architecture.md) | 范围必做项 A-F（围栏修复、链路收敛、Dream/Consolidator 统一、注入顺序、DataFile 对齐、any 清理）、影响范围、相关文档 |
| [测试文档](./testing.md) | 8 项验收标准、测试场景（围栏完整性、链路收敛、旧格式迁移、DataFile 规约、Consolidator 统一） |
