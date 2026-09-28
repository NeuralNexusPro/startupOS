---
title: Memory Core 架构审查（2026-05-20）
status: 已发布
date: 2026-05-20
author: Architecture Governance
related:
  - docs/design/memory-core.md
  - docs/specs/epic-M/README.md
  - docs/design/multi-agent-runtime-architecture-review-2026-05-20.md
  - CLAUDE.md（v2.3.0）
---

# Memory Core 架构审查（Architecture Review）

**审查范围：** `src/modules/memory-core/`（core/archival/recall/session/tools/adapter.ts），与 `src/lib/integrations/pi-agent/role-agent/{memory-tracker,dream,consolidator}.ts`、`src/lib/integrations/pi-agent/cognitive/`、`src/lib/integrations/pi-agent/{persistent-agent-manager,agent-manager}.ts`、`src/modules/collaboration-runtime/sandbox/agent-worker.mts` 中记忆链路；Epic M Stories M.1–M.7、设计文档 `docs/design/memory-core.md`。

**审查目标：** 基于 AGENTS.md v2.3.0 架构围栏，识别 memory-core 模块边界破损、新旧链路双轨并行、语义检索能力宣称与实际不符、Epic M 设计与现有体系脱节等问题，给出治理动作。

**结论摘要：** memory-core 模块**代码已经先于 Epic M 的 Planning 状态被引入主干并接线**（与 Epic M README/Stories 全为 Planning ⬜ 状态不一致），整体存在 **4 个 Critical、6 个 High、5 个 Medium** 风险项，统一编号 ARCH-MC-01 至 ARCH-MC-15。最危险的是 Critical-04：所谓"语义检索"在生产路径上**实质上仍是关键词匹配 + 哈希词袋**，与 README/设计文档的能力宣称严重背离。

---

## 1. Critical 风险项

### ARCH-MC-01 ｜ 模块围栏违规：memory-core 4 处反向 import `src/lib/`

- **位置：**
  - `src/modules/memory-core/core/consolidator.ts:11` — `import { createAutoModel } from '@/lib/integrations/pi-agent/server-config'`
  - `src/modules/memory-core/adapter.ts:9` — `import type { MemoryBlock } from '@/lib/integrations/pi-agent/cognitive/types'`
  - `src/modules/memory-core/session/memory-provider.ts:8` — `import { CognitiveProvider, TurnCognitiveData } from '@/lib/integrations/pi-agent/cognitive/types'`
  - `src/modules/memory-core/session/enhanced-pattern-provider.ts:11` — 同上
- **违反条款：** AGENTS.md §禁止事项 #9 / §模块依赖规约（单向按序）。collaboration-runtime 模块同样被该条款约束；CLAUDE.md v2.3.0 §目录结构规约仅为 `src/modules/collaboration-runtime/` 明确豁免业务逻辑位置，**未给 `src/modules/memory-core/` 任何豁免**。
- **风险：** 整个模块对 `cognitive/types.ts` 与 `server-config.ts` 形成硬耦合，无法独立替换或下沉；Epic M 设计文档承诺 modules 内部仅通过 adapter 反向适配 lib，与现状相反。
- **治理动作：**
  1. 把 `CognitiveProvider / TurnCognitiveData / MemoryBlock` 三个类型迁移到 memory-core 模块（或新建共享类型层 `src/types/cognitive.ts`），由 `cognitive/types.ts` 反向 re-export。
  2. `createAutoModel` 抽到 `MemoryCoreDeps` 接口，由 `persistent-agent-manager` 在构造时注入。
  3. lint 增加 `no-restricted-imports` 规则：`src/modules/memory-core/**` 禁止 import `@/lib/**` 与 `@/components/**`。
  4. CLAUDE.md v2.4.0 在 §目录结构规约新增对 `src/modules/memory-core/` 的明确豁免（位置）但不豁免依赖方向。

### ARCH-MC-02 ｜ 文档状态与代码状态严重背离

