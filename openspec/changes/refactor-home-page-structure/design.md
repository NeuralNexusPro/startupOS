# Design: refactor-home-page-structure（AG.10-T1）

## D1 拆分映射（逐字移动清单）

以 2026-09-30 逐段核对为依据（行号基于拆分前 1609 行版本）：

| 目标文件 | 移入内容（源行） | 预估行数 |
|---------|----------------|---------|
| `home/welcome-section.tsx` | `WelcomeSection`（175-241）、`DESKTOP_WIDGETS`（118-121，仅 WelcomeSection 消费） | ~75 |
| `home/project-card.tsx` | `ProjectCardProps`（77-87）、`ProjectCard`（247-400）、`formatRelativeTime`（123-136，ProjectCard 与 page.tsx 均消费 → 由 project-card.tsx 导出，page.tsx 导入） | ~170 |
| `home/use-home-state.ts` | Types `UserAgent`（89-98）、`DockActionDetail`（100-112）、`isNonEmptyString`（138-140）、`parseNotificationActivationTarget`（142-169）、useState/useRef/useMemo 集群（496-502, 570-578, 798-801, 1146-1149）及派生值 | ~180 |
| `home/use-home-handlers.ts` | 8 个窗口 handler（803-1144）、dock:action 分发 effect（627-729）、IPC/BroadcastChannel 订阅（966-1034）、通知激活（916-975）、删除 handlers（608-625, 1132-1144）、spotlight items 组装（1151-1292）、加载 effect（500-567, 580-605, 627-756, 770-795） | ~550 |
| `page.tsx`（保留） | 顶部注释、'use client'、import 块、`OSHomePage` 布局 JSX（1294-1608）、Provider 挂载 | ≤300 |

**职责单句（FR-3，写入各文件顶部注释）：**

- `welcome-section.tsx`：首页无项目时的欢迎面板展示组件。
- `project-card.tsx`：首页项目卡片展示组件（含草稿徽标、删除确认、协作/方案入口）。
- `use-home-state.ts`：首页全部页面级状态与派生值的归并 hook（无副作用订阅）。
- `use-home-handlers.ts`：首页全部窗口编排 handler 与全局事件/IPC 副作用订阅 hook。
- `page.tsx`：首页布局门面——组装上述模块并渲染桌面布局 JSX。

**有争议项的归属判定：**

- `formatRelativeTime` 被 ProjectCard（366 行）与 page.tsx（1408 行）双消费 → 放 project-card.tsx 并导出，page.tsx 导入。放 use-home-state 会让状态 hook 无端暴露展示格式化函数。
- `parseNotificationActivationTarget` 是纯函数，仅被 handler 层（968、1000 行）消费 → 随 handler 文件。
- `isNonEmptyString` 被 spotlight 组装（1273 行）消费 → 随 handler 文件；WelcomeSection 不用它。
- `DockActionDetail` 类型仅被 dock:action handler（630 行）消费 → 随 handler 文件。
- `UserAgent` 类型被 state（570 行）与 handler（948 行）消费 → 随 state 文件导出，handler 导入。
- spotlight items 组装（1151-1292）虽是 useMemo，但每项的 action 闭包直接调用 8 个 handler，属于 handler 层的派生数据 → 随 handler 文件（`useHomeHandlers` 返回 `spotlightItems`），避免 state→handler 反向依赖。

## D2 放置位置：`packages/web/src/app/home/` 页面就近目录

**决策**：新建 `packages/web/src/app/home/`（与 page.tsx 同级），存放 4 个新文件。

**为什么不放 `components/`**：这 4 个文件是 page.tsx 的页面私有实现，不是可复用组件；放入 `components/os/` 会把它们泄漏为公共组件 API，后续被其他页面导入会固化耦合。AGENTS.md 目录规约允许 `app/` 放页面与布局（业务逻辑下沉约束针对 API route 与可复用逻辑；页面私有展示/编排实现随页面就近存放符合 App Router 惯例，且 Story architecture.md 明示「同目录或就近组件目录」）。

