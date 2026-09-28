# 架构设计 - Story C.9

**Story:** Letta 三元记忆架构
**Epic:** C (认知系统)
**最后更新:** Planning

---

## 架构概览

### 设计目标

借鉴 Letta 的 Memory Block 模式和 Sleep-time Compute 机制，构建统一的三元记忆架构。

### 参考材料

**Letta 源码（`learn/letta/`）：**
- `letta/schemas/block.py` — Block 数据模型（label/value/limit/description/tags）
- `letta/schemas/memory.py` — Memory 类（block 集合 + CRUD + prompt 渲染）
- `letta/groups/sleeptime_multi_agent_v4.py` — Sleep-time 后台代理编排
- `letta/prompts/system_prompts/sleeptime_v2.py` — Sleep-time 系统提示词模板

---

## Letta 源码 → OriginOS 映射

| Letta 概念 | 源码位置 | OriginOS 映射 | 实现方式 |
|-----------|---------|--------------|---------|
| **Block** (label/value/limit) | `schemas/block.py:19-44` | Memory Block | Markdown 分块结构，每块有 label、value、limit、description |
| **Human block** | `schemas/block.py:117-121` | `[human]` 用户信息 block | Agent 自动提取用户偏好 |
| **Persona block** | `schemas/block.py:124-128` | `[persona]` Agent 角色认知 | 从 Role.md / Agent.md 初始化 |
| **Memory 渲染** | `schemas/memory.py:143-173` | prompt 注入 | XML 格式渲染各 block，注入 Layer 2 |
| **core_memory_append** | `schemas/memory.py:804-818` | `appendBlock()` | 追加内容到指定 block |
| **core_memory_replace** | `schemas/memory.py:820-837` | `replaceBlock()` | 精确替换 block 内容 |
| **ChatMemory** | `schemas/memory.py:840-854` | 默认 block 集合 | 初始化 human + persona 两个基础 block |
| **SleeptimeMultiAgent** | `groups/sleeptime_multi_agent_v4.py:24-289` | SleepComputeScheduler | 后台异步处理对话转录，更新 memory blocks |
| **Sleeptime system prompt** | `prompts/sleeptime_v2.py:1-30` | Sleep-task prompt 模板 | 指导后台代理整理、去重、更新记忆 |

---

## 三元记忆映射

| Letta 层级 | OriginOS 对应 | 注入方式 | Token 预算 |
|------------|--------------|---------|-----------|
| **Core Memory** | Agent.md + Memory Blocks | 始终注入（Layer 1-2） | ~2000 |
| **Recall Memory** | `memory/history.jsonl` | 按需检索（最近 N 条或关键词搜索） | ~4000 |
| **Archival Memory** | Knowledge.md + Patterns.md + episodic-memory/ | 惰性加载（TOC + read_file） | 无限制 |

---

## 数据结构

### Memory Block 类型

借鉴 Letta `schemas/block.py` 的数据模型：

```python
# Letta 源码 (schemas/block.py:13-44)
class BaseBlock(LettaBase, validate_assignment=True):
    value: str = Field(..., description="Value of the block.")
    limit: int = Field(CORE_MEMORY_BLOCK_CHAR_LIMIT, description="Character limit of the block.")
    label: Optional[str] = Field(None, description="Label of the block (e.g. 'human', 'persona') in the context window.")
    description: Optional[str] = Field(None, description="Description of the block.")
    metadata: Optional[dict] = Field({}, description="Metadata of the block.")
    read_only: bool = Field(False, description="Whether the agent has read-only access to the block.")
```

对应 OriginOS TypeScript 实现：

```typescript
interface MemoryBlock {
  label: string;           // 唯一标识，如 "human", "persona"
  value: string;           // block 内容（Markdown）
  limit: number;           // 字符上限
  description: string;     // 用途说明，指导 Agent 何时编辑
  metadata: Record<string, unknown>;
  readOnly: boolean;       // 是否只读（如 persona 从 Role.md 初始化后只读）
}
```

### Sleep Task 类型

```typescript
export interface SleepTask {
  type: 'consolidate_memory' | 'extract_knowledge' | 'mine_patterns' | 'update_blocks';
  payload: Record<string, unknown>;
}

export type SleepTrigger =
  | { type: 'session_end' }
  | { type: 'interval'; everyNTurns: number }
  | { type: 'manual' };
```

---

## Memory Block 模式

**Memory.md 新格式：**

