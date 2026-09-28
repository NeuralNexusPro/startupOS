# Story 9.35: Workflow 模式 Lightweight Supervisor 兜底

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** High
**估计工时:** 3–4 天
**依赖:** 9.34（用户回复路由）
**源依据:** [PRD-collaboration-product.md §FR-5](../PRD-collaboration-product.md) · [supervisor-agent.md §7.4](../../../design/supervisor-agent.md)

---

## 用户故事

> 作为用户，即使在没有显式 Supervisor 的 Workflow（纯 trigger DAG）模式下，当某个 Worker 需要我输入时，我仍然不希望被 Worker 直接打扰；运行时应该惰性挂载一个轻量 Supervisor 来承接 HITL。

---

## 目标

创建 supervisor-lite 极简模板（仅 Agent.md + Tool.md），实现惰性挂载机制（首个 WORKER_BLOCK 时才 spawn），轻量 Supervisor 仅支持升级用户和自助补参两种决策，会话结束自动销毁。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（模板/惰性挂载/生命周期/决策差异/配置开关）、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 模块设计、代码变更 |