- **现象：** Epic M README 与 M.1–M.7 全部标注「📋 Planning / ⬜ Pending」，但 `src/modules/memory-core/` 已包含 22 个 TS 文件、6 套单测、被 `persistent-agent-manager.ts`、`agent-manager.ts`、`api/agent/memory/consolidate/route.ts`、`collaboration-runtime/sandbox/agent-worker.mts` 四处实际接线。
- **风险：** 文档驱动开发（DDD）原则失效；新成员无法判断 memory-core 是"规划中"还是"运行中"；架构治理基线不明。
- **治理动作：**
  1. 立刻将 Epic M README 与各 Story 状态调整为反映现状（M.1–M.6 多数应为 ✅ Complete 或 🟡 部分实现，M.7 仍 Pending）。
  2. 设计文档 `memory-core.md` 顶部增加「实施进度」表，列出每个章节对应的实际文件与接线状态。
  3. 新增 `changelog.md` 条目补录"memory-core 模块首次合入主干"的实际日期。

### ARCH-MC-03 ｜ 新旧记忆链路双轨并行，存在数据写入冲突

- **位置：**
  - 旧：`src/lib/integrations/pi-agent/role-agent/memory-tracker.ts`（`MemoryTracker` + `MemoryBlockManager`）→ 仍由 `src/lib/services/launcher/role-agent.ts:184` 直接调用
  - 新：`src/modules/memory-core/`（`MemoryCore` = Memory + Archival + Recall）→ 由 `persistent-agent-manager.ts`、`agent-manager.ts`（in-process）、`agent-worker.mts`（collaboration sandbox）接线
- **现象：**
  - RoleAgent 走旧链；Project Agent / Persistent Agent / 协作 Agent 走新链。
  - 两条链都向同一 `Memory.md` 写入，但 `MemoryBlockManager` 与 `core/memory.ts` 默认 block 集合与序列化规则不同 → **同一 agent 切换链路会破坏 Memory.md**。
  - `core/memory.ts` 写 `blocks.json` 版本快照、旧链无；旧链写 `memory/history.jsonl` 单文件，新链写 `memory/history/{sessionId}.jsonl` 分片（含旧文件迁移）。
- **风险：** 数据完整性。同一项目下 role-agent 与 project-agent 共用 agent 目录时，记忆会被互相覆盖。
- **治理动作：**
  1. 在 Story M.6/M.7 之外**新增 Story M.8（统一记忆链路收敛）**：把 role-agent launcher 切换到 `MemoryCore`，删除 `MemoryTracker` / `MemoryBlockManager`，`MemoryAdapter` 落地或同步删除。
  2. 切换前在 `Memory.md` 写入前增加版本头检测（若发现旧链格式，自动迁移到新链格式）。

### ARCH-MC-04 ｜ "语义检索"能力宣称与实际严重不符

- **位置：**
  - `src/modules/memory-core/archival/embedding.ts:142-148` — `encodeOnnx()` 直接 `throw new Error('ONNX inference not yet implemented')`；`load()` 加载 `models/all-MiniLM-L6-v2.onnx`（仓库无此文件）几乎必失败 → 全部回退 384 维 TF-IDF 词袋。
  - `src/modules/memory-core/recall/recall-memory.ts:58-72` — `searchSemantic(query, queryEmbedding)` 内部 `void queryEmbedding`，**永远走 `scoreKeyword`**。
  - `src/modules/memory-core/archival/hnsw-index.ts:112` — `expandSearch(query, currentIdx, k)` 调用与函数签名 `(entryIdx, k)` arity 不一致，当条目 >1000 时（实际进入 HNSW 路径）会出错；当前被 `bruteForceSearch` 截胡掩盖。
- **现象：** 设计文档 §3.3/3.4 与 Epic M.3/M.4 把 ArchivalMemory 与 RecallMemory 定位为「HNSW + RRF + MMR 语义检索」，但实际：
  - ArchivalMemory 检索的是 TF-IDF 哈希词袋（与关键词匹配近似）
  - RecallMemory.searchSemantic 完全没用到 embedding
  - HNSW 在大数据量下还有 arity bug
