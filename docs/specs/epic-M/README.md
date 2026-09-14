# Epic M: Memory Core 记忆核心

**Epic 编号:** M
**Epic 名称:** Memory Core 记忆核心
**优先级:** 🔴 Critical

> ⚠️ **2026-05-20 架构审查更新：** 本 Epic 的 README 与 Story 状态全部标注 Planning，
> 但 `src/modules/memory-core/` 模块代码已合入主干并被 `persistent-agent-manager`、`agent-manager`
> （in-process）、`agent-worker.mts`（协作沙箱）、`/api/agent/memory/consolidate` 四处接线。
> 文档与代码状态严重背离（ARCH-MC-02）。审查识别 15 项偏离，新增 **Story M.8（记忆链路收敛）**
> 与 **Story M.9（语义检索能力补齐）** 与 **Story M.10（文档与协作场景对齐）**
> 作为进入 M.7 前的强制门禁（**Governance Phase**，覆盖 ARCH-MC-01..15 全部 15 项）。
> 详见 [Memory Core 架构审查（2026-05-20）](../../design/memory-core-architecture-review-2026-05-20.md)。

**状态:** 🚧 In Progress
**创建日期:** 2026-05-16
**设计文档:** [memory-core.md](../../design/memory-core.md)

---

## 📋 概述

将 OriginOS 现有分散在 `lib/integrations/` 的记忆体系重构为 Memory Core。M.12 在三层存储模型之上补充 Hindsight-inspired 的认知模型（world facts、experiences、evidence-backed observations、mental models）与 retain/recall/reflect 管线，并强制区分全局用户认知和 Agent/Project 世界认知的所有权。

### 核心问题

| 问题 | 现象 | 影响 |
|------|------|------|
| **Recall 检索弱** | 关键词匹配无法找到语义相关但关键词不同的历史 | Agent 遗漏相关经验 |
| **记忆层级单一** | 只有 Core Memory (blocks) + Recall (JSONL)，缺少 Archival 长期记忆 | Agent 无法区分短期上下文和长期知识 |
| **无结构化 API** | Agent 直接调用 MemoryBlockManager 方法，无标准工具接口 | Agent 无法通过工具自主管理记忆 |
| **无版本追溯** | Memory.md 修改无版本历史 | 无法回滚记忆变更 |

### 解决方案

1. **三层记忆模型** — Core（Block 集合，in-context）+ Archival（语义向量存储，长期）+ Recall（对话历史，语义增强搜索）
2. **标准 Memory Tools API** — core_memory_append/replace, archival_memory_insert/search
3. **语义搜索** — ONNX embedding + 余弦相似度替代关键词匹配
4. **适配器层** — 现有代码通过 adapter 使用新模块，无需修改

---

## 🎯 Epic 目标

### 核心目标

1. **Block 抽象** — 以 Letta Block 为基本单元，升级现有 MemoryBlockManager
2. **Memory.compile()** — 高效渲染 blocks 到 prompt（兼容现有 markdown 格式 + 新增 xml 格式）
3. **Archival Memory** — 新增长期语义记忆层，ONNX + HNSW 向量索引
4. **Recall 语义增强** — 关键词搜索升级为语义搜索，保留 keyword 回退
5. **标准 Tools API** — Agent 可通过工具自主编辑 Core 和 Archival 记忆
6. **CognitiveProvider 集成** — 实现 CognitiveProvider 接口，接入现有 CognitiveManager
7. **零破坏性迁移** — 通过适配器层兼容所有现有 API
8. **认知所有权分域** — 用户 Profile/个人风格全局唯一；Agent、RoleAgent 与 Project 独立维护世界认知；Skill 只读消费
9. **证据驱动认知** — 从事实和经验形成可修订、可冲突、可追溯的 Observation 与 Mental Model

### 成功标准

- ✅ `compile('markdown')` 输出与现有 MemoryBlockManager 格式一致
- ✅ 现有代码通过 adapter 正常工作，无需修改
- ✅ Archival search 10K 条目 < 100ms
- ✅ Recall 语义搜索结果质量优于关键词搜索
- ✅ Agent 可通过标准工具编辑记忆
- ✅ MemoryProvider 正确接入 CognitiveManager，prefetch 返回语义召回结果

