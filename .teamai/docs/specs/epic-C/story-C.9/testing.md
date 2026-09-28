# 测试文档 - Story C.9

**Story:** Letta 三元记忆架构
**Epic:** C (认知系统)
**最后更新:** Planning

---

## 测试策略

### 测试层级

| 测试类型 | 覆盖率目标 | 重点 |
|---------|-----------|------|
| 单元测试 | ≥ 80% | MemoryBlock CRUD、SleepComputeScheduler 调度逻辑 |
| 集成测试 | 关键路径 | memory-tracker + sleep-compute 协作 |
| E2E 测试 | 核心场景 | Agent 会话 → 记忆写入 → prompt 注入 |

---

## 验收标准测试

### AC1: Memory Block CRUD 可用

**Given** Memory.md 存在且包含 block 结构
**When** 调用 `getBlock('human')`
**Then** 返回正确的 MemoryBlock 对象

**Given** MemoryBlockManager 已初始化
**When** 调用 `setBlock('project', '新内容')`
**Then** Memory.md 中 project block 的 value 被更新

**Given** 某个 block 接近 limit
**When** 调用 `appendBlock('human', '额外内容')`
**Then** `nearLimit()` 返回 true

### AC2: 默认 Block 自动创建

**Given** Agent 首次初始化
**When** Memory.md 不存在
**Then** 自动创建包含 human/persona/project/scratchpad/temporal 5 个 block 的 Memory.md

### AC3: searchHistory 关键词检索

**Given** history.jsonl 包含 100 条 turn 记录
**When** 调用 `searchHistory('OriginOS')`
**Then** 返回包含 "OriginOS" 关键词的相关 turn 摘要

### AC4: recentTurns 最近摘要

**Given** history.jsonl 包含 turn 1-50
**When** 调用 `recentTurns(5)`
**Then** 返回 turn 46-50 的摘要

### AC5: SleepComputeScheduler 调度

**Given** SleepComputeScheduler 已初始化
**When** 调用 `schedule({ type: 'consolidate_memory' }, { type: 'interval', everyNTurns: 10 })`
**Then** 任务被加入队列，返回 taskId

**Given** 队列中有待执行任务
**When** 调用 `executePending()`
**Then** 所有待处理任务被执行

**Given** 任务已被调度
**When** 调用 `cancel(taskId)`
**Then** 任务从队列移除

### AC6: on_session_end 执行

**Given** Agent 会话中有多个待处理的 sleep compute 任务
**When** 会话结束触发 `on_session_end`
**Then** 所有待处理任务被执行

### AC7: Layer 2 XML 渲染

**Given** Memory.md 包含 5 个 block
**When** 构建 system prompt Layer 2
**Then** 使用 `<memory_blocks>` XML 格式渲染所有 block

### AC8: Dream 不再阻塞

**Given** Agent 已运行 20 turn
**When** Dream 触发条件满足
**Then** Dream 任务通过 SleepComputeScheduler 异步执行，不阻塞主流程

### AC9: Project Agent 对齐

**Given** Project Agent 启动
**When** 加载记忆
**Then** 与 RoleAgent 使用相同的 Memory Block 结构

### AC10: 单元测试覆盖率

**When** 运行 `npm run test:coverage`
**Then** 新增模块覆盖率 ≥ 80%

---

## 测试命令

```bash
# 单元测试
npm run test -- --filter="memory-block"
npm run test -- --filter="sleep-compute"

# 集成测试
npm run test -- --filter="memory-integration"

# 覆盖率
npm run test:coverage
```

---

## 相关文档

- [Story README](./README.md)
- [需求文档](./requirements.md)
- [架构设计](./architecture.md)
