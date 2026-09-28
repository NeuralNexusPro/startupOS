# 需求文档 - Story C.9

**Story:** Letta 三元记忆架构
**Epic:** C (认知系统)
**最后更新:** Planning

---

## 用户故事

> 作为 Agent 开发者，我需要借鉴 Letta 的 Memory Block 模式和 Sleep-time Compute 机制，将当前零散的 Memory 机制整合为统一的 **三元记忆架构**（Core / Recall / Archival），使 Agent 拥有结构化、可编辑、自动整理的记忆系统。

---

## 动机

当前 OriginOS 的记忆系统存在以下问题：

1. **碎片化**：Memory.md、Knowledge.md、Patterns.md、episodic memory 各自独立，没有统一的记忆管理接口
2. **无类型结构**：Memory.md 只是简单的 turn 摘要追加，没有分块（block），Agent 不知道哪些是用户偏好、哪些是项目上下文
3. **无分层可见性**：所有记忆要么全量注入 prompt（浪费 token），要么惰性加载（缺乏精确控制）
4. **整理在关键路径上**：Dream 每 20 turn 同步触发，阻塞 Agent 主流程

---

## 功能需求

### FR1: Memory Block 结构化存储

引入 Memory Block，将 Memory.md 改造为分块结构化的可编辑文件，每个 block 有 label、value、limit、description。

5 个默认 Block：

| Block 类型 | 用途 | 维护方式 | 默认内容 |
|-----------|------|---------|---------|
| `human` | 用户画像、偏好、历史习惯 | Agent 自动提取 + 用户纠正 | 空 |
| `persona` | Agent 的自我认知、风格 | 从 Role.md/Taste.md 初始化 | Role.md 角色定义 |
| `project` | 当前项目状态、活跃任务 | Agent 自动更新 | 来自 project.json |
| `scratchpad` | 临时笔记、待办、注意项 | Agent 自由读写 | 空 |
| `temporal` | 关键事件时间线 | 自动追加 | 空 |

### FR2: Block CRUD 操作

提供 `getBlock()`, `setBlock()`, `appendBlock()`, `replaceBlock()`, `deleteBlock()`, `listBlocks()` 操作。

### FR3: Sleep-time Compute 异步处理

将 Dream 同步阻塞改为异步后台处理，支持多种触发条件。

### FR4: 记忆检索（Recall API）

为 MemoryTracker 增加结构化检索能力：`recentTurns()`, `searchHistory()`, `getTurnRange()`, `getCoreMemory()`。

### FR5: 系统 Prompt 分层注入

将 Layer 2 (StateMemory) 重构为三元结构，使用 Memory Block XML 渲染。

---

## 验收标准

- [ ] AC1: Memory Block CRUD 可用，Memory.md 能正确解析和生成 block 结构
- [ ] AC2: Memory.md 初始化时自动创建 5 个默认 block（human/persona/project/scratchpad/temporal）
- [ ] AC3: `searchHistory()` 能基于关键词从 JSONL 中检索相关 turn
- [ ] AC4: `recentTurns()` 返回最近 N 条 turn 摘要
- [ ] AC5: SleepComputeScheduler 支持 `schedule()`, `cancel()`, `executePending()`
- [ ] AC6: `on_session_end` 时执行所有待处理的睡眠计算任务
- [ ] AC7: Layer 2 StateMemory 使用 Memory Block XML 渲染替代原 Memory.md 摘要
- [ ] AC8: 现有 Dream 功能（每 20 turn 触发）接入 SleepComputeScheduler，不再阻塞
- [ ] AC9: Project Agent 与 RoleAgent 的记忆加载逻辑对齐
- [ ] AC10: 所有新增功能通过单元测试（覆盖率 ≥ 80%）

---

## 非功能需求

- **向后兼容**：现有 `recordTurn()` / `flushMemory()` 不变
- **性能**：Sleep-time Compute 不阻塞主流程
- **Token 预算**：Core Memory ~2000 tokens，Recall Memory ~4000 tokens

---

## 依赖关系

| 依赖 Story | 依赖内容 | 状态 |
|-----------|---------|------|
| Story C.4 | 实践日志记录系统 — JSONL 历史存储基础 | 📋 Planning |
| Story C.7 | 角色知识体系插拔 — RoleAgent Memory 基础设施 | 📋 Planning |
| Story C.8 | Reflexion 失败反思 — Episodic Memory 已实现 | 📋 Planning |

---

## 与现有组件的兼容性

| 现有组件 | 影响 | 迁移策略 |
|---------|------|---------|
| `MemoryTracker` | 需要增加 Block 支持 | 向后兼容，现有 `recordTurn()` / `flushMemory()` 不变 |
| `Dream` (dream.ts) | 需要接入 SleepCompute | 改为向 SleepCompute 提交任务而非直接执行 |
| `MemoryGenerator` | 不受影响 | 仍负责 session 级别的摘要生成 |
| `PatternProvider` | 不受影响 | Episodic Memory 仍由 PatternProvider 管理 |
| `project-prompt.ts` | Layer 2 需要适配 | 增加 Memory Block XML 渲染逻辑 |
| `system-prompt.ts` | Layer 2 需要适配 | 增加 Memory Block XML 渲染逻辑 |

---

## 后续演进

- **向量搜索**：引入轻量级向量嵌入（如 `all-MiniLM-L6-v2`），替代 BM25 关键词搜索
- **跨 Session 记忆**：将 Memory Block 持久化到用户级别，而非 Agent 级别
- **记忆融合评分**：参考 Mem0 的 Vector + Graph + KV 融合评分，提升检索精度
- **记忆衰减**：引入时间衰减因子，旧记忆权重降低

---

## 相关文档

- [Story README](./README.md)
- [架构设计](./architecture.md)
- [测试文档](./testing.md)
- [Epic C README](../README.md)
