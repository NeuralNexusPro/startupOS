# repo-hygiene Specification

## Purpose
TBD - created by archiving change clean-redundant-docs-and-dead-code. Update Purpose after archive.

## Requirements

### Requirement: 文档树单一事实源

仓库根 `docs/` SHALL 为文档的唯一权威树；`.teamai/docs` 工具快照 SHALL 不被 git 追踪（`.gitignore` 含 `.teamai/`）。任何新文档只写入 `docs/`。

#### Scenario: 快照不入库

- **WHEN** 执行 `git ls-files .teamai | wc -l`
- **THEN** 输出 SHALL 为 0，且 `.gitignore` 中存在 `.teamai/` 条目

#### Scenario: 本地快照过渡保留

- **WHEN** 检查工作区文件系统
- **THEN** `.teamai/docs` 目录 SHALL 仍存在于本地（仅移出 git 追踪，物理删除另行决策）

### Requirement: 空壳包禁止

workspace 内 SHALL 不存在零源码且零引用的包目录（如 `packages/service/` 仅含 package.json）。

#### Scenario: service 空壳删除

- **WHEN** 执行 `ls packages/service`
- **THEN** SHALL 返回 No such file，且 `git grep -rn "@originos/service" packages/` 无生产源码引用

### Requirement: 运行数据目录唯一化

运行时数据 SHALL 只存在于数据根（`getDataRoot()` 解析结果，开发态为 monorepo 根 `data/`）；包内不得保留 git 追踪的运行数据副本（如 `packages/web/data/`）。

#### Scenario: web 包内数据清理

- **WHEN** 执行 `ls packages/web/data`
- **THEN** SHALL 返回 No such file，且 `git ls-files packages/web/data | wc -l` = 0

#### Scenario: 误嵌套清理

- **WHEN** 执行 `ls data/data`
- **THEN** SHALL 返回 No such file（未追踪旧产物物理删除）

### Requirement: dead-code 基线可复现

仓库 SHALL 提供 knip 配置（`knip.json`，entry 覆盖 Next.js 约定文件 / Electron main/preload / adapter entry / core `src/**/index.ts` 门面）与归档基线报告 `docs/specs/epic-AG/story-AG.11/knip-baseline.md`；基线只记录不阻塞，本变更不接 CI fail。

#### Scenario: knip 可复现运行

- **WHEN** 在仓库根执行 `npx knip`
- **THEN** 命令 SHALL 正常退出并产出报告（error 不得来自配置错误），报告结论与归档基线一致

### Requirement: 处置留痕

每项删除的 commit message SHALL 附引用确认命令与输出摘要，保证可审计、可回滚（全部操作可通过 git revert / git checkout 恢复）。

#### Scenario: 审计追溯

- **WHEN** 查看 C1–C4 各 commit message
- **THEN** SHALL 包含对应的引用确认命令与结果（零引用 / 未追踪 / 旧数据证据）