**备选被拒**：
- `app/(home)/components/`：路由组语义不成立——page.tsx 已是根路由，加路由组徒增目录噪音。
- `components/home/`：见上，会把页面私有实现公共化。

**导入形态**：page.tsx 以相对路径 `./home/welcome-section` 导入（app/ 内部惯例；跨包导入规约不适用——同为 packages/web 包内）。

## D3 Hook 接口设计（返回值一一对应，不改 hook 顺序）

`useHomeState(options)`：

```ts
// 输入：handler 不在 state 层，createProject 等依赖 useProjects 的值由 page.tsx 注入
interface UseHomeStateInput { projects: ProjectListItem[] }
// 输出：与拆分前 OSHomePage 体内同名变量一一对应
{
  llmConfigured, llmConfig, isElectronEnv, showDesktopOnboarding, setShowDesktopOnboarding,
  showSettings, setShowSettings, dockGuideHighlight, userAgents, userSkills,
  projectsRef, projectCount, activeProjectCount, draftProjectCount, recentProject,
}
```

`useHomeHandlers(input)`：

```ts
// 输入：state 值 + useProjects 动作 + 窗口组件引用（避免 handler 文件 import 窗口组件导致与 state 成环——实际不会成环，但组件引用集中由 page.tsx 传入可保持 handler 文件纯逻辑）
// 输出：{ handleCreateProject, handleSkillLaunch, handleOpenWorkspace, handleOpenProjectInterview,
//         handleOpenSolutionDesign, handleOpenCollaboration, handleDeleteProject,
//         handleDeleteAgent, handleDeleteSkill, handleNotificationActivation, spotlightItems }
```

**hook 调用顺序不变**：page.tsx 中 `useHomeState` → `useProjects` → `useHomeHandlers` 的组装顺序保证 React hook 规则下与原单函数体内声明顺序语义一致（原代码 projectsRef 在 useProjects 之后声明，state 层内部保持相对顺序即可；Ref 对象跨层传递语义不变）。

**eslint-disable 归置**：原文件 24 条整文件豁免按实际需要随代码块分配到新文件（如 no-console 随 handler，no-explicit-any 随 handler/composition 相关行），page.tsx 保留其 JSX 实际需要的最小集合。豁免范围收窄本身不改变行为，属拆分附带收益，不算逻辑变更。

## D4 循环依赖风险与预防

依赖方向单向：`page.tsx` → handlers → state → （类型）；展示组件互不依赖、不依赖 hooks。`formatRelativeTime` 从 project-card 导出被 page.tsx 导入（page → project-card，单向）。移动完成后运行 `npx madge --circular packages/web/src/app --extensions ts,tsx` 确认新增目录无环；Story 基线（packages/core/src 12 个循环）不涉及 web/app，TC-4 以全仓命令验证 ≤ 12。

## D5 实施边界（subagent work packages）

单一写入范围（全部改动集中在 `packages/web/src/app/` 5 个文件），不可并行拆分——设置 1 个 subagent Task worktree 串行实施：

- **WP-1（唯一实施包）**：按 D1 清单逐字移动 + page.tsx 收敛；写入范围 `packages/web/src/app/page.tsx` + `packages/web/src/app/home/`（新建）。验收命令：TC-1 符号 diff、TC-2 web build、TC-3 测试基线、TC-4 madge、TC-6 行数。

## D6 风险

| 风险 | 缓解 |
|------|------|
| 移动时顺手改逻辑 | subagent 指令明确「逐字移动」；验收用符号清单 diff + 测试基线兜底 |
| hook 拆分改变执行时序 | 返回值一一对应、hook 顺序不变；TC-5 首页冒烟（窗口开/关、Dock 交互） |
| SSR 边界破坏 | 全部 'use client'（page.tsx 已有）；TC-2 `pnpm --filter @originos/web build` |
| 新文件超 600 行 | D1 预估最大 use-home-handlers ~550 行；TC-6 wc -l 验证 |
| 拆块互引成环 | D4 单向依赖 + madge 验证 |
