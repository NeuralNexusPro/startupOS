# Story 9.34: 用户回复路由收敛到 Supervisor

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Critical
**估计工时:** 2–3 天
**依赖:** 9.33（Supervisor 决策器）
**源依据:** [PRD-collaboration-product.md §FR-4](../PRD-collaboration-product.md)

---

## 用户故事

> 作为协作运行时的设计者，我希望删除"用户回复直接 resume Worker"的代码路径：用户消息永远进入 Supervisor 消息历史，由 Supervisor 决定后续如何回到 Worker。

---

## 目标

移除所有用户消息直接 resume Worker 的代码分支，用户消息统一进入 Supervisor 消息历史，Worker 重新激活仅通过 Supervisor 的 `dispatch_worker` 工具调用完成。新增 `USER_REPLY_TO_SUPERVISOR` 事件类型。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（路由删除/消息接入/事件标注/兼容性扫描）、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 模块设计、代码变更 |
