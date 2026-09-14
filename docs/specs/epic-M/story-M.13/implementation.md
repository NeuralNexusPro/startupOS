# 开发文档 - Story M.13

**Story:** 旧记忆机制清退  
**版本:** 1.0  
**最后更新:** 2026-09-10

## 实施任务

### T1：测试先行

- [x] 增加 RoleAgent 单 turn 单写测试。
- [x] 增加不产生 `.dream_cursor`/旧 history 的测试。
- [x] 增加旧 history 幂等迁移测试。
- [x] 增加生产源码旧符号零引用检查。

### T2：解除运行时接线

- [x] 从 RoleAgent Launcher session state 删除 `MemoryTracker`。
- [x] 删除 Launcher 的 `recordTurn`、flush threshold 和旧 Memory 写入。
- [x] 验证 AgentManager/PersistentAgent 仍触发 CognitiveManager。

### T3：迁移共享解析

- [x] 将 `parseBlocksFromMarkdown` 移至 MemoryCore 公共边界。
- [x] ProjectContext 改为通过 MemoryCore 公共 API 导入。
- [x] 删除 `MemoryBlockManager` 和 `memory-tracker.ts`。

### T4：删除失活代码

- [x] 删除 Dream、Dream prompt 和 dream-compat。
- [x] 删除 MemoryAdapter 及其导出。
- [x] 删除 Dream cursor API 和专属测试。
- [x] 保留且验证旧 history 数据迁移。

### T5：回归与文档

- [x] 运行 MemoryCore、RoleAgent、ProjectAgent、PersistentAgent、协作 Agent 测试。
- [x] 运行 TypeScript、lint 和旧符号检查。
- [x] 创建自动化验证 goal：“通过 Story M.13 中定义的全部测试 case”。
- [x] 更新 Story/Epic 状态与变更记录。

## Ponytail 审查标准

- 删除代码量大于新增生产代码量。
- 不用新兼容壳替换旧兼容壳。
- 不删除用户数据，只删除运行时代码。
- 没有调用方的 API 直接删除，不加 deprecated 周期。
