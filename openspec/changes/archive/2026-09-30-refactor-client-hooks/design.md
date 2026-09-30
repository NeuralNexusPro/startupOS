# Design: refactor-client-hooks（AG.10-T2）

## D1 拆分映射（行号基于拆分前 1317 行版本）

| 目标文件 | 移入内容（源行） | 预估行数 |
|---------|----------------|---------|
| `client-hooks/session-store.ts` | `SessionState`（39–56）、`globalSessionStore`+`sessionListeners`（58–59）、`getSessionState`（61–76）、`_updateSessionState`（78–86）、`_subscribeToSession`（88–96） | ~75 |
| `client-hooks/types.ts` | `ClientAgentEvent`（105–115）、`UseClientPiAgentState`（120–170） | ~75 |
| `client-hooks/api.ts` | `API_BASE`（176）、`parseSSE`（182–207）、`initializeSession`（213–255）、`sendMessageToAgent`（261–280） | ~120 |
| `client-hooks/message-send.ts` | `sendMessage` 函数体（541–631）外移为 `runSendMessage(deps, message)` | ~120 |
| `client-hooks/message-stream.ts` | `sendMessageStream` 函数体（633–1117）外移为 `runSendMessageStream(deps, message)`（含 Electron IPC 分支 760–912 与 Web SSE 分支 914–1117，整体逐字） | ~520 |
| `client-hooks/use-pi-agent.ts` | `usePiAgent` 主体（309–540 的 state/refs/effects/helpers + 1119–1275 的 abort~返回值）、`usePiAgentEvent`（1276–1293）、`usePiAgentStatus`（1295–1317） | ~420 |
| `client-hooks/index.ts` | re-export 全部 7 个公共符号 + `SessionState` 类型导出（供 deps 类型引用） | ~20 |

**职责单句（FR-3，写入各文件顶部注释）：**

- `session-store.ts`：Pi Agent 客户端全局会话状态存储（跨 hook 实例共享 + 订阅通知）。
- `types.ts`：Pi Agent 客户端 hooks 的公共类型定义（事件与 hook 返回值）。
- `api.ts`：Pi Agent 客户端 API 客户端（SSE 解析与会话初始化/消息发送 HTTP 封装）。
- `message-send.ts`：非流式消息发送流程（纯函数，接收 hook deps）。
- `message-stream.ts`：流式消息发送流程（Electron IPC 与 Web SSE 双分支，纯函数，接收 hook deps）。
- `use-pi-agent.ts`：usePiAgent 主 hook——组装状态、事件与发送流程（含 usePiAgentEvent/usePiAgentStatus 辅助 hooks）。
- `index.ts`：client-hooks 公共导出门面（保持拆分前符号集合不变）。

**有争议项的归属判定：**

- 两个模块级辅助 `useEffect`（卸载清理 348–361、task-runtime 补投递 363–383）依赖 `sessionId` state 与 `setMessages`/`setActiveTools` 等 setState——留在 `use-pi-agent.ts` hook 体内原位置，不外移（外移需把 5+ 个 setState 传入 deps，改写面反而更大）。
- `emitEvent`/`invalidatePendingRestore`/`detachActiveStream`（386–416）被多个 action 共用、依赖各自 ref——留在 hook 体内，通过 deps 传给外移函数。
- `uiState` useMemo 与返回值组装（921–1275）依赖全部 state——留在 hook 尾部。
- `AbortController`/`Date.now` 等浏览器 API 本就是客户端安全约束内允许项，不构成拆分障碍。

## D2 放置位置与目录形态：`pi-agent/client-hooks/` 目录 + index.ts

**决策**：Story architecture.md T2 给出两个等价选项，选「拆为 `client-hooks/` 目录 + index.ts re-export」，理由：

1. 原 `client-hooks.ts` 的 5 个 exports specifier（package.json `./lib/integrations/pi-agent/client-hooks`、hooks.ts 的 `./client-hooks`、测试与 SolutionDesign 的导入路径）全部保持不变——index.ts 承接后 specifier 语义不变，仅 package.json 中该条 exports 的 target 从 `.../client-hooks.ts` 改为 `.../client-hooks/index.ts`（机械路径替换，specifier 不动）。
2. 相对目录 `pi-agent/hooks/` 已被占用（ React hooks 的服务端测试目录，含 `__tests__`），「同目录 hooks/」方案会与之混淆。

**导入路径调整规则**：新目录内文件的相对导入统一按「从 `client-hooks/` 出发」重算——`../electron/...`（原 `./electron/...` 加一级）、`../stream-dedupe`（原 `./stream-dedupe`）、`../types`（原 `./types`）、`../../../types/agent`（原 `../../../types/agent` 加一级）。`message-send.ts`/`message-stream.ts`/`use-pi-agent.ts` 之间用 `./` 同目录相对导入。core 包内部相对导入，不涉及跨包规约。

## D3 sendMessage/sendMessageStream 体外移的变换规则（唯一非逐字变换）

