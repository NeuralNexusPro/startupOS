# Proposal: refactor-supervisor-dag（AG.10-T7 collaboration-runtime/engine/supervisor-dag.ts 巨型文件拆分）

**epic-id:** AG
**story-id:** AG.10
**task-id:** AG10-T7
**owner:** Archersado
**来源 Story 文档：** `docs/specs/epic-AG/story-AG.10/`（README / requirements / architecture / testing）

## Why

`packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts` 当前 2166 行（与 2026-09-28 Story 基线一致），是 Story AG.10 最后一个待拆文件（T7）。现状盘点（2026-10-04 逐段核对）：

| 区块 | 行范围 | 职责 |
|------|--------|------|
| imports + 运行时 helper | 1–118 | CapabilityMatcher / ProtocolObserver / DependencyChecker / `streamSimple` 适配（107）/ `getDataRoot` / Blackboard / parseTopology / DagExecutor / mode-router / SubTask / spawner / llm-config / channel-office proxy；`summarizeRuntimeConfig`（66）/ `logRuntime`（84） |
| 适配类型 | 43–119 | `AgentCollaboration` / `AgentsJsonAgent` / `AgentsJson`（manifest JSON 形状）；`MessageToolCallBlock` / `MessageTextBlock` / `MessageContentBlock` / `StreamChunk`（verifier 消息块）；`UpstreamArtifactRef` / `UpstreamOutput` |
| HITL 事件包装 | 121–150 | `wrapWorkerHumanReviewRequest`（HUMAN_REVIEW_REQUEST → WORKER_BLOCK，导出、零消费方） |
| Manifest/拓扑 | 152–345 | `findLatestManifestDir` / `loadAgentsJson` / `extractEdges` / `normalizeEdgesForTopologyView` / `toManifestAgent` / `buildTopology` / `writeUnifiedManifest`（7 个模块函数） |
| 公共配置类型 | 352–381 | `MultiAgentExecutionResult` / `MultiAgentExecutorConfig` |
| `executeMultiAgentDag` | 383–664 | Workflow 路径（DagExecutor + ensureLightweightSupervisor 懒加载闭包，整函数自包含） |
| `loadProjectTopology` / `computeTaskLevels` | 668–775 | 独立拓扑加载（供查看器）/ SubTask 分层（导出、零外部消费方） |
| Verifier | 779–921 | `VerificationResult` / `verifyTaskCompletion`（LLM 验收）/ `verifierFallbackResult`（SUP-09 可测纯函数） |
| HITL 注册表 | 924–997 | `declare global` × 2（`__hitlResumerRegistry` / `__hitlChannelByWorker`，HMR 安全）+ `resumeSupervisorHitl`（直连 Worker channel 优先、registry fallback） |
| `executeSupervisorDag` | 1000–2066 | **约 1067 行 glue 层巨函数**：manifest 加载 / Blackboard + ProtocolObserver / Worker 状态 Map / collab-context 与 Agent.md 写入 / `onSupervisorEvent` 事件路由 / `recordTaskEvent` / `availableWorkers` / `handleSupervisorToolCall`（1238–1890，`switch` 9 个协调工具 case：dispatch_worker 1248 含 captureWorkerEvent 约 383 行、wait_workers 1631、cancel_worker 1684、run_verifier 1698、bb_list_artifacts 1737、bb_get_artifact 1743、resume_worker 1754、escalate_to_human 1791、ask_user_question 1831、wait_for_human 1866）/ Supervisor spawn + prompt + 汇总 |
| Worker prompt helper | 2068–2140 | `buildWorkerPrompt`（2068）/ `extractAgentOutputFromEvents`（2121）——均仅被 dispatch_worker case 消费 |
| `executeCollaborationRuntime` | 2142–2166 | mode-router 统一入口（system → executeSupervisorDag / workflow → executeMultiAgentDag） |

Story architecture.md T7 方案：「拆出：DAG 解析与校验、执行引擎、Supervisor 决策、失败重分配；engine/index.ts 承接导出」。

消费面（已核查，拆分后全部零改动）：

