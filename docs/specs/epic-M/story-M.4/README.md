# Story M.4: Recall Memory 语义增强

**Epic:** M — Memory Core 记忆核心
**状态:** ✅ Complete
**优先级:** High
**估计工时:** 2-3 天

---

## 概述

作为 Agent 系统，我需要将现有的对话历史搜索从关键词匹配升级为语义搜索，这样用户可以搜索"上周关于数据库优化的讨论"这类语义查询，即使对话中没有"数据库优化"这个词。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（语义搜索、关键词回退、Dream cursor） |
| [架构文档](./architecture.md) | RecallMemory API、与现有对比、异步 embedding 策略 |
| [测试文档](./testing.md) | 验收标准、测试用例 |

---

## 核心要点

- **RecallMemory 类**：兼容现有 MemoryTracker 的 recordTurn 行为
- **语义搜索**：searchSemantic(query, options) — ONNX 编码 + 余弦相似度
- **关键词回退**：searchKeyword(query, maxResults) — 保留现有逻辑
- **Dream cursor 兼容**：getDreamCursor, setDreamCursor, readRecentHistory
- **异步 embedding**：recordTurn 时不阻塞，后台生成 embedding

---

## 相关文档

- [Epic M 总览](../README.md)
- [Story M.3: Archival Memory 语义存储](../story-M.3/README.md)
- [Story M.5: Memory Tools API](../story-M.5/README.md)
- [架构规约](../../../CLAUDE.md)
