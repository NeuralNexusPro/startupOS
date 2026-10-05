/**
 * Multi-Agent Executor — 集成层：加载 Solution Manifest → 构建拓扑 → DAG 执行。
 *
 * 拆分后本文件（AG.10-T7）仅保留 executeSupervisorDag 编排主体与 executeCollaborationRuntime 统一入口；
 * manifest/拓扑构建见 supervisor-dag-manifest，静态 DAG 路径见 supervisor-dag-workflow，
 * 验收器见 supervisor-dag-verifier，HITL 路由见 supervisor-dag-hitl，
 * 协调工具分派见 supervisor-dag-tools / supervisor-dag-dispatch。
 * 全部 11 个公共符号经下方 re-export 原样保留（消费方 import specifier 零变化）。
 */

import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { getDataRoot } from '../../../lib/paths';

import {
  Blackboard,
  UpstreamResults,
} from "../../../modules/collaboration-runtime";
import { CapabilityMatcher } from "./capability-matcher";
import { ProtocolObserver, registerProtocolObserver, stopProtocolObserver } from "./protocol-observer";
import { getGlobalSpawner, type AgentProcess } from "../../../modules/collaboration-runtime/sandbox";
import { runtimeLLMConfigToWorkerModel } from "../../../lib/integrations/pi-agent/llm-config";

import type { EventStore } from "../../../modules/collaboration-runtime/session/event-store";
import type { RuntimeEvent } from "../../../modules/collaboration-runtime/session/types";
import { selectExecutionMode, type ExecutionMode } from "../../../modules/collaboration-runtime/engine/mode-router";

import type {
  MultiAgentExecutionResult,
  MultiAgentExecutorConfig,
  UpstreamOutput,
} from "./supervisor-dag-types";
import { logRuntime, summarizeRuntimeConfig } from "./supervisor-dag-types";
import {
  findLatestManifestDir,
  loadAgentsJson,
  extractEdges,
  buildTopology,
} from "./supervisor-dag-manifest";
import { executeMultiAgentDag } from "./supervisor-dag-workflow";
import { handleSupervisorToolCall, type SupervisorDagCtx, type WorkerResultEntry } from "./supervisor-dag-tools";
import { hitlResumerRegistry } from "./supervisor-dag-hitl";
import { runDispatchWorker } from "./supervisor-dag-dispatch";

// AG.10-T7 拆分 re-export：原单文件公共 API 逐符号原样保留（消费方 import specifier 零变化）
export { wrapWorkerHumanReviewRequest, resumeSupervisorHitl } from "./supervisor-dag-hitl";
export type { MultiAgentExecutionResult, MultiAgentExecutorConfig } from "./supervisor-dag-types";
export { executeMultiAgentDag, loadProjectTopology, computeTaskLevels } from "./supervisor-dag-workflow";
export { verifierFallbackResult } from "./supervisor-dag-verifier";
export type { VerificationResult } from "./supervisor-dag-verifier";

