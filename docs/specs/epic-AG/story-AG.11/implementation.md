# 实施记录 - Story AG.11

**Story:** 重复与死代码嗅探治理
**Epic:** AG — 架构治理与围栏对齐
**实施日期:** 2026-09-30
**载体:** OpenSpec Proposal `clean-redundant-docs-and-dead-code`（分支 `proposal/clean-redundant-docs-and-dead-code`）

---

## 实施步骤与 commits

| C 项 | 内容 | Commit | 关键证据 |
|------|------|--------|---------|
| C1 | `.teamai/docs` 移出 git（868 文件）+ `.gitignore` 追加 `.teamai/`，本地保留 | `bea3547` | `git grep "\.teamai"` 代码零引用；teamai 搜索索引 847 条目全部指向自有克隆 |
| C2 | 删除 `packages/service/` 空壳 | `bd773e5` | `git grep @originos/service` 零引用；pnpm install 后 workspace 不含该包 |
| C4 | `git rm -r packages/web/data`（61 文件） | `45ac675` | ID 集合比对：包内 agents/projects 均在根 `data/` 存在且更新；包内独有 2 agents + 4 projects 为 2026-06 空内容一次性测试数据 |
| C5 | knip 6.38.0 + `knip.json` + 基线报告归档 | `e4977d9` | files 121 / exports 80 / types 71 / deps 64 / devDeps 32；人工甄别注记（perception-plugin-* 误报等） |
| C6 | AGENTS.md v2.6.6 + Story 文档回写 + changelog | 本 commit | 目录树删除 service 行、web data 注释更新；README 状态 Completed；testing.md TC-1~6 结果回填 |

## 偏离与勘误（相对 2026-09-28 Story 盘点）

1. **`release/` 无需处置**：盘点认为存在历史 dmg/zip 残留需清理；实测根 `.gitignore` 已含 `/release`，目录未被追踪，AG.9 验证产物属正常本地产物。
2. **`packages/desktop/data` 不存在**：盘点列出该目录；实测文件系统无此目录，属盘点误差，无需处置。
3. **`packages/web/data` 为 61 个 git 追踪文件**（Story 估算更少）；按 D3 判据抽样比对后整体 `git rm -r`，未发现需迁移的独有数据（包内独有 id 均为 2026-06 空内容测试残留）。
4. **`data/data` 未在 Proposal worktree 出现**：未追踪运行数据不随 worktree 传播；主工作区物理删除留待合并后执行（不阻塞本 Proposal）。

## 迁移 / 兼容

- 全部为删除/移出追踪类改动，无生产源码修改；`.teamai/docs` 本地副本保留，可 `git checkout HEAD -- .teamai/docs` 恢复追踪。
- knip 基线只记录不阻塞（AG.5 负责 CI 接入决策）；`knip.json` entry 覆盖 Next.js 约定文件 / Electron main+preload / agent runtime entry / core `src/**/index.ts` 门面（与 AG.9 exports 白名单形态对齐）。

## 审查要点

- commit message 是否附引用确认命令与输出摘要（repo-hygiene「处置留痕」Requirement）。
- `.gitignore` 的 `.teamai/` 条目不得误伤仓库其他路径（实测无其他 `.teamai` 前缀文件）。

## 回滚

逐项 revert 对应 commit 即可；全部操作 git 可逆，无数据丢失风险（快照本地保留、运行数据均有根目录现行副本）。
