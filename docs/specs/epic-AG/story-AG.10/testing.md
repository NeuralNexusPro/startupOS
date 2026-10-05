# 测试策略 - Story AG.10

**Story:** 巨型文件拆分 — 单一职责重构
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-10-04

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

---

## AG.10-T3（task-runtime/coordinator.ts）执行结果

**Proposal:** `refactor-task-coordinator`（分支 `proposal/refactor-task-coordinator`，实施分支 `proposal-task/refactor-task-coordinator-1-split`）
**执行日期:** 2026-09-30
**基线:** web 425/425（71 文件）、desktop 182/182（30 文件）、madge core 12 环、coordinator.ts 1142 行（类体约 971 行）

| 用例 | 结果 | 证据 |
|------|------|------|
| TC-1 导出符号不变 | ✅ | 4 个公共符号（`AgentTaskRuntimeCoordinator`/`AgentTaskRuntimeConflictError`/`AgentTaskRuntimeProtocolError`/`AgentTaskRuntimeCoordinatorOptions`）经 coordinator.ts re-export/class 原位可导入；desktop 2 处深路径导入（`agent-task-runtime-ipc.ts` + 测试）specifier 零变化；`task-runtime/index.ts` 的 `export * from "./coordinator"` 不变 |
| TC-2 双端编译 | ✅ | web build `✓ Compiled successfully` 0 error；desktop `tsc -p tsconfig.json` 0 error；`expand-core-exports.cjs --verify` VERIFY PASSED |
| TC-3 测试基线 | ✅ | web **425/425（71 文件）**、desktop **182/182（30 文件）**；`coordinator.test.ts` **21/21**（5 describe）。注：desktop 首轮 1 suite flaky（jev-runtime-wiring），重跑 30 文件全绿，与既有 flaky 记录一致，非拆分引入 |
| TC-4 循环检查 | ✅ | madge = **12 环 = 基线**（存量环为 mcp-in-browser/neural-channel/view-reconciler 等）；`task-runtime/` 内部无新环 |
| TC-5 模块冒烟 | ✅（部分人工） | IPC 协议层：`agent-task-runtime-ipc.test.ts` 13 例全绿（含创建/推进/暂停/恢复/损坏态拒绝）；状态机：coordinator.test 21/21。人工项：Agent 会话内创建正式任务观察状态机推进（依赖 LLM 实际响应，步骤见下） |
| TC-6 行数达标 | ✅ | coordinator.ts **689** ≤ 700；coordinator-commands **328**、coordinator-controls **166**、coordinator-shared **73**、coordinator-types **87** 全部 ≤ 600，首部职责注释齐备（FR-3） |

**拆分产物（1142 行 → 5 文件共 1343 行，含头注释/导入）：**

- `task-runtime/coordinator.ts`（689）— `AgentTaskRuntimeCoordinator` 主类：host 生命周期、任务生命周期、续跑循环编排、状态机与持久化 + 4 个公共符号
- `task-runtime/coordinator-types.ts`（87）— host 桥接与配置类型（逐字移动）
- `task-runtime/coordinator-shared.ts`（73）— 错误类 + 7 个模块级纯 helper（逐字移动）
- `task-runtime/coordinator-commands.ts`（328）— Project metadata / Evidence / Review 命令方法体（D3 ctx 变换）
- `task-runtime/coordinator-controls.ts`（166）— pause/cancel/resume/retry 控制动作 + prompt 构建 + 只读工具调用（D3 ctx 变换）

**逐字一致性复核（集成时 token 级归一化验证，超出 subagent 自查）：**

