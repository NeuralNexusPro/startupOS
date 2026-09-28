# 架构文档 - Story M.5

**Story:** Memory Tools API
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 模块设计

**文件：**

```
src/modules/memory-core/tools/core-memory-tools.ts
src/modules/memory-core/tools/archival-memory-tools.ts
```

---

## Core Memory Tools API

```typescript
interface CoreMemoryTools {
  core_memory_append(label: string, content: string): Promise<string>;
  core_memory_replace(label: string, oldContent: string, newContent: string): Promise<string>;
  insert_memory_block(label: string, value: string, description?: string, limit?: number): Promise<string>;
  read_memory_block(label: string): Promise<string>;
}
```

---

## Archival Memory Tools API

```typescript
interface ArchivalMemoryTools {
  archival_memory_insert(text: string, tags?: string[]): Promise<string>;
  archival_memory_search(query: string, limit?: number): Promise<string>;
}
```

---

## 返回值格式

| 操作 | 成功 | 失败 |
|------|------|------|
| append | `Block '{label}' appended successfully.` | `Error: Block '{label}' does not exist.` |
| replace | `Block '{label}' replaced successfully.` | `Error: Old content not found in block '{label}'.` |
| insert | `Block '{label}' created successfully.` | `Error: Block '{label}' already exists.` |
| read | 返回 block 内容 | `Error: Block '{label}' does not exist.` |
| archival_insert | `Archival memory saved (id: {id}).` | - |
| archival_search | `Found N relevant memories: ...` | `No relevant memories found.` |