- `engine/index.ts` 第 4 行：`export { executeSupervisorDag, resumeSupervisorHitl, loadProjectTopology } from "./supervisor-dag"`——主文件保持全部符号可导入即可
- 生产深路径消费唯一一处：`facade/dag-runner.ts` 第 29 行 `import { executeSupervisorDag, resumeSupervisorHitl } from "../../../modules/collaboration-runtime/engine/supervisor-dag"`（第 33 行经 `setResumeSupervisorHitl` 注入 hitl-dispatcher，避免循环依赖——该注入机制不动）
- 模块 index（`collaboration-runtime/index.ts`）与 `facade/index.ts`：**均不导出** supervisor-dag 符号（`public-api-boundary.test.ts` 断言 facade index 禁止导出 `loadProjectTopology`、package.json exports 禁止 `./modules/collaboration-runtime/engine/*`）——两处零改动
- 测试：`engine/__tests__/supervisor-dag-hitl.test.ts`（`resumeSupervisorHitl`）与 `engine/__tests__/supervisor-protocol.integration.test.ts`（`executeSupervisorDag` + `resumeSupervisorHitl`）均 `from "../supervisor-dag"`——主文件 re-export 后零改动
- 导出符号清单（11 个）：`wrapWorkerHumanReviewRequest` / `MultiAgentExecutionResult` / `MultiAgentExecutorConfig` / `executeMultiAgentDag` / `loadProjectTopology` / `computeTaskLevels` / `VerificationResult` / `verifierFallbackResult` / `resumeSupervisorHitl` / `executeSupervisorDag` / `executeCollaborationRuntime`——除上表所列消费点外，web/desktop/core 其余源码零引用（已逐一 grep）
- core exports 白名单：**不含** supervisor-dag 深路径条目——package.json 零改动

关键依赖事实（设计前提，实测核对）：

- `executeSupervisorDag` 内部状态全部为**闭包捕获变量**（非 this）：`workerResults` / `workerTaskIds` / `workerCompletionCallbacks` / `upstreamOutputs` / `completedAgents` / `failedAgents`（Map/Array，const 引用原地变更，引用稳定）与 `supervisorEvents`（const 数组，push-only）、`pendingHitlResolve`（let，两处重绑定后立即写入 registry，此后无读取点）
- 工具 case 内 `resultJson` 局部变量 + `break` 出 switch 的模式共两类：`resultJson = <expr>; break;`（赋值后跳出）与裸 `break`（仅 2 处，均在 dispatch_worker 的 `if (protocol.isClosed)`，此刻 resultJson 仍为初始值 `JSON.stringify({ status: "ok" })`）
- `handleSupervisorToolCall` 尾部 sendToolResult 依赖 `spawner.get(supervisorAgentId)`（ctx 可携带）

## What Changes

- **C1 类型面拆出**：多消费类型（`AgentCollaboration` / `AgentsJsonAgent` / `AgentsJson` / `UpstreamArtifactRef` / `UpstreamOutput` / `ManifestAgent` / `SolutionManifest` / `MultiAgentExecutionResult` / `MultiAgentExecutorConfig`）+ `summarizeRuntimeConfig` / `logRuntime` 移至 `supervisor-dag-types.ts`，逐字移动；单一消费的私有类型（`AgentsJson`→manifest、`Message*Block`/`StreamChunk`→verifier）随唯一消费文件放置。公共类型经主文件 re-export。
- **C2 Manifest/拓扑拆出**：`findLatestManifestDir` / `loadAgentsJson` / `extractEdges` / `normalizeEdgesForTopologyView` / `toManifestAgent` / `buildTopology` / `writeUnifiedManifest` 移至 `supervisor-dag-manifest.ts`，逐字移动。
- **C3 Verifier 拆出**：`VerificationResult` / `verifyTaskCompletion` / `verifierFallbackResult` + `Message*Block` / `StreamChunk` 类型 + `streamSimple` 适配常量（107）移至 `supervisor-dag-verifier.ts`，逐字移动。
- **C4 HITL 拆出**：2 个 `declare global` 注册表 + `resumeSupervisorHitl` + `wrapWorkerHumanReviewRequest` 移至 `supervisor-dag-hitl.ts`，逐字移动（`hitlResumerRegistry` 与两个 globalThis 注册表在该文件内从「模块私有」升级为「跨模块共享导出」，但主文件不 re-export——公共符号集合不变）。
- **C5 Workflow 路径拆出**：`executeMultiAgentDag`（含全部内部闭包，整函数逐字）+ `loadProjectTopology` + `computeTaskLevels` 移至 `supervisor-dag-workflow.ts`。
- **C6 协调工具拆出**：`handleSupervisorToolCall`（含 9 个 case）外移至 `supervisor-dag-tools.ts`——dispatcher 与 8 个中小 case 在 tools，dispatch_worker case（含 captureWorkerEvent 约 383 行 + `buildWorkerPrompt` + `extractAgentOutputFromEvents`）单独移至 `supervisor-dag-dispatch.ts`；`recordTaskEvent` / `availableWorkers` / `notifyWorkerCompletion` 一并移入 tools 并供 dispatch 导入；case 体内 `resultJson` / `break` 按 D3 规则变换为 `return`，共享闭包状态经 `SupervisorDagCtx` 首参注入。
- **C7 主文件收敛**：`supervisor-dag.ts` 保留 `executeSupervisorDag` 编排主体（manifest 加载 / Blackboard + ProtocolObserver / Worker 状态与 ctx 组装 / collab-context 与 Agent.md 写入 / `onSupervisorEvent` / Supervisor spawn + prompt + 等待 + SUPERVISOR_AGGREGATE / finally stopProtocolObserver）+ `executeCollaborationRuntime` + 全部 11 个公共符号 re-export；文件顶部补单句职责注释（FR-3）。

