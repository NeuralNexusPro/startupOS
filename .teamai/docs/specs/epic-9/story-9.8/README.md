# Story 9.8: DAG 执行器（Workflow 模式）

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Critical
**估计工时:** 2-3 天

---

## Story 概览

> 作为协作引擎的核心，我需要按拓扑排序执行 Agent 并支持并行和无依赖等待，这样多 Agent 可以按 Solution Manifest 定义的顺序正确协作。

**目标：** 实现 DAG 执行器，支持拓扑排序、并行执行、依赖等待、超时控制和全局目标判定。

---

## 快速导航

- [需求定义](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
