# Story M.5: Memory Tools API

**Epic:** M — Memory Core 记忆核心
**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 2-3 天

---

## 概述

作为 Agent，我需要通过标准工具接口自主编辑核心记忆（添加/替换 block）和长期记忆（写入/搜索 archival），这样我可以在对话过程中主动管理记忆，而非被动等待外部系统更新。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求、依赖关系 |
| [架构文档](./architecture.md) | CoreMemoryTools、ArchivalMemoryTools API、返回值格式 |
| [测试文档](./testing.md) | 验收标准、测试用例 |

---

## 核心要点

- **CoreMemoryTools**：core_memory_append/replace/insert/read（借鉴 Letta）
- **ArchivalMemoryTools**：archival_memory_insert/search（借鉴 Letta）
- **错误处理**：block 不存在、只读、超出限制等
- **Agent 可读返回值**：统一成功/失败字符串格式

---

## 相关文档

- [Epic M 总览](../README.md)
- [Story M.1: 类型定义与 Block 抽象](../story-M.1/README.md)
- [Story M.2: Memory 集合 + compile/render](../story-M.2/README.md)
- [Story M.3: Archival Memory 语义存储](../story-M.3/README.md)
- [架构规约](../../../CLAUDE.md)
