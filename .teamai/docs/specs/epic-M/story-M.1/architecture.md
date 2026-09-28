# 架构文档 - Story M.1

**Story:** 类型定义与 Block 抽象
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 模块设计

**文件：**

```
src/modules/memory-core/core/block.ts
```

---

## Block 类型定义

```typescript
export interface Block {
  id: string;                    // 唯一 ID
  label: string;                 // 上下文窗口中的标签名
  value: string;                 // block 内容
  limit: number;                 // 字符上限
  description: string;           // 用途说明
  metadata: BlockMetadata;
  readOnly: boolean;
  tags: string[];               // 分类标签
  namespace?: string;            // 层级标签: 'system', 'skills', 'user'
  createdAt: number;             // Unix 毫秒时间戳
  updatedAt: number;
  version: number;               // 自增版本号
}
```

---

## 默认 Blocks（DEFAULT_BLOCKS）

```typescript
export const DEFAULT_BLOCKS: BlockDefinition[] = [
  { label: 'human', description: '用户画像、偏好、历史习惯', limit: 2000, namespace: 'system' },
  { label: 'persona', description: 'Agent 角色认知、工作风格、专业语言', limit: 2000, namespace: 'system' },
  { label: 'project', description: '当前项目状态、活跃任务、关键决策', limit: 3000, namespace: 'system' },
  { label: 'scratchpad', description: '临时笔记、待办、注意项', limit: 1000, namespace: 'system' },
  { label: 'temporal', description: '关键事件时间线', limit: 3000, readOnly: true, namespace: 'system' },
];
```

---

## 与 Letta BaseBlock 字段对比

| 字段 | Letta | Memory Core | 原因 |
|------|-------|-------------|------|
| `id` | 有 | 有 | 版本追溯 |
| `namespace` | 无 | 新增 | 层级标签（system/persona） |
| `tags` | 有 | 有 | 分类和语义检索 |
| `version` | 无 | 新增 | 版本追溯 |
| `template_*` | 有 | 移除 | OriginOS 是个人系统，无多租户 |
| `deployment_id` | 有 | 移除 | 同上 |
| `hidden` | 有 | 移到 metadata | 简化顶层字段 |
