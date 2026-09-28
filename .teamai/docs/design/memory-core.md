# Memory Core Module — 架构设计

> ⚠️ **2026-05-20 架构审查更新：** 模块代码已先于 Epic M 的 Planning 状态合入主干并接线，
> 但存在 4 个 Critical / 6 个 High / 5 个 Medium 偏离（ARCH-MC-01..15），核心问题：
> - 模块围栏违规（4 处反向 import `@/lib/`）
> - 「语义检索」实际仍是 TF-IDF 词袋 + 关键词匹配（ONNX 抛错、`RecallMemory.searchSemantic` 内 `void queryEmbedding`、HNSW `expandSearch` arity 不匹配）
> - 新旧记忆链路（role-agent `MemoryTracker/MemoryBlockManager` vs memory-core `MemoryCore`）双轨并行，存在 `Memory.md` 写入冲突
> - `MemoryAdapter` 完整实现但 0 引用
>
> 详见 [Memory Core 架构审查（2026-05-20）](./memory-core-architecture-review-2026-05-20.md)，
> 治理归集到 **Story M.8（链路收敛）**、**Story M.9（语义检索补齐）** 与 **Story M.10（文档与协作场景对齐）**，
> 共同构成 Epic M 的 **Governance Phase**，是进入 M.7（Pattern 质量提升）前的强制门禁。

## 1. 现状分析

> 2026-06-26 进展补充：
> - `OriginOSAgent.prompt()` 已统一承担 recent trace 保真压缩，长会话默认保留最近执行轨迹。
> - `MemoryProvider.sync_turn()` 已停止向 `Memory.md` 的 `temporal` block 追加逐轮内容，turn 级运行时轨迹只写 recall/history。
> - `MemoryTracker.flushMemory()` 已停止向 `Memory.md` 追加 turn 摘要；长期记忆整理正在收敛到 `memory-core` consolidation。

### 1.1 OriginOS 现有记忆体系

```
┌─────────────────────────────────────────────────┐
│  OriginOS 记忆（分散在 lib/integrations/）        │
│                                                   │
│  MemoryTracker (memory-tracker.ts)               │
│  ├─ turn 级记录 → JSONL 追加                       │
│  ├─ Dream cursor 管理                             │
│  └─ flushThreshold (50 turn) → Memory.md          │
│                                                   │
│  Dream (dream.ts)                                 │
│  ├─ Phase 1: LLM 分析 → [ADD]/[UPDATE]/[REMOVE]   │
│  ├─ Phase 2: 指令解析 → fs 编辑 Memory.md         │
│  └─ 每 20 turn 触发                                │
│                                                   │
│  MemoryBlockManager (memory-tracker.ts)           │
│  ├─ 5 默认 blocks: human, persona, project,       │
│  │  scratchpad, temporal                          │
│  ├─ 自定义 markdown 格式解析/序列化                 │
│  └─ CRUD: set/append/replace/delete               │
│                                                   │
│  Recall Search (memory-tracker.ts)                │
│  └─ 关键词匹配 (split + includes)                  │
│     → 简单评分: 匹配关键词数量                      │
│                                                   │
│  Cognitive System (cognitive/*.ts)               │
│  ├─ CognitiveManager (provider 编排)              │
│  ├─ KnowledgeProvider (知识提取)                   │
│  ├─ PatternProvider (模式沉淀)                     │
│  ├─ PracticeLogger (实践日志)                      │
│  └─ SleepCompute (睡眠计算)                        │
└─────────────────────────────────────────────────┘
```

**四个问题：**

| 问题 | 影响 |
|------|------|
| **Recall 检索弱** | 关键词匹配无法找到语义相关但关键词不同的历史 |
| **记忆层级单一** | 只有 Core Memory (blocks) + Recall (JSONL)，缺少 Archival 长期记忆 |
| **无结构化 API** | Agent 直接调用 MemoryBlockManager 方法，无标准工具接口 |
| **无版本追溯** | Memory.md 修改无版本历史，无法回滚 |

### 1.2 Letta 记忆架构（可借鉴点）

