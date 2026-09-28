# Story 10.4: 本地 Agent Runtime

**Story 编号:** 10.4
**Epic:** 10 - OriginOS CE 客户端
**优先级:** 🟡 Medium
**状态:** 📝 Draft
**创建日期:** 2026-06-02

---

## 📋 概述

CE 版本在本地运行 Agent Runtime，不依赖远程服务。Main Process 启动本地 Agent 子进程，复用现有 `collaboration-runtime` 模块，实现完全离线的 Agent 会话。

---

## 🎯 目标

- Main Process 启动本地 Agent Runtime 子进程
- 复用现有 `collaboration-runtime` 模块
- Agent 子进程在本地 spawn（不走 HTTP）
- 实现 `LocalAgentBridge` 替代 `PIAgentBridge`

---

## 📚 文档导航

| 文档 | 内容 |
|------|------|
| [需求规格](./requirements.md) | 用户故事、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 技术栈、模块设计、代码实现 |
| [测试策略](./testing.md) | 测试用例、验证方法 |
