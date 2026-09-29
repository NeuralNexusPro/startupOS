# Story AG.8: 包边界治理 — 消灭跨包相对路径穿透

**Epic:** AG — 架构治理与围栏对齐
**状态:** 🚧 In Progress（T1 完成，T2 待实施）
**优先级:** 🔴 Critical（规约 v2.6.3 新增强制条款的最大存量违规类）
**估计工时:** 2–3 天
**依赖:** 无硬依赖（可与 AG.9 并行；建议在 AG.9 exports 收缩前完成，避免迁移目标漂移）
**创建日期:** 2026-09-28
**规约依据:** AGENTS.md v2.6.3「跨包导入必须使用包名说明符」+ 禁止事项 #9/#10
**Task → Proposal 映射:** AG.8-T1 → `add-cross-package-specifier-imports`（✅ 已合并，2026-09-29）；AG.8-T2 → 待创建

---

## 概述

当前 `packages/desktop/src/main/` 存在 **123 处**（非测试，共 31 个文件）通过相对路径直插 core 内部实现的导入（如 `import { setElectronDataRoot } from '../../../core/src/lib/paths'`），`packages/web/src` 另有 2 处。这绕过了 `@originos/core` 的包边界——`package.json` exports 白名单、依赖方向检查（`lint:boundaries`）对这类导入全部失效。

本 Story 将全部存量违规迁移为包名说明符（`@originos/core/...`），并在 `.eslintrc.cjs` 的 `import/no-restricted-paths` zones 中加入拦截规则，使该类违规今后在 lint 阶段被自动发现。

关键工程事实（2026-09-28 验证）：

- desktop 运行时（Electron main）从 `dist-electron/` 加载产物，tsc 编译后相对路径恰好映射到 `dist-electron/core/src/...`，**能跑通纯属产物目录结构巧合**。迁移为包名说明符后，tsc（`paths` 已有映射）继续工作；产物解析改走 pnpm hoisted 链接，`dist-electron` 目录结构对 core 的依赖随之解除。
- `@originos/core` 的 exports 指向 `./src/*.ts` 源码（源码级包），Node 直接 require `.ts` 会失败，但 desktop 现有 4 处 `@originos/core/...` 导入全部是 `import type`（编译期擦除），以及 web 端走 Next.js transpilePackages。desktop 值导入在编译期由 tsc `paths`（`"@originos/core/*": ["../core/src/*"]`）解析并编译为产物内相对路径——因此**迁移后编译行为不变，运行时不受影响**。此断言必须在 TC 中验证（dev 启动 + Electron 打包冒烟）。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、验收标准、风险与回滚 |
| [architecture.md](./architecture.md) | 迁移策略、zones 规则设计、产物影响分析 |
| [implementation.md](./implementation.md) | Task 划分、基线口径、回滚策略 |
| [testing.md](./testing.md) | 测试策略、验收测试用例 |
| [interaction.md](./interaction.md) | 不适用（纯架构治理，无 UI/UX 变更） |

**OpenSpec Proposal：** AG.8-T1 → `openspec/changes/add-cross-package-specifier-imports/`（strict validation 通过，已实施并合并，见 [testing.md](./testing.md) T1 结果表）

## 状态

- [x] 需求确认
- [x] 架构设计
- [x] 开发实施（T1）
- [x] 测试验证（T1：TC-2/3/4/6 通过，TC-5 随 T2 回归）
- [ ] 开发实施（T2：存量 128 迁移 + error 升级）
- [ ] 测试验证（T2）

---

## 快速导航

- 违规清单生成命令（实施时重新执行以获取最新基线）：

```bash
grep -rEn "from ['\"](\.\./)+(\.\./)?core/src/" packages/desktop/src packages/web/src \
  --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."
```
