# 需求文档 - Story M.13

**Story:** 旧记忆机制清退  
**版本:** 1.0  
**最后更新:** 2026-09-10

## 功能需求

### FR1：停止 RoleAgent 双写

RoleAgent Launcher 必须移除 `MemoryTracker.recordTurn/flushMemory`，统一由 AgentManager/PersistentAgent 的 CognitiveManager → MemoryProvider → MemoryCore 记录 turn。

### FR2：删除失活实现

删除没有生产调用的 `Dream`、`DREAM_PHASE1_PROMPT`、`dream-compat`、`MemoryAdapter`，并清除对应公共导出和只服务于这些实现的测试。

### FR3：拆出仍有效的解析能力

ProjectContext 仍需解析 `Memory.md` 时，不得继续依赖 `role-agent/memory-tracker.ts`；解析函数应位于 MemoryCore 或下层共享模块，并通过公共 API 使用。

### FR4：保留数据兼容

停止生成 `.dream_cursor` 和旧单文件 `memory/history.jsonl`，但不得删除用户已有文件。HistoryStore 保留幂等迁移，将旧历史移动/读取为新的 session 历史格式。

## 验收标准

### AC1：单写

**Given** RoleAgent 完成一个 turn  
**When** Cognitive lifecycle 处理 `turn_end`  
**Then** 只追加一条 MemoryCore history entry  
**And** 不创建旧 `memory/history.jsonl` 或 `.dream_cursor`。

### AC2：无旧运行时引用

**Given** 生产源码  
**When** 搜索 Dream、MemoryTracker、MemoryBlockManager、MemoryAdapter  
**Then** 不存在运行时构造或调用  
**And** 不存在旧类型的公共导出。

### AC3：兼容旧数据

**Given** 用户目录含旧 `memory/history.jsonl`  
**When** 新 MemoryCore 首次启动  
**Then** 历史可读取且不会重复迁移  
**And** 不删除 `Memory.md` 或认知数据。

### AC4：行为不回退

**Given** 任一持久 Agent 类型  
**When** 完成会话并重新打开  
**Then** recall、reflect、user profile 和 owner world model 行为保持有效。

## 非功能需求

- 不新增依赖或新抽象层。
- 删除代码量应大于新增生产代码量。
- TypeScript、lint、MemoryCore 与 Agent 集成测试必须通过。
- 数据迁移失败不得造成旧文件丢失。