- **风险：** 用户/上游 Agent 信赖"语义检索"决策（如召回相关历史），实际拿到的是关键词命中。这是**能力宣称与实现不符的严重背离**，影响所有依赖记忆检索的下游推理。
- **治理动作：**
  1. 短期：在文档/工具描述中将 ArchivalMemory 标注为「Lexical+TF-IDF 回退模式，语义能力 Pending」；`RecallMemory.searchSemantic` 改名为 `searchKeyword` 或加 deprecate 警告。
  2. 中期（Story M.9 新增）：完成 ONNX 推理 + 提供模型文件分发方案；修复 `expandSearch` arity；为语义/关键词差异编写回归测试。

---

## 2. High 风险项

### ARCH-MC-05 ｜ `MemoryAdapter` 名存实亡

- `adapter.ts` 完整实现了旧 `MemoryTracker.recordTurn / getDreamCursor / readRecentHistory` 与 `MemoryBlockManager` 增删改 API，但 grep 显示 **0 外部引用**。
- 建议：要么完成对 role-agent launcher 的接管（见 ARCH-MC-03），要么直接删除以减少认知负担。

### ARCH-MC-06 ｜ Dream 与 Consolidator 双 LLM 入口

- `src/lib/integrations/pi-agent/role-agent/dream.ts` 每 20 turn 触发，输出 `[ADD]/[UPDATE]/[REMOVE]/[SKILL]`。
- `src/modules/memory-core/core/consolidator.ts` 由 `/api/agent/memory/consolidate` 触发，输出 `[ADD:label]/[UPDATE:label]`。
- 两份 prompt 相似但不一致，且 Consolidator 没有挂到 window-close / turn-end 钩子；功能职责重叠，设计文档未说明两者关系。
- 治理：统一两套 prompt 模板与指令语法，决策保留单一实现并清除另一处；Epic M 文档显式标注。

### ARCH-MC-07 ｜ `consolidator.ts`（role-agent 侧）仍是 stub

- `src/lib/integrations/pi-agent/role-agent/consolidator.ts` 仅有 `shouldConsolidate(currentTokens)`，无 LLM 调用。CLAUDE.md 描述为「token 预算触发式压缩接口」，但实际未实现。
- 治理：删除 stub 或在 Epic M 中新增 token-budget 触发分支并接线到 `MemoryConsolidator`。

### ARCH-MC-08 ｜ `system_prompt_block()` 与 Knowledge/Patterns 注入顺序未定义

- CLAUDE.md「Frozen Snapshot 模式」将 Knowledge.md / Patterns.md 加载到 Layer 2 StateMemory。
- `MemoryProvider.system_prompt_block()` 只返回 `Memory.compile('xml')`；与 Knowledge/Patterns 快照如何拼接（顺序、替换、并存）在 Epic M 与 RoleAgent/Project Agent 7 层 prompt 文档间无声明。
- 治理：Epic M.6 README 增加「Layer 2 注入顺序」小节；在 multi-agent-prompt-architecture.md 中同步交叉引用。

### ARCH-MC-09 ｜ HNSW 持久化时序不安全

- `archival-memory.ts:152-159` 把 HNSW 序列化为 JSON 写入 `.bin` 后缀（误导）；启动时若 entries.jsonl 不带 embedding，会在异步回调里 piecewise 重建索引。崩溃中断会导致索引与 entries 不一致。
- 治理：原子写（写入 `.tmp` 后 rename）+ 一致性校验（启动时 verify entries count 与 index nodes count）。

### ARCH-MC-10 ｜ `blocks.json` / `entries.jsonl` 不符合 AGENTS.md DataFile 规约

- AGENTS.md §数据存储规约要求 JSON 文件包含 `version / createdAt / updatedAt / data`。
- 当前 `blocks.json` 使用自定义 `{version, timestamp, blocks[]}`，`entries.jsonl` 每行无 version。
- 治理：统一为 DataFile 规约（version+createdAt+updatedAt+data wrapper），同时在 Memory Core 迁移路径中实现 forward compat 读取。

---

## 3. Medium 风险项

### ARCH-MC-11 ｜ `any / as any` 滥用
- `hnsw-index.ts:117, 124` 多处 `null as any`；`memory.ts:155, 184` `(block.metadata as any).hidden`；`consolidator.ts` 解析 LLM 输出 `(c: any)`。违反 AGENTS.md 代码层面禁止 #1。

