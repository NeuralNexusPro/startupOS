# Proposal: refactor-client-hooks（AG.10-T2 client-hooks.ts 巨型文件拆分）

**epic-id:** AG
**story-id:** AG.10
**task-id:** AG10-T2
**owner:** Archersado
**来源 Story 文档：** `docs/specs/epic-AG/story-AG.10/`（README / requirements / architecture / testing）

## Why

`packages/core/src/lib/integrations/pi-agent/client-hooks.ts` 当前 1317 行（与 2026-09-28 Story 基线一致），是 Story AG.10 FR-4 风险序列中第 2 个拆分对象。现状盘点（2026-09-30 逐段核对）：

| 区块 | 行范围 | 职责 |
|------|--------|------|
| 头部 + imports | 1–30 | 客户端安全约束注释、7 组 import |
| 全局会话 store | 31–96 | `SessionState`、`globalSessionStore`、`sessionListeners`、`getSessionState`、`_updateSessionState`、`_subscribeToSession` |
| 类型定义 | 98–170 | `ClientAgentEvent`、`UseClientPiAgentState` |
| API 客户端 | 172–280 | `API_BASE`、`parseSSE`、`initializeSession`、`sendMessageToAgent` |
| `usePiAgent` 单函数 | 309–1275 | **约 967 行单函数**：useState/useRef 集群、卸载 effect、task-runtime 补投递 effect、`emitEvent`/`invalidatePendingRestore`/`detachActiveStream`、`initialize`、`restoreSession`、`sendMessage`（~91 行）、`sendMessageStream`（~485 行，内含 Electron IPC 分支 ~152 行与 Web SSE 分支 ~196 行）、`abort`/`destroy`/`updateProjectContext`/`setSystemPrompt`/`setThinkingLevel`/`subscribe`/`reset`、`uiState`、返回值组装 |
| 辅助 hooks | 1276–1317 | `usePiAgentEvent`、`usePiAgentStatus` |

单文件混合了全局状态存储、类型、HTTP/IPC API 客户端、SSE 解析与 React hook 编排五类职责。Story architecture.md T2 方案：「按 hook 单元拆文件（同目录 `hooks/` 或拆为 `client-hooks/` 目录 + index.ts re-export）」。

消费面（已核查，拆分后全部零改动）：

- `pi-agent/hooks.ts` 桥接 re-export `usePiAgent`/`usePiAgentEvent`/`usePiAgentStatus`/`UseClientPiAgentState`/`ClientAgentEvent`（相对路径 `./client-hooks`）
- `packages/core/package.json` exports 显式条目 `./lib/integrations/pi-agent/client-hooks`（AG.9 白名单，132 条之一）
- `packages/web/src/components/solution/SolutionDesign.tsx` 深路径导入 `@originos/core/lib/integrations/pi-agent/client-hooks`
- `SolutionDesign.test.tsx` / `SolutionDesignPublishing.integration.test.tsx` 按同 specifier `vi.mock`
- `pi-agent/__tests__/client-hooks-session-isolation.test.ts` 相对导入 `{ usePiAgent }` 并 mock `electron/env` 与 `electron/services/agent-session`

## What Changes

- **C1 全局会话 store 拆出**：`SessionState`/`globalSessionStore`/`sessionListeners`/`getSessionState`/`_updateSessionState`/`_subscribeToSession`（31–96）移至 `client-hooks/session-store.ts`，逐字移动。
- **C2 类型拆出**：`ClientAgentEvent`、`UseClientPiAgentState`（98–170）移至 `client-hooks/types.ts`，逐字移动。
- **C3 API 客户端拆出**：`API_BASE`、`parseSSE`、`initializeSession`、`sendMessageToAgent`（172–280）移至 `client-hooks/api.ts`，逐字移动（仅 electron service 的相对导入路径因目录加深一级而机械调整）。
- **C4 流式/非流式发送体外移**：`sendMessage`（541–631）与 `sendMessageStream`（633–1117）两个 useCallback 的函数体移为模块级函数（`message-send.ts` / `message-stream.ts`），闭包对 hook 作用域的引用改为显式 deps 对象字段（变换规则见 design.md D3——本 Proposal 唯一允许的非逐字变换）。useCallback 依赖数组语义（`[emitEvent]`）保持不变。
- **C5 主 hook 收敛**：`usePiAgent` 保留在 `client-hooks/use-pi-agent.ts`（含 `usePiAgentEvent`/`usePiAgentStatus`），组装 deps 并调用外移函数；hook 调用顺序与原声明顺序一致。
- **C6 index.ts 门面 + 导出符号不变**：新建 `client-hooks/index.ts` re-export 全部 7 个公共符号（`_updateSessionState`、`_subscribeToSession`、`ClientAgentEvent`、`UseClientPiAgentState`、`usePiAgent`、`usePiAgentEvent`、`usePiAgentStatus`）；`client-hooks.ts` 删除，exports 条目 target 改指 `client-hooks/index.ts`（specifier 不变）。
- **C7 顶部注释单句职责**（FR-3）：每个新文件顶部一句话职责注释。