| Letta 概念 | 核心思想 | 可借鉴性 |
|------------|---------|---------|
| **Block** | LLM 上下文窗口的保留区，带 label/value/limit/description/tags | ★★★★★ 直接采用，替换现有 MemoryBlockManager |
| **Memory** | Block 集合 + compile/render 方法，高效渲染到 prompt | ★★★★☆ 引入 compile 机制 |
| **Core Memory** | 有限字符的 in-context 记忆，Agent 通过工具编辑 | ★★★★☆ 现有 blocks 升级 |
| **Archival Memory** | 无限容量语义向量存储，Agent 写入/搜索 | ★★★★★ 缺失层，需新增 |
| **Recall Memory** | 对话历史搜索 | ★★★☆☆ 现有 JSONL → 升级为语义搜索 |
| **Memory Tools API** | core_memory_append/replace, archival_memory_insert/search | ★★★★☆ 引入标准 API |
| **Git-backed Repo** | 记忆变更用 git 版本化 | ★★★☆☆ 用现有 JSONL + cursor 替代 |
| **FileBlock** | 文件作为记忆 block | ★★☆☆☆ Phase 2 考虑 |
| **Structured Labels** | 层级标签如 `system/persona` | ★★★★☆ 扩展 block 命名空间 |

---

## 2. 目标架构

### 2.1 三层记忆模型

```
┌─────────────────────────────────────────────────────────────┐
│  三层记忆                                                    │
│                                                              │
│  ┌──────────────────┐  ← In-context，有限字符               │
│  │  Core Memory     │     5-10 blocks，Agent 直接编辑       │
│  │  (Block 集合)     │     类比: RAM                         │
│  └────────┬─────────┘                                      │
│           │ compile() 注入 prompt                           │
│  ┌────────▼─────────┐  ← 向量索引，语义检索                 │
│  │  Archival Memory │     ONNX embeddings + HNSW           │
│  │  (语义向量存储)   │     类比: 长期记忆 / 硬盘             │
│  └────────┬─────────┘                                      │
│           │ search(query)                                   │
│  ┌────────▼─────────┐  ← 对话历史，时间索引                 │
│  │  Recall Memory   │     JSONL 历史 + 语义增强搜索         │
│  │  (对话历史索引)   │     类比: 情景记忆                    │
│  └──────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 模块定位

```
src/modules/memory-core/          # 新记忆核心模块
├── core/                         # Core Memory
│   ├── block.ts                  # Block 定义（借鉴 Letta BaseBlock）
│   ├── memory.ts                 # Memory 集合 + compile/render
│   └── block-manager.ts          # CRUD 操作
├── archival/                     # Archival Memory
│   ├── index.ts                  # HNSW 向量索引
│   ├── embedding.ts              # ONNX 编码 + Int8 量化
│   └── archival-memory.ts       # 语义存储主类
├── recall/                       # Recall Memory
│   ├── recall-memory.ts         # 对话历史索引 + 语义搜索
│   └── history-store.ts         # JSONL 历史存储
├── tools/                        # Memory Tools API
│   ├── core-memory-tools.ts     # core_memory_append/replace/...
│   └── archival-memory-tools.ts # archival_memory_insert/search
├── session/                      # 会话管理
│   ├── memory-session.ts        # 会话级记忆快照
│   └── memory-provider.ts       # 实现 CognitiveProvider 接口
└── index.ts                      # 统一导出

src/lib/integrations/memory/      # 集成层
├── adapter.ts                    # 适配器（新模块 → 旧 API 兼容）
└── hooks.ts                      # React hooks
```

### 2.3 与现有系统的共存策略

**核心原则：不修改现有代码，通过适配器桥接。**

```
现有代码                          新 Memory Core
──────────                       ─────────────
MemoryTracker ─────────────┐
MemoryBlockManager ────────┼──→ adapter.ts ──→ MemoryCore
Dream ─────────────────────┘                    ↑
                                                │
CognitiveManager ───────────→ MemoryProvider ───┘

Adapter 层将新 MemoryCore 的 Block/Archival/Recall
映射为旧的 MemoryTracker/MemoryBlockManager API，
确保现有调用方无需修改代码。
```

**具体兼容策略：**

| 现有 API | 兼容方式 | 迁移路径 |
|----------|---------|---------|
| `MemoryTracker.recordTurn()` | adapter 内部调用新 `RecallMemory.recordTurn()` | Phase 1: 双写 → Phase 2: 只写新模块 |
| `MemoryBlockManager.getBlock()` | adapter 转发到 `CoreMemory.getBlock()` | 直接转发，零成本 |
| `MemoryBlockManager.setBlock()` | adapter 转发到 `CoreMemory.setBlock()` | 直接转发 |
| `Dream.run()` | 继续独立运行，同时写入新 Archival | Dream 输出同时写 archival |
| `searchHistoryFromPath()` | adapter 调用新 `RecallMemory.searchSemantic()` | 替换底层实现 |

---

## 3. 详细设计

### 3.1 Block — 记忆基本单元

```typescript
// src/modules/memory-core/core/block.ts