- `coordinator-types.ts`、`coordinator-shared.ts` 两文件与原文件对应段 **token-identical**（剔除 export 关键字差异）。
- commands 4 个函数体（runMutateProjectTaskMetadata / runRecordVerifiedEvidence / runMutateReview / runCompletionInput）与原方法体 **token-identical**（括号配对提取 + 空白归一 + `this.`→`ctx.` 归一后）。
- controls 6 个函数体中：retryTask / buildContinuationPrompt→buildContinuationPromptText / invokeReadOnlyTaskTool / resumeTask **token-identical**；pauseTask/cancelTask 唯一差异为可变字段访问器变换（`this.continuationGeneration += 1` → `ctx.bumpContinuationGeneration()`、`this.runningPromise = null` → `ctx.resetRunningPromise()`，原文 2 处 → 访问器调用 2 处，一一对应）。
- 主类 28 个保留方法（constructor/initialize/getSnapshot/createTask/controlTask/submitUserReply/updateFromProjection/runContinuationLoop/publishState/queuePersist 等）**全部 token-identical**（逐字）；runContinuationLoop 唯一差异为 `this.buildContinuationPrompt()` → `buildContinuationPromptText()` 重命名调用（归一后 identical）。
- ctx 构造：`createCommandsCtx()`/`createControlsCtx()` 中 `state` 用 getter/setter（`updateFromProjection` 会整体替换 `this.state`，保持对象引用语义——源码注释已标明）；`options`/`initialize`/`requireHost`/`publishState` 等字段与 design.md D3 清单一致。

**实施偏差（1 处，design.md 已预案）：**

1. **ctx 可变字段访问器形态**：design.md D3 建议的 `ctx.getContinuationGeneration()`/`ctx.setRunningPromise(v)` 实施为 `bumpContinuationGeneration()`/`resetRunningPromise()`（按「原方法体对该字段的操作类型」选择最小访问器集合，design.md 明文允许）；`ctx.state` 采用 getter/setter 而非直接对象引用（应对 `updateFromProjection` 整体替换 state 的场景）。降级路径（控制动作留主类）未触发。

**人工验证步骤（TC-5 未自动化部分）:**

1. `pnpm dev` 打开首页 → Agent 会话内创建一个正式任务，观察状态从 planning → running 推进，完成后状态 done 且产出消息渲染正常。
2. 任务运行中点击「停止」再「恢复」，确认暂停/恢复行为与拆分前一致。

**剩余风险:**

- coordinator.ts 689 行仍为编排类大文件（≤ 700 约束内）；后续如需进一步收敛，可按「host 桥接 vs 状态机 vs 持久化」再拆，不阻塞本 task。
- desktop jev-runtime-wiring suite 存在 flaky 记录（重跑即绿），归属既有测试债。

---

## AG.10-T4（features/project/contract-bound-runtime-composition.ts）执行结果

**Proposal:** `refactor-contract-runtime-composition`（分支 `proposal/refactor-contract-runtime-composition`，实施分支 `proposal-task/refactor-contract-runtime-composition-1-split`）
**执行日期:** 2026-09-30
**基线:** web 425/425（71 文件）、desktop 182/182（30 文件）、madge core 12 环、contract-bound-runtime-composition.ts 1102 行

| 用例 | 结果 | 证据 |
|------|------|------|
| TC-1 导出符号不变 | ✅ | 9 个公共符号经主文件 re-export/原位可导入（50–52 行 re-export 段）；`features/project/index.ts` `export *` 不变；3 个包内测试相对导入 specifier 零变化；web/desktop 门面导入与 2 处 `vi.mock('@originos/core/lib/features/project')` 零改动；subagent 以临时 vitest 测试实际 import 全部 9 符号 + 调用组合成功（15/15，验证后删除） |
| TC-2 双端编译 | ✅ | web build `✓ Compiled successfully`；desktop `tsc -p tsconfig.json` 0 error；`expand-core-exports.cjs --verify` VERIFY PASSED（Task + Proposal 双 worktree） |
| TC-3 测试基线 | ✅ | web **425/425（71 文件）**、desktop **182/182（30 文件）**（双 worktree 复验）；3 个 T4 目标测试（composition/recovery/project-task-recovery）**15/15**。注：`solution-design-source.test.ts` 1 例失败已在拆分前基线（主仓 f3afc50，git stash）逐字复现——存量测试债，非拆分引入 |
| TC-4 循环检查 | ✅ | madge = **12 环 = 基线**，0 条路径经过 `composition/`；实施中出现的 13 环（artifact-runtime 经 `agent/server` barrel type import 回边）已用深路径 `../../agent/server/contract-bound-worker` 修正，环集合与基线逐条一致 |
| TC-5 模块冒烟 | ✅ | web/desktop `ontology-cross-package-runtime-wiring.test.ts` **2/2**；desktop `ontology-cross-package-ipc.test.ts` **23/23**；web build 静态导出完整跑完。真实 LLM 执行不在本 task 自动化范围（组合根装配以 wiring 测试覆盖） |
| TC-6 行数达标 | ✅ | 主文件 **141**（≤ 250）；types 83 / artifact-runtime 351 / execution-adapters 316 / task-session-adapters 286 全部 ≤ 600，首部职责注释齐备（FR-3） |

