# 架构设计 - Story AG.8

**Story:** 包边界治理 — 消灭跨包相对路径穿透
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 概述

两条工作线：(1) ESLint zones 规则先行（warning），建立回归防线；(2) 存量 123+2 处迁移为 `@originos/core` 包名说明符，全部完成后规则升 error。

## 必做项

### A：lint 规则（先行）

- [ ] **A-1** 在 `.eslintrc.cjs` 的 `import/no-restricted-paths` zones 追加：

```javascript
{
  "target": "./packages/desktop/src",
  "from": "./packages/core/src",
  "message": "禁止 desktop 通过相对路径穿透 core/src，必须使用 @originos/core 包名说明符（AGENTS.md v2.6.3）。",
},
{
  "target": "./packages/web/src",
  "from": "./packages/core/src",
  "message": "禁止 web 通过相对路径穿透 core/src，必须使用 @originos/core 包名说明符（AGENTS.md v2.6.3）。",
},
{
  "target": "./packages/perception-plugins",
  "from": "./packages/core/src",
  "message": "感知插件禁止相对路径穿透 core/src，必须使用 @originos/core 包名说明符。",
},
```

- [ ] **A-2** 在 `scripts/check-architecture-boundaries.cjs` 的 selfTest 中加入正反例：desktop → `../../core/src/...`（invalid）与 `@originos/core/...`（valid）。
- [ ] **A-3** 运行 `pnpm lint:boundaries`，确认存量违规数量与基线一致（此时为 warning，不阻塞）。

### B：存量迁移（机械替换）

- [ ] **B-1** 优先迁移 5 个启动关键文件（spike 验证产物行为）：`setup-data-root.ts`、`main.ts`、`paths.ts`、`agent-worker-runtime-deps.ts`、`local-agent-bridge.ts`。
- [ ] **B-2** `packages/desktop/src/main/services/` 26 个文件批量迁移。改写规则：
  - `from '../../../core/src/<path>'` → `from '@originos/core/<path>'`
  - 层级不同的相对前缀（`../`、`../../` 等）按同规则归一。
- [ ] **B-3** web 侧 2 处 + 测试文件同型导入（`__tests__` 中 45 个文件里的相对 core 导入）随 T2 清理。
- [ ] **B-4** 迁移完成后 zones 由 warning 升 error，更新 AGENTS.md「依赖验证」段落状态。

### C：产物验证

- [ ] **C-1** spike 结论固化到本文档：确认 tsc 将 `@originos/core/...` 说明符编译为产物内相对路径（`paths` 映射生效）或 hoisted 链接可达，二选一给出证据（`dist-electron/.../setup-data-root.js` 的 require 语句）。
- [ ] **C-2** 若 tsc 不重写说明符（保留 `@originos/core/...` 字面量进产物），则确认 Electron 运行时经由 `packages/desktop/node_modules/@originos/core` symlink → exports（`.ts` 源文件）无法加载，需启用 fallback：
  - **Fallback-F1**：`electron-builder.yml` 的 `files` 增加 core 编译产物与 package.json，使运行时 `require('@originos/core/...')` 走 hoisted 链接；或
  - **Fallback-F2**：desktop `tsconfig.json` 增加显式 `paths`，并在 `scripts/desktop-build-files.js` stage 时同步 core 产物。
  - Fallback 选择与证据记录在实施 PR 描述中。

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
