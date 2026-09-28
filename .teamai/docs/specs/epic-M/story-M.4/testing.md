# 测试文档 - Story M.4

**Story:** Recall Memory 语义增强
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

- [ ] recordTurn 行为与现有 MemoryTracker 一致（JSONL 追加写入）
- [ ] searchSemantic 返回结果按余弦相似度排序
- [ ] searchKeyword 回退到现有关键词匹配逻辑
- [ ] Dream cursor 完全兼容（读取/写入/增量历史）
- [ ] 语义搜索结果质量优于关键词搜索（人工评估 top-5 相关性）
- [ ] 单元测试覆盖 recordTurn + 两种搜索方式 + Dream cursor