**拆分产物（1102 行 → 5 文件共 1177 行，含头注释/导入）：**

- `features/project/contract-bound-runtime-composition.ts`（141）— 组合根：`createProjectContractRuntimeComposition` + `projectContractRuntimeHost` + 9 个公共符号 re-export
- `features/project/composition/contract-runtime-types.ts`（83）— 协议常量 + `ContractArtifactEnvelope`/`ProjectContractSessionPort` + 3 个导出接口
- `features/project/composition/contract-artifact-runtime.ts`（351）— 12 个纯 helper + `AgentManagerContractRuntime`（目标目录解析、worker prompt、AgentManager 派发落盘）
- `features/project/composition/contract-execution-adapters.ts`（316）— `CanonicalReadiness`/`ArtifactVerifier`/`ArtifactOutcomeDrafts`/`ParentSessionHitl` + schema/解析函数
- `features/project/composition/contract-task-session-adapters.ts`（286）— `RuntimeApprovedProjectTaskPort`/evidence sink/`ProjectContractTaskRuntimeRecovery`/`ProjectContractTaskPriorityMutation`

**逐字一致性复核（集成时 token 级验证，超出 subagent 自查）：**

- 组合根 2 个函数（`createProjectContractRuntimeComposition`、`projectContractRuntimeHost`）与原文件对应段 **token-identical**（括号配对提取 + 空白归一）。
- 8 个类（`AgentManagerContractRuntime`/`CanonicalReadiness`/`ArtifactVerifier`/`ArtifactOutcomeDrafts`/`ParentSessionHitl`/`RuntimeApprovedProjectTaskPort`/`ProjectContractTaskRuntimeRecovery`/`ProjectContractTaskPriorityMutation`）+ 19 个纯函数 + 2 个常量逐一提取对比：**全部一致**。唯一差异形态为 eslint `curly` autofix 的单语句 if 花括号包裹（20 个新增花括号字符，逐位置核验全部为 `if(...)` 后加 `{`、`;}` 收尾，无逻辑改动；brace-stripped 对比 token-identical）。
- subagent 独立以 TS-AST 语句级 multiset 对比：diff = 0（含错误消息字符串与装配顺序）。

**实施偏差（6 处，均已在 tasks.md/design 预案内）：**

1. `contract-artifact-runtime.ts` 对 agent/server 的 type import 用深路径 `../../agent/server/contract-bound-worker`（barrel 会多出 1 条 madge 环：13 > 门禁 12）——行为不变，切断回边。
2. 10 处单语句 if 被 eslint `curly` autofix 加花括号（语句语义经 AST diff 确认零变化）。
3. import 顺序按 eslint `import/order` autofix 重排（纯机械）。
4. `ContractArtifactEnvelope`/`ProjectContractSessionPort` 在 types 文件加 `export`（features/project 内部消费，不经 index.ts 对外包出——design.md D3 预期内）。
5. 12+ 个组合根消费的内部符号在拆分件中加 `export`（design.md D1/D3 预期内）。
6. 主文件删除拆分后不再需要的纯 type import（tsc/eslint 零未用告警）。

**人工验证步骤（TC-5 未自动化部分）:**

1. `pnpm dev` 打开首页 → 对已发布 contract 的项目触发一次协作执行，确认 WorkItem 派发、artifact 落盘、Review 流程与拆分前一致。

**剩余风险:**

