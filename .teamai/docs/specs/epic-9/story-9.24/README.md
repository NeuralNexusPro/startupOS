# Story 9.24: PID 孤儿会话回收

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** ✅ Complete
**优先级:** Medium
**估计工时:** 1-2 天

---

## Story 概览

> 作为协作运行时，我需要检测并清理宿主进程已退出的孤儿协作会话，这样不会产生"僵尸会话"占用资源，用户也不会看到已失效的会话显示为 running 状态。

---

## 快速导航

- [需求文档](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 相关文档

- Story 9.2: 事件存储（文件系统 JSONL）
- Story 9.11: Collaboration API Routes