/**
 * Block: LLM 上下文窗口的保留区。
 * 借鉴 Letta BaseBlock，扩展 OriginOS 需求。
 */
export interface Block {
  id: string;                    // 唯一 ID（自动生成）
  label: string;                 // 上下文窗口中的标签名
  value: string;                 // block 内容
  limit: number;                 // 字符上限
  description: string;           // 用途说明
  metadata: BlockMetadata;
  readOnly: boolean;             // 是否只读
  tags: string[];               // 标签（用于分类和检索）

  // 新增: 层级标签，支持 system/persona 等命名空间
  namespace?: string;            // 如 'system', 'skills', 'user'

  // 新增: 用于版本追溯
  createdAt: number;             // Unix 毫秒时间戳
  updatedAt: number;
  version: number;               // 自增版本号
}

export interface BlockMetadata {
  lastEditedBy?: string;         // 'agent' | 'user' | 'dream' | 'system'
  lastEdited?: number;           // Unix 毫秒时间戳
  priority?: 'high' | 'medium' | 'low';
  category?: string;             // 分类标签
}

/** 默认 Block 定义（从 cognitive/types.ts 迁移） */
export const DEFAULT_BLOCKS: BlockDefinition[] = [
  { label: 'human', description: '用户画像、偏好、历史习惯', limit: 2000, namespace: 'system' },
  { label: 'persona', description: 'Agent 角色认知、工作风格、专业语言', limit: 2000, namespace: 'system' },
  { label: 'project', description: '当前项目状态、活跃任务、关键决策', limit: 3000, namespace: 'system' },
  { label: 'scratchpad', description: '临时笔记、待办、注意项', limit: 1000, namespace: 'system' },
  { label: 'temporal', description: '关键事件时间线', limit: 3000, readOnly: true, namespace: 'system' },
];

export interface BlockDefinition {
  label: string;
  description: string;
  limit: number;
  readOnly?: boolean;
  namespace?: string;
}
```

**与 Letta 的差异：**
- 新增 `namespace` 字段，支持层级标签（`system/persona`）
- 新增 `version` 字段，用于版本追溯
- 新增 `tags` 字段，用于分类和语义检索
- 去除 `template_*`、`deployment_id` 等多租户字段（OriginOS 是个人系统）

### 3.2 Memory — Block 集合 + 编译

```typescript
// src/modules/memory-core/core/memory.ts

/**
 * Memory: Block 的集合，支持 compile/render 注入 prompt。
 * 借鉴 Letta Memory.compile() 方法。
 */
export class Memory {
  private blocks: Map<string, Block> = new Map();

  constructor(agentDir: string, definitions?: BlockDefinition[]) {
    // 加载或初始化 blocks
    this.loadFromDisk(agentDir);
    if (this.blocks.size === 0) {
      this.initializeDefaults(definitions);
    }
  }

  // --- 编译/渲染 ---

  /**
   * 编译 blocks 为 prompt 注入文本。
   * 输出格式兼容现有 MemoryBlockManager 的 markdown 格式，
   * 确保旧有 Dream/MemoryTracker 能正常解析。
   */
  compile(options?: CompileOptions): string {
    const { format = 'markdown', includeHidden = false, labels } = options ?? {};

    if (format === 'markdown') {
      return this.compileToMarkdown(labels ?? undefined, includeHidden);
    }

    return this.compileToXml(labels ?? undefined, includeHidden);
  }

