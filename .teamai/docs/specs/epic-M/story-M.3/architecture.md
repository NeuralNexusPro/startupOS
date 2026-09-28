# 架构文档 - Story M.3

**Story:** Archival Memory 语义存储
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 模块设计

**文件：**

```
src/modules/memory-core/archival/embedding.ts       # ONNX 编码 + Int8 量化
src/modules/memory-core/archival/hnsw-index.ts      # HNSW 图构建 + 搜索
src/modules/memory-core/archival/archival-memory.ts # 语义存储主类
```

---

## 核心 API

```typescript
interface ArchivalMemory {
  insert(text: string, tags?: string[]): Promise<string>;    // 写入一条记忆，返回 ID
  search(query: string, options?: SearchOptions): Promise<ArchivalSearchResult[]>;
  delete(id: string): Promise<void>;
  getAll(limit?: number): Promise<ArchivalEntry[]>;
  count(): Promise<number>;
}

interface SearchOptions {
  limit?: number;       // 默认 10
  minScore?: number;    // 最低相似度阈值，默认 0.3
  tags?: string[];      // 标签过滤
}

interface ArchivalSearchResult {
  id: string;
  text: string;
  score: number;       // 余弦相似度
  tags: string[];
  createdAt: number;
}
```

---

## 写入流程

```
文本 → ONNX(all-MiniLM-L6-v2) → Float32[384] → Int8 量化 → hnswIndex.insert() → 持久化
```

---

## 搜索流程

```
查询文本 → ONNX 编码 → HNSW.search(vector, k=limit*3, ef=50)
  → 余弦相似度过滤 (minScore=0.3)
  → 按时间衰减加权
  → 返回 Top-K
```

---

## Int8 量化

- Float32[384] → Int8[384]，内存减少 75%
- 量化参数：scale + zero_point（per-vector）
- 搜索时反量化为 Float32