export async function executeSupervisorDag(
  config: MultiAgentExecutorConfig,
  eventStore: EventStore,
  eventEmitter?: { emit: (event: RuntimeEvent) => void }
): Promise<MultiAgentExecutionResult> {
  const dagStartedAt = Date.now();
  logRuntime("dag.start", {
    projectId: config.projectId,
    sessionId: config.sessionId ?? "default",
    goalChars: config.globalGoal.length,
    timeoutMs: config.timeoutMs ?? "default",
    maxIterations: config.maxIterations ?? "default",
    llmConfig: summarizeRuntimeConfig(config.llmConfig),
  });
  // 1. 加载 manifest
  const manifestDir = await findLatestManifestDir(config.projectId);
  if (manifestDir === null) {
    throw new Error(`No solution manifest found for project ${config.projectId}`);
  }

  const agents = await loadAgentsJson(manifestDir);
  if (agents.length === 0) {
    throw new Error(`No agents defined in manifest for project ${config.projectId}`);
  }

  const edges = extractEdges(agents);
  const topology = buildTopology(agents, edges);

  console.log(`[SupervisorDag] SUPA-02 glue layer: ${agents.length} agents, ${edges.length} edges`);
  logRuntime("dag.manifest.loaded", {
    projectId: config.projectId,
    sessionId: config.sessionId ?? "default",
    manifestDir,
    agents: agents.map((agent) => agent.id),
    edgeCount: edges.length,
    topologyMode: topology.mode,
  });

  // Emit SUPERVISOR_AGENT_START event
  const supervisorStartEvent: RuntimeEvent = {
    id: `sup-start-${Date.now()}`,
    sessionId: config.sessionId ?? "supervisor",
    seq: 0,
    type: "SUPERVISOR_AGENT_START",
    payload: { agentCount: agents.length, edgeCount: edges.length },
    source: "supervisor",
    timestamp: new Date().toISOString(),
  };
  void eventStore.append(supervisorStartEvent);
  eventEmitter?.emit(supervisorStartEvent);

  // 2. Blackboard（用于持久化 upstream 产出 + swarm task 状态）
  const blackboardDir = path.join(getDataRoot(), "projects", config.projectId, "collaboration-sessions", config.sessionId ?? "default");

  // 附件目录（绝对路径），用于注入 Worker prompt
  const attachmentsAbsDir = path.join(blackboardDir, "attachments");

  let blackboard = await Blackboard.loadSnapshot(config.sessionId ?? config.projectId, blackboardDir);
  if (!blackboard) {
    blackboard = new Blackboard(config.sessionId ?? config.projectId, blackboardDir);
  }
  const bb = blackboard;
  const protocol = new ProtocolObserver(bb, `supervisor-${bb.sessionId}`, blackboardDir);
  await registerProtocolObserver(protocol);
  const workerTaskIds = new Map<string, string>();
  try {

  const upstreamResults = new UpstreamResults(bb);
  const workerModel = runtimeLLMConfigToWorkerModel(config.llmConfig);
  logRuntime("dag.worker_model.resolved", {
    projectId: config.projectId,
    sessionId: config.sessionId ?? "default",
    workerModel: summarizeRuntimeConfig(workerModel),
  });

  const completedAgents: string[] = [];
  const failedAgents: string[] = [];
  const upstreamOutputs = new Map<string, UpstreamOutput>();

  // spawner is declared early so the registered callback can reference it
  const spawner = getGlobalSpawner();

  // Worker 状态追踪
  const workerResults = new Map<string, WorkerResultEntry>();

  // wait_workers 等待器：当 Worker 完成后，通过 Promise.resolve 通知
  const workerCompletionCallbacks = new Map<string, Array<() => void>>();

  const notifyWorkerCompletion = (workerId: string): void => {
    const callbacks = workerCompletionCallbacks.get(workerId) ?? [];
    workerCompletionCallbacks.delete(workerId);
    for (const cb of callbacks) cb();
  };

  // 3. 写入 Supervisor 工作目录的协作上下文
  // supervisor agentId 按 session 隔离，避免多 session 共用同一 spawner ID
  const supervisorAgentId = `supervisor-${config.sessionId ?? config.projectId}`;
  const supervisorWorkDir = path.join(getDataRoot(), "projects", config.projectId);
  await mkdir(supervisorWorkDir, { recursive: true });

  // 写入 project-collaboration-context.json（initializeSupervisorAgent 通过 loadProjectCollaborationContext 读取）
  const collabContextPath = path.join(supervisorWorkDir, "project-collaboration-context.json");
  const collabContext = {
    // 包含业务项目 ID，用于区分 OriginOS 业务项目和本体中的"项目"概念
    originosProjectId: config.projectId,
    ontologyId: `ontology-${config.projectId}`,
    projectId: config.projectId,
    agentId: supervisorAgentId,
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      responsibility: a.responsibility,
      skills: a.skills ?? [],
    })),
    topology: {
      edges: edges.map((e) => ({ from: e.from, to: e.to, type: e.type, description: e.description })),
      entryPoints: topology.entryPoints,
      exitPoints: topology.exitPoints,
    },
    globalGoal: config.globalGoal,
  };
  await writeFile(collabContextPath, JSON.stringify(collabContext, null, 2), "utf-8");

  // 同时写入 Agent.md（Supervisor 身份定义）
  const agentMdPath = path.join(supervisorWorkDir, "Agent.md");
  try {
    await readFile(agentMdPath, "utf-8");
    // Agent.md 已存在，不覆盖
  } catch {
    const agentMd = `# Supervisor Agent

## 身份

你是多 Agent 协作系统的 Supervisor（调度官）。你的职责是：

1. 根据全局目标和可用 Worker Agent 列表，制定任务分解和执行计划
2. 使用 dispatch_worker 工具派发子任务给指定 Worker Agent
3. 使用 wait_workers 工具等待 Worker 完成
4. 使用 run_verifier 工具验收 Worker 产出
5. 使用 bb_list_artifacts / bb_get_artifact 监控协作黑板
6. 所有 Worker 完成后，汇总结果并结束

## 约束

- 不直接执行业务任务，只负责调度和协调
- 每个 Worker 只能接受一个明确的子任务
- 必须在所有 Worker 完成后发出最终汇总
`;
    await writeFile(agentMdPath, agentMd, "utf-8");
  }

  // 4. 启动 Supervisor 子进程
  const supervisorEvents: RuntimeEvent[] = [];

  // Pending HITL resolve: for SUPERVISOR_TOOL_CALL-based HITL (escalate_to_human in glue layer)
  // 仅经 ctx.setPendingHitlResolve 写入（escalate/ask_user 后无本地读取点，见 supervisor-dag-tools）
  let pendingHitlResolve: ((reply: string) => void) | null = null;
  void pendingHitlResolve;

  // Supervisor 完成信号
  let supervisorResolveDone!: (result: { completedAgents: string[]; failedAgents: string[] }) => void;
  let supervisorRejectDone!: (err: Error) => void;
  const supervisorDonePromise = new Promise<{ completedAgents: string[]; failedAgents: string[] }>((resolve, reject) => {
    supervisorResolveDone = resolve;
    supervisorRejectDone = reject;
  });

  protocol.onCancel = () => supervisorRejectDone(new Error("SESSION_ABORTED"));

  // 事件处理器 — 拦截 SUPERVISOR_TOOL_CALL 事件
  const onSupervisorEvent = (event: RuntimeEvent): void => {
    if (protocol.isClosed) return;
    if (event.type === "AGENT_FAIL_TASK") supervisorRejectDone(new Error("SUPERVISOR_FAILED"));
    supervisorEvents.push(event);
    void eventStore.append(event);
    eventEmitter?.emit(event);

    if (event.type === "AGENT_END" && event.source === supervisorAgentId) {
      // Supervisor 完成
      supervisorResolveDone({ completedAgents, failedAgents });
      return;
    }

    // Supervisor called escalate_to_human inside the worker (HITL_PAUSE path) — register resume handler
    if (event.type === "HUMAN_REVIEW_REQUEST" && event.source === supervisorAgentId) {
      protocol.pause();
      // Register resume handler: when user replies, call supervisorProc.resume()
      if (config.sessionId) {
        hitlResumerRegistry.set(config.sessionId, (reply: string) => {
          protocol.start();
          const sup = getGlobalSpawner().get(supervisorAgentId);
          if (sup) {
            sup.resume(reply).catch((err: Error) => {
              console.error(`[SupervisorDag] resume() failed:`, err);
            });
          }
        });
      }
      return;
    }

    if (event.type === "SUPERVISOR_TOOL_CALL") {
      const { toolCallId, toolName, args } = event.payload as {
        toolCallId: string;
        toolName: string;
        args: unknown;
      };

      // 异步处理工具调用，不阻塞事件处理器
      void handleSupervisorToolCall(ctx, toolCallId, toolName, args as Record<string, unknown>);
    }
  };

  function recordTaskEvent(type: RuntimeEvent["type"], payload: Record<string, unknown>, source = "supervisor"): void {
    const event: RuntimeEvent = { id: `protocol-${Date.now()}-${Math.random()}`, sessionId: bb.sessionId, seq: 0, type, payload, source, timestamp: new Date().toISOString() };
    void eventStore.append(event).catch(() => console.error("[collaboration-protocol] event persistence failed"));
    eventEmitter?.emit(event);
  }

  function availableWorkers() {
    const tasks = bb.getTasks();
    return new CapabilityMatcher().match({ description: config.globalGoal }, agents.map(agent => {
      const own = tasks.filter(task => task.assignedTo === agent.id);
      const terminal = own.filter(task => task.status === "completed" || task.status === "failed");
      return {
        agentId: agent.id, capabilities: agent.skills ?? [], skills: agent.skills ?? [], domain: agent.businessDomain,
        currentLoad: own.filter(task => ["assigned", "running", "reported", "blocked"].includes(task.status)).length,
        successRate: terminal.length ? terminal.filter(task => task.status === "completed").length / terminal.length : undefined,
      };
    }));
  }


  // 5.5 组装 ctx（D3）：闭包环境显式化后传给 tools/dispatch
  const ctx: SupervisorDagCtx = {
    config,
    agents,
    edges,
    topology,
    bb,
    protocol,
    eventStore,
    eventEmitter,
    workerModel,
    blackboardDir,
    attachmentsAbsDir,
    supervisorAgentId,
    workerTaskIds,
    workerResults,
    upstreamResults,
    upstreamOutputs,
    completedAgents,
    failedAgents,
    supervisorEvents,
    spawner,
    workerCompletionCallbacks,
    setPendingHitlResolve: (fn) => { pendingHitlResolve = fn; },
    recordTaskEvent,
    notifyWorkerCompletion,
    availableWorkers,
    dispatchWorker: (args) => runDispatchWorker(ctx, args),
  };


  let supervisorProc: AgentProcess;
  try {
    const spawnAt = Date.now();
    logRuntime("supervisor.spawn.start", {
      projectId: config.projectId,
      sessionId: config.sessionId ?? "default",
      agentId: supervisorAgentId,
      workingDirectory: supervisorWorkDir,
      blackboardDir,
      model: summarizeRuntimeConfig(workerModel),
    });
    supervisorProc = await spawner.spawn(
      {
        projectId: config.projectId,
        agentId: supervisorAgentId,
        workingDirectory: supervisorWorkDir,
        agentType: "supervisor",
        collaborationSessionId: config.sessionId,
        blackboardDir,
        model: workerModel,
      },
      onSupervisorEvent,
    );
    logRuntime("supervisor.spawn.ready", {
      projectId: config.projectId,
      sessionId: config.sessionId ?? "default",
      agentId: supervisorAgentId,
      elapsedMs: Date.now() - spawnAt,
    });
  } catch (spawnErr) {
    logRuntime("supervisor.spawn.error", {
      projectId: config.projectId,
      sessionId: config.sessionId ?? "default",
      agentId: supervisorAgentId,
      error: (spawnErr as Error).message,
    });
    throw new Error(`Failed to spawn supervisor: ${(spawnErr as Error).message}`);
  }

  // 5. 发送初始 prompt 给 Supervisor
  const topologySummary = agents.map((a) => `- ${a.id} (${a.name}): ${a.responsibility}`).join("\n");

  // 如果附件目录已有文件，注入附件列表供 Supervisor 感知
  let attachmentBlock = "";
  try {
    const { readdirSync } = require("fs") as typeof import("fs");
    const attachFiles = readdirSync(attachmentsAbsDir).filter((f: string) => !f.startsWith(".") && f !== "README.md");
    if (attachFiles.length > 0) {
      const fileLines = attachFiles.map((f: string) => `  - ${path.join(attachmentsAbsDir, f)}`).join("\n");
      attachmentBlock = `\n\n【用户已上传的附件文件】\n以下文件可供 Worker 使用（绝对路径）：\n${fileLines}`;
    }
  } catch { /* 目录不存在，跳过 */ }

  const supervisorPrompt = `你是一个多 Agent 协作任务的协调者（Supervisor）。

【用户目标】
${config.globalGoal}${attachmentBlock}

【团队能力地图（可调用的 Worker Agents）】
${topologySummary}

【你的工作方式】

**第一步：理解意图，制定方案**
分析用户目标，判断需要哪些 Worker、以什么顺序执行。不是所有 Worker 都需要参与——只选与目标直接相关的。

**第二步：向用户说明方案，征求确认**
用简洁的语言告诉用户：
- 你打算做什么（哪些步骤、哪些 Worker）
- 为什么跳过某些 Worker（如果有的话）
- 预计产出是什么

然后使用 ask_user_question 工具询问用户是否同意，或者让用户调整方案。

**第三步：按确认后的方案执行**
用户确认后，按顺序派发 Worker：
- 每次 dispatch_worker 后立即调用 wait_workers 等待完成
- Worker 完成后，根据结果决定是否需要继续派发下一个，或向用户报告进展
- 执行过程中若遇到需要用户决策的情况，再次使用 ask_user_question 询问

**第四步：汇总结果**
所有相关 Worker 完成后，向用户输出清晰的汇总报告。

【执行原则】
- DAG 拓扑只是能力参考，不是必须完整执行的流水线
- 优先理解用户真实意图，而不是机械地走完所有 Worker
- 主动引导用户，而不是等用户告诉你每一步怎么做
- 若数据不存在，直接告知用户现状，不要派发无意义的 Worker
- 每次 dispatch_worker 后必须紧跟 wait_workers，不允许并发派发后统一等待`;

  try {
    // 非阻塞发送（Supervisor 会通过 SUPERVISOR_TOOL_CALL 事件与 glue 层交互）
    logRuntime("supervisor.prompt.dispatch", {
      projectId: config.projectId,
      sessionId: config.sessionId ?? "default",
      agentId: supervisorAgentId,
      promptChars: supervisorPrompt.length,
    });
    protocol.start();
    supervisorProc.prompt(supervisorPrompt).catch((err) => {
      console.error(`[SupervisorDag] Supervisor prompt error:`, err);
      logRuntime("supervisor.prompt.error", {
        projectId: config.projectId,
        sessionId: config.sessionId ?? "default",
        agentId: supervisorAgentId,
        error: err instanceof Error ? err.message : String(err),
      });
      supervisorRejectDone(err instanceof Error ? err : new Error(String(err)));
    });
  } catch (err) {
    logRuntime("supervisor.prompt.throw", {
      projectId: config.projectId,
      sessionId: config.sessionId ?? "default",
      agentId: supervisorAgentId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // 6. 等待 Supervisor 完成（进程不自动销毁，由 abortSession/window 关闭时清理）
  let finalResult: { completedAgents: string[]; failedAgents: string[] };
  let executionFailed = false;
  try {
    finalResult = await supervisorDonePromise;
  } catch (err) {
    executionFailed = true;
    console.error(`[SupervisorDag] Supervisor failed:`, err);
    logRuntime("dag.supervisor.failed", {
      projectId: config.projectId,
      sessionId: config.sessionId ?? "default",
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - dagStartedAt,
    });
    finalResult = { completedAgents, failedAgents };
  }

  const fullyAccepted = !executionFailed && [...workerTaskIds.values()].every(id => bb.getTask(id)?.status === "completed");
  // Emit SUPERVISOR_AGGREGATE event
  const aggregateEvent: RuntimeEvent = {
    id: `sup-aggregate-${Date.now()}`,
    sessionId: config.sessionId ?? "supervisor",
    seq: 0,
    type: "SUPERVISOR_AGGREGATE",
    payload: {
      state: fullyAccepted ? "completed" : "partial",
      completedCount: finalResult.completedAgents.length,
      failedCount: finalResult.failedAgents.length,
    },
    source: "supervisor",
    timestamp: new Date().toISOString(),
  };
  void eventStore.append(aggregateEvent);
  eventEmitter?.emit(aggregateEvent);
  logRuntime("dag.done", {
    projectId: config.projectId,
    sessionId: config.sessionId ?? "default",
    status: fullyAccepted ? "completed" : "failed",
    completedAgents: finalResult.completedAgents,
    failedAgents: finalResult.failedAgents,
    elapsedMs: Date.now() - dagStartedAt,
  });

  return {
    status: fullyAccepted ? "completed" : "failed",
    completedAgents: finalResult.completedAgents,
    failedAgents: finalResult.failedAgents,
    events: supervisorEvents,
  };
  } finally {
    await stopProtocolObserver(bb.sessionId, false, protocol);
  }

}

/**
 * executeCollaborationRuntime — Story 9.28E/F
 *
 * 统一入口：根据 executionMode 参数或拓扑自动路由执行路径。
 * - executionMode="workflow" → DAG 路径
 * - executionMode="system" → Supervisor 路径
 * - 未指定 → mode-router 自动识别（含 notify 回边 → system）
 */
export async function executeCollaborationRuntime(
  config: MultiAgentExecutorConfig,
  eventStore: EventStore,
  eventEmitter?: { emit: (event: RuntimeEvent) => void },
  executionMode?: ExecutionMode
): Promise<MultiAgentExecutionResult> {
  const manifestDir = await findLatestManifestDir(config.projectId);
  if (manifestDir === null) {
    throw new Error(`No solution manifest found for project ${config.projectId}`);
  }

  const agents = await loadAgentsJson(manifestDir);
  const edges = extractEdges(agents);

  const mode: ExecutionMode = executionMode ?? selectExecutionMode({
    collaborations: edges.map((e) => ({ from: e.from, to: e.to, type: e.type })),
  });

  console.log(`[executeCollaborationRuntime] mode=${mode}`);

  if (mode === "system") {
    return executeSupervisorDag(config, eventStore, eventEmitter);
  }
  return executeMultiAgentDag(config, eventStore, eventEmitter);
}
