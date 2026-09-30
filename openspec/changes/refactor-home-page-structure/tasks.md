# refactor-home-page-structure 实施任务

对应 Story AG.10 Task AG10-T1。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [ ] 1.1 **WP-1 页面拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/web/src/app/page.tsx` 与新建 `packages/web/src/app/home/`；串行——全部改动同一目录，不可并行）
  - 按 design.md D1 清单逐字移动：`WelcomeSection`+`DESKTOP_WIDGETS` → `home/welcome-section.tsx`；`ProjectCardProps`+`ProjectCard`+`formatRelativeTime` → `home/project-card.tsx`；state 集群 → `home/use-home-state.ts`；handler/subscription/spotlight → `home/use-home-handlers.ts`；page.tsx 收敛为布局门面。
  - 每个新文件顶部一句话职责注释（FR-3）；eslint-disable 按块归置（D3）。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-6（命令见 testing.md 与本文件第 2 节）。
  - 完成证据：符号清单 diff 为空、双端 build 0 error、测试通过数 ≥ 基线、madge ≤ 12、`wc -l` 达标，附于本 task。

## 2. 验证（依赖 1.1）

- [ ] 2.1 TC-1 符号不变：拆分前后 `grep -E "^export" page.tsx | sort` diff 为空（或仅 re-export）。
- [ ] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error。
- [ ] 2.3 TC-3 测试基线：`pnpm test`（web）与 `pnpm --filter @originos/desktop test` 通过数 ≥ 基线（web 425/425、desktop 182/182 全绿）。
- [ ] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 12；`packages/web/src/app/home/` 无环。
- [ ] 2.5 TC-5 模块冒烟：首页加载、窗口打开/关闭、Dock 交互（web dev 启动人工/自动化冒烟，结果留痕）。
- [ ] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600、page.tsx ≤ 300。

## 3. 集成（依赖 2.x 全部通过）

- [ ] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果、README 状态更新。
- [ ] 3.2 `openspec validate refactor-home-page-structure --strict` 通过。
- [ ] 3.3 docs/changes 全量流水 + 版本归档；如架构围栏变化同步 AGENTS.md（本任务预期不改围栏，仅拆分实现）。
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
