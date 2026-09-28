# 架构设计 - Story 9.2

**Story:** 事件存储（文件系统 JSONL）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式
- 文件系统 JSONL（JSON Lines）格式
- 遵循 AGENTS.md DataFile 格式约束

## 数据结构

### JSONL 事件存储

- 路径：`data/projects/{projectId}/collaboration-sessions/{sessionId}/events.jsonl`
- 每行一个 JSON 对象（JSON Line 格式）
- 追加写入，不可变（append-only）

### Checkpoint

- 状态快照 + cursor，支持增量读取

## 模块设计

**文件：**

```
src/modules/collaboration-runtime/session/event-store.ts      # EventStore 接口
src/modules/collaboration-runtime/session/fs-event-store.ts   # 文件系统实现
```

## 代码变更

### 接口定义

```typescript
interface EventStore {
  append(event: RuntimeEvent): Promise<void>;
  read(sessionId: string, cursor?: number): Promise<RuntimeEvent[]>;
  checkpoint(sessionId: string, seq: number): Promise<void>;
  list(sessionId: string): Promise<string[]>;
}
```

- `event-store.ts`：定义 EventStore 接口
- `fs-event-store.ts`：实现文件系统 JSONL 存储