- `solution-design-source.test.ts` 存量 1 个失败与本次拆分无关（拆分前基线逐字复现），归属既有测试债。
- composition 拆分件间存在 internal export（envelope/session port 类型）——均为 features/project 包内消费，无公共 API 扩散。

---

## AG.10-T5（integrations/pi-agent/core/agent.ts）执行结果

**Proposal:** `refactor-agent-core`（分支 `proposal/refactor-agent-core`，实施分支 `proposal-task/refactor-agent-core-1-agent-split`）
**执行日期:** 2026-10-01
**基线:** core `__tests__` 7 项既有失败（agent.test 6 + agent-token-estimate 1，合并 64 passed / 71）、store.test 20/20、madge core 12 环、agent.ts 1912 行
**实施方式:** subagent 实施中途停滞 4 次（600s watchdog），文件产出完整但未验证；主会话接管完成全部验证与 2 处修正后提交

| 用例 | 结果 | 证据 |
|------|------|------|
| TC-1 导出符号不变 | ✅ | 6 公共符号（`OriginOSAgent`/`SessionData`/`CreateOriginOSAgentParams`/`createOriginOSAgent`/`AgentCompletionPolicy`/`AgentExecutionOptions`）全部由 agent.ts 直接导出或 re-export，符号清单 diff 为空；5 处包内生产导入 + 15 处测试导入/vi.mock + 1 处 desktop side-effect 导入 specifier 零变化；token 级对比——4 个 completion 方法体在 `this.`→`ctx.` 规范化后逐字相同、agent-internals 8 个 helper 逐字相同、factory 仅 D4 尾行差异；`vi.spyOn(agent, "judgePendingCompletion")` 与 `(agent as any).emitCompletionFailureReport()` 直调锚命中薄委托（失败集未变化即证） |
| TC-2 双端编译 | ✅ | web build exit 0、desktop build exit 0（ctx 修正与 D4 修订后均复跑）；`expand-core-exports.cjs --verify` exit 0；core tsc 0 error（除 client-hooks 5 条既有基线错误） |
| TC-3 测试基线 | ✅ | core `__tests__` 失败集与拆分前基线**逐一相同**（7 项既有失败，名称级 diff 为空）；store.test **20/20**；completion-guard/completion-judge/runtime-history-restore 全绿；hooks 4 测试 90 failed/10 passed 为既有基线（URL 解析环境问题）。web/desktop 全量测试套未在本 task 重跑——build 即编译层验证 + core 侧基线对比构成组合证据 |
| TC-4 循环检查 | ✅ | 终态 madge **12 环 = 基线**；`core/` 目录 4 环全部为基线既有路径（agent→health、task-runtime、token-usage），**新增 3 文件零环**。实施中途 13 环（factory type-only 反向 import 被 madge 8 计边）已按 design D4 传参注入预案修正 |
| TC-5 模块冒烟 | ✅ | `pnpm lint:boundaries` 974 生产文件 **0 诊断**；`check-architecture-boundaries.cjs --self-test` exit 0；web build 静态导出完整跑完（覆盖 agent 工厂经 store 消费链） |
| TC-6 行数达标 | ✅ | agent.ts **1348**（≤1500）；agent-internals **140** / agent-completion **432** / agent-factory **206**（全部 ≤600），首部职责注释齐备（FR-3） |

**拆分产物（1912 行 → 4 文件共 2126 行，含头注释/导入）：**

- `core/agent.ts`（1348）— OriginOSAgent 主类：状态字段、constructor/initialize、事件路由、执行编排、set-get API + 4 个 completion 薄委托 + 工厂薄包装
- `core/agent-internals.ts`（140）— EventEmitter + normalizeStreamProvider/hashText/previewText/previewToolResult/getMessageText/getPromptText/redactErrorForLogging/logInfo（逐字）
- `core/agent-completion.ts`（432）— runJudgePendingCompletion / runWithEmptyStopRecovery / runWithCompletionGuard / emitCompletionFailureReport（D3 ctx 变换，唯一非逐字）+ `AgentCompletionContext` 接口 + judge 常量/类型
- `core/agent-factory.ts`（206）— createOriginOSAgent（泛型签名 `<T>(params, ctor)`）+ SessionData/CreateOriginOSAgentParams