---

## 🔗 前置依赖

| 依赖内容 | 来源 Epic | 来源位置 | 状态 |
|---------|----------|---------|------|
| PI Agent 核心 | Epic 0 | `src/lib/integrations/pi-agent/` | ✅ Complete |
| MemoryTracker | Epic R | `role-agent/memory-tracker.ts` | ✅ Complete |
| Dream 记忆维护 | Epic R | `role-agent/dream.ts` | ✅ Complete |
| MemoryBlockManager | Epic R | `role-agent/memory-tracker.ts` | ✅ Complete |
| CognitiveManager | Epic C | `cognitive/manager.ts` | ✅ Complete |
| HNSW 设计（参考） | Epic 9 | Story 9.20 设计文档 | 📋 Planning |
| ONNX Runtime | 外部依赖 | `onnxruntime-node` | ✅ Available |

### 被影响的模块

| 影响模块 | 影响方式 |
|----------|---------|
| `role-agent/memory-tracker.ts` | 通过 adapter 转发到新 MemoryCore，不修改原代码 |
| `role-agent/dream.ts` | Dream 输出同时写入新 Archival Memory |
| `cognitive/*.ts` | 新增 MemoryProvider，接入 CognitiveManager |
| `launcher/role-agent.ts` | 新增 MemoryCore 初始化 |

---

## 📝 Stories 列表

| Story | 标题 | 优先级 | 调度 | 状态 |
|-------|------|--------|-----|------|
| **M.1** | 类型定义与 Block 抽象 | Critical | Phase 1 | ✅ Complete |
| **M.2** | Memory 集合 + compile/render | Critical | Phase 1 | ✅ Complete |
| **M.3** | Archival Memory 语义存储 | Critical | Phase 2 | ✅ Complete |
| **M.4** | Recall Memory 语义增强 | High | Phase 2 | ✅ Complete |
| **M.5** | Memory Tools API | Critical | Phase 3 | ✅ Complete |
| **M.6** | MemoryProvider 集成 + 适配器 | Critical | Phase 3 | ✅ Complete |
| **M.7** | Pattern 质量提升 + Memory 集成 | High | Phase 4 | ✅ Complete |
| **M.8** | 记忆链路收敛（围栏修复 + 新旧合并 + DataFile 对齐）| Critical | Governance | ✅ Complete |
| **M.9** | 语义检索能力补齐（ONNX/HNSW/RecallSemantic）| Critical | Governance | ⬜ Pending |
| **M.10** | 文档与协作场景对齐（状态修正 + 数据路径 + 协作策略 + 术语表）| High | Governance | ⬜ Pending |
| **M.11** | 用 Memory Core 统一 history-to-cognition 管线并替代 Dream | Critical | Governance | ⬜ Pending |
| **M.12** | Hindsight-inspired 全局用户认知与 Agent 世界模型分域 | Critical | Governance | ✅ Complete |
| **M.13** | 旧记忆机制清退（Dream / MemoryTracker / Adapter） | Critical | Governance | ✅ Complete |

---

## 🏗️ Story 详情

### Phase 1: Core Memory 基础 ✅ Complete

#### Story M.1: 类型定义与 Block 抽象

**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 1-2 天

**职责：** 定义记忆核心模块的类型系统，以 Letta Block 为参考设计 Block 抽象。

**功能需求：**

- `Block` 接口：id, label, value, limit, description, metadata, readOnly, tags, namespace, createdAt, updatedAt, version
- `BlockDefinition` 接口：用于定义默认 blocks
- `BlockMetadata` 接口：lastEditedBy, priority, category
- 默认 5 blocks：human, persona, project, scratchpad, temporal
- 与现有 `cognitive/types.ts` 中的 `MemoryBlock` 兼容

**技术文件：**

```
src/modules/memory-core/core/block.ts
```

**验收标准：**

- [ ] Block 类型包含所有 Letta BaseBlock 的核心字段
- [ ] 新增 namespace 字段支持层级标签（system/persona）
- [ ] 新增 tags 字段支持分类和语义检索
- [ ] 去除多租户相关字段（template_*, deployment_id 等）
- [ ] 单元测试覆盖 Block 创建、验证、序列化

