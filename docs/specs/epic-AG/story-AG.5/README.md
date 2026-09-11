# Story AG.5: 自动化围栏（ESLint 边界 + dead-code 工具 + any 预算 + CI 接入）

## 2026-09-11：首轮可执行任务 AG5-T1

本轮仅实施现有 Monorepo 边界检查修正，提案为 `fix-monorepo-boundary-lint`，状态为待批准。下方历史整套工具链规划不作为 AG5-T1 验收要求；不得因此宣称 AG.5 全部完成。现行架构以 AGENTS.md 为准，旧 `src/`、atoms/organisms 目录及旧 CLI 命令仅作为历史背景。


**Epic:** AG — 架构治理与围栏对齐
**状态:** 📋 Planning
**优先级:** 🟡 Medium（治理「再发生」的护栏，需在 AG.1~AG.4 落地后再启用 error 级）
**估计工时:** 2 天

---

## Story 概览

> 作为 OriginOS 维护者，我需要把 CLAUDE.md 中的架构围栏从「人工评审」升级为「CI 自动拦截」。当前已有 ESLint `no-restricted-imports` 与 `import/no-restricted-paths`，但包路径和扫描覆盖需修正；dead-code 与 `any` 预算仍属后续规划 — 任何穿透模块边界、`any` 滥用、未使用导出都依赖人工 PR review 把关。本 Story 接入工具链，让违规在 CI 阶段被拦截在合入前。

---

## 快速导航

- [需求规格](./requirements.md) - 用户故事、功能需求、验收标准
- [架构设计](./architecture.md) - 技术栈、数据结构、模块设计
- [测试策略](./testing.md) - 测试用例、验收标准测试

---

## 核心问题

当前 OriginOS 缺少自动化架构治理工具，所有架构围栏依赖人工 PR review 把关，容易遗漏。

---

## 目标架构

### ESLint 边界规则

- 📋 在 `.eslintrc.json` 中追加 `overrides` 段，按目录注入 `no-restricted-imports`
- 📋 渐进式启用：Week 1 warn → Week 2 PR diff error → Week 3+ 全量 error

### Dead-code 检查

- 📋 默认采用 **knip**（现代化、配置友好、支持 monorepo / Next.js）
- 📋 渐进式接入：Week 1 收集基线 → Week 2 新增 fail → Week 3+ 基线收敛

### any 预算脚本

- 📋 新建 `scripts/any-budget.mjs` 统计 any 使用
- 📋 预算目标：`src/modules/**` ≤ 30、`src/lib/**` ≤ 60

### 循环依赖检查

- 📋 使用 `madge` 检测循环依赖
- 📋 CI 中必须输出 `No circular dependency found`

### CI 集成

- 📋 新增 `.github/workflows/architecture-guardrails.yml`
- 📋 包含 TypeScript check、ESLint boundaries、Dead-code check、any budget、Circular dependencies

---

## 依赖关系

- **前置依赖：** AG.1 / AG.2 / AG.3（迁移完成后再接 lint）；AG.4（CLAUDE.md 条款落地后规则措辞才稳定）

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [测试策略](./testing.md)
- [Epic AG README](../README.md)

## AG5-T1 需求与验收

Owner：OriginOS 维护者 / Codex。作为维护者，我需要同一违规在根目录和包目录被一致检出，并获得真实存量基线。

- [ ] 工作目录与导入写法不影响边界判定。
- [ ] 合法 app → Core 公共 API 不误报。
- [ ] 生产扫描、自测和失败退出码符合 testing.md 的 AG5-T1 用例。
- [ ] 无新增工具依赖，默认 lint 兼容级别保留。

补充导航：[交互](interaction.md) · [实施](implementation.md)。

## 变更历史

- 2026-09-11：核实旧围栏失效原因，建立 AG5-T1 提案与验收用例；未修改应用源码。
