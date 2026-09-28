# Story 9.28: Swarm/Supervisor 模式生产接线

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** ✅ 完成
**优先级:** High（Phase 3 高级特性的核心能力）
**估计工时:** 3–4 天

---

## Story 概览

> 作为多 Agent 协作运行时的使用者，我希望对于需要动态任务分解和完成判定的复杂协作场景，能够使用 Supervisor/Worker 模式运行，而不是仅受限于静态 DAG 执行。

---

## 快速导航

- [需求文档](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 相关文档

- [多 Agent 协作运行时设计文档](../../../design/multi-agent-runtime.md) §5.1-5.3
- [多 Agent 协作运行时架构审查（2026-05-20）](../../../design/multi-agent-runtime-architecture-review-2026-05-20.md)
- [DAG HITL 输入判定标准](../../../design/dag-hitl-decision-standard.md)
- Story 9.13（Supervisor Mode 实现）
- Story 9.27（架构治理与 HITL 链路修复）