---

#### Story M.2: Memory 集合 + compile/render

**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 2-3 天

**职责：** 实现 Memory 类，管理 Block 集合，支持 compile/render 注入 prompt。

**功能需求：**

- `Memory` 类：管理 Map<string, Block>
- `compile(options)` 方法：支持 markdown（兼容现有格式）和 xml 两种输出
- `getBlock()`, `setBlock()`, `appendBlock()`, `replaceBlock()`, `deleteBlock()`, `listBlocks()`
- 持久化：save() 写入 Memory.md + blocks.json 版本快照
- 加载：从 Memory.md 解析 blocks，从 blocks.json 恢复版本历史

**技术文件：**

```
src/modules/memory-core/core/memory.ts
```

**验收标准：**

- [ ] `compile('markdown')` 输出与现有 MemoryBlockManager 的 serializeBlocksToMarkdown() 格式一致
- [ ] `compile('xml')` 输出紧凑 xml 格式（借鉴 Letta _render_memory_blocks_standard）
- [ ] setBlock/appendBlock/replaceBlock 自动触发 save
- [ ] blocks.json 版本快照记录每次变更（保留最近 10 个版本）
- [ ] 单元测试覆盖 CRUD 操作和 compile 输出格式

---

### Phase 2: Archival + Recall 语义增强 ✅ Complete

#### Story M.3: Archival Memory 语义存储

**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 4-5 天

**职责：** 实现 Archival Memory 层，提供长期语义记忆的向量索引和语义搜索。

**功能需求：**

- `EmbeddingEngine`：ONNX all-MiniLM-L6-v2 模型，384 维向量，Int8 量化
- `HNSWIndex`：HNSW 图构建 + 搜索，m=16, ef_construction=200
- `ArchivalMemory` 主类：
  - `insert(text, tags?)` → 内容 → ONNX 编码 → Int8 量化 → HNSW 插入 → 持久化
  - `search(query, options?)` → 查询编码 → HNSW 搜索 → 余弦相似度 → 返回 Top-K
  - `delete(id)`, `getAll()`, `count()`
- 持久化：entries.jsonl + embeddings.bin + hnsw-index.bin

**技术文件：**

```
src/modules/memory-core/archival/embedding.ts
src/modules/memory-core/archival/hnsw-index.ts
src/modules/memory-core/archival/archival-memory.ts
```

**验收标准：**

- [ ] insert 流程：ONNX 编码 < 50ms，Int8 量化内存减少 50-75%
- [ ] search 流程：10K 条目 < 100ms，100K 条目 < 500ms
- [ ] HNSW 索引损坏时可从 entries.jsonl 重建
- [ ] ONNX 模型加载失败时回退到关键词搜索
- [ ] 持久化到 disk，重启后可恢复
- [ ] 单元测试覆盖 insert/search/delete 全链路

---

#### Story M.4: Recall Memory 语义增强

**状态:** ✅ Complete
**优先级:** High
**估计工时:** 2-3 天

**职责：** 升级 Recall Memory，将现有关键词搜索升级为语义搜索，保留 keyword 回退。

**功能需求：**

- `RecallMemory` 类：
  - `recordTurn(data)`：兼容现有 MemoryTracker.recordTurn() 行为
  - `searchSemantic(query, options)`：ONNX 编码 + 余弦相似度，替代关键词匹配
  - `searchKeyword(query, maxResults)`：保留关键词搜索作为回退
  - Dream cursor 兼容：getDreamCursor(), setDreamCursor(), readRecentHistory()
- 异步生成 embedding（不阻塞 recordTurn）
- JSONL 历史存储兼容现有格式

**技术文件：**

```
src/modules/memory-core/recall/recall-memory.ts
src/modules/memory-core/recall/history-store.ts
```

**验收标准：**

- [ ] recordTurn 行为与现有 MemoryTracker 一致（JSONL 追加写入）
- [ ] searchSemantic 返回结果按余弦相似度排序
- [ ] searchKeyword 回退到现有关键词匹配逻辑
- [ ] Dream cursor 完全兼容（读取/写入/增量历史）
- [ ] 语义搜索结果质量优于关键词搜索（人工评估 top-5 相关性）
- [ ] 单元测试覆盖 recordTurn + 两种搜索方式

