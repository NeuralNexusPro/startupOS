# 测试文档 - Story M.9

**Story:** 语义检索能力补齐 — ONNX 推理 + HNSW 修复 + RecallMemory.searchSemantic 实装
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

1. `npm test src/modules/memory-core/__tests__/archival.test.ts` 通过，新增至少：
   - ONNX 推理路径回归（含模型不可用 fallback 路径）；
   - HNSW 1500 节点召回率 ≥95%；
   - `expandSearch` arity 修复后类型 0 错误。
2. `RecallMemory.searchSemantic(query, queryEmbedding)` 在 `queryEmbedding` 提供时使用余弦相似度，验证返回排序与 keyword 模式不同；新增端到端测试。
3. HNSW 持久化崩溃模拟测试：写入中断 → 重启 → 索引一致性自愈。
4. 模型下载脚本 `npm run download:embedding` 可用，sha256 校验通过；模型未就绪时启动不阻塞。
5. `memory-core.md` §3.3 §3.4 与代码能力一致；新增章节《Embedding 模型选型与分发》。
6. 进入 Story M.7 之前，本 Story 必须 Resolved。
