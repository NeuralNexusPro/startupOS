# Story C.9: Letta 三元记忆架构

**状态:** 📋 Planning
**优先级:** High
**Epic:** C（认知系统）

## 概述

借鉴 Letta 的 Memory Block 模式和 Sleep-time Compute 机制，将当前零散的 Memory 机制整合为统一的 **三元记忆架构**（Core / Recall / Archival），使 Agent 拥有结构化、可编辑、自动整理的记忆系统。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 概述、动机、验收标准、依赖关系、兼容性、后续演进 |
| [architecture.md](./architecture.md) | 核心设计（Letta 源码映射、三元记忆、Memory Block、Prompt 渲染、Sleep-time Compute、记忆检索、Prompt 分层注入）、代码变更、文件结构变化 |
| [testing.md](./testing.md) | 测试策略、功能测试用例 |

## 状态

- [ ] 需求确认
- [ ] 架构设计
- [ ] 开发实施
- [ ] 测试验证
