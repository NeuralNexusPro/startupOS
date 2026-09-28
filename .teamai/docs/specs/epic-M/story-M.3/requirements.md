# 需求文档 - Story M.3

**Story:** Archival Memory 语义存储
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 Agent，我需要将重要知识长期存储在语义向量索引中，并通过语义搜索（而非关键词匹配）来检索相关记忆，这样我可以找到语义相关但关键词不同的历史知识，提升回答质量。

---

## 功能需求

1. **ONNX embeddings**（384 维）— 使用 all-MiniLM-L6-v2 模型，推理 <50ms
2. **HNSW 向量索引** — 多层图结构，搜索复杂度 O(log n)
3. **写入时编码** — 文本 → ONNX 编码 → Int8 量化 → HNSW 插入
4. **语义搜索** — 查询编码 → HNSW 搜索 → 余弦相似度 → Top-K 返回
5. **持久化** — entries.jsonl + embeddings.bin + hnsw-index.bin
6. **标签过滤** — 搜索时可按 tags 过滤
7. **容错** — 索引损坏时可从 entries.jsonl 重建
