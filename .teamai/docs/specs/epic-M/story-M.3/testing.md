# 测试文档 - Story M.3

**Story:** Archival Memory 语义存储
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

- [ ] insert 流程：ONNX 编码 < 50ms，Int8 量化内存减少 50-75%
- [ ] search 流程：10K 条目 < 100ms，100K 条目 < 500ms
- [ ] HNSW 索引损坏时可从 entries.jsonl 重建
- [ ] ONNX 模型加载失败时 gracefully 降级（返回空结果或关键词回退）
- [ ] 持久化到 disk，重启后可恢复
- [ ] 单元测试覆盖 insert/search/delete 全链路
