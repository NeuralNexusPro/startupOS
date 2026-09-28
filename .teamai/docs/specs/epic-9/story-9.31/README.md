# Story 9.31: 单前台 Agent 契约（Supervisor as Sole Foreground Agent）

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Critical（PRD 强约束的工程入口）
**估计工时:** 3–4 天
**依赖:** 9.30 PR-A（Supervisor 子进程化）
**源依据:** [PRD-collaboration-product.md](../PRD-collaboration-product.md) §FR-1 · [supervisor-agent.md §0/§7.3](../../../design/supervisor-agent.md)

---

## 用户故事

> 作为协作运行时的设计者，我希望从工程上彻底切断 Worker → User 的直连通路：Worker 工具白名单移除 `ask_user_question`，运行时拒绝 Worker `HUMAN_REVIEW_REQUEST` 直接到达用户层，UI 前台对话窗口仅显示 Supervisor。这样产品层"单前台 Agent"原则才有强约束保障。

---

## 目标

从工具白名单、事件路由、UI 渲染、API 接口四个层面确保 Worker 无法直接面向用户，所有用户可见消息必须经由 Supervisor 发出。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（工具白名单/事件路由/UI 收敛/接口约束）、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 代码变更、关键文件 |
