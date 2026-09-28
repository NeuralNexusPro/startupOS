# Story M.9: 语义检索能力补齐 — ONNX 推理 + HNSW 修复 + RecallMemory.searchSemantic 实装

**Epic:** M — Memory Core 记忆核心
**状态:** ⬜ Pending
**优先级:** Critical（M.7 启动前的强制门禁）
**估计工时:** 5–7 天
**依赖:** M.3、M.4、Story M.8（链路收敛）

---

## 概述

让 ArchivalMemory 与 RecallMemory 真正具备语义检索能力，修复 HNSW 索引在大数据量下的正确性与崩溃安全问题，并定义 ONNX 模型的分发与版本管理方案。

---

## 📂 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、背景与问题 |
| [架构文档](./architecture.md) | 技术范围（ONNX/HNSW/持久化/文档同步）、影响范围、相关文档 |
| [测试文档](./testing.md) | 验收标准 |
