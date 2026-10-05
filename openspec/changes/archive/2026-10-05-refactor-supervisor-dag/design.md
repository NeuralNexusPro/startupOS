# refactor-supervisor-dag 设计（AG.10-T7）

## D1 拆分映射（行号基于拆分前 2166 行版本）

| 目标文件 | 移动内容（源行） | 变换 |
|----------|------------------|------|
| `supervisor-dag-types.ts` | `summarizeRuntimeConfig`（66–82）/ `logRuntime`（84–86）/ `AgentCollaboration`（43）/ `AgentsJsonAgent`（50）/ `AgentsJson`（62）/ `UpstreamArtifactRef`（109）/ `UpstreamOutput`（116）/ `ManifestAgent`（301）/ `SolutionManifest`（310）/ `MultiAgentExecutionResult`（352）/ `MultiAgentExecutorConfig`（359） | 逐字；跨模块消费的 type 加 export（`AgentCollaboration` 等原为模块私有）；主文件 re-export 公共面（`MultiAgentExecutionResult`/`MultiAgentExecutorConfig`） |
| `supervisor-dag-manifest.ts` | `findLatestManifestDir`（152）/ `loadAgentsJson`（176）/ `extractEdges`（190）/ `normalizeEdgesForTopologyView`（233）/ `toManifestAgent`（315）/ `buildTopology`（327）/ `writeUnifiedManifest`（336） | 逐字；跨模块消费的函数加 export |
| `supervisor-dag-verifier.ts` | `MessageToolCallBlock`（88）/ `MessageTextBlock`（94）/ `MessageContentBlock`（99）/ `StreamChunk`（101）/ `streamSimple` 适配（21+107）/ `VerificationResult`（779）/ `verifyTaskCompletion`（786）/ `verifierFallbackResult`（903） | 逐字；`verifyTaskCompletion` 加 export（tools 消费）；主文件 re-export 公共面（`VerificationResult`/`verifierFallbackResult`） |
| `supervisor-dag-hitl.ts` | `declare global` ×2（924–941）/ `hitlResumerRegistry`（931）/ `wrapWorkerHumanReviewRequest`（121）/ `resumeSupervisorHitl`（942–997） | 逐字；`hitlResumerRegistry` 与 `__hitlChannelByWorker` getter 加 export（dispatch/tools 消费）；主文件 re-export 公共面（`wrapWorkerHumanReviewRequest`/`resumeSupervisorHitl`） |
| `supervisor-dag-workflow.ts` | `executeMultiAgentDag`（383–664 整函数含全部闭包）/ `loadProjectTopology`（668）/ `computeTaskLevels`（712） | 逐字整函数搬移（内部闭包不拆）；主文件 re-export 公共面 |
| `supervisor-dag-tools.ts` | `SupervisorDagCtx` 接口（新，见 D3）/ `recordTaskEvent` / `availableWorkers` / `handleSupervisorToolCall`（1238–1890 骨架 + 8 个中小 case：wait_workers/cancel_worker/run_verifier/bb_list_artifacts/bb_get_artifact/resume_worker/escalate_to_human/ask_user_question/wait_for_human/default） | case 体按 D3 外移；`buildWorkerPrompt`/`extractAgentOutputFromEvents` 从 dispatch 导入 |
| `supervisor-dag-dispatch.ts` | dispatch_worker case 主体（1248–1630）+ `captureWorkerEvent` 闭包 + `buildWorkerPrompt`（2068）/ `extractAgentOutputFromEvents`（2121） | case 体按 D3 外移为 `runDispatchWorker(ctx, args): Promise<string>` |
| `supervisor-dag.ts`（主文件） | imports 收敛 / `executeSupervisorDag` 编排主体（1000–1236 + 1891–2066）/ `executeCollaborationRuntime`（2142）/ 全部 11 个公共符号 re-export / 顶部单句职责注释 | 编排主体逐字；ctx 组装新增（见 D3） |

行数预估：主文件 ~600 / types ~190 / manifest ~250 / verifier ~170 / hitl ~120 / workflow ~430 / dispatch ~530 / tools ~340（均 ≤ 600 上限）。

