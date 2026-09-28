# 架构 - Story R.5

**Story:** Turn 行为分析与 Memory Tracker
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 🏗️ 技术实现

**新增文件：** `src/lib/integrations/pi-agent/role-agent/memory-tracker.ts`

### 数据结构

```typescript
export interface MemoryEntry {
  turnNumber: number;
  summary: string;       // 用户意图一句话摘要
  keyInfo: string[];     // 关键信息片段
  timestamp: number;
}

export interface MemoryTrackerState {
  entries: MemoryEntry[];
  turnCount: number;
  flushThreshold: number;  // 默认 50
}

export class MemoryTracker {
  constructor(agentDir: string, threshold?: number);
  
  // turn_end 后调用，记录本轮记忆
  recordTurn(userMessage: string, turnNumber: number): void;
  
  // 检查是否需要刷盘
  shouldFlush(): boolean;
  
  // 将累积记忆写入 Memory.md
  flushMemory(existingContent: string | null): Promise<void>;
  
  // 手动触发刷盘
  forceFlush(existingContent: string | null): Promise<void>;
  
  getState(): MemoryTrackerState;
}
```

### 依赖

- `fs` / `path`（Node.js 标准库）
- 无 pi-agent 内部依赖

### 集成点

- `launcher/role-agent.ts` 的 `turn_end` 生命周期钩子中调用 `recordTurn()`
- 检查 `shouldFlush()`，满足条件时调用 `flushMemory()`

---

## 🔗 相关文档

- [Epic R README](../README.md)
- [设计方案](../../../../.claude/plans/roleagent-pi-agent-loop.md#375-memory-tracker-ts)
