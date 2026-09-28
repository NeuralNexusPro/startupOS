# Story 9.25: 子进程复用机制（Agent Pool）

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** High
**估计工时:** 2-3 天
**依赖:** 9.6（PI Agent 桥接与子进程入口）

---

## Story 概览

> 作为系统，我需要按 agent 复用 key 共享子进程，避免每次 session 都启动独立进程导致资源浪费，同一复用 key 的多个 session 共享一个子进程（顺序执行）。

---

## 快速导航

- [需求文档](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 相关文档

- Story 9.6: PI Agent 桥接与子进程入口