  /** Markdown 格式（兼容现有系统） */
  private compileToMarkdown(
    includeLabels?: string[],
    includeHidden = false,
  ): string {
    const lines: string[] = ['# Memory\n'];

    for (const [label, block] of this.blocks) {
      if (includeLabels && !includeLabels.includes(label)) continue;
      if (block.metadata.hidden && !includeHidden) continue;

      lines.push(`## ${label}`);
      lines.push(`{description: ${block.description}}`);
      lines.push(`{limit: ${block.limit}}`);
      lines.push(`{readOnly: ${block.readOnly}}`);
      if (block.tags.length > 0) {
        lines.push(`{tags: ${block.tags.join(', ')}}`);
      }
      lines.push('');
      if (block.value) {
        lines.push(block.value);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** XML 格式（用于更紧凑的 prompt 注入，借鉴 Letta） */
  private compileToXml(
    includeLabels?: string[],
    includeHidden = false,
  ): string {
    const s: string[] = [];
    s.push('<memory_blocks>');
    s.push('The following memory blocks are currently engaged in your core memory unit:\n');

    for (const [label, block] of this.blocks) {
      if (includeLabels && !includeLabels.includes(label)) continue;
      if (block.metadata.hidden && !includeHidden) continue;

      s.push(`<${label}>`);
      s.push(`<description>${block.description}</description>`);
      s.push('<metadata>');
      s.push(`- chars_current=${block.value.length}`);
      s.push(`- chars_limit=${block.limit}`);
      if (block.readOnly) s.push('- read_only=true');
      s.push('</metadata>');
      s.push(`<value>${block.value}</value>`);
      s.push(`</${label}>`);
      s.push('');
    }

    s.push('</memory_blocks>');
    return s.join('\n');
  }

  // --- 块操作 ---

  getBlock(label: string): Block | null { ... }
  setBlock(label: string, value: string): void { ... }
  appendBlock(label: string, content: string): void { ... }
  replaceBlock(label: string, oldContent: string, newContent: string): boolean { ... }
  deleteBlock(label: string): void { ... }
  listBlocks(): Block[] { ... }

  // --- 持久化 ---

  save(): void { /* 写入 Memory.md + blocks.json 版本快照 */ }
  private loadFromDisk(agentDir: string): void { ... }
}

export interface CompileOptions {
  format?: 'markdown' | 'xml';
  includeHidden?: boolean;
  labels?: string[];  // 只编译指定 labels
}
```

### 3.3 Archival Memory — 语义向量存储

```typescript
// src/modules/memory-core/archival/archival-memory.ts

/**
 * ArchivalMemory: 长期语义记忆存储。
 * 借用 Story 9.20 的 HNSW 语义索引设计，
 * 但独立为通用记忆层，不限于黑板场景。
 */
export class ArchivalMemory {
  private entries: ArchivalEntry[] = [];
  private embeddingEngine: EmbeddingEngine;
  private hnswIndex: HNSWIndex;
  private storePath: string;

  constructor(agentDir: string) {
    this.storePath = path.join(agentDir, 'archival');
    this.embeddingEngine = new EmbeddingEngine();
    this.hnswIndex = new HNSWIndex({ m: 16, efConstruction: 200 });
    this.ensureStoreDir();
    this.loadFromDisk();
  }

  /**
   * 写入一条新记忆。
   * 流程：内容 → ONNX 编码 → Int8 量化 → HNSW 插入 → 持久化
   */
  async insert(text: string, tags?: string[]): Promise<string> {
    const entry: ArchivalEntry = {
      id: generateId(),
      text,
      tags: tags ?? [],
      createdAt: Date.now(),
      embedding: await this.embeddingEngine.encode(text),
    };

    this.entries.push(entry);
    await this.hnswIndex.insert(entry.id, entry.embedding);
    await this.persist();

    return entry.id;
  }

  /**
   * 语义搜索。
   * 流程：查询 → ONNX 编码 → HNSW 搜索 → RRF 融合 → MMR 去重 → 返回
   */
  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<ArchivalSearchResult[]> {
    const { limit = 10, namespace, minScore = 0.3 } = options ?? {};

    const queryEmbedding = await this.embeddingEngine.encode(query);
    const candidates = await this.hnswIndex.search(queryEmbedding, limit * 3);

    // RRF 融合：语义得分 + 时间衰减 + 标签权重
    const scored = this.applyRRF(candidates, queryEmbedding, {
      semanticWeight: 0.6,
      temporalWeight: 0.2,
      tagWeight: 0.2,
    });

    // MMR 去重
    const diverse = this.applyMMR(scored, options?.diversity ?? 0.7);

    return diverse
      .filter(r => r.score >= minScore)
      .slice(0, limit);
  }

  async delete(id: string): void { ... }
  async getAll(limit?: number): Promise<ArchivalEntry[]> { ... }
  async count(): Promise<number> { ... }
}

export interface ArchivalEntry {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  embedding: Float32Array;  // ONNX 编码后的向量
}

export interface ArchivalSearchResult {
  id: string;
  text: string;
  score: number;        // RRF 融合后的综合得分
  relevance: number;    // 余弦相似度
  tags: string[];
  createdAt: number;
}

export interface SearchOptions {
  limit?: number;
  namespace?: string;
  minScore?: number;
  diversity?: number;   // MMR 多样性参数 (0-1)
  tags?: string[];      // 按标签过滤
}
```

### 3.4 Recall Memory — 对话历史索引

```typescript
// src/modules/memory-core/recall/recall-memory.ts

/**
 * RecallMemory: 对话历史索引 + 语义搜索。
 * 替换现有 memory-tracker.ts 中的 keyword search，
 * 升级为语义搜索。
 */
export class RecallMemory {
  private entries: RecallEntry[] = [];
  private agentDir: string;
  private historyFilePath: string;
  private dreamCursorPath: string;

  constructor(agentDir: string) {
    this.agentDir = agentDir;
    this.historyFilePath = path.join(agentDir, 'memory', 'history.jsonl');
    this.dreamCursorPath = path.join(agentDir, '.dream_cursor');
    this.loadFromDisk();
  }

  /**
   * 记录一轮对话。
   * 兼容现有 MemoryTracker.recordTurn() 行为。
   */
  recordTurn(data: TurnRecord): void {
    const entry: RecallEntry = {
      turnNumber: data.turnNumber,
      summary: data.userMessage.slice(0, 200),
      keyInfo: this.extractKeyInfo(data.userMessage),
      userMessage: data.userMessage,
      assistantMessage: data.assistantMessage ?? '',
      toolCalls: data.toolCalls ?? [],
      timestamp: Date.now(),
    };

    this.entries.push(entry);
    this.appendHistoryLine(JSON.stringify(entry));
  }

  /**
   * 语义搜索对话历史。
   * 替换现有 searchHistoryFromPath()。
   * 使用 ONNX 编码 + 余弦相似度，而非关键词匹配。
   */
  async searchSemantic(
    query: string,
    maxResults = 5,
  ): Promise<RecallSearchResult[]> {
    const queryEmbedding = await this.embeddingEngine.encode(query);

    const scored = this.entries.map(entry => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding ?? zeros()),
    }));

    return scored
      .filter(r => r.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(r => ({
        turnNumber: r.entry.turnNumber,
        score: r.score,
        summary: r.entry.summary,
        text: r.entry.userMessage,
      }));
  }

  /**
   * 兼容旧 API: 关键词搜索。
   * 在条目有 embedding 时退化为语义搜索。
   */
  searchKeyword(query: string, maxResults = 5): string {
    // 如果 embedding 可用，走语义搜索
    // 否则回退到关键词匹配（保持向后兼容）
    return this.fallbackKeywordSearch(query, maxResults);
  }

  // --- Dream cursor 兼容 ---

  getDreamCursor(): number { ... }
  setDreamCursor(cursor: number): void { ... }
  readRecentHistory(sinceCursor: number): string { ... }
}

export interface TurnRecord {
  turnNumber: number;
  userMessage: string;
  assistantMessage?: string;
  toolCalls?: ToolCallRecord[];
}

export interface RecallEntry extends TurnRecord {
  summary: string;
  keyInfo: string[];
  timestamp: number;
  embedding?: Float32Array;  // 可选，异步生成
}

export interface RecallSearchResult {
  turnNumber: number;
  score: number;
  summary: string;
  text: string;
}
```

### 3.5 Memory Tools API — Agent 工具接口

```typescript
// src/modules/memory-core/tools/core-memory-tools.ts

/**
 * Core Memory Tools: Agent 编辑核心记忆的标准 API。
 * 借鉴 Letta function_sets.base.py 中的:
 *   core_memory_append, core_memory_replace,
 *   core_memory_remove, insert_memory_block
 */
export class CoreMemoryTools {
  constructor(private memory: Memory) {}

