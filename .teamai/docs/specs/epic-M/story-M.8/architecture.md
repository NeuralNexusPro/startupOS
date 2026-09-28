# 架构文档 - Story M.8

**Story:** 记忆链路收敛 — 围栏修复 + 新旧合并 + DataFile 对齐
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 影响范围

- `src/modules/memory-core/{core,session,adapter.ts}` — DI 化、围栏修复、DataFile 对齐
- `src/lib/integrations/pi-agent/role-agent/{memory-tracker,dream,consolidator}.ts` — 删除或薄壳化
- `src/lib/integrations/pi-agent/cognitive/types.ts` — 类型反向 re-export
- `src/lib/integrations/pi-agent/{persistent-agent-manager,agent-manager,server-config}.ts` — DI 注入
- `src/lib/services/launcher/role-agent.ts` — 切换到 MemoryCore
- `src/modules/collaboration-runtime/sandbox/agent-worker.mts` — DI 注入对齐
- `.eslintrc`、CLAUDE.md（→ v2.4.0）、`docs/design/memory-core.md`、Epic M README

---

## 模块设计

### A. 围栏修复 — 类型迁移与依赖注入

**类型迁移策略：**
- `CognitiveProvider / TurnCognitiveData / MemoryBlock` → 迁入 memory-core 或 `src/types/cognitive.ts`
- 原文件 `src/lib/integrations/pi-agent/cognitive/types.ts` 改为 re-export

**依赖注入：**
- `createAutoModel` 抽到 `MemoryCoreDeps` 接口
- `MemoryCore` 构造函数接受 deps
- `persistent-agent-manager` / `agent-manager` / `agent-worker.mts` 注入

**ESLint 规则：**
- `.eslintrc` 新增 `no-restricted-imports`：`src/modules/memory-core/**` 禁止 import `@/lib/**` 与 `@/components/**`

### B. 新旧链路收敛 — 统一入口

- role-agent launcher 切换到 `MemoryCore`
- `MemoryCore.constructor` 加入旧格式探测 + 自动迁移逻辑
- 旧格式自动转换为新格式并保留备份 `Memory.md.legacy`

### C. Dream/Consolidator 统一

- 保留 `MemoryConsolidator` 为唯一 LLM 整理入口
- `dream.ts` 两阶段流程迁入或封装为 `MemoryConsolidator.dream(turns)`
- 统一指令语法
- 触发钩子统一接到 `CognitiveManager` 生命周期事件

### D. Layer 2 注入顺序

`MemoryProvider.system_prompt_block()` 拼接顺序：
1. Memory blocks
2. Knowledge index
3. Patterns index

### E. DataFile 规约对齐

**blocks.json 格式：**
```json
{
  "version": "memory-core/1.0",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "data": { "blocks": [] }
}
```

**entries.jsonl 每行格式：**
```json
{
  "version": "memory-core/1.0",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "data": {}
}
```

### F. any 清理

| 文件 | 当前用法 | 修复方案 |
|------|---------|---------|
| `hnsw-index.ts:117,124` | `null as any` | 显式类型 |
| `memory.ts:155,184` | `(block.metadata as any).hidden` | 在 `BlockMetadata` 类型中声明 `hidden?: boolean` |
| `consolidator.ts` | LLM 响应解析无 schema | 加 zod schema |
