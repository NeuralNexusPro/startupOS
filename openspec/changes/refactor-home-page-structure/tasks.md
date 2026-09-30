# refactor-home-page-structure 实施任务

对应 Story AG.10 Task AG10-T1。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [x] 1.1 **WP-1 页面拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/web/src/app/page.tsx` 与新建 `packages/web/src/app/home/`；串行——全部改动同一目录，不可并行）
  - 按 design.md D1 清单逐字移动：`WelcomeSection`+`DESKTOP_WIDGETS` → `home/welcome-section.tsx`；`ProjectCardProps`+`ProjectCard`+`formatRelativeTime` → `home/project-card.tsx`；state 集群 → `home/use-home-state.ts`；handler/subscription/spotlight → `home/use-home-handlers.ts`；page.tsx 收敛为布局门面。
  - 每个新文件顶部一句话职责注释（FR-3）；eslint-disable 按块归置（D3）。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-6（命令见 testing.md 与本文件第 2 节）。
  - 完成证据：符号清单 diff 为空、双端 build 0 error、测试通过数 ≥ 基线、madge ≤ 12、`wc -l` 达标，附于本 task。
  - **实施记录（commit 117ee9e，分支 `proposal-task/refactor-home-page-structure-1c-page-split`）：** page.tsx 1609 → 108 行；新文件 welcome-section 80 / project-card 190 / use-home-state 178 / use-home-handlers 779（编排类 ≤800）/ desktop-layout 486（集成时补充提取，原布局 JSX 逐字移动，逐行 diff 仅 1 行边界差异——见 tasks.md 3.1 与 testing.md 偏差说明）。集成时修复 2 处遗漏透传（projectsRef、llmConfig）并复核 JSX 一致性。

## 2. 验证（依赖 1.1）

- [x] 2.1 TC-1 符号不变：拆分前后 `grep -E "^export" page.tsx | sort` diff 为空（或仅 re-export）。**✅ 导出仅 `export default function OSHomePage()`，全仓无新增 `app/page` 导入方。**
- [x] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error。**✅ 双端 0 error（desktop 侧顺带修复 decaab3 遗留 tsc 错误，commit 1569562，非拆分引入）。**
- [x] 2.3 TC-3 测试基线：`pnpm test`（web）与 `pnpm --filter @originos/desktop test` 通过数 ≥ 基线（web 425/425、desktop 182/182 全绿）。**✅ web 425/425（71 文件）、desktop 182/182（30 文件）。**
- [x] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 12；`packages/web/src/app/home/` 无环。**✅ core 12 环 = 基线；home/ 内部无环。**
- [x] 2.5 TC-5 模块冒烟：首页加载、窗口打开/关闭、Dock 交互（web dev 启动人工/自动化冒烟，结果留痕）。**✅ 自动化：隔离端口 3177 `next dev` HTTP 200，渲染「欢迎进入 OriginOS / 应用启动器」，Compiled / 6321 modules，0 error；窗口/Dock 开合为人工验证项（步骤留痕于 story-AG.10/testing.md）。**
- [x] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600、page.tsx ≤ 300。**✅ page.tsx 108；其余 80/190/178/486 ≤ 600；use-home-handlers 779 为编排类 ≤ 800（testing.md 已记录理由）。**

## 3. 集成（依赖 2.x 全部通过）

- [x] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果、README 状态更新。**✅ 已回写 story-AG.10/testing.md（AG.10-T1 执行结果 + 偏差 + 剩余风险）、story-AG.10/README.md（状态 In Progress）、epic-AG/README.md（Story 表行）。**
- [x] 3.2 `openspec validate refactor-home-page-structure --strict` 通过。**✅ merge 0e6e079 后复验 valid。**
- [x] 3.3 docs/changes 全量流水 + 版本归档；如架构围栏变化同步 AGENTS.md（本任务预期不改围栏，仅拆分实现）。**✅ changelog.md + releases/v0.4.0/changelog.md 已追加；无围栏变化，AGENTS.md 不动。**
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
