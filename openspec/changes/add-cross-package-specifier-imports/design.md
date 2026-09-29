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

### zones 规则放 `.eslintrc.cjs` 而非独立检查器脚本（实施偏离：zones 不可行）

原计划用 `import/no-restricted-paths` zones。实施时发现该规则按 **ESM 解析后的物理路径** 判定违规：pnpm workspace 使合法的 `@originos/core/...` 说明符也解析进 `core/src`，产生约 589 条误报（740 总诊断 = 151 真实 + 589 误报），无法以「合法说明符白名单」收敛（每加一条白名单就是一个新的维护面）。

实际落地：`no-restricted-syntax` 字面量匹配——5 个 esquery selector 匹配 `source.value` 中含 `core/src` 路径段的字面量（ImportDeclaration / ImportExpression / ExportNamedDeclaration / ExportAllDeclaration / TSImportType），severity=warning，零误报；天然覆盖 side-effect import、`import type`、动态 `import()`、`typeof import` 全部语法形态。`check-architecture-boundaries.cjs` checker 以 error 级镜像同组 selector（注意 ESLint rule options 是 `[severity, ...options]` 变参形态，须 `slice(1)` 展开全部 selector），selfTest 43→50 例（新增 side-effect / import-type / 动态 import / typeof import 反例）。保留「单一配置源」初衷：检查器与 `.eslintrc.cjs` 同组 selector 镜像，PR 内注明同步义务。

备选方案：在 `check-architecture-boundaries.cjs` 内手写相对路径解析。放弃原因：与既有 zones 双轨易漂移，且自研路径解析需处理 tsconfig paths/别名组合，正确性成本高于复用插件。

### spike 选这 3 个文件

`setup-data-root.ts`（数据根注入，Electron 启动第一环，1 处值导入）、`main.ts`（进程入口，3 处值导入含 agentManager 单例）、`agent-worker-runtime-deps.ts`（21 处 side-effect import，验证 emit 强制语义在说明符形态下不变）。三者覆盖值导入 + side-effect import + 启动链路；`lib/paths.ts`、`local-agent-bridge.ts` 经 2026-09-28 复核无跨包导入，从 spike 清单移除（Story 早先清单基于估算）。

### 产物验证判据（结论已固化，Fallback-F1 落地）

编译后检查 `dist-electron/desktop/src/main/setup-data-root.js` 的 require 形态。实测：**tsc 保留 `@originos/core/...` 字面量**（desktop tsconfig `paths` 仅服务类型解析，不重写 emit），Node 打包态 require `.ts` 必然失败，启用 **F1**：

- `scripts/prepare-core-runtime.js`（新增）：把 desktop tsc 的副产物 `dist-electron/core` 镜像到 `.packaging/core-runtime`，生成运行时 `package.json`（`main`/`exports` 的 `./src/*.ts` → `./dist/src/*.js`），并按 dist-electron 产物真实 require 的 24 个 `@originos/core/...` 说明符闭集追加 exact exports 条目——源 exports 的 `*/index.ts` 形状通配与真实平铺文件（如 `cognitive/knowledge-provider.ts`）错配，若照抄则 24 个中 15 个在打包态不可解析（staging 冒烟实测）。脚本 fail-fast：24/24 说明符必须经 staged exports `resolve` 成功。
- `electron-builder.yml` `files` 增加 `.packaging/core-runtime → node_modules/@originos/core`；`build:app` 在 desktop tsc 之后挂载 staging。
- 只做解析级校验、不做模块执行冒烟：核心运行时模块持有活句柄（spawner watch、agent pool），全量 require 会挂起事件循环（`verify-ontology-runtime.js` 的挂起已实测并修复为其显式 `process.exit(0)`）；打包完整冒烟由 electron-builder `--dir` + 启动检查承担。
- F2（tsconfig 显式 paths + stage 同步）放弃：tsc paths 不重写产物，F2 无法解决打包态解析，只有 staging 能让说明符在产物内可解析。

附带修复的两个**前置既有缺陷**（与本 Proposal 无因果，打包链路实测暴露，单独提交）：
- `prepare-web-standalone.js`：pnpm store 条目被 stage 进 `.packaging` 后落在 desktop workspace 路径内，`isWorkspaceUiPackage` 前缀判定误拒 hoisting，导致 `next.js` 断言失败 → 增加 `isPathInside(realSource, target)` 守卫。
- `verify-ontology-runtime.js`：全部校验通过后事件循环被运行时活句柄挂住不退出（未改动主 workspace 可复现）→ 成功路径显式 `process.exit(0)`。

## Risks / Trade-offs

- side-effect import 迁移后 emit 位置变化 → tsc 输出路径由 tsconfig `outDir`/rootDir 决定，与源码说明符无关，理论无影响；TC-3 编译 + TC-4 冒烟兜底。
- warning 存量基线被误读为「已治理」→ 基线数字写入 tasks.md 证据，T2 完成后归零复核。
- Fallback 引入打包脚本改动 → 限定在 F1/F2 预案范围内，不扩散。

## Migration Plan

T1 期间 zones 为 warning，存量违规继续报但不阻塞；spike 3 文件迁移后立即跑双端编译与打包冒烟。回滚 = revert 单 PR。

## 实施边界

本 Proposal 单一工作包，写入范围：`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`packages/desktop/src/main/setup-data-root.ts`、`packages/desktop/src/main/main.ts`、`packages/desktop/src/main/agent-worker-runtime-deps.ts`。T2 范围（services/、测试文件、zones 升级）不得在本 Proposal 内触碰。若产物验证结论需要 Fallback 脚本改动，改动限于 `packages/desktop/scripts/` 与 `electron-builder` 配置的 F1/F2 预案，并在 PR 中单独提交说明。