## 硬约束（来自 Story requirements / testing）

- 纯机械拆分：除 D3 列明的受限变换外，不改任何逻辑、不改调用顺序、不新增抽象接口、不重构 prompt 文本与事件 payload。
- **公共导出符号集合不变**：上述 11 个符号全部保持从 `supervisor-dag.ts` 可导入；`engine/index.ts` 第 4 行 re-export 零改动；`facade/dag-runner.ts` 深路径 import 零改动；2 个 engine 测试文件 import 零改动；`facade/index.ts` 与模块 index 零改动（boundary 断言不触发）。
- 测试基线：`engine/__tests__/` 7 文件中 supervisor-dag-hitl（4 用例）与 supervisor-protocol.integration 保持全绿；引擎目录既有失败集（capability-matcher 10 + dag-executor 3 = 13 项）与基线逐一相同；`collaboration-runtime/` 全目录失败集与基线逐一相同。
- madge 循环数 ≤ 基线 12（core 全仓）；`engine/` 新增 7 文件无环。
- 行数达标：新文件单文件 ≤ 600 行；`supervisor-dag.ts` 预期 ≤ 700（glue 编排主文件备用上限 800）。

## 非目标

- 不改 Supervisor 决策语义、dispatch/wait/verifier/HITL 协议、Blackboard 写入格式、事件 payload（全部逐字或 D3 等价）。
- 不改 `engine/index.ts`、`facade/dag-runner.ts`、`facade/hitl-dispatcher.ts`（`setResumeSupervisorHitl` 注入机制原样）。
- 不删除或收紧「导出但零消费」的符号（`wrapWorkerHumanReviewRequest` / `computeTaskLevels` / `executeMultiAgentDag` / `executeCollaborationRuntime` 等）——死代码处置不在本 Proposal 范围。
- 不新增/删除 core exports 条目。

## Capabilities

### 新增

- `collaboration-supervisor-dag-structure`：engine/supervisor-dag 的文件结构约束——类型面 / manifest 与拓扑 / verifier / HITL 注册表 / workflow 路径 / 协调工具（dispatch 独立文件）分文件存放，主文件保留 `executeSupervisorDag` 编排与 `executeCollaborationRuntime` 路由并 re-export 全部公共符号；公共导出符号与行为不变。

## Impact

- **修改**：`packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts`（2166 → 预期 ~600 行）
- **新增**：`engine/` 下 7 个新文件（types ~190 / manifest ~250 / verifier ~170 / hitl ~120 / workflow ~430 / dispatch ~530 / tools ~340）
- **不改**：engine/index.ts、facade/（dag-runner / hitl-dispatcher / index）、collaboration-runtime/index.ts、core exports、web/desktop
- **风险**：case 体外移引入闭包→ctx 绑定偏差（D3 符号映射表 + 2 个 engine 测试套件全绿 + token 级对比兜底）；`hitlResumerRegistry` 等模块私有注册表升级为跨模块导出（仅包内新文件消费，不经主文件对外导出——公共面不变）

## 依赖

- 无前置 Proposal 依赖（T1–T6 已合并）。

## 上线方案

单一 Proposal 集成分支 `proposal/refactor-supervisor-dag`（从 `refactor/arch-governance` 创建，沿用既定偏差——dev 落后 114+ 提交）；应用源码在 subagent Task worktree 实施；完成后按 TC-1~TC-6 全量验证，合并回 `refactor/arch-governance`（需用户授权）。

## 回滚方案

全部为 git 可逆操作：revert 拆分 commit 即恢复单文件形态。拆分期间每步移动后立即验证 core 类型检查与 2 个 supervisor-dag 测试套件，不存在中间态上线窗口。