  /**
   * 追加内容到指定 block。
   * Agent 可调用的标准工具。
   */
  async core_memory_append(label: string, content: string): Promise<string> {
    const block = this.memory.getBlock(label);
    if (!block) {
      return `Error: Block '${label}' does not exist.`;
    }
    if (block.readOnly) {
      return `Error: Block '${label}' is read-only.`;
    }

    const newValue = block.value + (block.value ? '\n' : '') + content;
    if (newValue.length > block.limit) {
      return `Error: Content exceeds block limit (${block.limit} chars). Current: ${block.value.length}, New: ${newValue.length}`;
    }

    this.memory.setBlock(label, newValue);
    return `Block '${label}' appended successfully.`;
  }

  /**
   * 精确替换 block 中的内容。
   */
  async core_memory_replace(
    label: string,
    oldContent: string,
    newContent: string,
  ): Promise<string> {
    const block = this.memory.getBlock(label);
    if (!block) {
      return `Error: Block '${label}' does not exist.`;
    }
    if (block.readOnly) {
      return `Error: Block '${label}' is read-only.`;
    }
    if (!block.value.includes(oldContent)) {
      return `Error: Old content not found in block '${label}'.`;
    }

    const newValue = block.value.replace(oldContent, newContent);
    if (newValue.length > block.limit) {
      return `Error: Content exceeds block limit (${block.limit} chars).`;
    }

    this.memory.setBlock(label, newValue);
    return `Block '${label}' replaced successfully.`;
  }

