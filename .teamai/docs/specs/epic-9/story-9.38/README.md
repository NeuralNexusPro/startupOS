# Story 9.38: Service/Bridge 层合并 — 协作模块边界收敛

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** High
**估计工时:** 2–3 天
**依赖:** 9.37（HITL 直连，Day 1 完成后再做目录迁移）
**源依据:** CLAUDE.md §模块依赖规约 · Story 9.37 Section B

---

## 用户故事

> 作为开发者，我希望协作运行时的所有核心逻辑都统一在 `src/modules/collaboration-runtime/` 下，而不是分散在 `src/lib/collaboration-runtime-bridge/` 和 `src/lib/collaboration-runtime-service/` 两个孤立目录，这样排障和扩展都更清晰。

---

## 目标

新建 `facade/` 层（session-store / event-bus / dag-runner / hitl-dispatcher / index），将 `collaboration-runtime-service/` 和 `collaboration-runtime-bridge/` 的核心逻辑迁移到 `modules/collaboration-runtime/` 下的 facade 和 engine 目录，更新所有 API Routes import 路径，删除旧目录。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（facade 层/engine 迁移/删除旧目录/API 路径更新/测试）、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 背景、调用关系、目标结构、模块设计、迁移顺序、风险 |
| [测试策略](./testing.md) | 迁移验证、验收标准测试 |