```markdown
# Memory

## human
{description: 用户信息}
{limit: 2000 chars}
{readOnly: false}

- 姓名: Archersado
- 偏好: 简洁的响应风格，不喜欢冗余的总结
- 项目: OriginOS AI Native 操作系统

## persona
{description: Agent 角色认知}
{limit: 2000 chars}
{readOnly: false}

- 当前身份: Atlas 架构师
- 工作风格: 先分析全局，再深入细节
- 专业语言: 技术术语 + 中文

## project
{description: 项目上下文}
{limit: 2000 chars}
{readOnly: false}

- 当前阶段: Epic C 认知系统开发
- 活跃 Story: C.9 Letta 记忆架构
- 最近决策: 采用 Lazy Loading 模式注入 Knowledge.md

## scratchpad
{description: 工作笔记}
{limit: 1000 chars}
{readOnly: false}

- 待确认: Memory Block 的初始内容如何生成

## temporal
{description: 关键事件时间线}
{limit: 3000 chars}
{readOnly: true}

- 2026-05-12: 创建了 Reflexion 失败反思机制
- 2026-05-11: 实现了 Knowledge.md 惰性加载
```

**Block CRUD 操作**（借鉴 Letta `schemas/memory.py:750-780`）：

```typescript
interface MemoryBlockManager {
  getBlock(label: string): MemoryBlock | null;
  setBlock(label: string, value: string): void;
  appendBlock(label: string, content: string): void;
  replaceBlock(label: string, oldContent: string, newContent: string): void;
  deleteBlock(label: string): void;
  listBlocks(): MemoryBlock[];
  nearLimit(label: string, threshold?: number): boolean;  // 接近上限时触发 summarizer
}
```

---

## Prompt 渲染（借鉴 Letta）

Letta 使用 XML 格式渲染 blocks（`schemas/memory.py:143-173`）：

```python
def _render_memory_blocks_standard(self, s: StringIO):
    s.write("<memory_blocks>\n")
    for block in renderable:
        s.write(f"<{block.label}>\n")
        s.write("<description>\n{block.description}\n</description>\n")
        s.write(f"<metadata>\n- chars_current={len(value)}\n- chars_limit={limit}\n</metadata>\n")
        s.write(f"<value>\n{value}\n</value>\n")
        s.write(f"</{block.label}>\n")
```

OriginOS Layer 2 注入格式：

```xml
<memory_blocks>
The following memory blocks are currently engaged in your core memory unit:

<human>
<description>
用户画像、偏好、历史习惯
</description>
<metadata>
- chars_current=120
- chars_limit=2000
</metadata>
<value>
- 姓名: Archersado
- 偏好: 简洁的响应风格
</value>
</human>

<persona>
...
</persona>

<project>
...
</project>
</memory_blocks>
```

---

## Sleep-time Compute

**流程设计：**

```
用户消息 → Agent 处理 → 响应（关键路径，快）
                    ↘
                     on_turn_end（轻量）
                       ├─ 记录 turn 到 JSONL
                       └─ 检查是否需要触发 sleep compute

Sleep Compute（异步，不阻塞）
  ├─ Memory Consolidation: 合并最近 N 条 turn 为摘要
  ├─ Dream Analysis: 分析对话历史 → 更新 Memory Block
  ├─ Knowledge Extraction: 提取新知识 → Knowledge.md
  └─ Pattern Mining: 分析成功/失败路径 → Patterns.md
```

**触发条件**：
- `on_session_end`：会话结束时必定执行
- `turn % N === 0`：每 N turn 检查一次（可配置频率，对应 Letta 的 `sleeptime_agent_frequency`）

```typescript
interface SleepComputeScheduler {
  schedule(task: SleepTask, trigger: Trigger): string;
  cancel(taskId: string): void;
  executePending(): Promise<void>;
  getPendingTasks(): SleepTask[];
}
```

**Sleep-task prompt 模板**（借鉴 `prompts/sleeptime_v2.py`）：

```
You are a background memory manager reviewing a conversation that already happened.

Your role is memory management only. Review the conversation and update 
any memory blocks with information worth preserving:

1. **Human block**: Extract user preferences, facts, goals mentioned in conversation
2. **Persona block**: Update agent's self-concept if new identity/tone insights emerged
3. **Project block**: Update project status, decisions, active tasks
4. **Temporal block**: Append key events with precise timestamps

When writing to memory blocks, be precise with dates and times.
Do not use "today" or "recently" - use specific ISO timestamps.

Skip edits if there are no meaningful updates. Not every conversation warrants a memory edit.
```

---

## 记忆检索（Recall API）

```typescript
interface MemoryRecall {
  /** 获取最近 N 条 turn 的摘要 */
  recentTurns(count: number, sinceTurn?: number): string;
  
  /** 按关键词搜索历史 */
  searchHistory(query: string, maxResults?: number): string;
  
  /** 获取指定 turn 范围的详细信息 */
  getTurnRange(from: number, to: number): string;
  
  /** 获取 Core Memory 全文（Memory Blocks） */
  getCoreMemory(): string;
}
```

