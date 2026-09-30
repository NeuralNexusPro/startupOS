# 测试策略 - Story AG.10

**Story:** 巨型文件拆分 — 单一职责重构
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 测试策略

以「既有测试全绿 + 编译 + 循环检查 + 模块冒烟」验证纯移动重构。每个 task（文件）独立走一遍完整链路。

### 测试前置条件

- 记录基线：`pnpm test` 通过数、madge 循环数。

---

## 验收测试用例

### TC-1: 导出符号不变（静态）

```bash
# 拆分前后各跑一次，diff 为空（或仅新增 re-export 行）
grep -E "^export" <target-file> | sort > /tmp/before.txt
# 拆分后对门面文件重复并对比
```

**预期结果：** 符号集合不变

---

### TC-2: 双端编译

```bash
pnpm --filter @originos/web build
pnpm --filter @originos/desktop build
```

**预期结果：** 0 error

---

### TC-3: 测试基线不回退

```bash
pnpm test && pnpm --filter @originos/desktop test
```

**预期结果：** 通过数 ≥ 基线；被拆文件的既有测试文件路径不变且全绿

---

### TC-4: 循环导入检查

```bash
npx madge --circular packages/core/src --extensions ts,tsx
```

**预期结果：** 循环数 ≤ 基线

---

### TC-5: 模块冒烟（按 task 对应执行）

| Task | 冒烟场景 |
|------|---------|
| T1 page.tsx | 首页加载、窗口打开/关闭、Dock 交互 |
| T2 client-hooks | Skill 对话流式会话收发 |
| T3 coordinator | Agent 会话内任务执行一次 |
| T4 composition | 新建项目并启动 Project Agent |
| T5 agent.ts | 普通会话 + RoleAgent 各一次 |
| T6 contract-execution | 最小协作会话执行到完成 |
| T7 supervisor-dag | Supervisor 模式任务分解 + 失败重分配（可用 scripts/test-supervisor-execution.ts） |

**预期结果：** 各场景行为与拆分前一致，无新增报错

---

### TC-6: 行数达标

```bash
wc -l <每个新文件>
```

**预期结果：** 单文件 ≤ 600 行（编排类 ≤ 800 行且 PR 已说明）

---

## 自动化测试验证 goal

本 Story 完成后创建自动化测试验证 goal，目标为通过 TC-1 ~ TC-6。TC-5 冒烟中依赖 LLM 实际响应的场景，允许以「事件流到达 + 无错误」为自动化断言；无法自动化的步骤在 goal 输出中记录人工步骤与剩余风险。

---

## AG.10-T1（page.tsx）执行结果

**Proposal:** `refactor-home-page-structure`（分支 `proposal/refactor-home-page-structure`，实施分支 `proposal-task/refactor-home-page-structure-1c-page-split`）
**执行日期:** 2026-09-30
**基线:** web 425/425（71 文件）、desktop 182/182（30 文件）、madge core 12 环、page.tsx 1609 行

| 用例 | 结果 | 证据 |
|------|------|------|
| TC-1 导出符号不变 | ✅ | 拆分后 `grep -E "^export" page.tsx` 仅 `export default function OSHomePage()`，与拆分前一致；全仓无新增 `app/page` 导入方 |
| TC-2 双端编译 | ✅ | `pnpm --filter @originos/web build` 0 error；`pnpm --filter @originos/desktop build` 0 error（另修 decaab3 遗留 tsc 错误：email-provisioning 测试 `Provision` 入参类型收窄，见 1569562） |
| TC-3 测试基线 | ✅ | web **425/425（71 文件）**、desktop **182/182（30 文件）** 全绿，≥ 基线 |
| TC-4 循环检查 | ✅ | `npx madge --circular packages/core/src --extensions ts,tsx` = 12 环 = 基线；`packages/web/src/app/home/` 内部无环 |
| TC-5 模块冒烟 | ✅（部分人工） | 自动化：隔离端口 3177 `next dev` 冒烟——HTTP 200、渲染「欢迎进入 OriginOS / 应用启动器」、`✓ Compiled / in 6s (6321 modules)`、日志 0 error。人工项：窗口打开/关闭与 Dock 交互见下方「人工验证步骤」 |
| TC-6 行数达标 | ✅ | page.tsx **108** ≤ 300；welcome-section 80、project-card 190、use-home-state 178、desktop-layout 486 均 ≤ 600；**use-home-handlers 779**（编排类，≤ 800，见下方偏差说明） |

**拆分产物（1609 行 → 6 文件共 1821 行，含模块头注释/导入）：**

- `packages/web/src/app/page.tsx`（108）— 布局门面：`useHomeState` → `useProjects` → `useHomeHandlers` → `<DesktopLayout/>`
- `packages/web/src/app/home/desktop-layout.tsx`（486）— TopMenuBar + 桌面 JSX（原 1294–1608 行逐字移动）
- `packages/web/src/app/home/use-home-handlers.ts`（779）— 窗口 handler + 事件/IPC 订阅 + spotlight
- `packages/web/src/app/home/use-home-state.ts`（178）— 状态集群 + `projectsRef`
- `packages/web/src/app/home/project-card.tsx`（190）— `ProjectCard` + `formatRelativeTime`
- `packages/web/src/app/home/welcome-section.tsx`（80）— `WelcomeSection` + `DESKTOP_WIDGETS`

