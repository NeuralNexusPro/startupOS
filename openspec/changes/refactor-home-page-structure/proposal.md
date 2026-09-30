# Proposal: refactor-home-page-structure（AG.10-T1 首页 page.tsx 巨型文件拆分）

**epic-id:** AG
**story-id:** AG.10
**task-id:** AG10-T1
**owner:** Archersado
**来源 Story 文档：** `docs/specs/epic-AG/story-AG.10/`（README / requirements / architecture / testing）

## Why

`packages/web/src/app/page.tsx` 当前 1609 行（与 2026-09-28 Story 基线一致），是 Story AG.10 列出的 7 个巨型文件中风险最低、但同样违反单一职责的首个拆分对象（FR-4 明确按「风险从低到高」排序：page.tsx → client-hooks.ts → coordinator.ts → composition.ts → agent.ts → contract-execution.ts → supervisor-dag.ts）。

现状盘点（2026-09-30 逐段核对）：

| 区块 | 行范围 | 职责 |
|------|--------|------|
| eslint-disable 块 | 1-27 | 24 条整文件规则豁免 |
| Types / helpers / 静态数据 | 73-169 | `ProjectCardProps`、`UserAgent`、`DockActionDetail`、`DESKTOP_WIDGETS`、`formatRelativeTime`、`isNonEmptyString`、`parseNotificationActivationTarget` |
| 独立展示组件 | 175-400 | `WelcomeSection`、`ProjectCard` |
| `TopMenuBar` | 410-479 | 顶栏（时间、感知状态、通知、设置/引导按钮） |
| `OSHomePage` 默认导出 | 485-1609 | **约 1125 行单函数**：onboarding 状态与副作用、agents/skills 加载与删除、projects 管理、8 个窗口打开 handler、dock:action 分发、IPC/BroadcastChannel 订阅、spotlight items 组装、约 310 行布局 JSX |

单文件混合了展示组件、状态集群、窗口编排、IPC 订阅与页面布局五类职责；`max-lines-per-function` 等规则靠整文件 eslint-disable 压制。Story requirements 明确非目标：**只移动代码，不做逻辑重写、性能优化、依赖注入改造**。

## What Changes

- **C1 展示组件拆出**：`WelcomeSection`、`ProjectCard`（含 `ProjectCardProps`、`DESKTOP_WIDGETS`、`formatRelativeTime`）移至 `packages/web/src/app/(home)/components/` 同级新目录（放置与命名见 design.md D2），逐字移动不改逻辑。
- **C2 状态集群归并**：`OSHomePage` 内的 useState/useRef/useMemo 集群（onboarding、settings、dock 高亮、isElectronEnv、userAgents/userSkills、projectsRef、llm 派生值）提取为一个 hook 文件（`useHomeState`），返回值与原变量一一对应。
- **C3 副作用与 handler 拆出**：dock:action 分发、IPC/BroadcastChannel 订阅、通知激活、8 个窗口打开 handler（createProject/skillLaunch/openWorkspace/projectInterview/solutionDesign/collaboration/deleteProject/deleteAgent/deleteSkill）与 spotlight items 组装移入 handler/effect 模块（`useHomeHandlers`），签名与副作用顺序逐字保持。
- **C4 page.tsx 收敛为布局门面**：保留默认导出 `OSHomePage` 名称、布局 JSX（约 310 行）与 Provider 挂载；目标 ≤ 300 行（含 import）。
- **C5 顶部注释单句职责**（FR-3）：每个新文件顶部一句话职责注释。

## 硬约束（来自 Story requirements / testing）

- 纯机械移动：不改任何逻辑、不改 handler 行为、不新增抽象接口。
- **导出符号不变**：`page.tsx` 唯一导出为默认导出 `OSHomePage`，拆分后保持不变，全仓调用方零改动（已核查：`grep -rn "app/page"` 零外部导入方，Next.js 约定路由消费）。
- 每块保持 `'use client'` 语义（page.tsx 已有，新文件不设服务端边界）。
- madge 循环数 ≤ 基线 12。
- 行数达标：新文件单文件 ≤ 600 行；page.tsx ≤ 300 行。

## 非目标

- 不改任何 UI 视觉、交互行为、数据流。
- 不重命名变量、不调整 hook 顺序、不合并重复代码（如多处重复的 agent-dialog 打开逻辑——记录为 Story 备忘，不在本次实施）。
- 不动 `packages/web/src/app/` 下其他页面（desktop/page.tsx、dock/ 等）。
- 不新增状态管理方案（仍用既有 useState/zustand）。

## Capabilities

### 新增

- `home-page-structure`：首页 page.tsx 的文件结构约束——page.tsx 只保留布局门面与 Provider 挂载，展示组件、状态 hook、handler/effect 模块分文件存放；导出符号与行为不变。

## Impact

- **修改**：`packages/web/src/app/page.tsx`（1609 → ≤300 行）
- **新增**：约 4-6 个新文件（展示组件 ×2、状态 hook ×1、handler/effect ×1-2），均在 `packages/web/src/app/` 页面就近目录（不进入 `components/` 公共层，避免把页面私有实现泄漏为公共组件 API）
- **不改**：任何其他文件的 import（page.tsx 无外部导入方）；packages/core、packages/desktop 零改动
- **风险**：拆块互相引用成环（design.md D4 缓解）；SSR/客户端边界（全部维持 'use client'，TC-2 web build 验证）

## 依赖

- 无前置 Proposal 依赖。AG.10 后续 T2-T7 与本 Proposal 无共享文件，可各自独立推进。

## 上线方案

单一 Proposal 集成分支 `proposal/refactor-home-page-structure`（从 `refactor/arch-governance` 创建，沿用 AG.9/AG.11 既定偏差——dev 落后 114+ 提交）；应用源码在 subagent Task worktree 实施；完成后按 TC-1~TC-6 全量验证，合并回 `refactor/arch-governance`（需用户授权）。

## 回滚方案

全部为 git 可逆操作：revert 拆分 commit 即恢复单文件形态。拆分期间 page.tsx 始终保持可编译状态（每步移动后立即验证 build），不存在中间态上线窗口。
