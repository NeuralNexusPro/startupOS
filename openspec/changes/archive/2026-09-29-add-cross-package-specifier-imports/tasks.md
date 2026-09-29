# AG.8-T1 实施工作包

本 Proposal 唯一对应 Story AG.8-T1。以下编号是内部工作包，不是新增可独立交付的 Story Task。

## 1. lint 防线

- [x] 1.1 串行；依赖设计批准。编排角色核对基线（grep 实测：desktop 非测试 `from` 形态 123 处 / 30 文件，side-effect 21 处于 `agent-worker-runtime-deps.ts`；web 生产源码 0、仅测试文件 2 处），建立 Proposal integration branch `proposal/add-cross-package-specifier-imports` 与 subagent Task worktree。证据：分支 `proposal-task/add-cross-package-specifier-imports-1-toolchain`（a3ca994）与 `-2-core`（8256af7）。
- [x] 1.2 串行，依赖 1.1。工具链 subagent 落地拦截（**机制偏离见 design.md：zones 因 ~589 误报被弃，改用 `no-restricted-syntax` 字面量匹配 5 selector，warning**）；selfTest 43→50 例（含 side-effect / import type / 动态 import / typeof import 反例）。证据：`node scripts/check-architecture-boundaries.cjs --self-test` 50/50 通过；`pnpm lint:boundaries` 真实违规 128（迁移后口径），零误报。
- [x] 1.3 串行，依赖 1.2。核心 subagent 迁移 spike 文件：`setup-data-root.ts`、`main.ts`、`agent-worker-runtime-deps.ts`（25 处导入 → `@originos/core/...`，文件头注释同步更新）；不改导出符号与逻辑。证据：commit 8256af7，`pnpm --filter @originos/desktop build` 0 error；`main.ts` 使用 `@originos/core/lib/features/agent/server`（显式目录入口，实测 `/index` 后缀会 MODULE_NOT_FOUND）。

## 2. 产物验证

- [x] 2.1 串行，依赖 1.3。打包实测：**tsc 保留说明符字面量**（`dist-electron/desktop/src/main/setup-data-root.js:1` = `require("@originos/core/lib/paths")`），启用 F1：新增 `scripts/prepare-core-runtime.js`（staging dist-electron/core + 运行时 exports 改写 + 24 个真实消费说明符闭集 exact 条目 + 24/24 resolve fail-fast），`electron-builder.yml` 增加 `.packaging/core-runtime → node_modules/@originos/core`，`build:app` 挂载 staging 步骤。**TC-4 完整通过**：`build:app` 端到端 0 退出（含两个前置既有脚本缺陷修复：`prepare-web-standalone.js` isWorkspaceUiPackage 误拒、`verify-ontology-runtime.js` 挂起不退出），`verify-ontology-runtime.js` 开发态全项 ok。desktop 测试 6 失败经对照未改动主 workspace 确认为存量（email-provisioning ×5、verify-windows-package ×1），非本 Proposal 回退。
- [x] 2.2 串行，依赖 2.1。spike 结论（tsc 不重写说明符、exports 通配 15/24 错配、F1 选择与证据）已同步回 Story AG.8 architecture.md A-0/C-1/C-2 与 implementation.md；warning 基线 128 留档。`openspec validate add-cross-package-specifier-imports --strict` 于 3.1 集成后随文档更新复跑（见 3.1 证据）。

## 3. 集成与验收

- [x] 3.1 串行，依赖 2.2。Task 分支已合并回 Proposal integration branch（2f87b7c、ab1aa88，无冲突）；TC-2/TC-3 通过、TC-4 完整通过（含 electron-builder `--dir`）；`pnpm lint` 无新增 error、`pnpm lint:boundaries` 基线 128、self-test 50/50、desktop 测试无新增失败。文档回写（design/tasks/Story）后复跑 `openspec validate add-cross-package-specifier-imports --strict` 通过。证据见 Story AG.8 testing.md TC-4 记录。
- [ ] 3.2 串行，依赖 3.1。编排角色将 Proposal 分支合入发布线（需用户授权），清理本任务 worktree（确认成果已保存且无人使用）；Story AG.8 README 状态更新。证据：合并提交哈希与清理清单。