**实施偏差（2 处，已在 Proposal 主 worktree 集成时验证）：**

1. **desktop-layout.tsx 提取**：原设计 page.tsx 直接保留布局 JSX；因原布局 JSX 315 行 + imports 超出 page.tsx ≤ 300 约束，将整段 JSX（原 1294–1608 行）逐字移入 `home/desktop-layout.tsx`。经逐行 diff 验证 JSX 与原文仅 1 行差异（文件边界 `}`），行为不变。
2. **decaab3 遗留 tsc 修复（1569562）**：desktop build 的 TS2345（email-provisioning 测试 `Provision` 入参 `typeof request` 无法容纳 decaab3 新增 dingtalk 用例）为拆分前已存在（vitest esbuild 不查类型故基线未暴露），非本拆分引入；顺带修复使 TC-2 恢复 0 error。

**人工验证步骤（TC-5 未自动化部分）:**

1. `pnpm dev` 打开首页，点击 Dock「工作台」确认工作空间窗口打开、关闭按钮可关闭。
2. 顶部菜单栏各入口（设置/通知中心）开合正常。

**剩余风险:**

- use-home-handlers.ts 779 行超过 600 常规上限（编排类允许 ≤ 800）：后续可按「窗口 handler vs 事件订阅 vs spotlight」再拆，不阻塞本 task。
- eslint warnings 3211 vs 基线 3140（仅 warning 级，源于 eslint-disable 注释随代码块重新分布），0 error 不变。

---

## AG.10-T2（client-hooks.ts）执行结果

**Proposal:** `refactor-client-hooks`（分支 `proposal/refactor-client-hooks`，实施分支 `proposal-task/refactor-client-hooks-1-split`）
**执行日期:** 2026-09-30
**基线:** web 425/425（71 文件）、desktop 182/182（30 文件）、madge core 12 环、client-hooks.ts 1317 行

| 用例 | 结果 | 证据 |
|------|------|------|
| TC-1 导出符号不变 | ✅ | `client-hooks/index.ts` 承接原 7 个公共符号（`usePiAgent`/`usePiAgentEvent`/`usePiAgentStatus`/`UseClientPiAgentState`/`ClientAgentEvent`/`_updateSessionState`/`_subscribeToSession`）+ `SessionState`/`ClientHookMessage` 类型；`hooks.ts` 桥接 diff 为空；SolutionDesign 深路径导入与 3 个测试文件 specifier 零变化；exports 条目仅 target 改指 index.ts |
| TC-2 双端编译 | ✅ | web build 0 error；desktop build（tsc -p）0 error；`expand-core-exports.cjs --verify` VERIFY PASSED |
| TC-3 测试基线 | ✅ | web **425/425（71 文件）**、desktop **182/182（30 文件）**。注：`client-hooks-session-isolation.test.ts` 有 2 个存量失败（"does not deliver project-level AGENT_EVENT payloads…" / "TC-U4/TC-I1 restores B…"），已在拆分前 HEAD 逐字复现（git stash 验证），失败集合与基线一致，非拆分引入 |
| TC-4 循环检查 | ✅ | madge = **12 环 = 基线**；`client-hooks/` 相关循环 0 |
| TC-5 模块冒烟 | ✅（部分人工） | 自动化：隔离端口 3179 `next dev` HTTP 200、渲染正常、`✓ Compiled / in 7.7s (6331 modules)`、0 error；Electron IPC 流分支以 session-isolation 9/11（=基线）覆盖。人工项：Skill 入口发消息依赖 LLM 实际响应（步骤见下） |
| TC-6 行数达标 | ✅ | message-stream 538 / use-pi-agent 518 / api 121 / message-send 127 / types 96 / session-store 71 / index 20，全部 ≤ 600 |

**逐字一致性复核（集成时 token 级归一化验证，超出 subagent 自查）：**

- 三个纯移动文件（session-store / types / api）与原文件对应段 **token-identical**（剔除文件头注释、import 路径机械加深一级、export 关键字后）。
- `message-send.ts` / `message-stream.ts` 函数体 **token-identical**（2142 / 12968 token，D3 deps 解构后逐字）。
- 主 hook 的 initialize / restoreSession / abort~return / uiState+return / 辅助 hooks 段全部 **token-identical**；`ClientHookMessage` 类型与原 `messages` useState 内联类型逐字一致。
- `sendMessage`/`sendMessageStream` 副作用调用序列（console/setXxx/emitEvent）合并薄包装后 **8/8、23/23 MATCH**；useCallback 依赖数组保持 `[emitEvent]`。

**人工验证步骤（TC-5 未自动化部分）:**

1. `pnpm dev` 打开首页 → 任一技能入口发送一条消息，确认流式回复正常渲染、错误提示与中止按钮可用。

**剩余风险:**

- session-isolation 存量 2 个失败与本次拆分无关（拆分前已存在），归属既有测试债，不阻塞本 task。
- deps 对象每次渲染重建：useCallback 依赖数组仍为 `[emitEvent]`，函数身份不变，下游 useEffect 不受影响（已由 SolutionDesign 集成测试与 web 425 全绿佐证）。