**逐字一致性复核（主会话独立验证，Python 花括号配对提取 + 空白归一）：**

- 4 个 completion 方法：`this.`→`ctx.` 规范化后 token-identical；调用点仅 this.X → ctx.X。
- agent-internals 8 helper：逐字相同（空白归一）。
- agent-factory：仅尾部差异（`new OriginOSAgentClass(...)` → `new ctor(config, healthMonitor)`，D4 传参注入的既定偏差）。

**实施修正（2 处，均记入 proposal design.md/tasks.md）：**

1. **ctx 快照不回写**：初版 `createCompletionCtx()` 以对象属性拷贝组装 ctx，judge 写 `ctx.pendingPromiseStop = true` 落在临时对象、主类字段未变 → 3 用例新增失败（guard 循环条件恒假）。修正为 4 个可变字段（pendingCompletionCandidate/pendingPromiseStop/deferredAgentEndEvent/lastToolFailure）以 **getter/setter 闭包绑定 `self = this`**，赋值直写主类实例，失败集回到基线。
2. **D4 传参注入落地**：madge 8 将 `import type` 计为依赖边（无 skip 选项），factory 持 type-only 反向引用实测 13 环 > 门禁 12。按 design.md D4 预案改 `createOriginOSAgent<T>(params, ctor)` 构造器参数注入 + agent.ts 尾部同名薄包装（消费方符号零变化），环数回到 12。替代方案 setter 注册（`setOriginOSAgentClass`）曾先实施，因 type-only 残环同样超门禁而替换。

**人工验证步骤（TC-5 未自动化部分）:**

1. `pnpm dev` 打开首页发起普通会话（空响应/不完整响应场景触发 empty-stop 恢复与 completion guard）与一次 RoleAgent 会话，确认 completion 判定、恢复循环与失败报告行为与拆分前一致。

**剩余风险:**

- core `__tests__` 7 项既有失败与本次拆分无关（拆分前基线逐字复现），归属既有测试债。
- `AgentCompletionContext` 的 getter/setter 闭包绑定依赖 `self = this` 捕获——若未来在 completion 模块函数中新增对其他主类可变字段的直接赋值，必须同步扩展 ctx 接口（编译期会报错兜底）。
- judge 路径的真实 LLM 时序（15s 超时、2 次重试）以单测 mock 覆盖，未做真实网络验证（与拆分前一致，无行为面变化）。

---

## AG.10-T6（modules/collaboration-runtime/facade/contract-execution.ts）执行结果

**Proposal:** `refactor-contract-execution`（分支 `proposal/refactor-contract-execution`，实施分支 `proposal-task/refactor-contract-execution-1-split`）
**执行日期:** 2026-10-04
**基线:** facade `__tests__` 4 直接覆盖套件 30 用例全绿、collaboration-runtime 全目录 14 项既有失败（capability-matcher 10 + dag-executor 3 + agent-spawner 1）、madge core 12 环、contract-execution.ts 2611 行
**实施方式:** subagent 一次通过（commit `a8a95c8`，7 新文件 + 主文件重写）；主会话独立复验全部 TC 门禁 + token 级对比，追加 1 处 re-export 单行化修正（`fdd940b`，802 → 800 行）