---

### Phase 3: Tools API + Provider 集成 ✅ Complete

#### Story M.5: Memory Tools API

**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 2-3 天

**职责：** 实现标准 Memory Tools API，使 Agent 可通过工具自主编辑记忆。

**功能需求：**

- `CoreMemoryTools`：
  - `core_memory_append(label, content)` → 追加到 block
  - `core_memory_replace(label, old, new)` → 精确替换
  - `insert_memory_block(label, value, description?, limit?)` → 插入新 block
  - `read_memory_block(label)` → 读取内容
- `ArchivalMemoryTools`：
  - `archival_memory_insert(text, tags?)` → 写入长期记忆
  - `archival_memory_search(query, limit?)` → 语义搜索长期记忆
- 错误处理：block 不存在、只读、超出限制等
- 返回值：成功/失败字符串（Agent 可读）

**技术文件：**

```
src/modules/memory-core/tools/core-memory-tools.ts
src/modules/memory-core/tools/archival-memory-tools.ts
```

**验收标准：**

- [ ] core_memory_append 检查 block 存在性 + 只读 + 字符限制
- [ ] core_memory_replace 精确匹配 oldContent，不匹配时返回错误
- [ ] archival_memory_insert 返回保存 ID
- [ ] archival_memory_search 返回格式化搜索结果
- [ ] 所有返回值格式一致，Agent 可解析
- [ ] 单元测试覆盖正常路径和错误路径

---

#### Story M.6: MemoryProvider 集成 + 适配器

**状态:** ✅ Complete
**优先级:** Critical
**估计工时:** 2-3 天

**职责：** 实现 MemoryProvider 接入 CognitiveManager，创建 MemoryAdapter 兼容现有 API。

**功能需求：**

- `MemoryProvider` 实现 CognitiveProvider 接口：
  - `prefetch(query)`：并行查询 Archival + Recall，返回语义召回结果
  - `sync_turn(data)`：记录对话到 Recall Memory
  - `system_prompt_block()`：返回 Memory.compile('xml')
- `MemoryCore` 统一门面：管理 Core + Archival + Recall 三层
- `MemoryAdapter` 兼容旧 API：
  - MemoryTracker 兼容：recordTurn, getDreamCursor, setDreamCursor, readRecentHistory
  - MemoryBlockManager 兼容：getBlock, setBlock, appendBlock, replaceBlock, getCoreMemory
  - Recall search 兼容：searchHistoryFromPath → searchSemantic + keyword 回退

**技术文件：**

```
src/modules/memory-core/core/memory-core.ts           # 统一门面
src/modules/memory-core/session/memory-provider.ts     # CognitiveProvider 实现
src/modules/memory-core/index.ts                       # 统一导出
src/lib/integrations/memory/adapter.ts                 # 适配器层
src/lib/integrations/memory/index.ts                   # 集成入口
```

**验收标准：**

- [ ] MemoryProvider.prefetch 返回 Archival + Recall 语义结果
- [ ] MemoryProvider.sync_turn 不阻塞主流程
- [ ] MemoryAdapter 的所有兼容方法输出与旧实现一致
- [ ] 现有代码通过 adapter 使用新 MemoryCore，无需修改
- [ ] CognitiveManager 注册 MemoryProvider，build_snapshot_prompt 包含记忆快照
- [ ] 集成测试：完整 Agent 启动 → 对话 → 记忆编辑 → 重启 → 记忆恢复

---

### Phase 4: Pattern 质量提升 + Memory 集成 ✅ Complete

#### Story M.7: Pattern 质量提升 + Memory 集成

**状态:** ✅ Complete
**优先级:** High
**估计工时:** 3-4 天

**职责：** 解决当前 Pattern 提取无意义的问题，并将 Pattern/Reflection 集成到 Archival Memory。

**功能需求：**