### ARCH-MC-12 ｜ 数据路径未在 AGENTS.md/CLAUDE.md 数据存储规约中登记
- `data/agents/{agentName}/archival/`、`memory/history/{sessionId}.jsonl`、`.dream_cursor` 三个路径未在 CLAUDE.md §数据存储规约第 7 节文件树中列出。

### ARCH-MC-13 ｜ 多 Agent 协作场景的记忆隔离未定义
- collaboration-runtime 协作场景中多个子进程 Agent 各持 `MemoryCore`，同一 agentDir 多进程并发读写 Memory.md / HNSW index 无锁。
- Epic M 未覆盖多 Agent 协作运行时下的记忆隔离/共享策略；与 ARCH-RT-06（Blackboard 路径）应交叉考虑。

### ARCH-MC-14 ｜ 命名漂移
- Block vs MemoryBlock；Memory（Block 集合）vs MemoryCore（三层门面）；`searchSemantic / searchKeyword / searchHistoryFromPath / recordTurn` 在 RecallMemory 与旧 MemoryTracker 中混用。需要统一术语表。

### ARCH-MC-15 ｜ ONNX 运行时依赖与模型分发未规划
- `onnxruntime-node` 是二进制运行时依赖，需评估打包/部署体积；`models/all-MiniLM-L6-v2.onnx` 仓库无此文件、未说明下载/缓存策略。Epic M 设计文档无对应章节。

---

## 4. 治理动作总览

| 编号 | 严重度 | 归属 | 交付物 |
|------|--------|------|-------|
| ARCH-MC-01 | Critical | Story M.8 | DI 化 + 类型层抽取 + lint 规则 |
| ARCH-MC-02 | Critical | Story M.10 | Epic M README 状态修正 + memory-core.md 实施进度表 |
| ARCH-MC-03 | Critical | Story M.8 | role-agent launcher 切换 + Memory.md 迁移 |
| ARCH-MC-04 | Critical | Story M.9 | ONNX 推理实现 + HNSW arity 修复 + RecallMemory.searchSemantic 修复 + 文档降级 |
| ARCH-MC-05 | High | Story M.8 | adapter 落地或删除 |
| ARCH-MC-06 | High | Story M.8 | Dream/Consolidator 统一 |
| ARCH-MC-07 | High | Story M.8 | role-agent consolidator stub 处理 |
| ARCH-MC-08 | High | Story M.8 | Layer 2 注入顺序声明 |
| ARCH-MC-09 | High | Story M.9 | HNSW 原子写 + 一致性校验 |
| ARCH-MC-10 | High | Story M.8 | DataFile 规约对齐 |
| ARCH-MC-11 | Medium | Story M.8 | any 清理 |
| ARCH-MC-12 | Medium | Story M.10 + CLAUDE.md v2.4 | 数据路径登记 |
| ARCH-MC-13 | Medium | Story M.10 | 多 Agent 协作场景记忆策略 |
| ARCH-MC-14 | Medium | Story M.10 | 术语表 |
| ARCH-MC-15 | Medium | Story M.9 | ONNX 模型分发方案 |

新增 Stories：

- **Story M.8（记忆链路收敛 + DataFile 对齐 + 围栏修复）** — 处理 ARCH-MC-01/03/05/06/07/08/10/11
- **Story M.9（语义检索能力补齐）** — 处理 ARCH-MC-04/09/15
- **Story M.10（文档与协作场景对齐）** — 处理 ARCH-MC-02/12/13/14

三个 Story 构成 Epic M 的 **Governance Phase**，是进入「Phase 4 Pattern 质量提升」（M.7）前的强制门禁。

---

## 5. 后续

- 本审查与 [多 Agent 协作运行时架构审查（2026-05-20）](./multi-agent-runtime-architecture-review-2026-05-20.md) 是同一治理批次。
- ARCH-MC-13（协作场景记忆隔离）需要与 ARCH-RT-06（Blackboard）合并设计。
- 下一次审查时点：Story M.8/M.9 完成后、M.7 启动前。

