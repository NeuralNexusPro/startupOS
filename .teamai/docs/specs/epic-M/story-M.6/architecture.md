# 架构文档 - Story M.6

**Story:** MemoryProvider 集成 + 适配器
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 技术文件

```
src/modules/memory-core/core/memory-core.ts           # 统一门面
src/modules/memory-core/session/memory-provider.ts     # CognitiveProvider 实现
src/modules/memory-core/index.ts                       # 统一导出
src/lib/integrations/memory/adapter.ts                 # 适配器层
src/lib/integrations/memory/index.ts                   # 集成入口
```

---

## MemoryCore（统一门面）

```typescript
export class MemoryCore {
  readonly memory: Memory;
  readonly archival: ArchivalMemory;
  readonly recall: RecallMemory;
  readonly coreTools: CoreMemoryTools;
  readonly archivalTools: ArchivalMemoryTools;

  constructor(agentDir: string, definitions?: BlockDefinition[]);
  initialize(): Promise<void>;   // 加载磁盘数据
  shutdown(): Promise<void>;     // 刷盘
}
```

---

## MemoryProvider（CognitiveProvider 实现）

```typescript
export class MemoryProvider implements CognitiveProvider {
  readonly name = 'memory';

  prefetch(query: string): Promise<string | null>;
  sync_turn(data: TurnCognitiveData): Promise<void>;
  system_prompt_block(): Promise<string>;

  // 对外暴露完整 API
  get coreMemory(): Memory;
  get archivalMemory(): ArchivalMemory;
  get recallMemory(): RecallMemory;
  get coreTools(): CoreMemoryTools;
  get archivalTools(): ArchivalMemoryTools;
}
```

---

## 适配器映射

| 现有 API | Adapter 方法 | 新模块方法 |
|----------|-------------|-----------|
| `MemoryTracker.recordTurn()` | adapter.recordTurn() | recall.recordTurn() |
| `MemoryTracker.getDreamCursor()` | adapter.getDreamCursor() | recall.getDreamCursor() |
| `MemoryBlockManager.getBlock()` | adapter.getBlock() | memory.getBlock() |
| `MemoryBlockManager.setBlock()` | adapter.setBlock() | memory.setBlock() |
| `MemoryBlockManager.getCoreMemory()` | adapter.getCoreMemory() | memory.compile('markdown') |
| `searchHistoryFromPath()` | adapter.searchHistoryFromPath() | recall.searchSemantic() → searchKeyword() 回退 |

---

## Dream 双写策略

```
Dream Phase 2 指令应用
  ├── 继续写入 Memory.md（保持现有行为）
  └── 同时写入 Archival Memory（新增）
      └── [ADD] 指令 → archival.insert(text, ['dream', 'add'])
      └── [UPDATE] 指令 → archival.insert(text, ['dream', 'update'])
```
