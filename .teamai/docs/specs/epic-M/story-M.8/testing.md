# 测试文档 - Story M.8

**Story:** 记忆链路收敛 — 围栏修复 + 新旧合并 + DataFile 对齐
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

1. `grep -r "from \"@/lib" src/modules/memory-core/` 输出为 0。
2. `grep -rn ": any\\|as any\\|<any>" src/modules/memory-core/ | grep -v __tests__` 输出为 0。
3. `npm run lint` 0 错误（含新增 `no-restricted-imports`）；`npx tsc --noEmit --skipLibCheck` 0 错误。
4. role-agent / project-agent / persistent-agent / 协作 sandbox 全部经 `MemoryCore` 写入；同一 agent 目录在不同链路下 `Memory.md` 不再冲突；新增端到端测试覆盖 role-agent + project-agent 切换场景。
5. `MemoryAdapter` 已删除或仅在 launcher 切换过渡期保留并标 deprecated；`role-agent/memory-tracker.ts` 已删除或重写为 `MemoryCore` 薄壳。
6. `MemoryConsolidator` 是唯一 LLM 整理实现；旧 `dream.ts` 已合并或替换为再导出。
7. `blocks.json` / `entries.jsonl` 符合 DataFile 规约；旧格式自动迁移有测试覆盖。
8. Epic M README 状态调整为反映现状（M.1–M.6 完成度真实标注）。

---

## 测试场景

### 1. 围栏完整性验证

**测试目标：** 验证 memory-core 模块无反向依赖

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| 无 `@/lib` 反向 import | `grep -r "from \"@/lib" src/modules/memory-core/` | 输出为 0 |
| 无 `any` 类型滥用 | `grep -rn ": any\\|as any\\|<any>" src/modules/memory-core/ \| grep -v __tests__` | 输出为 0 |
| ESLint 通过 | `npm run lint` | 0 错误（含 `no-restricted-imports`） |
| TypeScript 编译 | `npx tsc --noEmit --skipLibCheck` | 0 错误 |

### 2. 链路收敛测试

**测试目标：** 验证所有 Agent 类型走同一 MemoryCore 链路

| 场景 | 预期行为 |
|------|---------|
| role-agent 写入 Memory.md | 通过 `MemoryCore` 写入，格式与 project-agent 一致 |
| project-agent 写入 Memory.md | 通过 `MemoryCore` 写入 |
| persistent-agent 写入 Memory.md | 通过 `MemoryCore` 写入 |
| 协作 sandbox agent 写入 Memory.md | 通过 `MemoryCore` 写入 |
| 同一 agent 目录切换链路 | `Memory.md` 无冲突，格式一致 |
| role-agent → project-agent 切换 E2E | 端到端测试覆盖切换场景 |

### 3. 旧格式迁移测试

**测试目标：** 验证 Memory.md 旧格式自动探测与迁移

| 场景 | 预期行为 |
|------|---------|
| 旧 `MemoryBlockManager` 序列化（无版本头） | 自动转换为新格式，保留 `Memory.md.legacy` 备份 |
| 已有新格式 `blocks.json` | 不触发迁移，正常读取 |
| 旧格式 + 新格式混合 | 以新格式为准，旧内容合并迁移 |

### 4. DataFile 规约测试

**测试目标：** 验证数据文件符合 AGENTS.md DataFile 规约

| 场景 | 预期行为 |
|------|---------|
| 新建 `blocks.json` | 格式为 `{ version, createdAt, updatedAt, data: { blocks: [...] } }` |
| 新建 `entries.jsonl` | 每行格式为 `{ version, createdAt, updatedAt, data: <entry> }` |
| 读取旧格式 `blocks.json` | forward-compat 兼容，正常读取 |
| 读取旧格式 `entries.jsonl` | forward-compat 兼容，正常读取 |

### 5. Consolidator 统一测试

**测试目标：** 验证 `MemoryConsolidator` 为唯一 LLM 整理入口

| 场景 | 预期行为 |
|------|---------|
| Dream 触发整理 | 委托给 `MemoryConsolidator.dream(turns)` |
| 每 N 轮触发 | 通过 `CognitiveManager` 生命周期事件统一触发 |
| window-close 触发 | 同上 |
| token 预算触发 | 同上 |
