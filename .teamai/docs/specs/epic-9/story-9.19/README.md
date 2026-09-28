# Story 9.19: Queen-Led 层级协调（动态治理模式）

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** High
**估计工时:** 3-4 天

---

## Story 概览

> 作为协作运行时的治理引擎，我需要根据 Agent 数量、故障率和协作复杂度动态切换治理模式（hierarchical → democratic → emergency），Queen 作为权威状态维护者防止 Agent 漂移，在 Worker 崩溃时紧急接管任务。

---

## 快速导航

- [需求文档](./requirements.md) - 用户故事、功能需求、验收标准

---

## 相关文档

- [设计文档 §5.3 Supervisor-Worker 模式](../../design/multi-agent-runtime.md#模式-bsupervisor-worker动态分解)
- Story 9.8: DAG 执行器
- Story 9.13: Supervisor 模式