  /**
   * 插入新 block。
   */
  async insert_memory_block(
    label: string,
    value: string,
    description?: string,
    limit?: number,
  ): Promise<string> {
    if (this.memory.getBlock(label)) {
      return `Error: Block '${label}' already exists.`;
    }

    this.memory.createBlock({
      label,
      value,
      description: description ?? 'Agent-created block',
      limit: limit ?? 2000,
      metadata: { lastEditedBy: 'agent' },
    });

    return `Block '${label}' created successfully.`;
  }

  /**
   * 读取 block 内容。
   */
  async read_memory_block(label: string): Promise<string> {
    const block = this.memory.getBlock(label);
    if (!block) {
      return `Error: Block '${label}' does not exist.`;
    }
    return block.value;
  }
}

// src/modules/memory-core/tools/archival-memory-tools.ts

/**
 * Archival Memory Tools: Agent 写入/搜索长期记忆。
 * 借鉴 Letta: archival_memory_insert, archival_memory_search
 */
export class ArchivalMemoryTools {
  constructor(private archival: ArchivalMemory) {}

  async archival_memory_insert(text: string, tags?: string[]): Promise<string> {
    const id = await this.archival.insert(text, tags);
    return `Archival memory saved (id: ${id}).`;
  }

  async archival_memory_search(
    query: string,
    limit = 5,
  ): Promise<string> {
    const results = await this.archival.search(query, { limit });
    if (results.length === 0) {
      return 'No relevant memories found.';
    }

    const lines = ['Found ' + results.length + ' relevant memories:'];
    for (const r of results) {
      lines.push(`- [score: ${r.score.toFixed(2)}] ${r.text}`);
    }
    return lines.join('\n');
  }
}
```

### 3.6 Memory Provider — 集成 Cognitive System

```typescript
// src/modules/memory-core/session/memory-provider.ts

/**
 * 实现 CognitiveProvider 接口，
 * 使新 Memory Core 能接入现有 CognitiveManager。
 */
export class MemoryProvider implements CognitiveProvider {
  readonly name = 'memory';

  private core: MemoryCore;

  constructor(agentDir: string) {
    this.core = new MemoryCore(agentDir);
  }