## D2 放置位置与导入方向

全部新文件位于 `packages/core/src/modules/collaboration-runtime/engine/` 同目录（与主文件平级），命名前缀 `supervisor-dag-`。依赖方向（单向，无环）：

```
supervisor-dag.ts（编排主文件）
  ├─ import types / manifest / verifier / hitl / workflow / tools
  └─ executeCollaborationRuntime（mode 路由：system→本文件 / workflow→workflow 文件）

supervisor-dag-dispatch.ts ──import──▶ supervisor-dag-tools.ts（ctx 类型 + recordTaskEvent/availableWorkers/notifyWorkerCompletion）
                          ──import──▶ supervisor-dag-types.ts（类型）
                          ──import──▶ supervisor-dag-manifest.ts（无需，经 ctx.topology）
supervisor-dag-tools.ts ──import──▶ types / manifest（extractEdges 不需要）/ verifier（run_verifier）/ hitl（resume_worker 用 __hitlChannelByWorker）
supervisor-dag-workflow.ts ──import──▶ types / manifest / verifier?（否——workflow 不用 verifier）/ sandbox / dag-executor / mode-router?（否，路由在主文件）
```

- `engine/index.ts` 第 4 行 re-export **零改动**（仍从 `./supervisor-dag` 导入）。
- `facade/dag-runner.ts`、`facade/hitl-dispatcher.ts`、模块 index、`facade/index.ts` 零改动。
- madge 8 计 `import type` 为边：新文件间 type-only 引用也按真实依赖设计（ctx 接口唯一定义于 tools，dispatch/tools 均 `import type` 或值导入按需）。

## D3 case 体外移变换规则（唯一非逐字变换）

`handleSupervisorToolCall` 的 `switch` 结构外移：主文件保留事件接线（`SUPERVISOR_TOOL_CALL` → `handleSupervisorToolCall(...)`），工具分派逻辑移入 tools/dispatch。

1. **Ctx 形状**（唯一定义于 `supervisor-dag-tools.ts`，主文件新增 `createSupervisorDagCtx()` 组装）：

```ts
export interface SupervisorDagCtx {
  config: MultiAgentExecutorConfig;
  agents: AgentsJsonAgent[];
  edges: Array<{ from: string; to: string; type: string; description: string }>;
  topology: CollaborationTopology;
  bb: Blackboard;
  protocol: ProtocolObserver;
  eventStore: EventStore;
  eventEmitter?: { emit: (event: RuntimeEvent) => void };
  workerModel: RuntimeLLMConfig → WorkerModel 形态（即 runtimeLLMConfigToWorkerModel 返回值）;
  blackboardDir: string;
  attachmentsAbsDir: string;
  supervisorAgentId: string;
  workerTaskIds: Map<string, string>;
  workerResults: Map<string, { status: WorkerStatus; output: string; artifacts: UpstreamArtifactRef[]; proc?: AgentProcess; messages?: Array<{ role: string; content?: unknown }> }>;
  upstreamResults: UpstreamResults;
  upstreamOutputs: Map<string, UpstreamOutput>;
  completedAgents: string[];
  failedAgents: string[];
  supervisorEvents: RuntimeEvent[];
  spawner: ReturnType<typeof getGlobalSpawner>;
  getSupervisorProc: () => AgentProcess | undefined;  // sendToolResult 尾部需要
  pendingHitlResolve: { set(fn: ((reply: string) => void) | null): void };  // escalate/ask_user 写入点
  hitlResumerRegistry: Map<string, (userReply: string) => void>;
  recordTaskEvent: (type, payload, source?) => void;      // 主文件逐字实现后注入（或 tools 导出后回接）
  notifyWorkerCompletion: (workerId: string) => void;
  availableWorkers: () => ReturnType<CapabilityMatcher["match"]>;
  isClosed: () => boolean;                                 // protocol.isClosed 直通（避免闭包过期读）
}
```