- **Pattern 提取增强**：从工具调用结果（成功/失败状态、返回摘要）中提炼有意义的 principle，而非截断 thinking 文本
- **Tool 调用结果利用**：记录每个工具调用的输入摘要和输出摘要，形成可追溯的模式链
- **Pattern 语义化存储**：Pattern 条目写入 Archival Memory，prefetch 改为语义搜索
- **Reflection 语义化**：反思条目写入 Archival Memory，searchReflections 改为语义搜索
- **一次性迁移**：现有 registry.json + episodic-memory 批量导入 Archival

**技术文件：**

```
src/modules/memory-core/archival/pattern-ingest.ts    # Pattern 语义化提取 + Archival 写入
src/lib/integrations/pi-agent/cognitive/pattern-provider.ts  # 修改 prefetch + searchReflections
```

**验收标准：**

- [ ] Pattern principle 包含有意义的工具链描述和成功率，而非截断的 thinking
- [ ] Pattern 提取利用工具调用的成功/失败状态和返回结果摘要
- [ ] PatternProvider.prefetch 返回 Archival 语义结果（优先）+ 关键词回退
- [ ] searchReflections 走 Archival 语义搜索，回退到 Jaccard
- [ ] 一次性迁移：现有 Pattern + Reflection 数据批量导入 Archival
- [ ] 单元测试：提取的 pattern 包含工具链描述、成功率、场景

---

### Governance Phase: 架构治理（M.7 启动前的强制门禁）

> 来源：[Memory Core 架构审查（2026-05-20）](../../design/memory-core-architecture-review-2026-05-20.md)，覆盖 ARCH-MC-01..15。

#### Story M.8: 记忆链路收敛 — 围栏修复 + 新旧合并 + DataFile 对齐
处理 ARCH-MC-01（4 处反向 import `@/lib/`）、03（role-agent 新旧链路双写 `Memory.md`）、05（`MemoryAdapter` 0 引用）、06（Dream/Consolidator 双 LLM 入口）、07（role-agent `consolidator.ts` stub）、08（Layer 2 注入顺序未定义）、10（DataFile 规约对齐）、11（`any` 滥用）。详见 [story-M.8](./story-M.8/README.md)。

#### Story M.9: 语义检索能力补齐 — ONNX 推理 + HNSW 修复 + RecallMemory.searchSemantic 实装
处理 ARCH-MC-04（"语义检索"实质是 TF-IDF + 关键词匹配）、09（HNSW 持久化时序不安全）、15（ONNX 模型分发未规划）。详见 [story-M.9](./story-M.9/README.md)。

#### Story M.10: 文档与协作场景对齐 — 状态修正 + 数据路径 + 协作策略 + 术语表
处理 ARCH-MC-02（Epic M 全 Planning 但代码已上线）、12（数据路径未在 CLAUDE.md 登记）、13（协作场景记忆策略缺失）、14（术语漂移）。详见 [story-M.10](./story-M.10/README.md)。

#### Story M.11: 用 Memory Core 统一 history-to-cognition 管线并替代 Dream
将 Recall History、Stable Memory、Pattern/Reflection 与 Knowledge Candidate 收敛到唯一 consolidation 主路径，停止 Dream 和 turn 摘要直接改写 `Memory.md`。详见 [story-M.11](./story-M.11/README.md)。

#### Story M.12: Hindsight-inspired 全局用户认知与 Agent 世界模型分域
修正 M.11 仍以 `agentDir` 为唯一 bank、把 `human/persona/project` 混存的所有权问题：`data/users/{userId}/cognition` 保存全局 Profile/个人风格；Agent/RoleAgent/Project 保存各自 world facts、experiences、observations、mental models；Skill 只读消费组合快照。详见 [story-M.12](./story-M.12/README.md)。

#### Story M.13: 旧记忆机制清退
删除已退出主架构但仍残留或双写的 Dream、MemoryTracker、MemoryBlockManager 与 MemoryAdapter；保留旧数据的一次性安全迁移，所有 Agent 统一通过 MemoryCore。详见 [story-M.13](./story-M.13/README.md)。

---

## 🏗️ 模块目录结构