**搜索实现**（MVP 阶段不使用向量数据库）：
- 关键词 BM25 匹配：对 JSONL 每条记录的 summary + keyInfo 打分
- 返回 top-N 结果
- 后续可升级为向量搜索

---

## 系统 Prompt 分层注入

```
Layer 1: Identity（Agent.md 全文）

Layer 2: Core Memory（Memory Blocks XML 渲染）
  - human / persona / project / scratchpad blocks
  - 始终可见，~2000 tokens
  - 格式对齐 Letta XML 结构

Layer 2b: Archival TOC（惰性）
  - Knowledge.md 实体索引
  - Patterns.md 经验索引
  - Episodic Memory 反思索引
  - 附带 read_file 指令

Layer 3: Thinking Loop
  ...

Layer 4: Toolbox
  ...

Layer 5: Style Guide（Taste.md）
  ...

Layer 6: Working Directory + Permissions
  ...
```

**变化**：
- Memory Blocks 取代当前零散的 Memory.md 摘要
- Knowledge.md / Patterns.md / Episodic Memory 统一为惰性 TOC 注入
- Recall Memory 不注入 prompt，仅在 Agent 需要时通过工具检索

---

## 代码变更

### 修改：`src/lib/integrations/pi-agent/role-agent/memory-tracker.ts`

1. **新增 Memory Block 支持：**
   - 新增 `MemoryBlock` 接口和 `MemoryBlockManager` 类
   - 解析/生成 Memory.md 的 block 结构（`## label` + `{metadata}` 格式）
   - 提供 `getBlock()`, `setBlock()`, `appendBlock()`, `replaceBlock()` 操作
   - 实现 `nearLimit()` 检查，接近上限时标记需要 summarizer

2. **新增 Recall 检索：**
   - `searchHistory(query, maxResults)` — 基于关键词匹配 JSONL
   - `recentTurns(count)` — 获取最近 N 条摘要
   - `getTurnRange(from, to)` — 获取指定范围详情

3. **保留现有功能：**
   - `recordTurn()` — 追加到 entries + JSONL
   - `flushMemory()` — 更新 Memory.md（改为更新对应 block）
   - Dream cursor 相关方法保持不变

### 新增：`src/lib/integrations/pi-agent/cognitive/sleep-compute.ts`

```typescript
export class SleepComputeScheduler {
  private pendingTasks: Map<string, SleepTask> = new Map();
  
  schedule(task: SleepTask, trigger: Trigger): string;
  cancel(taskId: string): void;
  async executePending(): Promise<void>;
  getPendingTasks(): SleepTask[];
}
```

### 修改：`src/lib/integrations/pi-agent/role-agent/system-prompt.ts`

更新 Layer 2 (StateMemory) 的构建逻辑：
1. 读取 Memory Block 内容，使用 XML 格式渲染注入 Core Memory
2. Knowledge.md / Patterns.md / Episodic Memory 统一为惰性 TOC
3. 新增 Recall Memory 检索指令（告知 Agent 如何检索历史）

### 修改：`src/lib/integrations/pi-agent/project-agent/project-prompt.ts`

与 RoleAgent 对齐：
1. 支持 Memory Block 读取
2. 现有惰性加载逻辑保持不变（已是正确模式）

### 新增：`src/lib/integrations/pi-agent/cognitive/types.ts`（扩展）

```typescript
export interface MemoryBlock {
  label: string;
  value: string;
  limit: number;
  description: string;
  metadata: Record<string, unknown>;
  readOnly: boolean;
}

export interface SleepTask {
  type: 'consolidate_memory' | 'extract_knowledge' | 'mine_patterns' | 'update_blocks';
  payload: Record<string, unknown>;
}

export type SleepTrigger =
  | { type: 'session_end' }
  | { type: 'interval'; everyNTurns: number }
  | { type: 'manual' };
```

### 修改：`src/lib/integrations/pi-agent/persistent-agent.ts`

在 `on_turn_end` 中增加睡眠计算调度：
- 检查是否需要触发 `sleep_compute`
- `on_session_end` 中执行所有待处理任务

---

## 文件结构变化

```
{agentOrProject}/
├── Memory.md             # Memory Block 结构化文件（5 个 block）
├── memory/
│   └── history.jsonl     # 不变，原始 turn 记录
```

**存储策略**：
- MVP：所有 block 合并在 Memory.md 一个文件中（简单，便于 Agent 一次性读取）
- 后续：当 block 内容过大时，拆分为独立文件，Memory.md 只保留索引

---

## 相关文档

- [Story README](./README.md)
- [需求文档](./requirements.md)
- [测试文档](./testing.md)
