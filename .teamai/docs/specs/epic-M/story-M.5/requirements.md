# 需求文档 - Story M.5

**Story:** Memory Tools API
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 Agent，我需要通过标准工具接口自主编辑核心记忆（添加/替换 block）和长期记忆（写入/搜索 archival），这样我可以在对话过程中主动管理记忆，而非被动等待外部系统更新。

---

## 功能需求

1. **CoreMemoryTools** — 借鉴 Letta core_memory_append/replace/insert/read
2. **ArchivalMemoryTools** — 借鉴 Letta archival_memory_insert/search
3. **错误处理** — block 不存在、只读、超出限制等
4. **Agent 可读返回值** — 统一成功/失败字符串格式

---

## 依赖关系

- 依赖 Story M.1（Block 类型）
- 依赖 Story M.2（Memory 类 CRUD 操作）
- 依赖 Story M.3（ArchivalMemory insert/search）
