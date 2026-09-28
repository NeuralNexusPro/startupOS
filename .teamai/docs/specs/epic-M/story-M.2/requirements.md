# 需求文档 - Story M.2

**Story:** Memory 集合 + compile/render
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 Agent 系统，我需要将多个 Block 组织为 Memory 集合，并提供 compile/render 方法将其注入到 prompt 中，这样 LLM 能读取结构化的记忆上下文。

---

## 功能需求

1. **Memory 类** — 管理 Map<string, Block> 集合
2. **compile(options)** — 支持 markdown（兼容现有格式）和 xml 两种输出格式
3. **CRUD 操作** — getBlock, setBlock, appendBlock, replaceBlock, deleteBlock, listBlocks
4. **持久化** — save() 写入 Memory.md + blocks.json 版本快照
5. **加载恢复** — 从 Memory.md 解析 blocks，从 blocks.json 恢复版本历史

---

## 持久化格式

```
{agent-workspace}/
├── Memory.md              # 人类可读（markdown 格式）
└── blocks.json            # 版本快照（含 version, createdAt, updatedAt）
```

---

## 依赖关系

- 依赖 Story M.1 的 Block 类型定义
- compile('markdown') 输出须与现有 `serializeBlocksToMarkdown()` 格式完全一致
- 加载恢复须兼容现有 `parseBlocksFromMarkdown()`
