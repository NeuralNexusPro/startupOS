# 需求文档 - Story M.9

**Story:** 语义检索能力补齐 — ONNX 推理 + HNSW 修复 + RecallMemory.searchSemantic 实装
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 OriginOS 的维护者，我需要让 ArchivalMemory 与 RecallMemory 真正具备语义检索能力，与设计文档承诺一致；同时保证 HNSW 索引在大数据量下的正确性与崩溃安全，并定义 ONNX 模型的分发与版本管理方案。

---

## 背景与问题

1. **ONNX 推理未实现（ARCH-MC-04 / ARCH-MC-15）**：
   - `src/modules/memory-core/archival/embedding.ts:142-148` `encodeOnnx()` 直接 `throw new Error('ONNX inference not yet implemented')`；
   - `load()` 试图加载 `models/all-MiniLM-L6-v2.onnx`，仓库未提供该模型文件；
   - 全部 embedding 回退到 384 维 TF-IDF 哈希词袋；
   - 模型分发/缓存/版本管理无规划。
2. **`RecallMemory.searchSemantic` 假语义（ARCH-MC-04）**：
   - `recall-memory.ts:58-72` 内部 `void queryEmbedding`，永远调用 `scoreKeyword`；
   - 函数名误导调用方。
3. **HNSW `expandSearch` arity 不匹配（ARCH-MC-04）**：
   - `hnsw-index.ts:112` 调用处 `expandSearch(query, currentIdx, k)` 与签名 `(entryIdx, k)` 不一致；
   - 当前被 `bruteForceSearch` 截胡掩盖，但条目 >1000 时会出错。
4. **HNSW 持久化时序不安全（ARCH-MC-09）**：
   - `archival-memory.ts:152-159` 直接覆写 `.bin`，启动 piecewise 重建索引，崩溃中断会出现 entries 与 index 不一致；
   - `.bin` 后缀实际写入 JSON，扩展名误导。
