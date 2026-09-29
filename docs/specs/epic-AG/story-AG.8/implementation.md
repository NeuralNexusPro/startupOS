# 实施计划 - Story AG.8

**Story:** 包边界治理 — 消灭跨包相对路径穿透
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-29

---

## Task 划分

每个 Task 一对一创建 OpenSpec Proposal；Task 之间串行（T2 的迁移机制依赖 T1 的 spike 结论）。

### AG.8-T1 — lint 规则 + 启动关键文件 spike（Proposal 1）— **已完成（2026-09-29）**

**交付物（含实施偏离，机制详见 [architecture.md](./architecture.md) A-0/C-2）：**

1. ~~zones 规则~~ → 实施改为 `no-restricted-syntax` 字面量匹配（`.eslintrc.cjs` 5 个 esquery selector，warning）：`import/no-restricted-paths` 按 ESM 解析后物理路径判定，pnpm 链接使合法说明符也解析进 core/src，误报 ~589 条，不可用。拦截语义不变：desktop/web/感知插件相对穿 core/src 全部报出，合法 `@originos/core/...` 零误报。
2. selfTest 43→50 例：新增 side-effect、`import type`、动态 `import()`、`typeof import` 反例（checker 以 error 级镜像同组 selector，`slice(1)` 展开变参 options）。
3. Spike 迁移 3 个启动关键文件（25 处导入，commit 8256af7）：`setup-data-root.ts`、`main.ts`、`agent-worker-runtime-deps.ts`（side-effect 21 处 + 值导入 4 处，文件头注释同步更新，emit 语义实测不变）。
4. 产物解析结论（architecture.md C-1/C-2）：**tsc 保留说明符字面量**；启用 **Fallback-F1** —— 新增 `scripts/prepare-core-runtime.js`（staging `dist-electron/core` → `.packaging/core-runtime`，exports `./src/*.ts` → `./dist/src/*.js` 改写，按产物真实消费的 24 个说明符闭集追加 exact 条目并 24/24 resolve fail-fast），`electron-builder.yml` 增加 `.packaging/core-runtime → node_modules/@originos/core`，`build:app` 挂载 staging。
5. 前置既有缺陷修复 2 处（打包链路暴露，非本 Proposal 引入）：`prepare-web-standalone.js`（isWorkspaceUiPackage 误拒 stage 内 store 条目 → `isPathInside` 守卫）、`verify-ontology-runtime.js`（活句柄挂起 → 成功路径显式 exit）。

**验收：** TC-2/TC-3/TC-4 通过、TC-6 无回退；结果记录见 [testing.md](./testing.md) AG.8-T1 测试结果表。

### AG.8-T2 — services 批量迁移 + error 升级（Proposal 2，依赖 T1）

**已实施（2026-09-29，WP-1 范围：core toolchain 侧）：**

1. `packages/core/src/types/index.ts` ontology 显式重导出列表补入 `OntologyEntity`、`OntologyRelation`（core type-check 0 error），支撑 desktop 将 `types/ontology` 深路径相对导入迁移为 `@originos/core/types` 说明符。
2. `.eslintrc.cjs` `no-restricted-syntax` warning → error，违规 message 更新为强制执行表述（AGENTS.md v2.6.4）；zones 弃用说明注释保留。
3. `scripts/check-architecture-boundaries.cjs` checker 保持 error 级镜像；违规 message 同步更新；selfTest 新增 export 形态穿透用例 + 「正式配置 error 判定」断言（severity === 2、errorCount、message 含 v2.6.4），50 → 51 例。
4. AGENTS.md 版本升 v2.6.4（2026-09-29），「跨包相对路径检查」段落更新为迁移完成、规则 error 强制执行状态。

**WP-2（并行进行中）：** `packages/desktop/src/main/services/` 批量迁移 + 测试文件同型导入清理 + TC-1~TC-6 集成验证（打包冒烟、IPC 回归、基线 grep 清零），在集成阶段交付。

**交付物（原计划）：**

1. `packages/desktop/src/main/services/` 26 个文件批量迁移（约 99 处 from 形态 + 动态 import：`collaboration-service.ts`、`channel-runtime-service.ts`）。
2. 测试文件同型导入清理（desktop 测试 24 处 + web 测试 2 处）。
3. zones 规则 warning → error，更新 AGENTS.md「依赖验证」段落状态。
4. 基线 grep 清零（TC-1）、双端编译（TC-3）、完整打包冒烟（TC-4）、IPC 回归（TC-5）、测试基线（TC-6）。

---

## 基线口径（统一，2026-09-28）

| 形态 | 数量 | 位置 |
|------|------|------|
| `from` 形态（非测试） | 123 处 / 30 文件 | 全部在 desktop（services 26 文件 + main 3 文件 + setup-data-root） |
| side-effect import（非测试） | 21 处 | `agent-worker-runtime-deps.ts` |
| 动态 import / typeof import（非测试） | 数处 | `collaboration-service.ts`、`channel-runtime-service.ts` |
| 测试文件 `from` 形态 | 26 处 | desktop 24 + web 2（scheduler test） |

> 注：Story 早先记录的「web 非测试 2 处」实为测试文件导入，已在本计划中修正口径。

---

## 回滚策略

- 每个 Task 单独 PR，单 revert 可回滚。
- zones 规则 warning 级不影响存量通过状态，revert 无副作用。
- 迁移为纯说明符改写，不涉及数据/配置迁移。
