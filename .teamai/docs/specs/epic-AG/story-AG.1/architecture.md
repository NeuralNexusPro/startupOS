# 架构设计 - Story AG.1

**Story:** 死代码与死路径清理
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 概述

本 Story 聚焦**纯删除 / 纯解绑**操作，不引入新依赖、不重组目录、不动业务语义，是后续 Story 的"清场"。

---

## 必做项（A：死路径）

- [ ] **A-1** 修复 `src/modules/collaboration-runtime/engine/agent-context-writer.ts:6` — 当前 `export ... from "@/lib/collaboration-runtime-bridge/project-context-writer"`，但 `src/lib/collaboration-runtime-bridge/` 目录已删除（由 Story 9.27 ARCH-RT-09 完成）。
  - 验证：`ls src/lib/collaboration-runtime-bridge/` → "No such file or directory"
  - 处理：grep 全仓引用方 `ProjectContextWriter / ProjectContextData / ProjectContextSummary`；
    - 若有引用 → 在 `src/modules/collaboration-runtime/engine/` 内部寻找替代实现（应该已经存在），改为本地 import；
    - 若无引用 → 整体删除该 re-export。

---

## 必做项（B：deprecated 服务壳）

- [ ] **B-1** 评估 `src/lib/collaboration-runtime-service/` 整体清理路径：
  - 当前 `index.ts` 仅 `export * from "@/modules/collaboration-runtime/facade"`，注释为 `@deprecated Story 9.38`
  - 该目录其余文件（如 `runtime-agent-registry.ts`）若存在 → 单独评估
  - 处理选项：
    - **B-1-a（推荐）**：grep 仓库所有 `from "@/lib/collaboration-runtime-service"` 引用方；逐个改为 `@/modules/collaboration-runtime/facade`；删除 `src/lib/collaboration-runtime-service/` 目录
    - **B-1-b（保守）**：保留壳但加 ESLint `no-restricted-imports` 警告（在 AG.5 实施时统一处理）；本 Story 仅删除其内部已无意义的实现文件
  - 默认采用 B-1-a；仅当某个 API route 因 SSR 限制无法直接 import module 时降级到 B-1-b。

---

## 必做项（C：孤立组件 / dead exports）

- [ ] **C-1** 确认 `src/components/organisms/CommandInterface.tsx` 是否存在引用方：
  - `grep -rn "CommandInterface" src/` → 若仅在 `organisms/index.ts` 内部出现 → 整体删除（含 `index.ts` 的导出条目和目录）
  - 若有引用 → 暂保留，转给 AG.4 在组件分层修订时处理
- [ ] **C-2** 跑一次 `npx ts-prune --error` 或 `npx knip` 收集当前未使用的 export 列表，识别其中明显的"已废弃但未删"的条目（不在本 Story 全面清理，仅清理与 Epic 9 / Epic C 治理相关的部分；其他留待 AG.5 接 CI）。
- [ ] **C-3** 确认 `src/components/molecules/{ChatInput,MessageList}.tsx` 是否仍被 `@/components/os/**` 或 skills/solution 等业务域组件引用：
  - 若引用方仅 1 处 → 留待 AG.4 决策（可能下沉到使用方业务域目录）
  - 若多处引用 → 视为 "ad-hoc 共享组件"，保留并在 AG.4 决策（移入 `ui/` 或保留 `molecules/`）
  - 本 Story 不做实际移动，仅在文档中标注现状

---

## 必做项（D：构建与测试基线）

- [ ] **D-1** 删除完成后跑 `npx tsc --noEmit`，0 error
- [ ] **D-2** 跑 `npm test`（或 `npm run test:unit`），通过率不低于本 Story 开始前的基线
- [ ] **D-3** 跑 `npm run lint`，新增 error 数 = 0（既有的 200+ error 不在本 Story 修复范围）

---

## 技术细节

### 关键扫描命令

```bash
# 死路径检测
grep -rn "@/lib/collaboration-runtime-bridge" src/ docs/
grep -rn "@/lib/collaboration-runtime-service" src/

# 孤立组件检测
grep -rn "CommandInterface" src/
grep -rn "from .*\bmolecules" src/
grep -rn "from .*\borganisms" src/

# 全局 ts-prune（可选，作为后续 AG.5 的输入）
npx ts-prune --project tsconfig.json | grep -v "(used in module)"
```

### 涉及文件（预期变更清单）

| 文件 | 操作 |
|------|------|
| `src/modules/collaboration-runtime/engine/agent-context-writer.ts` | 删除死 re-export 或改本地 import |
| `src/lib/collaboration-runtime-service/index.ts` | 删除（B-1-a）或保留（B-1-b） |
| `src/lib/collaboration-runtime-service/` 整目录 | 删除（B-1-a） |
| `src/components/organisms/CommandInterface.tsx` | 视引用情况删除或保留 |
| `src/components/organisms/index.ts` | 删除对应导出（若 CommandInterface 删了） |
| 引用方（API routes / agent-* 目录等） | 改 import 路径到 `@/modules/collaboration-runtime/facade` |
