# 需求文档 - Story AG.8

**Story:** 包边界治理 — 消灭跨包相对路径穿透
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 用户故事

> 作为 OriginOS 维护者，我需要把所有跨包相对路径导入（desktop/web → core src）迁移为 `@originos/core` 包名说明符，并让 lint 自动拦截此类导入，这样包边界才真正存在，`exports` 白名单（Story AG.9）才有收紧的抓手。

---

## 功能需求

1. **FR-1 存量迁移**：`packages/desktop/src` 与 `packages/web/src` 中所有解析到 `core/src/` 的相对路径导入，全部改为 `@originos/core/...` 说明符。基线（2026-09-28）：desktop 非测试 123 处 / 31 个文件，web 非测试 2 处；测试文件中的同型导入一并在本次或随后清理（非阻塞）。
2. **FR-2 lint 拦截**：`.eslintrc.cjs` 增加规则：在 `packages/desktop`、`packages/web`、感知插件源码中，相对导入解析到其他包的 `src/` 目录时报 warning（AG.8 期间），迁移完成后升级 error。
3. **FR-3 产物验证**：迁移后 desktop dev 模式（`pnpm desktop:dev`）与打包产物（`pnpm desktop:build:app`）均能正常启动；`dist-electron/` 中不再包含对 `dist-electron/core/` 的依赖（编译产物内联或走 hoisted 链接）。
4. **FR-4 单一实现**：迁移只改 import 说明符，禁止复制 core 代码到 desktop 侧。

---

## 验收标准

1. - [ ] 基线 grep 命令输出为 0（生产源码）
2. - [ ] `pnpm lint:boundaries` 通过，且 zones 含跨包相对路径规则（正例/反例自测通过）
3. - [ ] `pnpm --filter @originos/desktop build`（tsc）0 error
4. - [ ] `pnpm --filter @originos/web type-check` 0 error
5. - [ ] Electron 打包冒烟：`pnpm desktop:build:app` 后启动打包产物，主进程日志无 `MODULE_NOT_FOUND`，数据根注入（setup-data-root）正常
6. - [ ] 核心行为回归：agent 会话创建、本体读写、协作会话启动三类 IPC 冒烟通过
7. - [ ] 本 Story 全部改动在单 PR（或按 AG.8-T1/T2 task 分 PR），便于回滚

---

## 非功能需求

- 迁移为机械替换（说明符改写），不改动任何运行逻辑、导出符号与文件位置。
- 若某符号在 core 的 exports 中无对应条目，使用现有最贴近的通配条目（如 `./lib/features/*`）；**不**在本 Story 中新增 exports 白名单（那是 AG.9 的职责）。

---

## 风险与回滚

| 风险 | 缓解 |
|------|------|
| 包名说明符在 Electron 打包后解析失败（exports 指向 src .ts，Node 无法直接 require） | 实施前先做 spike：desktop main 中 1 个文件改为说明符导入 → tsc 编译 → 检查产物 require 形态（tsc paths 编译期重写为产物内相对路径则无风险）；失败则降级方案：desktop tsconfig paths 保持，产物 stage 脚本补 core 产物目录 |
| 迁移过程中 web/desktop lint 报大量 warning 影响开发 | warning 级起步，迁移完成后立即升 error，窗口期控制在单 Story 内 |
| 31 个文件一次性改动造成 review 困难 | 按 task 分 PR：AG.8-T1 规则 + main.ts/paths.ts 等核心文件，AG.8-T2 services 批量迁移 |

---

## 相关文档

- [AGENTS.md v2.6.3 依赖规约](../../../../AGENTS.md) — 「跨包导入必须使用包名说明符」
- [Epic AG README](../README.md)
- [Story AG.9 — core 包治理与公共 API 收缩](../story-AG.9/README.md)（本 Story 的下游）
