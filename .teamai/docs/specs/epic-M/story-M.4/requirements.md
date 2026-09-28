# 需求文档 - Story M.4

**Story:** Recall Memory 语义增强
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 Agent 系统，我需要将现有的对话历史搜索从关键词匹配升级为语义搜索，这样用户可以搜索"上周关于数据库优化的讨论"这类语义查询，即使对话中没有"数据库优化"这个词。

---

## 功能需求

1. **RecallMemory 类** — 兼容现有 MemoryTracker 的 recordTurn 行为
2. **语义搜索** — searchSemantic(query, options)：ONNX 编码 + 余弦相似度
3. **关键词回退** — searchKeyword(query, maxResults)：保留现有关键词匹配逻辑
4. **Dream cursor 兼容** — getDreamCursor, setDreamCursor, readRecentHistory
5. **异步 embedding** — recordTurn 时不阻塞，后台生成 embedding
