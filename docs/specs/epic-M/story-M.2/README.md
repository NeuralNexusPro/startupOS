# Story M.2: Memory 集合 + compile/render

**Epic:** M — Memory Core 记忆核心
**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 2-3 天

---

## 概述

作为 Agent 系统，我需要将多个 Block 组织为 Memory 集合，并提供 compile/render 方法将其注入到 prompt 中，这样 LLM 能读取结构化的记忆上下文。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求、持久化格式、依赖关系 |
| [架构文档](./architecture.md) | Memory 类设计、compile 格式（markdown/xml）、持久化结构 |
| [测试文档](./testing.md) | 验收标准、测试用例 |

---

## 核心要点

- **Memory 类**：管理 Map<string, Block> 集合
- **compile 双格式**：markdown（兼容现有）+ xml（紧凑 prompt 注入）
- **CRUD 操作**：getBlock, setBlock, appendBlock, replaceBlock, deleteBlock, listBlocks
- **持久化**：Memory.md + blocks.json 版本快照

---

## 相关文档

- [Epic M 总览](../README.md)
- [Story M.1: 类型定义与 Block 抽象](../story-M.1/README.md)
- [Story M.3: Archival Memory 语义存储](../story-M.3/README.md)
- [架构规约](../../../CLAUDE.md)
