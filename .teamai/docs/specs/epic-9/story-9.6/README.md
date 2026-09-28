# Story 9.6: PI Agent 桥接与子进程入口

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Critical
**估计工时:** 3-4 天

---

## Story 概览

> 作为系统，我需要将现有 PI Agent 的运行从 Next.js 进程迁移到独立的沙箱子进程中，通过 stdio 与 Runtime 通信，这样 LLM 调用不再阻塞 Next.js 事件循环。

**目标：** 实现 Agent Worker 子进程和 Runtime 侧 Agent Spawner，完成 PI Agent 从 Next.js 进程到沙箱子进程的迁移。

---

## 快速导航

- [需求定义](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