（最终字段以实施时逐字核对为准；原则：**全部经闭包捕获的共享状态经 ctx 显式传递，不得引入模块级可变全局**。）

2. **case → 模块函数**：每个 case 体移为 `runXxx(ctx, args): Promise<string> | string`（返回 resultJson）。两类机械变换：
   - `resultJson = <expr>; break;` → `return <expr>;`
   - 裸 `break;`（2 处，dispatch 内 `if (protocol.isClosed)`）→ `return JSON.stringify({ status: "ok" });`（与原行为逐字等价：此刻 resultJson 未被赋值，仍为函数头初始值）
   - case 内 `switch`/`try-catch` 边界与 `catch (err)` 错误包装保留在 tools 的 `handleSupervisorToolCall` 骨架中，逐字。

3. **this 无关**：原函数全部状态为闭包捕获（无 class、无 this）→ ctx 首参即闭包环境显式化，无 T5/T6 式 getter/setter 需求。Map/数组字段经 ctx 持引用，原地变更语义不变。

4. **注册表导出**：`hitlResumerRegistry`（现为模块级 const）与 `globalThis.__hitlChannelByWorker` 从 supervisor-dag-hitl.ts 导出，tools/dispatch 导入使用；`resumeSupervisorHitl` 行为逐字不变。

5. **prompt/payload 逐字**：`supervisorPrompt` 模板、HITL 事件 payload、`swarm$tasks$*` 写入形状、logRuntime 相位字符串全部逐字保留。

## D4 循环依赖预防

- dispatch → tools 单向；tools 不 import dispatch（`buildWorkerPrompt`/`extractAgentOutputFromEvents` 放 dispatch，由 tools 的分派骨架经 ctx 或直接 import dispatch 消费——若 tools import dispatch 亦为单向（tools→dispatch），同样无环；实施时二选一并保持单向）。
- 主文件 → 全部新文件单向；新文件不 import 主文件。
- `resumeSupervisorHitl` / hitl 注册表仅供 hitl 文件内部与 tools/dispatch 消费；facade/hitl-dispatcher 的 `setResumeSupervisorHitl` 注入链不动（dag-runner → 主文件 re-export → hitl 文件实现）。

## D5 实施边界（subagent work packages）

- 单一 WP-1（串行）：全部改动同一文件族（1 主文件 + 7 新文件），不可并行。
- 写入范围：`packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts` + 新建 7 个 `supervisor-dag-*.ts`。
- 禁改：`engine/index.ts`、`facade/`、`collaboration-runtime/index.ts`、`package.json`、`web/`、`desktop/`。

## D6 风险

- **闭包→ctx 漏字段**：case 体引用了未纳入 ctx 的闭包变量 → tsc 立即暴露（新文件无该标识符）；TC-2/TC-3 兜底。
- **`supervisorEvents` 数组语义**：run_verifier 从中读取、主文件尾部返回 `events: supervisorEvents`——ctx 持同一数组引用，push 语义不变。
- **`pendingHitlResolve` 重绑定**：仅 2 处赋值后写入 registry，此后无读取 → ctx 用 setter 包装即可，不损失语义（D3.1）。
- **`wait_for_human` 返回裸字符串** `"HITL_PAUSE"`（非 JSON）→ 保留逐字，不做"修正"。
- **madge type-only 边**：新文件间 type import 计边，单向设计下不产生环；TC-4 验证 ≤ 12。

## D7 偏差记录（与 Story architecture.md T7 方案的对照）

- Story 方案动词「DAG 解析与校验、执行引擎、Supervisor 决策、失败重分配」映射为实施文件：manifest（解析）+ workflow/tools/dispatch（执行引擎与协调）+ verifier（验收）+ hitl（HITL）；「失败重分配」在现源码中并无独立实现（dispatch 失败即 failTask + failedAgents，无重分配逻辑），不虚构文件。
- `SupervisorDagCtx` 为本拆分新增的参数传递结构（非抽象接口、非公共 API，不导出至 engine/index）；与 T6 `ContractExecutionCtx` 同模式。
