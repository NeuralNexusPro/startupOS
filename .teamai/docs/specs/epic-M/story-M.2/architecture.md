# 架构文档 - Story M.2

**Story:** Memory 集合 + compile/render
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 模块设计

**文件：**

```
src/modules/memory-core/core/memory.ts
```

---

## compile 输出格式对比

| 格式 | 用途 | 特点 |
|------|------|------|
| `markdown` | 兼容现有 MemoryBlockManager/Dream | `## label` + `{description:}` + `{limit:}` 格式 |
| `xml` | 紧凑 prompt 注入，借鉴 Letta | `<label><description>...<value>...</value></label>` |

---

## Markdown 格式（必须与现有输出一致）

```markdown
# Memory

## human
{description: 用户画像、偏好、历史习惯}
{limit: 2000}
{readOnly: false}

用户喜欢简洁的代码...
```

---

## XML 格式（借鉴 Letta _render_memory_blocks_standard）

```xml
<memory_blocks>
The following memory blocks are currently engaged in your core memory unit:

<human>
<description>用户画像、偏好、历史习惯</description>
<metadata>
- chars_current=15
- chars_limit=2000
</metadata>
<value>
用户喜欢简洁的代码...
</value>
</human>

</memory_blocks>
```

---

## 持久化结构

```
{agent-workspace}/
├── Memory.md              # 人类可读（markdown 格式）
└── blocks.json            # 版本快照（含 version, createdAt, updatedAt）
```
