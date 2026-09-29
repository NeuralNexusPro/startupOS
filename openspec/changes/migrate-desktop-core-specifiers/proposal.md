# 迁移 desktop 存量跨包相对导入为包名说明符（AG.8-T2）

## Why

Story AG.8-T1（`add-cross-package-specifier-imports`，已归档）建立了跨包说明符边界的拦截防线与启动关键文件 spike，但 desktop 生产源码仍剩 **128 处**跨包相对导入（`from` 形态 119 处 / 27 文件 + 动态 import 9 处），测试文件另有 26 处。这些导入绕过 `@originos/core` 包名说明符边界，使 exports 白名单、依赖方向检查（`lint:boundaries`）对该类导入全部失效（AGENTS.md v2.6.3 禁止事项 #9/#10）。

T1 spike 已消除全部机制不确定性：

- tsc 产物保留 `@originos/core/...` 说明符字面量，打包解析由 Fallback-F1（`prepare-core-runtime.js` staging + electron-builder files 条目）解决，已随 T1 合入并验证（打包冒烟 0 MODULE_NOT_FOUND）。
- 深路径说明符必须与 core `exports` 白名单精确匹配：`@originos/core/lib/features/agent/server`（显式目录入口）合法，`/index` 后缀会 MODULE_NOT_FOUND；`main.ts` 已验证。
- `prepare-core-runtime.js` 按产物真实消费说明符闭集生成 exact exports 并 fail-fast 校验，T2 新增的说明符会自动纳入打包闭集。

本 Proposal 完成剩余迁移，并将拦截规则从 warning 升级为 error，使 AGENTS.md v2.6.3「跨包导入必须使用包名说明符」条款进入强制执行状态。

## What Changes

- **breaking**（源码级）：desktop 27 个服务/主进程文件的 119 处 `from` 形态 + 9 处动态/`typeof import` 形态迁移为 `@originos/core/...` 说明符；desktop 测试 24 处 + web 测试 2 处同型导入一并清理。只改 import 说明符，不改导出符号、运行逻辑与文件位置。
- **不变**：`prepare-core-runtime.js`、`electron-builder.yml`、`.eslintrc.cjs` 的 selector 集合（T1 已就位）；core 源码除一处类型重导出补充外零改动。

## Impact

- 影响范围：`packages/desktop/src/`（main/services 及测试）、`packages/web/src/`（测试）、`packages/core/src/types/index.ts`（重导出补充）、`.eslintrc.cjs`（severity 升级）、`scripts/check-architecture-boundaries.cjs`（checker 与 selfTest 同步）、`AGENTS.md`（依赖验证状态）、Story AG.8 文档。
- 迁移目标涉及 57 个 core 子路径，其中 52 个已被 core `exports` 现有条目覆盖；`types/agent`、`types/perception`、`types/project`、`types/project-creation` 4 个子路径改写为 `@originos/core/types`（符号经 `export *` 可达）；`types/ontology` 的 `OntologyEntity`/`OntologyRelation` 未被 index 重导出，需在 `packages/core/src/types/index.ts` 显式清单中补充（唯一 core 源码改动）。
- 可追溯性：epic-id: AG、story-id: AG.8、task-id: AG.8-T2；来源 Story 文档 `docs/specs/epic-AG/story-AG.8/`。
- Owner：Archersado（编排）/ Claude Code（实施）。

## Capabilities

### 修改的 Capabilities

- `cross-package-specifier-boundary`：新增「存量清零与 error 升级」需求（存量迁移完成后规则 MUST 升为 error 且基线归零），扩展「存量迁移不改行为」到全量存量（T1 仅覆盖启动关键文件 spike）。

## Migration / Compatibility

- 纯说明符改写 + 一处类型重导出补充，无数据/配置迁移；类型解析经 desktop tsconfig `paths`（`@originos/core/*` → `../core/src/*`）不变。
- `types/ontology` 重导出补充是公共 API 面的微扩容（两个既有接口加入显式导出清单），不改变任何符号定义。

## Rollback

单 revert 可回滚（迁移 + severity 升级同一 Proposal）；severity 升级如需独立回退，`.eslintrc.cjs` 单行改回 `warn` 即可，不阻塞其他开发。
