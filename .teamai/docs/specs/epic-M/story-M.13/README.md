# Story M.13：旧记忆机制清退

**Epic:** M — Memory Core 记忆核心  
**状态:** ✅ Complete  
**优先级:** 🔴 Critical  
**创建日期:** 2026-09-10  
**最后更新:** 2026-09-10

## Story 概览

作为 OriginOS 维护者，我希望删除已经被 MemoryCore 替代的 Dream、MemoryTracker、MemoryBlockManager 和 MemoryAdapter 运行时链路，使每个 Agent turn 只写一次历史、只通过一个入口 reflect，并停止维护无调用的兼容代码。

## 验收标准

- [x] RoleAgent Launcher 不再创建或调用 `MemoryTracker`，turn 只写入 MemoryCore 的 session JSONL。
- [x] 删除无生产调用的 Dream、Dream compatibility helper 和 MemoryAdapter 公共导出。
- [x] `MemoryBlockManager` 不再参与运行时；仍需使用的 Markdown 解析能力迁入 MemoryCore 公共边界。
- [x] `.dream_cursor` 和旧 `memory/history.jsonl` 不再产生；已有历史仍可由一次性迁移读取。
- [x] RoleAgent、ProjectAgent、PersistentAgent 和协作 Agent 的记忆回归通过。

## 范围边界

不重写 MemoryCore，不新增存储格式，不迁移用户业务内容，不增加 UI，也不新增第三方依赖。

## 文档导航

- [需求](./requirements.md)
- [交互](./interaction.md)
- [架构](./architecture.md)
- [实施](./implementation.md)
- [测试](./testing.md)
- [返回 Epic M](../README.md)
