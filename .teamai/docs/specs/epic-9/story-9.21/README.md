# Story 9.21: Agent Pool 预热机制

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Medium
**估计工时:** 2-3 天

---

## Story 概览

> 作为协作运行时，我需要维护一个预热的 Agent 实例池，这样当新任务到来时可以立即获取已初始化的 Agent（<100ms），跳过冷启动开销（读取 Agent.md/Tool.md/Skill.md、构建 prompt、初始化 sandbox 约 ~2s）。

---

## 快速导航

- [需求文档](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 相关文档

- Story 9.6: PI Agent 桥接与子进程入口
- Story 9.10: Node.js 沙箱