**规则**：useCallback 内函数体提升为模块级 `runXxx(deps, message)`；凡函数体引用的「hook 作用域内、函数体外」声明的变量，一律改为 `deps.<同名>` 字段访问；函数体内部声明的局部变量（`streamId`、`receivedAssistantContent`、`currentAssistantMessageId`、`renderScheduler`、`buffer` 等全部局部状态）保持逐字不动。

deps 接口（字段与 hook 内同名变量一一对应，全部为稳定引用或 ref/state 值）：

```ts
// message-send.ts
interface SendMessageDeps {
  sessionIdRef: React.MutableRefObject<string | null>;
  projectContextRef: React.MutableRefObject<ProjectContext | null>;
  isInitializedRef: React.MutableRefObject<boolean>;
  restoreTargetRef: React.MutableRefObject<string | null>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setErrorMessage: (v: string | null) => void;
  setIsRunning: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  emitEvent: (event: ClientAgentEvent) => void;
}
// message-stream.ts（sendMessage deps 全集 + 流式专属）
interface SendMessageStreamDeps extends SendMessageDeps {
  activeStreamIdRef: React.MutableRefObject<string | null>;
  streamSequenceRef: React.MutableRefObject<number>;
  streamUnsubscribeRef: React.MutableRefObject<(() => void) | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  setProgressMessage: (v: string | null) => void;
  setActiveTools: (v: Array<{ toolName: string; startTime: number }>) => void;
  setArtifactVersion: Dispatch<SetStateAction<number>>;
}
```

**保持不变的行为要点（subagent 验收时逐条对照）：**

- useCallback 依赖数组 `[emitEvent]` 原样保留（deps 对象每次渲染重建，但其中的 ref 与 setState 均为稳定引用，`emitEvent` 为 `[]` 依赖 useCallback——语义与拆分前一致）。
- `isActiveStream`、`beginAssistantTurn`、`createRenderScheduler`、`scheduleUpdate` 等全部闭包内定义的 helper 随函数体逐字移动，不提取。
- console.log/info/error 语句逐条保留（TC-1 辅助核对：console 调用计数守恒）。
- Electron 分支与 Web 分支的先后顺序、`return` 提前退出位置逐字保持。

**备选被拒**：把整个 `usePiAgent` 拆成多个自定义 hook（useAgentSession/useAgentStream/…）——会改变 hook 调用数量与顺序，违反「纯机械拆分」；props 注入 setState——需要改 `hooks.ts` 桥接签名，调用方零改动约束不允许。

## D4 循环依赖预防

依赖方向单向：`index.ts` → `use-pi-agent.ts` → `message-send.ts`/`message-stream.ts` → `api.ts`/`types.ts`/`session-store.ts`；`session-store.ts` 仅依赖 `types.ts`。`use-pi-agent.ts` 不被任何兄弟文件反向导入。`hooks.ts` 桥接改为 `from "./client-hooks"`（index.ts）——相对路径不变，指向目录即解析 index.ts。移动完成后 `npx madge --circular packages/core/src --extensions ts,tsx` 验证 ≤ 基线 12，且 `client-hooks/` 内部无环。

## D5 实施边界（subagent work packages）

单一写入范围（`packages/core/src/lib/integrations/pi-agent/client-hooks*` + `packages/core/package.json` 1 行），设置 1 个 subagent Task worktree 串行实施：

- **WP-1（唯一实施包）**：按 D1 清单移动 + D3 变换规则外移两个发送函数 + C6 门面与 exports target；写入范围 `packages/core/src/lib/integrations/pi-agent/client-hooks/`（新建）、删除 `client-hooks.ts`、`packages/core/package.json`。验收命令：TC-1 符号 diff、TC-2 双端 build、TC-3 测试基线、TC-4 madge、TC-6 行数。

## D6 风险

| 风险 | 缓解 |
|------|------|
| deps 改写遗漏字段 → 运行时 undefined | TypeScript 编译期全量校验（TC-2）；`use-pi-agent.ts` 组装处逐一对照 D3 字段清单 |
| deps 对象每次渲染重建导致 sendMessageStream 身份变化 → 下游 useEffect 重跑 | 该 useCallback 依赖数组仍为 `[emitEvent]`，函数身份不变；组装 deps 对象在 useCallback 体内读取最新 ref（与拆分前闭包语义等价） |
| 流式双分支事件顺序被顺手调整 | subagent 指令「函数体内部逐字」；TC-3 session-isolation + hooks 测试、TC-5 流式冒烟兜底 |
| exports target 改路径后 Next/Electron 打包解析失败 | TC-2 双端 build + `node scripts/expand-core-exports.cjs --verify`；web 测试含 SolutionDesign mock 同 specifier 验证 |
| 新文件超 600 行 | D1 预估最大 message-stream ~520；TC-6 wc -l 验证 |
| 拆块互引成环 | D4 单向依赖 + madge 验证 |
