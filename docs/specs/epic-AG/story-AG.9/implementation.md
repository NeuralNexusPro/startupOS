# 实施记录 - Story AG.9

**Story:** core 包治理 — 公共 API 收缩与定位如实化
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-29

---

## 实施概况

**OpenSpec Proposal:** `govern-core-public-api`（分支 `proposal/govern-core-public-api`，AG.9 全项作为单一交付单元）
**实施周期:** 2026-09-29（Proposal 起草 + WP-1 + WP-2 单日完成）
**实施方式:** 编排角色（Archersado/Claude Code 编排）+ 2 个 subagent 工作包，独立 task worktree

## 基线（2026-09-29 实测，@ 3d1d4c8）

Story 文档记载与实测的差异（以实测为准，Story 文档已同步修正）：

| 项 | Story 记载 | 实测 |
|----|-----------|------|
| exports | 84 条 / ~40 通配 | 74 条 / 52 通配 / 22 显式 |
| 深路径说明符 | 243+ 处 | 243+ 处 / 120 唯一（补充唯一数口径） |
| 严格 Node 语义解析 | 未测 | 97/120 可解析，23 条靠宽松解析存活 |
| jsx 副本 | 7 组 14 文件 | 11 文件（漏计 system 4 个） |
| web 壳 | culture 3 文件 + ontology-data-store 1 | culture 2 壳 + ontology-data-store 1 + 同型 json-store 壳 1（新增发现） |

## Task 划分与完成情况

### WP-1（task worktree `startupos-govern-core-public-api-task-1`，分支 `proposal-task/govern-core-public-api-1-core`）

| 项 | 内容 | commit |
|----|------|--------|
| 2.1 | `scripts/expand-core-exports.cjs`（526 行，expand/--dry-run/--verify 三模式） | 8630f6b |
| 2.2 | exports 4 批展开：features → integrations → modules → shared/hooks/storage，每批 verify + 双端编译 + F1 staging | 8630f6b / b907e15 / 726803e / db49190 |
| 2.3 | 门面补齐：新建 `lib/integrations/electron/index.ts`（六模块显式重导出）；ontology 补 `ontologyStorage`；agent 补 2 类型 | c40c0c8 |
| 4.1 | `packages/core/README.md`（定位如实化）+ AGENTS.md core 树 2 处修正 | 314df17 |

### WP-2（task worktree `startupos-govern-core-public-api-task-2`，分支 `proposal-task/govern-core-public-api-2-callers`）

| 项 | 内容 | commit |
|----|------|--------|
| 3.1 | 热点深路径迁门面（electron env 22 + ipc-protocol 26、culture 10+、pi-agent/task-runtime 10）；/index 归一 5 处 | 5dbbea0 |
| — | `useCultureDetection.ts` 补 `'use client'`（门面化把 client hook 带进 server route 图的必要修复，超出 WP-2 声明范围已披露） | 277434e |
| 3.2 | 删除 11 jsx + web 壳 4 文件；13 处消费改 `@originos/core/...` | 9414f47 |
| 3.3 | verify 收口：135→132 条（收敛删除 2 个失去消费者条目、合并 3 个 /index 重复键、1 个更名） | （随 5dbbea0 工具运行） |
| — | tasks.md 3.1–3.3 证据回写 | 380ebb8 |

## 关键实施事实

1. **exports 终态：132 条显式 / 0 通配**（展开峰值 135，门面迁移后按 D1 规则收敛）。F1 staging 自动兼容：`prepare-core-runtime.js` staged 132 entries / 67 consumed verified，打包 asar 内 exports 全显式。
2. **23 条严格解析失败说明符全部修复**：根因两类（通配目标指向不存在文件 / tie-break 错配），精确条目展开后全部可 `require.resolve`。
3. **agent 值符号门面化回退**：`agentManager`/`persistentAgentManager`/`handleSkillEvolution` 进门面实测引入新环（12→14），回退为仅类型重导出；消费方暂走 `lib/features/agent/server` 深路径显式条目（过渡态，AG.11 收口）。
4. **10 个 feature 无 types.ts**：`<feature>/types` 条目按规约回退指向 feature 门面 index.ts（expand 脚本 note 注明）；agent 特例指向共享 `src/types/agent.ts`。
5. **唯一 MultiAgentLauncher.tsx 条目**保留为显式条目（exports 通配中唯一 .tsx 目标）。

## 文件级改动范围

- `packages/core/package.json`（exports 74→132）
- `scripts/expand-core-exports.cjs`（新增，526 行）
- `packages/core/src/lib/integrations/electron/index.ts`（新增门面，117 行）
- `packages/core/src/lib/features/{ontology,agent}/index.ts`（补导出）
- `packages/core/src/lib/features/culture/hooks/useCultureDetection.ts`（'use client'）
- `packages/core/src/**/*.jsx`（删 11 个）
- `packages/web/src/`（37+ 文件导入收口、4 处测试/动态导入改说明符、壳 4 文件删除）
- `packages/desktop/src/`（导入收口 + /index 归一）
- `packages/core/README.md`（新增）、`AGENTS.md`（core 树 2 处）

## 迁移 / 兼容策略

无数据/配置迁移。exports 显式化对下游透明（tsc paths / transpilePackages / F1 staging 三条解析通路均验证不变）。深路径白名单保留为过渡态（FR-2），AG.11 继续按热度消化。

## 审查要点

- expand 脚本的通配删除范围（只删匹配消费说明符的通配）与悬空条目防御
- 门面 re-export 均为显式（无 `export *` 整目录），madge 零新增环
- `use client` 补丁的唯一性（仅 culture hook 一处）

## 回滚风险

单 revert 链可回滚（task 分支线性，全部 commit 在 Proposal 分支内）；exports 回滚需同步回滚调用方迁移（同 Proposal 内原子）；jsx/壳删除不可逆恢复（git 历史可追溯）。

## 集成与回归

见 [testing.md](./testing.md) 测试结果表（TC-1 ~ TC-7 全过）。Task 分支集成：WP-2 分支 fast-forward 合并入 `proposal/govern-core-public-api`（@ 380ebb8）。