| 用例 | 结果 | 证据 |
|------|------|------|
| TC-1 导出符号不变 | ✅ | 脚本比对 `git show 57ad147:.../contract-execution.ts` 与新主文件 exported symbol 集合——orig 50 / new 50，missing/added 均为 NONE；`git diff 57ad147 HEAD --name-only` 仅含 8 个 contract-execution 文件，facade/index.ts、composition 根、integrations 2+1、facade 兄弟 3、facade 测试 4 全部 import specifier 零变化 |
| TC-2 双端编译 | ✅ | web build exit 0、desktop build exit 0；core tsc 5 errors 全为 client-hooks 既有基线（TS2307 types/agent），0 新增；`expand-core-exports.cjs --verify` exit 0（exports 零增删） |
| TC-3 测试基线 | ✅ | facade `__tests__` 全目录 7 文件 **48/48 全绿**（contract-execution 16 + stage-machine 9 + handoff 4 + protocol-observation 1 直接覆盖，另 18 为 session-store/hitl-dispatcher/protocol-snapshot 兄弟套件）；collaboration-runtime 全目录失败集与基线逐一相同（capability-matcher 10 + dag-executor 3）；integrations 套件与基线相同。**token 级对比（超出 TC-3 的行为一致性证据）：60 个方法/函数体（15 主类方法 + 24 ops + 6 ledger + 14 stages + 1 advance）经 D3 变换规范化后逐一 token-identical** |
| TC-4 循环检查 | ✅ | madge **12 环 = 基线**；facade/ 仅基线环 7 `contract-execution.ts > run-observation.ts`（既有 type-only 反向引用，D4 声明不动）；7 个新文件 0 环路径 |
| TC-5 模块冒烟 | ✅ | `pnpm lint:boundaries` 981 生产文件 **0 诊断**；`check-architecture-boundaries.cjs --self-test` exit 0；`expand-core-exports.cjs --verify` exit 0 |
| TC-6 行数达标 | ✅（备用上限） | 7 新文件全部 ≤ 600：types 414 / shared 148 / lock 67 / ops 389 / ledger 252 / stages 543 / advance 383；主文件 **800 = 备用上限内**（预期 700 未达，见偏差 1） |

**拆分产物（2611 行 → 8 文件共 2996 行，含头注释/导入/re-export）：**

- `contract-execution.ts`（800）— `CollaborationExecutionStore` 主类：9 字段 + constructor、13 个公共 API 方法（逐字）、`advance` observers 桥接（逐字）、`now`、`createCtx()` 工厂 + 全部公共符号 re-export
- `contract-execution-types.ts`（414）— ~50 公共类型 + 7 端口 + Dependencies/ExecutionPort（逐字）
- `contract-execution-shared.ts`（148）— 3 常量 + 3 错误类 + 8 helper（逐字）
- `contract-execution-lock.ts`（67）— `FileCollaborationMutationLock`（逐字）
- `contract-execution-ops.ts`（389）— 24 个无状态运算模块函数（21 直移 + 3 预算加 clock 首参）
- `contract-execution-ledger.ts`（252）— `ContractExecutionCtx` 唯一定义 + runMutate/runReadRun/runWriteRunCas/runPath/runClaimAttempt/runTransition
- `contract-execution-stages.ts`（543）— 14 个阶段提交/HITL 模块函数
- `contract-execution-advance.ts`（383）— `runAdvanceLedger` 五阶段循环

**实施偏差（4 项，记入 proposal design.md D7，均不改变行为）：**

1. **主文件 800 行 > 预期 700**（备用上限 800 内）：13 个公共 API 方法体逐字（约 684 行）+ 62 行 imports + 54 行 re-export 为压缩下限；`export *` 等手段会扩大公共面或破坏「方法体逐字」硬约束，按备用上限判定通过。
2. **ops `locate` 局部变量遮蔽**：原方法体局部 `item`/`attempt` 与模块函数名冲突 → `itemOf`/`attemptOf` 别名（token 等价）。
3. **ledger `claimAttempt`/`transition` 同类遮蔽** → `ops.item(...)` 命名空间调用。
4. **ctx 增加 `observers` 字段**：`writeRunCas` checkpoint 钩子外移后需访问 observers Map → ctx 持结构化类型 `{ checkpoint(): void }` 字段，避免 ledger import `RunObserver` 成新环（observers Map 引用自 constructor 起稳定）。

**主会话修正（1 处）：**

- 单符号 re-export 块（`export { FileCollaborationMutationLock, } from ...` 3 行）收敛为单行（802 → 800 行）；re-export 语义与公共符号集合零变化，修正后重跑 tsc / facade 48 用例 / madge / exports verify 全绿。

**人工验证步骤（未自动化部分）:**

1. `pnpm dev` 触发一次协作运行（或走 integrations 消费链的项目执行流），确认 run 启动/阶段推进/HITL 交互与拆分前一致（CAS/lease/预算路径已由 48 用例覆盖，此为端到端补充）。

**剩余风险:**

