# 包边界治理：跨包说明符拦截规则与启动关键文件迁移（AG.8-T1）

## Why

`packages/desktop/src` 存在大量通过相对路径直插 core 内部实现的导入（如 `from '../../../core/src/lib/paths'`）。这绕过了 `@originos/core` 的包边界——`package.json` exports 白名单与依赖方向检查对这类导入全部失效，`AGENTS.md` v2.6.3 禁止事项 #9/#10 因此名存实亡。desktop 能运行纯属 tsc 产物目录结构巧合（`dist-electron/` 内相对路径恰好映射到 `dist-electron/core/src/`），并非受控的包依赖。

## 可追溯信息

- epic-id: AG
- story-id: AG.8
- task-id: AG.8-T1
- owner: 架构治理 / desktop 维护者（实施负责人待分配）
- 来源: [Story AG.8](../../../docs/specs/epic-AG/story-AG.8/README.md)

## What Changes

- `.eslintrc.cjs` 的 `import/no-restricted-paths` zones 新增 3 条规则：`packages/desktop/src`、`packages/web/src`、`packages/perception-plugins` 中解析到 `packages/core/src` 的相对导入报 **warning**（T1 阶段；T2 迁移完成后升 error）。
- `scripts/check-architecture-boundaries.cjs` selfTest 补正反例：desktop 相对路径穿 core（invalid，覆盖 `from` / side-effect / `import type` 三形态）、`@originos/core/...` 包名说明符（valid）。
- Spike 迁移 3 个含违规的启动关键文件为 `@originos/core/...` 包名说明符（约 25 处）：`setup-data-root.ts`（1）、`main.ts`（3）、`agent-worker-runtime-deps.ts`（21 处 side-effect import）。
- 产物解析结论固化到 Story architecture.md：确认 tsc `paths`（`"@originos/core/*": ["../core/src/*"]`）使说明符在编译期解析、产物 require 形态；若产物保留说明符字面量且 Node 无法加载（exports 指向 `.ts` 源码），按 Story 预案选择 Fallback-F1（electron-builder files 补 core 产物）或 F2（stage 脚本同步 core 产物）并留证。

## Capabilities

### New Capabilities

- `cross-package-specifier-boundary`: 下游包对 core 的导入必须使用包名说明符的静态边界契约，覆盖 lint zones 拦截、自测正反例、warning→error 升级时机与产物解析验证。

### Modified Capabilities

无。`monorepo-boundary-lint` 既有能力（现行依赖方向、可信扫描与可运行验收）保持不变；本能力是其上叠加的跨包说明符专项规则，不修改既有 zones 的判定语义。

## Impact

涉及 `packages/desktop/src/main/`（3 个启动关键文件）、`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`。迁移只改 import 说明符，不改任何导出符号、运行逻辑与文件位置；禁止复制 core 代码到 desktop。desktop `tsconfig.json` 已有 `paths` 映射，编译期解析路径不变。运行时影响集中在 Electron 打包产物模块解析，由 TC-4 打包冒烟验证。web 与感知插件本 Task 零代码改动（仅 lint 规则覆盖）。

## 非目标

不迁移 `services/` 下 26 个文件的存量导入（AG.8-T2 职责）；不清理测试文件中的同型导入（T2 随迁）；不新增 core `exports` 白名单条目（AG.9 职责）；不升级 warning 为 error（T2 迁移完成后执行）；不修改 `@originos/core` 的 exports 定义与包结构。

## 依赖与上线

依赖无（本 Proposal 是 AG.9 exports 收缩的前置）。实施顺序：先 zones + selfTest（防线先行），再 spike 迁移，最后产物验证。`pnpm lint`（warning 级架构规则）与 `lint:boundaries` 在本 Task 期间允许存量 warning 存在，以基线留档为验收口径，不通过 allowlist 隐藏。上线即合入发布线，无灰度需求；`desktop:dev` 与打包冒烟通过后生效。

## 回滚

zones 规则为 warning 级，revert 单 PR 即可完全回滚，无数据/配置迁移。spike 迁移的 3 个文件若打包冒烟失败，revert 后恢复相对导入即可（产物目录巧合仍有效）；Fallback 决策与证据记录在实施 PR 描述中，保证回滚路径明确。
