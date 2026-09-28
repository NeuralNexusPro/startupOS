# 包边界说明符拦截设计（AG.8-T1）

## Context

2026-09-28 复核基线：desktop 生产源码 `from` 形态 123 处 / 30 文件（services 26 文件 + `main.ts` 3 处 + `setup-data-root.ts` 1 处），`agent-worker-runtime-deps.ts` 另有 21 处 side-effect import；web 仅测试文件 2 处。desktop 现有 4 处 `@originos/core/...` 导入全部为 `import type`（编译擦除），说明说明符通路尚未被值导入验证过——spike 必须覆盖值导入与 side-effect import 两种新形态。

关键工程事实：

- desktop `tsconfig.json` 已有 `paths`：`"@originos/core": ["../core/src/index.ts"]`、`"@originos/core/*": ["../core/src/*"]`，tsc 编译期解析到 core 源码并按既有产物布局 emit。
- `@originos/core` exports 指向 `./src/*.ts` 源码（源码级包）。若产物保留说明符字面量，Node 运行时 require `.ts` 会失败——这是 TC-4 必须验证的核心风险点。
- `agent-worker-runtime-deps.ts` 的 side-effect import 承担「强制 core 模块 emit 进 dist-electron/core/src」的职责（文件头注释明示），其注释本身需要在迁移时同步更新，避免文档性误导。

## Goals / Non-Goals

目标：让跨包相对导入在 lint 阶段可见（warning 基线），并用 3 个启动关键文件验证说明符通路的产物安全性，为 T2 批量迁移扫清机制不确定性。

非目标：services 批量迁移、测试文件清理、exports 收缩、error 升级（均属 T2 或 AG.9）。

## Decisions

### zones 规则放 `.eslintrc.cjs` 而非独立检查器脚本

`import/no-restricted-paths` 已承载现有 zones（Layer 依赖方向），跨包相对路径是同族规则，放同一处保持单一配置源；`check-architecture-boundaries.cjs` 继续通过 ESLint 执行（而非自行解析 AST），selfTest 以真实 ESLint 运行正反例。新增规则初始为 `warn`，因为存量 123 处尚未迁移，error 会阻塞全部开发。

备选方案：在 `check-architecture-boundaries.cjs` 内手写相对路径解析。放弃原因：与既有 zones 双轨易漂移，且自研路径解析需处理 tsconfig paths/别名组合，正确性成本高于复用插件。

### spike 选这 3 个文件

`setup-data-root.ts`（数据根注入，Electron 启动第一环，1 处值导入）、`main.ts`（进程入口，3 处值导入含 agentManager 单例）、`agent-worker-runtime-deps.ts`（21 处 side-effect import，验证 emit 强制语义在说明符形态下不变）。三者覆盖值导入 + side-effect import + 启动链路；`lib/paths.ts`、`local-agent-bridge.ts` 经 2026-09-28 复核无跨包导入，从 spike 清单移除（Story 早先清单基于估算）。

### 产物验证判据

编译后检查 `dist-electron/desktop/src/main/setup-data-root.js` 的 require 形态：

- 若为产物内相对路径（tsc paths 重写或保持相对）→ 无 Fallback 需求，结论写入 Story architecture.md C-1。
- 若保留 `@originos/core/...` 字面量 → Node 走 pnpm hoisted 链接 require 到 `.ts` 会失败，必须启用 Fallback：F1（electron-builder `files` 纳入 core 编译产物与 package.json）或 F2（desktop tsconfig paths 显式映射 + stage 脚本同步 core 产物）。F1/F2 选择以打包冒烟实测为准，证据记录在实施 PR。

### 不在本 Proposal 内动 exports

迁移目标说明符（如 `@originos/core/lib/paths`）已被现有 exports 通配条目（`./lib/paths`、`./lib/features/*` 等 74 条）覆盖；即使个别深路径未被覆盖，tsc paths 也能编译通过，exports 语义收敛统一交给 AG.9，避免两条战线交叉。

## Risks / Trade-offs

- side-effect import 迁移后 emit 位置变化 → tsc 输出路径由 tsconfig `outDir`/rootDir 决定，与源码说明符无关，理论无影响；TC-3 编译 + TC-4 冒烟兜底。
- warning 存量基线被误读为「已治理」→ 基线数字写入 tasks.md 证据，T2 完成后归零复核。
- Fallback 引入打包脚本改动 → 限定在 F1/F2 预案范围内，不扩散。

## Migration Plan

T1 期间 zones 为 warning，存量违规继续报但不阻塞；spike 3 文件迁移后立即跑双端编译与打包冒烟。回滚 = revert 单 PR。

## 实施边界

本 Proposal 单一工作包，写入范围：`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`packages/desktop/src/main/setup-data-root.ts`、`packages/desktop/src/main/main.ts`、`packages/desktop/src/main/agent-worker-runtime-deps.ts`。T2 范围（services/、测试文件、zones 升级）不得在本 Proposal 内触碰。若产物验证结论需要 Fallback 脚本改动，改动限于 `packages/desktop/scripts/` 与 `electron-builder` 配置的 F1/F2 预案，并在 PR 中单独提交说明。
