# 需求文档 - Story M.1

**Story:** 类型定义与 Block 抽象
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 Agent 开发者，我需要统一的 Block 类型定义来描述记忆的各个分区，这样我可以标准化记忆管理、支持版本追溯，并为上层编译和语义检索提供基础。

---

## 功能需求

1. **Block 接口** — 借鉴 Letta BaseBlock，定义记忆基本单元
2. **BlockDefinition** — 默认 block 定义，用于初始化
3. **BlockMetadata** — 扩展元数据字段（编辑者、优先级、分类）
4. **默认 5 blocks** — human, persona, project, scratchpad, temporal
5. **与现有类型兼容** — 兼容 `cognitive/types.ts` 中的 `MemoryBlock`

---

## 边界条件与依赖关系

### 与 Letta 的差异

| 字段 | Letta | Memory Core | 原因 |
|------|-------|-------------|------|
| `id` | 有 | 有 | 版本追溯 |
| `namespace` | 无 | 新增 | 层级标签（system/persona） |
| `tags` | 有 | 有 | 分类和语义检索 |
| `version` | 无 | 新增 | 版本追溯 |
| `template_*` | 有 | 移除 | OriginOS 是个人系统，无多租户 |
| `deployment_id` | 有 | 移除 | 同上 |
| `hidden` | 有 | 移到 metadata | 简化顶层字段 |

### 兼容性要求

- 必须兼容 `cognitive/types.ts` 中的 `MemoryBlock` 类型
- DEFAULT_BLOCKS 须与现有 5 默认 blocks 一致

### 所属文件

```
src/modules/memory-core/core/block.ts
```
