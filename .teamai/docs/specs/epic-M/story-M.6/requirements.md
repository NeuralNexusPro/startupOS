# 需求文档 - Story M.6

**Story:** MemoryProvider 集成 + 适配器
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为系统开发者，我需要新 Memory Core 无缝接入现有 CognitiveManager，同时通过适配器兼容所有现有 API，这样我可以分阶段迁移而不破坏现有功能。

---

## 功能需求

1. **MemoryCore 统一门面** — 管理 Core + Archival + Recall 三层
2. **MemoryProvider** — 实现 CognitiveProvider 接口（prefetch, sync_turn, system_prompt_block）
3. **MemoryAdapter** — 兼容现有 MemoryTracker/MemoryBlockManager/Recall search API
4. **灰度迁移** — Phase 1 双写 → Phase 2 灰度 → Phase 3 完全切换
