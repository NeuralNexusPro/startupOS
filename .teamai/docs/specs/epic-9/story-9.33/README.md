# Story 9.33: Supervisor HITL 决策器

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Critical
**估计工时:** 4–5 天
**依赖:** 9.32（report_block 契约）
**源依据:** [PRD-collaboration-product.md §FR-3](../PRD-collaboration-product.md) · [supervisor-agent.md §7.3](../../../design/supervisor-agent.md)

---

## 用户故事

> 作为 Supervisor，当我收到 Worker 的 `WORKER_BLOCK` 事件时，我希望显式选择四种决策（自助补参 / 改派 / 升级用户 / 拒绝）中的一种，并把整合后的上下文（不是 Worker 原句）发给用户。

---

## 目标

扩展 Supervisor 状态机支持 block_received / deciding 子状态，升级 `escalate_to_human` 工具强制 mergedContext，实现决策日志、防滥用约束（连续 3 次升级拒绝）、自助补参重派路径。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（状态机扩展/工具签名升级/决策日志/防滥用/自助路径）、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 数据结构（escalate_to_human 签名/决策日志格式）、模块设计、代码变更 |
| [测试策略](./testing.md) | 测试用例（正向/防滥用/Schema 校验/决策日志/四路径覆盖） |
