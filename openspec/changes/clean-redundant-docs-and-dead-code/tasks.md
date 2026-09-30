# AG.11 实施任务

本 Proposal 对应 Story AG.11（单一交付单元）。编号是 Proposal 内部工作包。

## 1. 双文档树快照移出 git（C1）

- [ ] 1.1 `git rm -r --cached .teamai/docs`（868 文件移出追踪，本地保留）；`.gitignore` 追加 `.teamai/`；commit 附引用确认命令（`git grep -l "\.teamai" -- "*.ts" "*.js" "*.cjs" "*.mjs" "*.sh" "*.yml" "*.yaml" "*.json"` 零命中 + teamai 搜索索引路径核查）证据。
- [ ] 1.2 验证 `git ls-files .teamai | wc -l` = 0 且本地 `.teamai/docs` 仍存在；`git status` 干净（ignore 生效）。

## 2. 空壳包与误嵌套清理（C2/C3）

- [ ] 2.1 删除 `packages/service/`（引用确认：`git grep -rn "@originos/service" packages/ --include="*.ts*" --include="*.json"` 零命中留痕）；`pnpm install` 后 `pnpm ls -r --depth -1 2>/dev/null | grep service` 确认 workspace 无该包。
- [ ] 2.2 删除 `data/data/`（本地 `rm -rf`，未追踪产物，留 ls 输出证明内容为 2026-09-11 旧会话注册表）。

## 3. 包内运行数据清理（C4）

- [ ] 3.1 抽样比对 `packages/web/data/`（61 文件）与根 `data/`：对 agents/projects 抽 3 个 id 验证根目录存在同 id 且 mtime 更新；发现包内独有 id 时先迁移到根 `data/` 并留痕。
- [ ] 3.2 `git rm -r packages/web/data`（61 文件出库 + 本地删除）；web 本地启动一次冒烟确认运行数据正常写入根 `data/`。

## 4. knip 基线（C5）

- [ ] 4.1 devDependencies 加入 `knip`；新建 `knip.json`（workspaces entry：web Next.js 约定文件、desktop main/preload、agent runtime entry、core `src/**/index.ts`；ignore 产物与测试路径）。
- [ ] 4.2 运行 knip，报告整理归档 `docs/specs/epic-AG/story-AG.11/knip-baseline.md`（按文件级 / 导出级 / 依赖级分组；只记录不删除）。

## 5. 验证与文档同步（C4/C5 验证 + C6）

- [x] 5.1 TC-4 双端编译 0 error（desktop tsc 在预构建 4 个 perception-plugin + pi-agent-adapter 后通过——worktree 首次构建需先产出插件 dist）；TC-6 测试基线零 delta（web 425/425；desktop 6 failed | 176 passed (182)，失败集合 = 基线 email-provisioning ×5 + verify-windows-package ×1，2 个文件；首跑出现 safe-storage-credential-adapter 短暂失败（3 files/174 passed），复跑 2 次均回到基线，隔离运行 2/2 通过，定性为 Electron safeStorage 并发竞态 flake，与 AG.9 基线先例一致，非 C2/C4 回归）；`openspec validate clean-redundant-docs-and-dead-code --strict` 通过。
- [x] 5.2 TC-5 打包冒烟通过：`pnpm desktop:build` exit 0（19 个 worker runtime 模块校验 OK、repo root clean）；electron-builder（从 packages/desktop 运行，--dir）产出 `release/mac-arm64/OriginOS CE.app`（985M；签名跳过为无 Developer ID 证书的预期行为，不影响产物）；asar 内 `@originos/core/package.json` exports 132 条 / 0 通配符；打包启动 60s 观察：`[setup-data-root] Packaged mode → DATA_ROOT: ~/Library/Application Support/@originos/desktop/data`，0 MODULE_NOT_FOUND。
- [ ] 5.3 AGENTS.md 目录树 / 数据存储章节与现实核对更新（`packages/service` 行删除、web data 提示清理）；Story AG.11 文档（README 状态、testing.md TC 结果、implementation.md）回写；Epic README 状态；docs/changes 全量流水 + 版本归档。

## 6. 集成

- [ ] 6.1 Proposal 分支合并入 `refactor/arch-governance`（需用户授权），清理 worktree。