  /**
   * 回忆相关上下文，注入 prompt。
   * 由 launcher 在 Agent 启动前调用。
   */
  async prefetch(query: string): Promise<string | null> {
    const [archivalResults, recallResults] = await Promise.all([
      this.core.archival.search(query, { limit: 5 }),
      this.core.recall.searchSemantic(query, { limit: 5 }),
    ]);

    const parts: string[] = [];

    if (archivalResults.length > 0) {
      parts.push('## Archival Memory (Semantic)\n');
      for (const r of archivalResults) {
        parts.push(`- [${r.score.toFixed(2)}] ${r.text}`);
      }
    }

    if (recallResults.length > 0) {
      parts.push('## Recall Memory (Conversation History)\n');
      for (const r of recallResults) {
        parts.push(`- Turn #${r.turnNumber} [${r.score.toFixed(2)}]: ${r.summary}`);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  /** Turn 级写入：记录对话到 Recall Memory */
  async sync_turn(data: TurnCognitiveData): Promise<void> {
    this.core.recall.recordTurn({
      turnNumber: data.turnNumber,
      userMessage: data.userMessage,
      assistantMessage: data.assistantMessage,
      toolCalls: data.toolCalls,
    });
  }

  /** Frozen Snapshot：启动时加载到 system prompt */
  async system_prompt_block(): Promise<string> {
    return this.core.memory.compile({ format: 'xml' });
  }

  // --- 对外暴露的完整 API ---

  get coreMemory(): Memory { return this.core.memory; }
  get archivalMemory(): ArchivalMemory { return this.core.archival; }
  get recallMemory(): RecallMemory { return this.core.recall; }
  get coreTools(): CoreMemoryTools { return this.core.coreTools; }
  get archivalTools(): ArchivalMemoryTools { return this.core.archivalTools; }
}
```

### 3.7 Pattern 集成策略

```typescript
// src/lib/integrations/pi-agent/cognitive/pattern-provider.ts
// 改造：底层复用 Archival Memory，上层保持 CognitiveProvider 接口
```

当前 PatternProvider 的三个痛点：

| 痛点 | 现状 | 新方案 |
|------|------|--------|
| **prefetch() 关键词匹配** | `includes()` 匹配 tool chain name | Archival semantic search |
| **Reflection 搜索只靠 Jaccard** | 标签重叠 + 时间衰减 | 语义向量搜索 + RRF 融合 |
| **Pattern 无版本追溯** | 直接覆盖 registry.json | Archival Entry 带 timestamp |

**集成方案：**

```
PatternProvider.sync_turn()
  ├── (保留) 更新 registry.json（维持现有行为）
  └── (新增) 写入 Archival Memory
      ├── 成功工具链 → archival.insert(text, ['pattern', toolChain...])
      ├── 失败反思 → archival.insert(text, ['reflection', toolChain..., failureReason...])
      └── 反模式 → archival.insert(text, ['anti-pattern', toolChain...])

PatternProvider.prefetch(query)
  ├── (优先) archival.searchSemantic(query, { tags: ['pattern'], limit: 5 })
  ├── (回退) 现有关键词匹配
  └── (追加) archival.searchSemantic(query, { tags: ['reflection'], limit: 3 })

PatternProvider.searchReflections(query)
  ├── (优先) archival.searchSemantic(query, { tags: ['reflection'], limit: 5 })
  └── (回退) 现有 Jaccard 标签匹配
```

**一次性迁移：**

```
MemoryCore.initialize()
  └─ migratePatterns()：
      1. 读取 patterns/registry.json
      2. 每个 PatternEntry → archival.insert(principle || triggerCondition, ['pattern', ...toolChain])
      3. 读取 patterns/episodic-memory/*.json
      4. 每个 ReflectionEntry → archival.insert(scene + failureReason + lesson, ['reflection', ...tags])
```

**收益：**
- 用户查询"处理文件的方式"时，匹配到 `read → write → process` pattern（即使名称中没有关键词）
- 失败场景"工具链超时"直接匹配到语义相关的历史反思，不再依赖人工标签
- Pattern 出现时间、成功率变化趋势可从 Archival 时间线查询

### 3.8 MemoryCore — 统一门面


```typescript
// src/modules/memory-core/core/memory-core.ts

/**
 * MemoryCore: 三层记忆的统一门面。
 * 一个类管理 Core + Archival + Recall 三层记忆。
 */
export class MemoryCore {
  readonly memory: Memory;
  readonly archival: ArchivalMemory;
  readonly recall: RecallMemory;
  readonly coreTools: CoreMemoryTools;
  readonly archivalTools: ArchivalMemoryTools;

  constructor(agentDir: string, definitions?: BlockDefinition[]) {
    this.memory = new Memory(agentDir, definitions);
    this.archival = new ArchivalMemory(agentDir);
    this.recall = new RecallMemory(agentDir);
    this.coreTools = new CoreMemoryTools(this.memory);
    this.archivalTools = new ArchivalMemoryTools(this.archival);
  }

  /** Agent 启动时初始化 */
  async initialize(): Promise<void> {
    await Promise.all([
      this.archival.loadFromDisk(),
      this.recall.loadFromDisk(),
    ]);
  }

  /** Agent 结束时刷盘 */
  async shutdown(): Promise<void> {
    await Promise.all([
      this.memory.save(),
      this.archival.persist(),
    ]);
  }
}
```

---

## 4. 适配器层

```typescript
// src/lib/integrations/memory/adapter.ts

/**
 * 适配器：让新 MemoryCore 兼容旧 MemoryTracker/MemoryBlockManager API。
 * 确保现有代码无需修改即可使用新记忆模块。
 */
export class MemoryAdapter {
  private core: MemoryCore;

  constructor(core: MemoryCore) {
    this.core = core;
  }

  // --- MemoryTracker 兼容 ---

  recordTurn(userMessage: string, turnNumber: number): void {
    this.core.recall.recordTurn({ turnNumber, userMessage });
  }

  getDreamCursor(): number {
    return this.core.recall.getDreamCursor();
  }

  setDreamCursor(cursor: number): void {
    this.core.recall.setDreamCursor(cursor);
  }

  readRecentHistory(sinceCursor: number): string {
    return this.core.recall.readRecentHistory(sinceCursor);
  }

  // --- MemoryBlockManager 兼容 ---

  getBlock(label: string): MemoryBlock | null {
    const block = this.core.memory.getBlock(label);
    if (!block) return null;
    return {
      label: block.label,
      value: block.value,
      limit: block.limit,
      description: block.description,
      metadata: block.metadata,
      readOnly: block.readOnly,
    };
  }

  setBlock(label: string, value: string): void {
    this.core.memory.setBlock(label, value);
  }

  appendBlock(label: string, content: string): void {
    this.core.memory.appendBlock(label, content);
  }

  replaceBlock(label: string, old: string, replacement: string): boolean {
    return this.core.memory.replaceBlock(label, old, replacement);
  }

  getCoreMemory(): string {
    return this.core.memory.compile({ format: 'markdown' });
  }

  // --- Recall search 兼容 ---

  searchHistoryFromPath(
    historyFilePath: string,
    query: string,
    maxResults = 5,
  ): string {
    // 优先走语义搜索，回退到关键词搜索
    return this.core.recall.searchSemantic(query, { limit: maxResults })
      .map(r => `- Turn #${r.turnNumber}: ${r.summary}`)
      .join('\n')
      || this.core.recall.searchKeyword(query, maxResults);
  }
}
```

---

## 5. 数据目录结构

```
{agent-workspace}/
├── Memory.md                    # Core Memory（现有格式，兼容）
├── blocks.json                  # Block 版本快照（新增）
├── memory/
│   └── history.jsonl            # Recall Memory 历史（现有）
├── .dream_cursor                # Dream cursor（现有）
├── archival/                    # Archival Memory（新增）
│   ├── entries.jsonl            # 语义记忆条目
│   ├── embeddings.bin           # Int8 量化向量数据
│   └── hnsw-index.bin           # HNSW 图索引
└── cognitive/                   # 认知系统（现有）
    ├── knowledge/
    ├── patterns/                # PatternProvider（保留现有目录结构）
    │   ├── registry.json        # 模式注册表（保留，adapter 读取）
    │   ├── episodic-memory/     # 反思条目（保留，adapter 读取）
    │   └── ...
    └── practice/
```

**说明：** Pattern 现有目录结构保留，不破坏现有数据。新 Archival Memory 作为语义索引层，PatternProvider 的双写策略确保新旧数据一致。

---

## 6. 迁移路径

### Phase 1: 创建 Memory Core 模块骨架

- [ ] 创建 `src/modules/memory-core/` 目录结构
- [ ] 实现 Block 定义 + Memory 集合
- [ ] 实现 compile/render（markdown + xml 双格式）
- [ ] 验证：compile('markdown') 输出与现有 MemoryBlockManager 格式一致

### Phase 2: Archival Memory 语义存储

- [ ] 实现 EmbeddingEngine（ONNX all-MiniLM-L6-v2）
- [ ] 实现 HNSW 向量索引（复用 Story 9.20 设计）
- [ ] 实现 ArchivalMemory 主类（insert/search/delete）
- [ ] 实现 RRF 融合 + MMR 去重
- [ ] 验证：10 万条目 <100ms 搜索

### Phase 3: Recall Memory 语义增强

- [ ] 升级 RecallMemory.searchSemantic()（ONNX 编码 + 余弦相似度）
- [ ] 保留 searchKeyword() 作为回退
- [ ] 异步生成 embedding（不阻塞 recordTurn）
- [ ] 验证：语义搜索结果质量优于关键词搜索

### Phase 4: Memory Tools API + Provider 集成

- [ ] 实现 CoreMemoryTools（append/replace/insert/read）
- [ ] 实现 ArchivalMemoryTools（insert/search）
- [ ] 实现 MemoryProvider（CognitiveProvider 接口）
- [ ] 集成 CognitiveManager
- [ ] 验证：Agent 可通过工具编辑记忆

### Phase 5: 适配器 + 灰度切换

- [ ] 实现 MemoryAdapter（兼容旧 API）
- [ ] 现有代码通过 adapter 使用新 MemoryCore
- [ ] 双写模式：旧 MemoryTracker + 新 RecallMemory 同时写入
- [ ] 灰度切换：关闭旧写入，只使用新模块
- [ ] 验证：所有现有功能正常工作

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| ONNX 模型加载失败 | 语义搜索不可用 | 回退到关键词搜索 |
| HNSW 索引损坏 | Archival 搜索失效 | 从 entries.jsonl 重建 |
| compile 输出格式不兼容 | Dream 解析失败 | Phase 1 严格验证 markdown 格式一致性 |
| MemoryCore 初始化慢 | Agent 启动延迟 | 延迟加载 Archival，Core 优先 |
| 适配器层 bug | 旧 API 行为不一致 | 全面单元测试，对比新旧输出 |

---

## 8. 性能指标

| 指标 | 目标 | 验证方式 |
|------|------|---------|
| Core Memory compile | < 10ms | 单元测试 |
| Archival insert | < 50ms (含编码) | 单元测试 |
| Archival search (10K entries) | < 100ms | 性能测试 |
| Recall semantic search (10K turns) | < 50ms | 性能测试 |
| Memory Provider prefetch | < 200ms | 集成测试 |
| 内存占用 (100K archival entries) | < 50MB | 压力测试 |