## 硬约束（来自 Story requirements / testing）

- 纯机械移动：除 D3 定义的「闭包外层引用 → deps 字段」改写外，不改任何逻辑、不改事件处理顺序、不新增抽象接口。
- **导出符号不变**：上述 7 个符号集合与语义不变；全仓调用方 import 零改动（specifier 全部保持原样）。
- 客户端安全约束保持：新文件不引入任何 Node.js 特定依赖（沿用原文件头部约束注释）。
- madge 循环数 ≤ 基线 12（core）。
- 行数达标：新文件单文件 ≤ 600 行；`use-pi-agent.ts` 目标 ≤ 600（编排类上限 800 备用，预期不触发）。
- `client-hooks-session-isolation.test.ts` 与 `hooks/__tests__/` 既有测试全绿（Electron IPC 流分支的主要回归保障）。

## 非目标

- 不改任何会话/流式行为、错误处理、render 调度（`StreamRenderScheduler` 参数与节奏原样）。
- 不合并 `SessionState.messages` 与 `UseClientPiAgentState.messages` 的重复内联类型（保持逐字）。
- 不动 `hooks.ts` 桥接、`store.ts`、`use-persistent-agent.ts` 及 pi-agent 其他文件。
- 不改 exports specifier 名称，不新增/删除 exports 条目（仅 client-hooks 条目 target 文件路径变化）。

## Capabilities

### 新增

- `pi-agent-client-hooks-structure`：Pi Agent 客户端 hooks 的文件结构约束——`client-hooks/` 目录内按 store / types / api / send / stream / 主 hook 分文件，index.ts 承接全部公共导出；导出符号与行为不变。

## Impact

- **修改**：`packages/core/src/lib/integrations/pi-agent/client-hooks.ts`（1317 行 → 删除，转为目录）；`packages/core/package.json`（1 条 exports target 路径）
- **新增**：`packages/core/src/lib/integrations/pi-agent/client-hooks/` 下 7 个文件（index / session-store / types / api / message-send / message-stream / use-pi-agent）
- **不改**：`hooks.ts`、全部消费方 import、packages/web、packages/desktop
- **风险**：sendMessageStream 双分支闭包改写引入行为偏差（design.md D3/D6 缓解：deps 只读外层稳定引用、函数内局部变量零改动、session-isolation 测试 + TC-5 流式冒烟兜底）；exports target 改路径后打包遗漏（TC-2 双端 build + exports verify 门禁兜底）

## 依赖

- 无前置 Proposal 依赖（AG.10-T1 已合并，无共享文件）。T3–T7 与本 Proposal 无交集，可独立推进。

## 上线方案

单一 Proposal 集成分支 `proposal/refactor-client-hooks`（从 `refactor/arch-governance` 创建，沿用 AG.9/AG.11/AG.10-T1 既定偏差——dev 落后 114+ 提交）；应用源码在 subagent Task worktree 实施；完成后按 TC-1~TC-6 全量验证，合并回 `refactor/arch-governance`（需用户授权）。

## 回滚方案

全部为 git 可逆操作：revert 拆分 commit 即恢复单文件形态。拆分期间每步移动后立即验证 core build 与 session-isolation 测试，不存在中间态上线窗口。