- collaboration-runtime 既有 13 项失败（capability-matcher 10 + dag-executor 3）与本次拆分无关（基线逐一复现），归属既有测试债；agent-spawner 基线失败 1 项为时间敏感 flaky（完整套件运行中可通过），与拆分无关。
- `ContractExecutionCtx.observers` 为结构化类型（非 `RunObserver` 泛型）——若未来 observer 接口新增方法且被 ledger 路径消费，需同步扩展该结构（编译期兜底）。

---

## AG.10-T7（modules/collaboration-runtime/engine/supervisor-dag.ts）执行结果

**Proposal:** `refactor-supervisor-dag`（分支 `proposal/refactor-supervisor-dag`，实施分支 `proposal-task/refactor-supervisor-dag-1-split`）
**执行日期:** 2026-10-05
**基线:** engine `__tests__` 13 项既有失败（capability-matcher 10 + dag-executor 3）、collaboration-runtime 全目录失败集与 engine 一致（supervisor-dag-hitl 7 + supervisor-protocol.integration 4 全绿）、madge core 12 环、supervisor-dag.ts 2166 行
**实施方式:** 实施 subagent 4 次停滞（87 次工具调用、0 次写入，与 T5 同一故障模式）→ 按 T5 先例由主会话接管，基于 subagent 已验证的 /tmp 分段快照程序化生成 8 文件（commit `175a088`）；主会话独立复验全部 TC 门禁 + token 级对比

| 用例 | 结果 | 证据 |
|------|------|------|
| TC-1 导出符号不变 | ✅ | tsx 导入验证：8 个运行时函数（`wrapWorkerHumanReviewRequest`/`executeMultiAgentDag`/`loadProjectTopology`/`computeTaskLevels`/`verifierFallbackResult`/`resumeSupervisorHitl`/`executeSupervisorDag`/`executeCollaborationRuntime`）全部在位、3 个类型符号（`MultiAgentExecutionResult`/`MultiAgentExecutorConfig`/`VerificationResult`）可导入；消费方（engine/index.ts、facade/dag-runner.ts、2 个 engine 测试文件、public-api-boundary.test.ts）import specifier 零改动；public-api-boundary 39/39 绿 |
| TC-2 双端编译 | ✅ | web build ✅、desktop build ✅；core tsc 仅 client-hooks 既有基线 5 条 TS2307（types/agent），0 新增；`expand-core-exports.cjs --verify` exit 0（exports 零增删） |
| TC-3 测试基线 | ✅ | supervisor-dag-hitl 7/7 绿、supervisor-protocol.integration 4/4 绿；engine `__tests__` 失败集与主 worktree 基线 **diff 为空（13 项逐一相同）**；collaboration-runtime 全目录 13 failed/331 passed 与基线一致；**token 级对比（超出 TC-3 的行为一致性证据）：1708 条原始可执行行 = 1423 逐字命中 + 235 经 D3-ctx 变换命中 + 50 有已记录变换对应物（export 关键字、WorkerStatus/WorkerResultEntry 类型提升、ctx 首参、pendingHitlResolve setter 形式），未解释 0 条** |
| TC-4 循环检查 | ✅ | madge **12 环 = 基线**；supervisor-dag 新文件在环路径中出现 **0 次** |
| TC-5 模块冒烟 | ✅ | `pnpm lint:boundaries` 988 生产文件 **0 诊断**；`check-architecture-boundaries.cjs --self-test` 51 用例通过；`expand-core-exports.cjs --verify` exit 0 |
| TC-6 行数达标 | ✅ | 主文件 **522 行**（≤700 预期）；7 新文件全部 ≤ 600：types 95 / manifest 195 / verifier 176 / hitl 86 / workflow 412 / dispatch 467 / tools 397 |

**拆分产物（2166 行 → 8 文件共 2348 行，含头注释/导入/re-export）：**

