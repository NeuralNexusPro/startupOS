# Changelog - v0.4.0

---

## 2026-09-28 — docs：架构围栏治理与 Epic AG Story 追加（AG.8–AG.11）

**类型**：docs
**影响模块**：`AGENTS.md`（v2.5.8 → v2.6.3）、`CLAUDE.md`（改为指针文件）、`docs/specs/epic-AG/`
**摘要**：架构审视后完成规约围栏治理：确立 AGENTS.md 为单一事实源，CLAUDE.md 变为工具兼容指针；AGENTS.md 补入多 Agent 协作运行时章节（facade/ui 组装豁免取代「不 import 外部模块」声明）、跨包导入必须使用包名说明符条款、协作运行时性能指标、数据根解析规则与实际 data 子目录；技术栈表补入 Monorepo/Electron。新增 4 个治理 Story：AG.8 包边界治理（125 处跨包相对路径 + lint zones）、AG.9 core 公共 API 收缩（exports 通配符 84→显式白名单 + jsx 副本清理）、AG.10 巨型文件拆分（7 文件）、AG.11 重复与死代码嗅探（knip 基线 + 双文档树处置）。

---

## 2026-09-29 — feat：AG.8-T1 跨包说明符边界（lint 拦截 + 启动文件 spike + F1 打包 staging）

**类型**：feat
**影响模块**：`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`packages/desktop/src/main/{setup-data-root,main,agent-worker-runtime-deps}.ts`、`packages/desktop/scripts/{prepare-core-runtime,prepare-web-standalone,verify-ontology-runtime}.js`、`packages/desktop/{package.json,electron-builder.yml}`、`docs/specs/epic-AG/story-AG.8/`、`openspec/changes/add-cross-package-specifier-imports/`
**摘要**：AG.8-T1 落地跨包说明符边界（Proposal `add-cross-package-specifier-imports`，已合并 refactor/arch-governance）。拦截机制放弃 `import/no-restricted-paths` zones（pnpm 链接下物理路径判定误报 ~589），改用 `no-restricted-syntax` 5 selector 字面量匹配（warning，零误报），checker 以 error 级镜像，selfTest 43→50；迁移 3 个启动关键文件共 25 处导入为 `@originos/core/...`（tsc 保留说明符字面量，产物解析由新增 Fallback-F1 解决：`prepare-core-runtime.js` staging dist-electron/core 并按 24 个真实消费说明符闭集生成 exact exports，electron-builder 打包为 node_modules/@originos/core，打包产物启动冒烟 0 MODULE_NOT_FOUND）；附带修复 2 个前置既有打包脚本缺陷（prepare-web-standalone hoist 误拒、verify-ontology-runtime 挂起不退出）。存量违规 128 处留待 AG.8-T2 迁移后升 error。
