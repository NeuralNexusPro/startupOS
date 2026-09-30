# Proposal: clean-redundant-docs-and-dead-code（AG.11 重复与死代码嗅探治理）

**epic-id:** AG
**story-id:** AG.11
**task-id:** AG.11（单一交付单元，无 Task 拆分）

## Why

2026-09-28 静态盘点（Story AG.11 文档）确认五类重复结构 / 死产物残留，2026-09-30 实施前复核全部属实：

1. **`.teamai/docs` 双文档树快照（868 个 git 追踪文件）**：2026-09-28 提交 a3e4d1e 一次性引入，此后 `docs/` 已演进（AG.8-T2、AG.9 等）而快照不再更新，内容已漂移（changelog 缺 AG.9 条目、缺 story-1.7/1.8/9.36/AG.10 等约 46 处文件级差异）。teamai 工具链的搜索索引（847 条）全部指向其自有团队仓库克隆 `~/.teamai/projects/*/team-repo/docs/`，无一条引用工作区 `.teamai/docs`——该目录不被任何工具读取，是纯死快照。
2. **`packages/service/` 空壳包**：仅 1 个 package.json（`@originos/service`），零源码，仓库内零引用。
3. **`data/data/` 误嵌套**：`data/data/sessions/sessions.json`（2026-09-11 旧会话注册表，git 未追踪，`/data` 已 gitignore），为旧版本误写路径产物；根 `data/sessions/` 现为空目录。
4. **`packages/web/data/`（61 个 git 追踪文件）**：9/13 开发态运行数据残留（agents/projects），与根 `data/`（1056 + 794 文件）并存；AGENTS.md 数据根规约明确 Web 开发态数据应在根 `data/`（`getDataRoot()` 兜底 `getMonorepoRoot()/data`）。
5. **dead-code 检测缺位**：AG.5 既定选型 knip 尚未接入，无 dead-code 基线可对照后续治理。

`release/` 已在 `.gitignore`（`/release`），本地构建产物保留（AG.9 TC-4 刚使用过，物理删除影响后续验证效率），本 proposal 仅确认 gitignore 生效，不做本地清理。

## What Changes

- **C1 双文档树快照移出 git（B-2-a）**：`git rm -r --cached .teamai/docs` + `.gitignore` 追加 `.teamai/`，本地副本保留过渡（确认 teamai 工具链不受影响后再物理删除，另行处理）。不删除文件本体，零运行时风险。
- **C2 空壳包删除（C-1）**：删除 `packages/service/`（零引用已确认），pnpm-workspace 通配自动失效。
- **C3 误嵌套清理（C-2）**：删除 `data/data/`（1 个未追踪旧 JSON，2026-09-11 产物；`/data` 全局 gitignore 下本就不入库，仅物理清理本地）。
- **C4 包内运行数据迁移（C-4）**：`packages/web/data/`（61 文件，9/13 开发态数据，git 已追踪）——抽样比对根 `data/agents`（1056 文件）时间戳更新，包内为旧残留；`git rm -r packages/web/data` 并本地删除。若抽样发现包内独有数据，迁移到根 `data/` 对应子目录后再删。
- **C5 knip 基线接入（A）**：devDependencies 加入 `knip`，新建 `knip.json`（entry 覆盖 Next.js 约定文件、Electron main/preload、adapter entry；ignore 排除产物与测试），运行产出报告整理为 `docs/specs/epic-AG/story-AG.11/knip-baseline.md`。**基线只记录不删除，不接 CI fail。**
- **C6 文档同步（C-5 / FR-4）**：AGENTS.md 数据存储章节与目录树核对更新；每项删除在 commit message 附引用确认命令与输出（留痕可回滚）。

## Capabilities

### 新增

- `repo-hygiene`：仓库卫生约束——文档树单一事实源（`docs/` 为权威，工具快照不入 git）、运行时数据目录唯一化（数据根由 `getDataRoot()` 统一解析，包内不保留运行数据副本）、空壳包禁止（无源码包不入 workspace）、dead-code 基线可复现（knip 配置入库 + 基线报告归档）。

## Impact

- **删除**：`.teamai/docs`（移出 git，868 文件）、`packages/service/`、`data/data/`、`packages/web/data/`（git rm 61 文件）
- **新增**：`knip.json`、`docs/specs/epic-AG/story-AG.11/knip-baseline.md`、devDependency `knip`
- **修改**：`.gitignore`、`AGENTS.md`（目录树/数据存储章节）、`docs/specs/epic-AG/story-AG.11/*`、Epic README、`docs/changes/`
- **不改**：任何生产源码、构建链路、运行时行为（全部为仓库卫生操作）
