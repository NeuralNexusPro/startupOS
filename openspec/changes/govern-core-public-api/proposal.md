# core 公共 API 收缩与定位如实化（AG.9）

## Why

core 的公共 API 当前名存实亡（2026-09-29 实测，refactor/arch-governance @ 3d1d4c8）：

| 事实 | 实测值 | Story 文档记载 | 说明 |
|------|--------|--------------|------|
| exports 总条目 / 通配条目 | 74 / 52 | 84 / ~40 | 以实测为准 |
| 唯一深路径说明符（web+desktop 非测试） | 120 个（243+ 处导入） | 243+ 处 | 处数一致，补充唯一数口径 |
| 严格 Node exports 语义可解析 | 97/120 | 未测 | **23 条仅靠 webpack 宽松解析（web）或 F1 staging exact entries（desktop 打包）存活** |
| jsx 无类型副本 | 11 文件（7 组 collaboration-runtime/ui + 4 文件 lib/features/system） | 7 组 14 文件 | Story 漏计 system 下 4 个（errors 2 + performance 2）；全部有 .tsx 对应、全仓零引用 |
| web re-export 壳 | culture 2 + ontology-data-store 1 + storage/json-store 1 | culture 3 文件 + ontology-data-store 1 | Story 的 culture「3 文件」实为 2 壳 + 1 处测试引用；另发现同型 json-store 壳 |

AG.8 完成后，web/desktop 全部跨包导入已走 `@originos/core/...` 说明符单一形态，收缩 exports 的前提就绪。本 Proposal 落实 Story AG.9 的四个必做项：通配符显式化（A）、门面补齐与深路径收口（B）、定位如实化（C）、死代码清理（D）。

## What Changes

- **breaking**（包边界级）：`packages/core/package.json` exports 的 52 条通配全部删除，替换为「消费闭集驱动的文件级显式白名单」（机械展开，逐条 `require.resolve` 验证）；23 条仅靠宽松解析存活的说明符随展开获得指向真实文件的条目，严格 Node 语义解析率从 97/120 提升到 120/120。
- **breaking**（导入说明符级）：调用方深路径导入收口到 feature/integration/module 门面（热点优先）；5 处 T1-legacy `/index` 后缀遗留归一为裸形式；白名单经 `expand-core-exports.cjs --verify` 再生成，未消费条目按规则保留（feature 门面 + types 为强制下限）。
- **新增**：`scripts/expand-core-exports.cjs`（expand / --verify 两模式，机械展开 + 硬门禁校验）；`packages/core/README.md`（定位如实化）。
- **删除**：11 个 .jsx 副本；`packages/web/src/lib/features/culture/`、`packages/web/src/lib/features/ontology-data-store/`、`packages/web/src/lib/storage/json-store.ts` 壳文件（json-store 为实测新增的同型壳，Story FR-5 未列出）。
- **文档**：AGENTS.md core 段落如实化；Story AG.9 testing.md TC-2 阈值修正（见 design D2，需用户在批准时确认）。

## Impact

- 影响范围：`packages/core/package.json`、`packages/core/src/`（门面 index 补充、jsx 删除）、`scripts/expand-core-exports.cjs`（新增）、`packages/web/src/`（导入收口 + 壳删除 + 2 个测试文件引用更新）、`packages/desktop/src/`（导入收口 + `/index` 归一）、`packages/core/README.md`（新增）、`AGENTS.md`、Story AG.9 文档。
- 不变：`prepare-core-runtime.js` 与 `electron-builder.yml`（F1 staging 的 exact entries 机制自动兼容显式 exports，`rewriteExports` 按任意显式条目改写 `./src/*.ts` → `./dist/src/*.js`）；desktop tsc `paths` 与 web transpilePackages 解析通路。
- 可追溯性：epic-id: AG、story-id: AG.9、task-id: AG.9-T1（Story 无 Task 拆分，A–D 四项作为单一交付单元）；来源 Story 文档 `docs/specs/epic-AG/story-AG.9/`。
- Owner：Archersado（编排）/ Claude Code（实施）。

## Capabilities

### 新增的 Capabilities

- `core-exports-whitelist`：core exports 显式白名单规约——零通配、消费集精确命中、门面下限、展开工具门禁与死代码清零。
