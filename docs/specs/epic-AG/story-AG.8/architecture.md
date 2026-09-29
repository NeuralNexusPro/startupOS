# 架构设计 - Story AG.8

**Story:** 包边界治理 — 消灭跨包相对路径穿透
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 概述

两条工作线：(1) ESLint zones 规则先行（warning），建立回归防线；(2) 存量 123+2 处迁移为 `@originos/core` 包名说明符，全部完成后规则升 error。

## 必做项

### A：lint 规则（先行）— 已实施，机制有偏离（见 A-0）

- [x] **A-0（偏离记录）** 实施时放弃 `import/no-restricted-paths` zones 方案：该规则按 **ESM 解析后的物理路径** 判定，而 pnpm workspace 链接使合法的 `@originos/core/...` 说明符也解析进 `core/src`，产生约 589 条误报（740 总诊断 = 151 真实违规 + 589 误报）。改用 `no-restricted-syntax` 字面量匹配（5 个 esquery selector，覆盖 ImportDeclaration / ImportExpression / ExportNamedDeclaration / ExportAllDeclaration / TSImportType，severity=warning，零误报）；`scripts/check-architecture-boundaries.cjs` checker 以 error 级镜像同组 selector（`slice(1)` 展开全部 options），selfTest 43→50 例（新增 side-effect import、`import type`、动态 `import()`、`typeof import` 反例）。
- [x] **A-1** 拦截规则已落地（形式如上，非 zones）。
- [x] **A-2** selfTest 正反例已加入并通过（`--self-test` 50/50）。
- [x] **A-3** `pnpm lint:boundaries` 基线确认：迁移后真实违规 128（123 desktop import + 21 side-effect + 8 dynamic + 1 typeof 折算口径见 implementation.md）；web 生产源码 0。

### B：存量迁移（机械替换）

- [x] **B-1** 启动关键文件 spike：已迁移 3 个（`setup-data-root.ts`、`main.ts`、`agent-worker-runtime-deps.ts`，共 25 处导入）；`paths.ts` 是 core 自身文件、`local-agent-bridge.ts` 实测无跨包相对导入，均无需迁移。
- [ ] **B-2** 其余 desktop 非测试存量（迁移后 128）随 T2 批量清理。
- [ ] **B-3** web 测试文件同型导入随 T2 清理。
- [ ] **B-4** 迁移完成后规则由 warning 升 error，更新 AGENTS.md「依赖验证」段落状态。

### C：产物验证 — 结论已固化

- [x] **C-1** spike 结论：**tsc 不重写说明符**。desktop tsconfig 的 `paths` 仅服务类型解析，`tsc -p tsconfig.json` 产物 JS 中保留 `require("@originos/core/...")` 字面量（证据：`dist-electron/desktop/src/main/setup-data-root.js` 第 1 行 `require("@originos/core/lib/paths")`）。开发态可运行是因为 pnpm symlink 指向源码级 packages/core（exports 指向 `.ts`，经运行时 loader/tsx 链路解析）。
- [x] **C-2** Fallback 选择：**F1（打包期 staging）**，证据链：
  - `electron-builder.yml` 原无 `@originos/core` 条目，打包产物中不存在该包 → 打包态 `require('@originos/core/…')` 必然 `MODULE_NOT_FOUND`。
  - 新增 `scripts/prepare-core-runtime.js`：将 `dist-electron/core`（desktop tsc 的副产物，含 core 编译 JS）镜像到 `.packaging/core-runtime`，生成运行时 `package.json`：`main`/`exports` 的 `./src/*.ts` 改写为 `./dist/src/*.js`；并按 **dist-electron 产物真实 require 的 24 个 `@originos/core/...` 说明符闭集** 追加 exact exports 条目（覆盖通配形态错配：源 exports 的 `*/index.ts` 形状通配指向不存在的 index，真实文件是平铺 `.ts`，如 `cognitive/knowledge-provider.ts`）。脚本内建 fail-fast：24/24 说明符必须经 staged exports `resolve` 成功，否则退出非零。
  - `electron-builder.yml` `files` 增加 `from: .packaging/core-runtime → to: node_modules/@originos/core`；`build:app` 在 `pnpm build`（desktop tsc）之后、`verify-ontology-runtime.js` 之前挂载 staging 步骤。
  - 消费说明符闭集来自全量 grep dist-electron 产物（24 个唯一值），动态计算 import 目前不存在；若未来出现，启动期 require 失败会显式暴露（fallback 边界记录于此）。

## 技术细节

### 基线命令（2026-09-28 快照）

```
desktop 非测试：123 处 import / 31 文件（分布：lib/features 42、lib/integrations 37、
modules/perception-runtime 11、lib/paths 8、modules/channel-runtime 7、types/* 9、
modules/collaboration-runtime 3）
web 非测试：2 处
含测试共：147 处 / 45 文件
```

### 迁移后的预期形态

```typescript
// packages/desktop/src/main/setup-data-root.ts
import { setElectronDataRoot, setMonorepoRoot } from '@originos/core/lib/paths';
```

### 已知不需要迁移的特例

- `packages/desktop/src/main/main.ts` 中 `electron_1.app.setAppUserModelId('com.originos.ce')` 等字符串字面量含 "originos" 不属于导入。
- `agent-worker.mts`（tsconfig include 中的 core 文件）是 core 模块自身的沙箱 worker，不迁移。

## 涉及文件清单

实施时以基线命令实时输出为准；AG.8-T1/T2 的 PR 描述必须附 grep 前后对比。
