# Story M.1: 类型定义与 Block 抽象

**Epic:** M — Memory Core 记忆核心
**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 1-2 天

---

## 概述

作为 Agent 开发者，我需要统一的 Block 类型定义来描述记忆的各个分区，这样我可以标准化记忆管理、支持版本追溯，并为上层编译和语义检索提供基础。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求、边界条件、依赖关系 |
| [架构文档](./architecture.md) | Block 类型定义、DEFAULT_BLOCKS、与 Letta 对比 |
| [测试文档](./testing.md) | 验收标准、测试用例 |

---

## 核心要点

- **Block 接口**：借鉴 Letta BaseBlock，新增 namespace、tags、version 字段
- **默认 5 blocks**：human, persona, project, scratchpad, temporal
- **兼容性**：与现有 `cognitive/types.ts` 的 MemoryBlock 兼容

---

## 相关文档

- [Epic M 总览](../README.md)
- [Story M.2: Memory 集合 + compile/render](../story-M.2/README.md)
- [架构规约](../../../CLAUDE.md)
