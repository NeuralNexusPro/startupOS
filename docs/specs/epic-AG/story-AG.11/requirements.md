# 需求文档 - Story AG.11

**Story:** 重复与死代码嗅探治理
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 用户故事

> 作为 OriginOS 维护者，我需要用工具建立 dead-code 基线并清理已确认的重复结构与死产物，这样仓库体积与认知负担不再无限增长，后续治理有可复用的检测手段。

---

## 功能需求

1. **FR-1 工具基线**：接入 `knip`（AG.5 既定选型），产出首份 dead-code 报告（未使用导出 / 依赖 / 文件），报告归档到本 story 目录（`knip-baseline.md`）。仅建基线，不接 CI fail。
2. **FR-2 双文档树处置**：`.teamai/docs`（868 文件，git 已追踪）与 `docs/` 的重复——确认 `.teamai` 的实际消费方（teamai 工具链？），若仅作快照则从 git 移除并 gitignore；若被工具引用则记录权威关系（哪份是事实源）并同步机制。
3. **FR-3 空壳与误嵌套清理**：`packages/service/`、`data/data/`、`release/` 残留、包内 `packages/web/data` / `packages/desktop/data`（若 `packages/desktop/data` 存在）逐项确认引用后处置：删除、gitignore 或在 AGENTS.md 记录保留理由。
4. **FR-4 处置留痕**：每个删除项在 PR 描述中附「引用确认命令 + 输出」，确保可审计、可回滚。

---

## 验收标准

1. - [ ] `knip` 可运行且基线报告已归档（`knip-baseline.md`），含配置文件（`knip.json` 或 package.json 配置段）
2. - [ ] `.teamai/docs` 处置完成：git 不再追踪（或已建立明确的同步/权威说明）
3. - [ ] `packages/service/` 处置完成：目录删除（并从 pnpm-workspace 自动消失）或 AGENTS.md 已记录保留理由
4. - [ ] `data/data/`、`release/`、包内 data 目录处置完成（删除或 gitignore + 本地清理）
5. - [ ] `pnpm test` 通过数 ≥ 基线；`pnpm desktop:build:app` 冒烟通过（确认删除项不在构建链路）
6. - [ ] AGENTS.md 数据存储章节与目录树与处置后现状一致

---

## 非目标

- 不处理 `any` 存量（AG.5 后续任务的 any 预算范围）。
- 不清理 `dist/`、`dist-electron/`、`.next/` 等标准构建产物（已有 gitignore 覆盖）。
- 不在本 Story 将 knip 接入 CI 门禁（归 AG.5 CI 接入任务）。

---

## 风险与回滚

| 风险 | 缓解 |
|------|------|
| `.teamai/docs` 被 teamai CLI 依赖（运行时读取） | 删除前 grep 仓库脚本与 `.teamai` 配置；保留本地目录仅移出 git 追踪（`git rm -r --cached`）作为保守选项 |
| `data/data/sessions` 有用户实际会话数据 | 删除前检查内容时间戳与可读性；如有数据先迁移到 `data/sessions/` |
| knip 误报（动态 import、Next.js 约定文件） | 基线仅记录不阻塞；配置 `ignore` 排除 Next.js 约定路径 |

---

## 相关文档

- [Story AG.1 — 死代码与死路径清理](../story-AG.1/README.md)（历史清场，方法可复用）
- [Story AG.5 — 自动化围栏](../story-AG.5/README.md)（knip 选型出处）
