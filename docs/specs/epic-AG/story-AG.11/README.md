# Story AG.11: 重复与死代码嗅探治理

**Epic:** AG — 架构治理与围栏对齐
**状态:** ✅ Completed（2026-09-30，Proposal `clean-redundant-docs-and-dead-code`）
**优先级:** 🟡 Medium
**估计工时:** 2–3 天
**依赖:** 建议在 AG.9（core 治理）之后实施——AG.9 已清理 collaboration-runtime jsx 副本与 web culture/ontology-data-store 壳，本 Story 处理剩余项并建立常态化检测
**创建日期:** 2026-09-28

---

## 概述

仓库中残留若干重复结构与疑似死代码（2026-09-28 静态盘点）：

| 项 | 位置 | 性质 | 处置方向 |
|----|------|------|---------|
| `.teamai/docs` 与 `docs` 双文档树（868 个 git 追踪文件） | 仓库根 | 同源复制且已漂移（changelog/index/epic-1 内容不一致） | 确认消费方后删除或排除出 git |
| `packages/service/` | 仅 1 个 package.json，零源码 | 空壳包 | 删除或在 AGENTS.md 标注保留原因 |
| `data/data/`（内嵌 data 目录） | `data/data/sessions` | 疑似历史误嵌套 | 确认无消费后删除 |
| `release/`（历史 dmg/zip，未被 git 追踪） | 仓库根 | 构建产物残留 | 清理 + gitignore 确认 |
| `packages/web/data`、`packages/desktop/data` | 包内 data 目录 | 与根 `data/` 并存的开发态遗留 | 确认后删除或迁移 |
| `any` 预算 | core lib 161 处 / web 92 处 | 规约禁止项存量 | 对齐 AG.5 any 预算任务（本 Story 仅盘点不计入） |

本 Story 引入 **knip**（或 ts-prune）建立 dead-code 基线，并对上表逐项处置；处置原则：先确认引用（运行时动态引用需甄别），再删除，单 PR 可回滚。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、验收标准、风险与回滚 |
| [architecture.md](./architecture.md) | 逐项处置方案、knip 接入 |
| [testing.md](./testing.md) | 测试策略、验收测试用例 |
| [knip-baseline.md](./knip-baseline.md) | dead-code 基线报告（AG.11 新增，只记录不阻塞） |
| [implementation.md](./implementation.md) | 实施记录（AG.11 新增） |

## 状态

- [x] 需求确认
- [x] 架构设计
- [x] 开发实施
- [x] 测试验证

## 完成记录（2026-09-30）

| Story 盘点项 | 处置结果 |
|--------------|---------|
| `.teamai/docs` 双文档树 | `git rm -r --cached`（868 文件移出追踪，本地保留）+ `.gitignore` 追加 `.teamai/`；实测 teamai 搜索索引 847 条目全部指向其自有克隆，无工作区消费方 |
| `packages/service/` 空壳 | 物理删除；`git grep @originos/service` 零引用留痕于 commit |
| `data/data/` 误嵌套 | 未追踪产物；Proposal worktree 无该目录，主工作区物理删除于合并后执行（见 implementation.md） |
| `release/` | `.gitignore` 已含 `/release`（实测早于本 Story 已忽略），无需处置 |
| `packages/web/data` | `git rm -r` 61 文件；抽样比对确认根 `data/` 存在同名且更新的数据；worktree 无本地 data 目录 |
| `packages/desktop/data` | 实测不存在（Story 文档盘点有误），无需处置 |
| any 预算 | 按范围定义移交 AG.5，不在本 Story 处理 |
| knip 基线 | `knip.json` + `knip-baseline.md`（files 121 / exports 80 / types 71 / deps 64 / devDeps 32），只记录不接 CI |
