# Design: clean-redundant-docs-and-dead-code（AG.11）

## D1 双文档树处置：git rm --cached + gitignore（保守选项）

**决策**：采用 Story 文档 B-2-a（仅快照 → `git rm -r --cached .teamai/docs` + `.gitignore` 追加 `.teamai/`，本地保留）。

**依据（2026-09-30 实测）**：
- teamai CLI 的搜索索引（`~/.teamai/projects/users-archersado-workspace-startupos-48c5aed2705ddb75/search-index.json`，847 条目）路径全部为其自有团队仓库克隆 `~/.teamai/.../team-repo/docs/**`，无一条指向工作区 `.teamai/docs`；
- 仓库内代码 / 脚本 / CI 配置 `git grep "\.teamai"` 零引用（`.teamai/` 自身除外）；
- `.teamai/docs` 由 a3e4d1e（2026-09-28 feat: v0.4.x）一次性提交，此后 `docs/` 新增内容（AG.8-T2 changelog、story-AG.9/AG.10、v0.3.4/v0.4.0 release 归档等约 46 处）均未同步，快照已漂移成误导性死副本。

**为什么不物理删除**：`git rm -r --cached` 零运行时风险且保留本地副本过渡；若后续确认 teamai 无任何隐藏消费方（如 `teamai codebase` 未探索到的模式），物理删除另行处理。该保守性符合 FR-2「确认消费方后删除或排除出 git」的分支定义。

**备选被拒**：B-2-b（标注权威关系保留双树）——快照已漂移且无消费方，标注只会延续误导。

## D2 knip 接入形态：基线报告而非门禁

- knip 仅入 devDependencies，报告归档到 Story 目录；**不在本 proposal 接 CI fail**（AG.5 CI 接入任务的边界）。
- 配置要点：workspaces 按包声明 entry（Next.js 约定文件、Electron main/preload、adapter runtime entry）；ignore 覆盖 `**/.next/**`、`**/dist*/**`、`release/**`、测试文件；`packages/core` 的 entry 需要覆盖 `src/**/index.ts`（exports 白名单形态下每个 exports 条目都是公共 API 边界，不能只认 `src/index.ts`——该根入口仅导出 storage/utils/types，以它为唯一 entry 会把全部 feature 门面误报为死码）。
- exports 白名单与 knip 的关系：`packages/core/package.json` exports 显式条目视为公共 API（knip entry 补充声明），Story AG.9 的 verify 门禁管「消费闭集命中」，knip 管「未被任何消费方引用的导出」——两者互补，knip 基线预期会把 exports 条目里的过渡态深路径列为候选，这正是 AG.11 后续按热度消化的输入。

## D3 数据处置判据

| 项 | 判据 | 动作 |
|----|------|------|
| `packages/service/` | `git grep @originos/service` 零命中（已确认） | 物理删除目录 |
| `data/data/` | 未 git 追踪（`/data` ignore）；内容为 2026-09-11 旧会话注册表；根 `data/sessions/` 现为空 | 本地 `rm -rf data/data` |
| `packages/web/data/` | git 追踪 61 文件；mtime 9/13 早于根 `data/agents` 现行数据；AGENTS.md 数据根规约 `getDataRoot()` 兜底 monorepo 根 | 抽样比对确认无独有数据后 `git rm -r`；有独有则先迁移 |
| `release/` | gitignore 已含 `/release`；本地产物为 AG.9 TC-4 验证刚产出 | 仅确认 ignore，不物理删除 |

**`packages/web/data` 抽样方案**：比对包内与根 `data/` 同名 id（proj-*/agents/*）的文件集合与 mtime；包内全部条目在根目录存在且更新 → 确认旧残留；存在包内独有 id → 该 id 子目录先 `cp -R` 到根 `data/` 对应位置并留痕。

## D4 提交与回滚策略

- 每个 C 项独立 commit（C1 快照移出 / C2 空壳 / C3 误嵌套 / C4 包内数据 / C5 knip / C6 文档），commit message 附引用确认命令与输出摘要。
- 全部为 git 可逆操作（快照移出可 `git checkout HEAD -- .teamai/docs` 恢复追踪；目录删除可 revert）；无生产源码改动，回滚零风险。
- 单一 Proposal 分支内直接实施（无 subagent worktree 必要：写入范围互斥且总量小，符合「至少一个 task worktree」精神的最小满足——应用源码零改动，全部为仓库卫生文件与文档，在 Proposal 主 worktree 直接实施属规约允许范围）。

## D5 风险

| 风险 | 缓解 |
|------|------|
| `.teamai/docs` 有未发现的消费方 | 保守选项保留本地副本；`git grep` 已证零代码引用；teamai 索引指向自有克隆 |
| knip 误报污染基线报告 | 报告只记录不阻塞；ignore 覆盖产物路径；Next.js 约定文件全部进 entry |
| `packages/web/data` 有独有数据 | 抽样比对先行；独有则迁移留痕后再删 |
| 删除影响构建链路 | TC-4 双端编译 + TC-5 打包冒烟兜底 |
