# 架构文档 - Story M.10

**Story:** Memory Core 文档与协作场景对齐
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 影响范围

- `docs/specs/epic-M/README.md`、`docs/specs/epic-M/story-M.{1..7}/README.md`
- `docs/design/memory-core.md`
- `docs/design/multi-agent-runtime.md`
- `CLAUDE.md`（→ v2.4.0）
- `docs/changes/changelog.md`

---

## 模块设计

### A. 文档状态对齐

**实施进度对照表结构（新增到 `memory-core.md` 第 1 章后）：**

| 章节 | 对应文件 | 状态 |
|------|---------|------|
| 3.1 Block | ... | Wired/Available/Not-wired |
| 3.2 Memory | ... | Wired/Available/Not-wired |
| 3.3 Archival | ... | Wired/Available/Not-wired |
| 3.4 Recall | ... | Wired/Available/Not-wired |
| 3.5 Tools | ... | Wired/Available/Not-wired |
| 3.6 Provider | ... | Wired/Available/Not-wired |
| 3.7 Pattern | ... | Wired/Available/Not-wired |
| 3.8 MemoryCore | ... | Wired/Available/Not-wired |
| 4 Adapter | ... | Wired/Available/Not-wired |

### B. 数据路径登记

**CLAUDE.md §数据存储规约第 7 节新增路径：**

```
data/agents/{agentName}/
├── archival/
│   ├── entries.jsonl       # Archival 语义条目
│   └── hnsw-index.bin      # HNSW 向量索引
├── memory/
│   ├── history/{sessionId}.jsonl  # 分片对话历史
│   └── .dream_cursor       # Dream 增量游标
└── blocks.json             # Block 版本快照（保留 10 个）
```

**version 字段：** `memory-core/1.0`

### C. 协作场景记忆策略（新增 §9）

**核心决策点：**

| 问题 | 决策方向 |
|------|---------|
| MemoryCore 实例化位置 | agent-worker.mts 子进程内 vs runtime 主进程 |
| 多进程并发安全 | 文件锁 vs 单写者由主进程持有 |
| Workflow 上游产出 | 是否进入下游 Agent 的 ArchivalMemory |
| 协作会话级 Memory.md | 独立于 Agent 长期记忆；session 写入 Blackboard → session 结束时 Consolidator 抽取合并 |
| 与 ARCH-RT-06 交叉 | Blackboard 写入与 ArchivalMemory 写入的边界 |

**交叉引用：** `docs/design/multi-agent-runtime.md` §3 → memory-core §9

### D. 术语表

| 当前用词 | 统一后 | 含义 |
|---|---|---|
| Block / MemoryBlock | **Block** | 记忆基本单元；旧 `MemoryBlock` 类型仅作过渡期 re-export |
| Memory / MemoryCore | **Memory**（Block 集合）/ **MemoryCore**（三层门面） | 不可互换 |
| Archival / Long-term Memory / 长期记忆 / 语义向量存储 | **ArchivalMemory** | 统一英文术语 |
| Recall / 对话历史 / Short-term Memory | **RecallMemory** | 统一英文术语 |
| searchSemantic / searchKeyword / searchHistoryFromPath / recordTurn | 保留 `searchKeyword` / `searchSemantic` / `searchHybrid` / `recordTurn` | 删除 `searchHistoryFromPath` 别名 |
