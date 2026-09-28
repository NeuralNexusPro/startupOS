# Story C.1: 认知管理器基础设施

**状态:** 🔴 Not Started
**优先级:** Critical
**Epic:** [Epic C](../README.md)

## 目标

构建认知系统的核心管理器（`CognitiveManager`）和 Provider 抽象接口，作为知识库、经验模式库的统一编排层。

## 设计要点

- `CognitiveProvider` 抽象接口（类似 hermes-agent `MemoryProvider`）
  - `prefetch(query)` — 回忆相关上下文注入 prompt
  - `sync_turn(user, assistant)` — 同步完成 turn 的知识写入
  - `system_prompt_block()` — 静态指令注入
  - 可选钩子：`on_turn_start`, `on_session_end`, `on_delegation`

- `CognitiveManager` 管理器（类似 hermes-agent `MemoryManager`）
  - 注册/管理多个 Provider（KnowledgeProvider, PatternProvider）
  - 按 Agent/Project 维度隔离
  - 生命周期钩子自动触发（pi-agent turn_end hook）
  - 工具路由（tool_name → Provider 映射）

- 集成点：在 `PersistentAgent` 的 `subscribe(agent_end)` 中调用 `CognitiveManager.sync_turn`
- 集成点：在 `RoleAgent` 的 `turn_end` hook 中调用相同逻辑

## 验收标准

- [ ] `CognitiveProvider` 接口定义完整，支持核心 + 可选生命周期
- [ ] `CognitiveManager` 支持多 Provider 注册，故障隔离
- [ ] 按 Agent/Project 隔离作用域
- [ ] pi-agent turn 结束自动触发 sync_turn
- [ ] 不阻塞 Agent 主流程（写入异步化）
