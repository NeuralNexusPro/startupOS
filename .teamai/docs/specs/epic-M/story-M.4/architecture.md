# 架构文档 - Story M.4

**Story:** Recall Memory 语义增强
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 模块设计

**文件：**

```
src/modules/memory-core/recall/recall-memory.ts
src/modules/memory-core/recall/history-store.ts
```

---

## 核心 API

```typescript
interface RecallMemory {
  recordTurn(data: TurnRecord): void;
  searchSemantic(query: string, options?: { limit?: number }): Promise<RecallSearchResult[]>;
  searchKeyword(query: string, maxResults?: number): string;
  getDreamCursor(): number;
  setDreamCursor(cursor: number): void;
  readRecentHistory(sinceCursor: number): string;
}

interface TurnRecord {
  turnNumber: number;
  userMessage: string;
  assistantMessage?: string;
  toolCalls?: ToolCallRecord[];
}

interface RecallSearchResult {
  turnNumber: number;
  score: number;
  summary: string;
  text: string;
}
```

---

## 与现有 searchHistoryFromPath 的对比

| 维度 | 现有（关键词） | 新（语义） |
|------|---------------|-----------|
| 匹配方式 | split + includes | ONNX 编码 + 余弦相似度 |
| 评分 | 匹配关键词数量 | 向量相似度 |
| 召回 | 精确匹配关键词 | 语义相关即可 |
| 速度 | 快（纯文本） | 快（ONNX 推理 + 向量搜索） |

---

## 异步 embedding 策略

```
recordTurn → 立即追加 JSONL → setImmediate(() => {
  embedding = await onnx.encode(entry.userMessage.slice(0, 512));
  entry.embedding = quantize(embedding);
  saveToDisk(entry);
})
```
