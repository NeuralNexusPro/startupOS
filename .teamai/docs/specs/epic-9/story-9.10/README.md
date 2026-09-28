# Story 9.10: Node.js 沙箱（MVP）

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** High
**估计工时:** 2 天

---

## Story 概览

> 作为系统，我需要通过沙箱隔离每个 Agent 子进程的执行环境，这样失控或恶意的 Agent 不会影响系统安全和其他 Agent。

**目标：** 实现基于 `@anthropic-ai/sandbox-runtime` 的沙箱执行器，支持文件系统权限控制、超时管理和违规追踪。

---

## 快速导航

- [需求定义](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