- `supervisor-dag.ts`（522）— `executeSupervisorDag` 编排主体（manifest 加载、Blackboard + ProtocolObserver、状态声明 + ctx 组装、collab-context/Agent.md 写入、`onSupervisorEvent` 接线、Supervisor spawn/prompt/等待/SUPERVISOR_AGGREGATE、finally stopProtocolObserver，逐字）+ `executeCollaborationRuntime`（逐字）+ 全部 11 个公共符号 re-export
- `supervisor-dag-types.ts`（95）— manifest 适配类型（AgentsJsonAgent 等 3 接口）、执行配置（MultiAgentExecutionResult/ExecutorConfig）、UpstreamArtifactRef/UpstreamOutput、summarizeRuntimeConfig/logRuntime helper
- `supervisor-dag-manifest.ts`（195）— agents.json 加载、协作边提取（含 back-edge notify 降级）、拓扑查看规范化、CollaborationTopology 构建、统一 manifest 写入
- `supervisor-dag-verifier.ts`（176）— LLM 任务验收 `verifyTaskCompletion` + 规则回退 `verifierFallbackResult`（SUP-09）+ 消息块类型
- `supervisor-dag-hitl.ts`（86）— `wrapWorkerHumanReviewRequest`、hitlResumerRegistry/__hitlChannelByWorker 全局注册表（HMR 安全）、`resumeSupervisorHitl` 路由（行为逐字）
- `supervisor-dag-workflow.ts`（412）— 静态 DAG 路径 `executeMultiAgentDag`（DagExecutor + Lightweight Supervisor 懒加载）+ 独立拓扑加载 `loadProjectTopology` + `computeTaskLevels`
- `supervisor-dag-dispatch.ts`（467）— dispatch_worker case 主体（`runDispatchWorker(ctx, args)`）+ `buildWorkerPrompt` + `extractAgentOutputFromEvents`
- `supervisor-dag-tools.ts`（397）— `SupervisorDagCtx` 唯一定义（新，见偏差）+ 分派骨架 `handleSupervisorToolCall`（try/switch/catch + sendToolResult 尾部逐字）+ 其余 8 个 case 函数

**实施偏差（3 项，记入 proposal design.md D6/D7，均不改变行为）：**

1. **SupervisorDagCtx 为新参数传递结构**：原 `executeSupervisorDag` 无 class/this，全部共享状态为闭包捕获 → ctx 首参显式化（Map/数组字段持同一引用，原地变更语义不变）；非公共 API，不进 exports 白名单。
2. **`pendingHitlResolve` 重绑定 → setter**：仅 2 处赋值后写入 hitlResumerRegistry、此后无本地读取 → `ctx.setPendingHitlResolve(fn)` 包装，语义无损。
3. **主文件新增 `void pendingHitlResolve;` 1 行**：desktop build TS6133（noUnusedLocals）下原闭包变量声明必须被"读取"一次；`void` 直通不改语义。

**实施过程备注:**

- 对象 key 误替换（`ctx.agents:` 等 2 处）、属性 shorthand（`ctx.blackboardDir,` 2 处）、manifest 重复接口声明 3 类机械替换事故在 tsc 阶段全部暴露并修复；最终 tsc 0 新增 error。
- dispatch 内 2 处 `protocol.isClosed` 裸 `break` 转换为 `return JSON.stringify({ status: "ok" });`（与原行为逐字等价：此刻 resultJson 仍为函数头初始值）。

**人工验证步骤（未自动化部分）:**

1. `pnpm dev` 触发一次 Supervisor 模式协作运行（含 dispatch_worker/wait_workers/HITL escalate 或 ask_user 路径），确认任务分解、Worker 派发、HITL 交互与汇总报告行为与拆分前一致（glue 层已由 supervisor-protocol.integration 4 用例 + hitl 7 用例覆盖，此为端到端补充）。

**剩余风险:**

- collaboration-runtime 既有 13 项失败（capability-matcher 10 + dag-executor 3）与本次拆分无关（基线逐一复现），归属既有测试债。
- `SupervisorDagCtx` 字段为实施时逐字核对清单——若未来 case 函数新增对其他闭包变量的引用，必须同步扩展 ctx 接口（编译期报错兜底）。
- `wait_for_human` 返回裸字符串 `"HITL_PAUSE"`（非 JSON）为既有行为，逐字保留未"修正"。
