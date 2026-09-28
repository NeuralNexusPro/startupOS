# Story 9.32: Worker 结构化阻塞契约（report_block）

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Critical
**估计工时:** 3–4 天
**依赖:** 9.31（单前台契约）
**源依据:** [PRD-collaboration-product.md §FR-2](../PRD-collaboration-product.md)

---

## 用户故事

> 作为 Worker，当我缺信息或遇到决策点时，我希望通过结构化的 `report_block` 工具上报给 Supervisor，而不是用自然语言提问；这样 Supervisor 就能用机器可读的方式判定阻塞类型并做出决策。

---

## 目标

定义 4 种 WorkerBlock 类型（need_input / decision_required / conflict_detected / capability_missing），注入 `report_block` 工具使 Worker 挂起但不销毁，事件路由到 Supervisor 等待后续 resume。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（WorkerBlock 类型/report_block 工具/事件路由/向后兼容）、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 数据结构（WorkerBlock 类型定义）、模块设计、代码变更 |
