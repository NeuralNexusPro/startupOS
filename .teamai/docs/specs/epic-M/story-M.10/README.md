# Story M.10: Memory Core 文档与协作场景对齐

**Epic:** M — Memory Core 记忆核心
**状态:** ⬜ Pending
**优先级:** High（M.7 启动前的强制门禁）
**估计工时:** 2–3 天
**依赖:** M.8、M.9
**源依据:** [Memory Core 架构审查（2026-05-20）](../../../design/memory-core-architecture-review-2026-05-20.md)（ARCH-MC-02 / ARCH-MC-12 / ARCH-MC-13 / ARCH-MC-14）

---

## 用户故事

> 作为 OriginOS 的维护者，我需要在 M.8 / M.9 完成代码层治理之后，把仍遗留的文档背离、术语漂移、协作场景记忆策略缺失、数据路径登记缺漏一次清掉，让 Epic M 文档与代码、与 collaboration-runtime 完整一致。

---

## 问题

1. **ARCH-MC-02 ｜ 文档与代码状态背离**：Epic M README 与 M.1–M.7 全部标 Planning ⬜，但 `src/modules/memory-core/` 已上线并被 4 处接线（`persistent-agent-manager`、`agent-manager`、`agent-worker.mts`、`/api/agent/memory/consolidate`）。
2. **ARCH-MC-12 ｜ 数据路径未登记**：`data/agents/{name}/archival/`、`memory/history/{sessionId}.jsonl`、`.dream_cursor` 在 CLAUDE.md §数据存储规约第 7 节文件树中未列出。
3. **ARCH-MC-13 ｜ 协作场景记忆隔离/共享策略缺失**：collaboration-runtime 多 Agent 子进程各持 `MemoryCore`，并发读写同一 `Memory.md` / `archival/hnsw-index.bin` 无锁；Epic M 未定义协作场景记忆策略，与 ARCH-RT-06（Blackboard 路径）需要交叉考虑。
4. **ARCH-MC-14 ｜ 术语漂移**：Block vs MemoryBlock；Memory（Block 集合）vs MemoryCore（三层门面）；`searchSemantic / searchKeyword / searchHistoryFromPath / recordTurn` 在 RecallMemory 与旧 MemoryTracker 中混用；Archival vs Long-term Memory 多种叫法并存。

---

## 范围（必做项）

### A. 文档状态对齐（ARCH-MC-02）

- [ ] 重新评估 M.1–M.7 实际实施进度，依据 `src/modules/memory-core/` 现状把每个 Story 标为 ✅ Complete / 🟡 部分实现 / ⬜ Pending（M.7 在 M.8/M.9 完成前保持 Pending）。
- [ ] 在 Epic M README §Stories 列表新增「实施进度」列，并在每个 Story README 顶部增加「实施状态摘要」段落，列出对应的实际文件路径。
- [ ] 在 `docs/design/memory-core.md` 第 1 章后新增「实施进度对照表」：每个章节（3.1 Block / 3.2 Memory / 3.3 Archival / 3.4 Recall / 3.5 Tools / 3.6 Provider / 3.7 Pattern / 3.8 MemoryCore / 4 Adapter）→ 对应文件 → Wired/Available/Not-wired。
- [ ] `docs/changes/changelog.md` 补录「memory-core 模块首次合入主干」的实际日期（追溯由 `git log src/modules/memory-core` 取最早提交）。

### B. 数据路径登记（ARCH-MC-12）

- [ ] CLAUDE.md v2.4.0 §数据存储规约第 7 节（强制目录结构）的 `data/agents/{agentName}/` 树新增：
  ```
  ├── archival/
  │   ├── entries.jsonl       # Archival 语义条目
  │   └── hnsw-index.bin      # HNSW 向量索引
  ├── memory/
  │   ├── history/{sessionId}.jsonl  # 分片对话历史
  │   └── .dream_cursor       # Dream 增量游标
  └── blocks.json             # Block 版本快照（保留 10 个）
  ```
