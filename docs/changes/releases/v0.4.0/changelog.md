# Changelog - v0.4.0

---

## 2026-09-29 — feat：AG.9 core 公共 API 收缩与定位如实化（Story AG.9 完成）

**类型**：feat
**影响模块**：`packages/core/package.json`、`scripts/expand-core-exports.cjs`、`packages/core/src/`、`packages/web/src/`、`packages/desktop/src/`、`packages/core/README.md`、`AGENTS.md`、`docs/specs/epic-AG/story-AG.9/`、`openspec/`（spec `core-exports-whitelist` 新增）
**摘要**：Proposal `govern-core-public-api`（已归档）实施 core 公共 API 收缩：exports 74 条/52 通配 → 132 条显式 / 0 通配（新增 `expand-core-exports.cjs --verify` 门禁）；新建 electron 门面并迁移 electron/culture/pi-agent-task-runtime 热点深路径导入；删除 11 个 jsx 副本与 web 壳 4 文件；`packages/core/README.md` 定位如实化（共享 TS 运行时，exports 白名单即公共 API）。TC-1~TC-7 全过，测试基线零 delta。


## 2026-09-28 — docs：架构围栏治理与 Epic AG Story 追加（AG.8–AG.11）

**类型**：docs
**影响模块**：`AGENTS.md`（v2.5.8 → v2.6.3）、`CLAUDE.md`（改为指针文件）、`docs/specs/epic-AG/`
**摘要**：架构审视后完成规约围栏治理：确立 AGENTS.md 为单一事实源，CLAUDE.md 变为工具兼容指针；AGENTS.md 补入多 Agent 协作运行时章节（facade/ui 组装豁免取代「不 import 外部模块」声明）、跨包导入必须使用包名说明符条款、协作运行时性能指标、数据根解析规则与实际 data 子目录；技术栈表补入 Monorepo/Electron。新增 4 个治理 Story：AG.8 包边界治理（125 处跨包相对路径 + lint zones）、AG.9 core 公共 API 收缩（exports 通配符 84→显式白名单 + jsx 副本清理）、AG.10 巨型文件拆分（7 文件）、AG.11 重复与死代码嗅探（knip 基线 + 双文档树处置）。

---

## 2026-09-29 — feat：AG.8-T1 跨包说明符边界（lint 拦截 + 启动文件 spike + F1 打包 staging）

**类型**：feat
**影响模块**：`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`packages/desktop/src/main/{setup-data-root,main,agent-worker-runtime-deps}.ts`、`packages/desktop/scripts/{prepare-core-runtime,prepare-web-standalone,verify-ontology-runtime}.js`、`packages/desktop/{package.json,electron-builder.yml}`、`docs/specs/epic-AG/story-AG.8/`、`openspec/changes/add-cross-package-specifier-imports/`
**摘要**：AG.8-T1 落地跨包说明符边界（Proposal `add-cross-package-specifier-imports`，已合并 refactor/arch-governance）。拦截机制放弃 `import/no-restricted-paths` zones（pnpm 链接下物理路径判定误报 ~589），改用 `no-restricted-syntax` 5 selector 字面量匹配（warning，零误报），checker 以 error 级镜像，selfTest 43→50；迁移 3 个启动关键文件共 25 处导入为 `@originos/core/...`（tsc 保留说明符字面量，产物解析由新增 Fallback-F1 解决：`prepare-core-runtime.js` staging dist-electron/core 并按 24 个真实消费说明符闭集生成 exact exports，electron-builder 打包为 node_modules/@originos/core，打包产物启动冒烟 0 MODULE_NOT_FOUND）；附带修复 2 个前置既有打包脚本缺陷（prepare-web-standalone hoist 误拒、verify-ontology-runtime 挂起不退出）。存量违规 128 处留待 AG.8-T2 迁移后升 error。

## 2026-09-29 — feat：AG.8-T2 desktop 存量说明符迁移与 error 强制执行（Story AG.8 完成）

**类型**：feat
**影响模块**：`packages/desktop/src/`（27 服务文件 + 测试）、`packages/web/src/`（测试）、`packages/core/src/types/index.ts`、`packages/desktop/vitest.config.ts`、`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`AGENTS.md`（v2.6.3 → v2.6.4）、`docs/specs/epic-AG/story-AG.8/`、`openspec/changes/migrate-desktop-core-specifiers/`
**摘要**：AG.8-T2（Proposal `migrate-desktop-core-specifiers`）完成剩余存量迁移：154 处跨包相对导入（119 from + 9 动态/typeof + 26 测试，含 10 处 vi.mock 字面量）全部改为 `@originos/core/...` 包名说明符；types 深路径收敛到 `@originos/core/types`（core types index 显式补 `OntologyEntity`/`OntologyRelation` 重导出）；`no-restricted-syntax` 拦截规则升 error（selfTest 51 例），`lint:boundaries` 966 文件 0 诊断、新增违规非零退出阻断；desktop vitest 补 `@originos/core` resolve.alias 与 web 对齐；F1 打包 staging 自动扩展至 70 个消费说明符（130 条 exports 全部 resolve），打包产物启动冒烟 0 MODULE_NOT_FOUND；测试基线零 delta（web 425/425）。Story AG.8（T1+T2）至此完成，AGENTS.md v2.6.4 标记该条款强制执行。遗留：T1 产物中 5 处 `/index` 形态说明符留待 AG.9 exports 治理统一收敛。
