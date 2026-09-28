# 架构文档 - Story M.9

**Story:** 语义检索能力补齐 — ONNX 推理 + HNSW 修复 + RecallMemory.searchSemantic 实装
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 关键文件 / 影响范围

- `src/modules/memory-core/archival/{embedding,hnsw-index,archival-memory}.ts`
- `src/modules/memory-core/recall/recall-memory.ts`
- `package.json` — 新增 `@xenova/transformers` 或 `tokenizers-node`、`scripts/download-embedding-model.ts`
- `docs/design/memory-core.md` §3.3 §3.4 + 新增章节
- `.gitignore` — `models/*.onnx`、`~/.cache/originos/`（如适用）

---

## 范围（必做项）

### A. ONNX 推理实装

- [ ] 在 `embedding.ts` 中实现 `encodeOnnx()`：使用 `onnxruntime-node` 加载 `models/all-MiniLM-L6-v2.onnx`，输入 token ids（需 tokenizer）→ 输出 384 维向量 → mean pooling + L2 normalize。
- [ ] 引入 tokenizer：选用 `@xenova/transformers` 或 `tokenizers-node`；选型纳入设计文档新增章节《Embedding 模型选型决策》。
- [ ] 提供 fallback 链：ONNX 不可用 → TF-IDF（保留）；通过 `EmbeddingEngine.mode` 暴露当前模式。
- [ ] 模型分发方案：
  - 仓库新增 `scripts/download-embedding-model.ts`（基于 huggingface CDN）+ npm `postinstall` 钩子（可关闭）；
  - 模型 sha256 校验；
  - 模型缓存路径：`~/.cache/originos/embeddings/all-MiniLM-L6-v2.onnx`；
  - 默认模型未就绪时不阻塞启动，仅降级为 TF-IDF + 控制台 warn。

### B. RecallMemory.searchSemantic 实装

- [ ] 修复 `recall-memory.ts:58-72`：实际使用 `queryEmbedding` 与历史条目的 embedding 做余弦相似度；
- [ ] `recordTurn` 在 `setImmediate` 中异步编码并写回 JSONL（已部分实现）；
- [ ] 增加 `searchHybrid` API：BM25 + 语义 RRF 融合；
- [ ] 旧 `searchKeyword` 保留并显式命名。

### C. HNSW 修复

- [ ] 修正 `expandSearch` 签名：选定 `(query: number[], entryIdx: number, k: number)` 三参数版本，对齐所有调用点；
- [ ] 增加单测：节点数 1500 时强制走 HNSW 路径，验证召回率与 brute-force 偏差 ≤5%。

### D. 持久化安全

- [ ] HNSW 索引序列化为二进制（确实使用 binary 格式而非 JSON）或显式改后缀为 `.json`；
- [ ] 写入流程改为 `tmp → fsync → rename` 原子操作；
- [ ] 启动时一致性校验：entries.jsonl 行数 == index node count，否则触发 `rebuildIndex` 并记录 warn 事件；
- [ ] `rebuildIndex` 在主线程同步完成（首次启动 + 不一致时），不再 piecewise 异步。

### E. 文档同步

- [ ] `memory-core.md` §3.3 §3.4 增加「实际能力 vs 设计能力」对照表，已修复后删除该表；
- [ ] 在 §3.3 新增「Embedding 模型选型与分发」章节，覆盖：候选对比（all-MiniLM-L6-v2 vs bge-small-zh）、中英文表现、分发与缓存策略、版本管理。

---

## 相关文档

- [Memory Core 架构审查（2026-05-20）](../../../design/memory-core-architecture-review-2026-05-20.md)
- [Memory Core 设计文档](../../../design/memory-core.md)
- Story 9.20（黑板 HNSW 语义索引）— 共享底层 EmbeddingEngine + HNSWIndex

**源依据:** [Memory Core 架构审查（2026-05-20）](../../../design/memory-core-architecture-review-2026-05-20.md)（ARCH-MC-04/09/15）