- [ ] 同步更新 `docs/design/memory-core.md` §5 数据目录结构，与 CLAUDE.md 一字不差对齐。
- [ ] 在 Story M.8 完成的 DataFile 规约对齐基础上，明确 `entries.jsonl` 与 `blocks.json` 的 `version` 字段当前版本号（建议 `memory-core/1.0`）。

### C. 协作场景记忆策略（ARCH-MC-13）

- [ ] 在 `docs/design/memory-core.md` 新增 §9「多 Agent 协作场景的记忆策略」章节，覆盖：
  - 协作 Agent 的 `MemoryCore` 实例化位置（agent-worker.mts 子进程内 vs runtime 主进程）；
  - 同一 agentDir 多进程并发安全：选择「文件锁」还是「单写者由主进程持有」；
  - Workflow 模式下上游产出是否进入下游 Agent 的 ArchivalMemory；
  - 协作会话级 `Memory.md` 是否独立于 Agent 长期记忆（建议：协作 session 写入 Blackboard，session 结束时由 Consolidator 抽取后再合并到 Agent ArchivalMemory，避免污染长期记忆）；
  - 与 ARCH-RT-06（Workflow 路径黑板写入）的交叉点：Blackboard 写入与 ArchivalMemory 写入的边界。
- [ ] 在 `docs/design/multi-agent-runtime.md` §3（Session 层）增加交叉引用，指向上述 §9。

### D. 术语表统一（ARCH-MC-14）

- [ ] 在 `docs/design/memory-core.md` 新增 §10「术语表」：
  | 当前用词 | 统一后 | 含义 |
  |---|---|---|
  | Block / MemoryBlock | **Block** | 记忆基本单元；旧 `MemoryBlock` 类型仅作过渡期 re-export |
  | Memory / MemoryCore | **Memory**（Block 集合）/ **MemoryCore**（三层门面） | 不可互换 |
  | Archival / Long-term Memory / 长期记忆 / 语义向量存储 | **ArchivalMemory** | 统一英文术语 |
  | Recall / 对话历史 / Short-term Memory | **RecallMemory** | 统一英文术语 |
  | searchSemantic / searchKeyword / searchHistoryFromPath / recordTurn | 保留 `searchKeyword` / `searchSemantic`（M.9 实装后）/ `searchHybrid`（M.9 新增）/ `recordTurn` | 删除 `searchHistoryFromPath` 别名 |
- [ ] 全文 grep memory-core.md / Epic M / CLAUDE.md，按术语表替换；保留 1 行术语过渡注释。

---

## 验收标准

1. `docs/specs/epic-M/README.md` 与每个 story README 状态准确反映 `src/modules/memory-core/` 现状；新增「实施进度」列。
2. `docs/design/memory-core.md` 含「实施进度对照表」「术语表」「多 Agent 协作场景的记忆策略」三个新增章节。
3. CLAUDE.md v2.4.0 §数据存储规约第 7 节包含 archival / memory/history / blocks.json 三类路径。
4. `docs/design/multi-agent-runtime.md` §3 含指向 memory-core §9 的交叉引用。
5. `docs/changes/changelog.md` 包含 memory-core 模块上线追溯条目。
6. 用术语表统一后，全文不再出现「Long-term Memory」「Short-term Memory」「语义向量存储」「对话历史索引」等漂移用词（除术语表本身外）。
7. 进入 Story M.7 之前，本 Story 与 M.8 / M.9 必须 Resolved。

---

## 影响范围

- `docs/specs/epic-M/README.md`、`docs/specs/epic-M/story-M.{1..7}/README.md`
- `docs/design/memory-core.md`
- `docs/design/multi-agent-runtime.md`
- `CLAUDE.md`（→ v2.4.0）
- `docs/changes/changelog.md`

## 相关文档

- [Memory Core 架构审查（2026-05-20）](../../../design/memory-core-architecture-review-2026-05-20.md)
- [Memory Core 设计文档](../../../design/memory-core.md)
- Story M.8（记忆链路收敛）、Story M.9（语义检索能力补齐）
- 多 Agent 协作运行时架构审查（ARCH-RT-06 黑板路径）
