# Story M.3: Archival Memory 语义存储

**Epic:** M — Memory Core 记忆核心
**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 4-5 天

---

## 概述

作为 Agent，我需要将重要知识长期存储在语义向量索引中，并通过语义搜索（而非关键词匹配）来检索相关记忆，这样我可以找到语义相关但关键词不同的历史知识，提升回答质量。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（ONNX、HNSW、Int8 量化） |
| [架构文档](./architecture.md) | ArchivalMemory API、写入/搜索流程、Int8 量化策略 |
| [测试文档](./testing.md) | 验收标准、性能指标、测试用例 |

---

## 核心要点

- **ONNX embeddings**：all-MiniLM-L6-v2 模型，384 维，推理 <50ms
- **HNSW 向量索引**：多层图结构，搜索复杂度 O(log n)
- **Int8 量化**：内存减少 75%，搜索时反量化
- **持久化**：entries.jsonl + embeddings.bin + hnsw-index.bin
- **容错**：索引损坏时可从 entries.jsonl 重建

---

## 相关文档

- [Epic M 总览](../README.md)
- [Story M.2: Memory 集合 + compile/render](../story-M.2/README.md)
- [Story M.4: Recall Memory 语义增强](../story-M.4/README.md)
- [架构规约](../../../CLAUDE.md)