```
src/modules/memory-core/          # 记忆核心模块
├── core/
│   ├── block.ts                  # Block 类型定义
│   ├── memory.ts                 # Memory 集合 + compile/render
│   └── memory-core.ts            # 统一门面
├── archival/
│   ├── embedding.ts              # ONNX 编码 + Int8 量化
│   ├── hnsw-index.ts             # HNSW 图构建 + 搜索
│   └── archival-memory.ts        # 语义存储主类
├── recall/
│   ├── recall-memory.ts          # 对话历史索引 + 语义搜索
│   └── history-store.ts          # JSONL 历史存储
├── tools/
│   ├── core-memory-tools.ts      # Core Memory 工具
│   └── archival-memory-tools.ts  # Archival Memory 工具
├── session/
│   └── memory-provider.ts        # CognitiveProvider 实现
└── index.ts                      # 统一导出

src/lib/integrations/memory/      # 集成层
├── adapter.ts                    # 适配器（新 → 旧 API 兼容）
└── index.ts                      # 集成入口
```

---

## 🔄 与现有系统的共存

```
现有代码                           新 Memory Core
──────────                        ─────────────
MemoryTracker.recordTurn() ──────┐
Dream.run() ─────────────────────┼→ adapter.ts ──→ MemoryCore
MemoryBlockManager.getBlock() ───┘
searchHistoryFromPath() ────────────────────────→ RecallMemory.searchSemantic()

PatternProvider.prefetch() ───────→ Archival semantic search (优先) + 关键词回退
PatternProvider.searchReflections() → Archival semantic search (优先) + Jaccard 回退
Pattern 条目 sync_turn() ────────→ 双写 registry.json + Archival Memory

Phase 1: 双写（旧 + 新同时写入）
Phase 2: 灰度（部分路由走新模块）
Phase 3: 切换（关闭旧写入，只使用新模块）
```

### Pattern 集成详情

现有 PatternProvider 有三个痛点可通过新 Memory 体系增强：

| 痛点 | 现状 | 新方案 |
|------|------|--------|
| **prefetch() 关键词匹配** | `includes()` 匹配 tool chain name | Archival semantic search |
| **Reflection 搜索只靠 Jaccard** | 标签重叠 + 时间衰减 | 语义向量搜索 + RRF 融合 |
| **Pattern 无版本追溯** | 直接覆盖 registry.json | Archival Entry 带 timestamp |

**集成策略：**

- **sync_turn()**：保留 registry.json 写入（维持现有行为），同时写入 Archival Memory
- **prefetch(query)**：优先走 Archival semantic search（tags: ['pattern']），回退到关键词匹配
- **searchReflections(query)**：优先走 Archival semantic search（tags: ['reflection']），回退到 Jaccard
- **一次性迁移**：MemoryCore.initialize() 时将现有 registry.json + episodic-memory 批量导入 Archival

---

## 📊 性能指标

| 指标 | 目标 | 验证方式 |
|------|------|---------|
| Core Memory compile | < 10ms | 单元测试 |
| Archival insert | < 50ms (含编码) | 单元测试 |
| Archival search (10K entries) | < 100ms | 性能测试 |
| Recall semantic search (10K turns) | < 50ms | 性能测试 |
| Memory Provider prefetch | < 200ms | 集成测试 |
| 内存占用 (100K archival entries) | < 50MB | 压力测试 |

---

## 📝 与 Story 9.20 的关系

Story 9.20（黑板 HNSW 语义索引）和 Story M.3（Archival Memory）共享底层技术（ONNX embedding + HNSW 索引），但服务于不同场景：

| 维度 | Story 9.20 (黑板) | Story M.3 (Archival) |
|------|-------------------|---------------------|
| **数据源** | 黑板条目（多 Agent 协作） | Agent 长期记忆条目 |
| **用途** | 多 Agent 语义检索黑板上下文 | 单个 Agent 语义检索长期记忆 |
| **RRF 融合** | 语义得分 + 时间衰减 + 标签权重 | 语义得分 + 时间衰减 + 标签权重 |
| **实现** | `collaboration-runtime/session/semantic-index.ts` | `memory-core/archival/archival-memory.ts` |

**策略：** M.3 实现底层 embedding + HNSW 引擎，9.20 复用 M.3 的引擎但使用不同的数据源和搜索策略。两者共享 `EmbeddingEngine` 和 `HNSWIndex` 实现。
