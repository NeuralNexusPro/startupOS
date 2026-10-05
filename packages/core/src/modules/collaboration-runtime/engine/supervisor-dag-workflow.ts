/** Supervisor DAG workflow 路径：DagExecutor 驱动的静态 DAG 执行 + 独立拓扑加载/分层（供查看器） */

import path from 'path';
import { getDataRoot } from '../../../lib/paths';
import { Blackboard, UpstreamResults } from '../../../modules/collaboration-runtime';
import { DagExecutor } from './dag-executor';
import type { SubTask } from './supervisor';
import { getGlobalSpawner, type AgentProcess } from '../../../modules/collaboration-runtime/sandbox';
import { runtimeLLMConfigToWorkerModel } from '../../../lib/integrations/pi-agent/llm-config';
import type { CollaborationTopology, RuntimeEvent } from '../../../modules/collaboration-runtime/session/types';
import type { EventStore } from '../../../modules/collaboration-runtime/session/event-store';
import type { MultiAgentExecutionResult, MultiAgentExecutorConfig } from './supervisor-dag-types';
import { findLatestManifestDir, loadAgentsJson, extractEdges, buildTopology, writeUnifiedManifest, normalizeEdgesForTopologyView } from './supervisor-dag-manifest';

/**
 * 执行多 Agent 协作 DAG。
 *
 * 流程：
 * 1. 加载 solutions/v1.x/agents.json
 * 2. 提取 collaborations → 扁平 edges
 * 3. 构建 CollaborationTopology
 * 4. 写入统一 manifest（向后兼容）
 * 5. 创建 EventStore + Blackboard
 * 6. 通过 DagExecutor 并行/串行执行 Agent 子进程
 */
export async function executeMultiAgentDag(
  config: MultiAgentExecutorConfig,
  eventStore: EventStore,
  eventEmitter?: { emit: (event: RuntimeEvent) => void }
): Promise<MultiAgentExecutionResult> {
  // 1. 加载 manifest
  const manifestDir = await findLatestManifestDir(config.projectId);
  if (manifestDir === null) {
    throw new Error(`No solution manifest found for project ${config.projectId}`);
  }

  const agents = await loadAgentsJson(manifestDir);
  if (agents.length === 0) {
    throw new Error(`No agents defined in manifest for project ${config.projectId}`);
  }

  // 2. 提取边并构建拓扑
  const edges = extractEdges(agents);
  const topology = buildTopology(agents, edges);

  // 3. 写入统一 manifest（向后兼容，不影响执行）
  await writeUnifiedManifest(config.projectId, agents, edges);

  console.log(`[MultiAgentExecutor] Loaded ${agents.length} agents, ${edges.length} edges, mode: ${topology.mode}, entry: ${topology.entryPoints.join(", ")}`);

  // 4. 创建 Blackboard 和基于 Event Sourcing 的 UpstreamResults
  const blackboardDir = path.join(getDataRoot(), "projects", config.projectId, "collaboration-sessions", config.sessionId ?? "default");

  // 创建 Event Store 和 Blackboard
  let blackboard = await Blackboard.loadSnapshot(config.sessionId ?? config.projectId, blackboardDir);
  if (!blackboard) {
    blackboard = new Blackboard(config.sessionId ?? config.projectId, blackboardDir);
  }

  // UpstreamResults 通过 Blackboard 存储（Event Sourcing + Provenance）
  const upstreamResults = new UpstreamResults(blackboard);
  const workerModel = runtimeLLMConfigToWorkerModel(config.llmConfig);

  // 等待中的 Agent 进程引用（供 resume 使用）
  const waitingProcs = new Map<string, AgentProcess>();

  // Story 9.35: Lightweight Supervisor 懒加载状态
  const lsEnabled = config.enableLightweightSupervisor !== false;
  let lightweightSupervisorProc: AgentProcess | null = null;

  /** 懒加载 Lightweight Supervisor 子进程（首次 WORKER_BLOCK 时触发） */
  async function ensureLightweightSupervisor(
    blockEvent: RuntimeEvent
  ): Promise<AgentProcess | null> {
    if (!lsEnabled) return null;
    if (lightweightSupervisorProc) {
      // 复用已有进程：向其路由新的 WORKER_BLOCK
      try {
        await lightweightSupervisorProc.prompt(
          `[WORKER_BLOCK] ${JSON.stringify(blockEvent.payload)}`
        );
      } catch {
        // non-fatal: process may have already completed
      }
      return lightweightSupervisorProc;
    }
    // 首次：spawn supervisor-lite
    const spawner = getGlobalSpawner();
    const supervisorWorkingDir = path.join(getDataRoot(), "agents", "supervisor-lite");
    const supervisorId = `supervisor-lite-${config.sessionId ?? config.projectId}`;
    try {
      const proc = await spawner.spawn(
        {
          projectId: config.projectId,
          agentId: supervisorId,
          workingDirectory: supervisorWorkingDir,
          agentType: "supervisor-lite" as "supervisor",
          model: workerModel,
        },
        (event: RuntimeEvent) => {
          void eventStore.append(event);
          eventEmitter?.emit(event);
        }
      );
      emitSupervisorAgentStart(supervisorId);
      lightweightSupervisorProc = proc;
      // 路由触发此次 spawn 的 WORKER_BLOCK
      await proc.prompt(`[WORKER_BLOCK] ${JSON.stringify(blockEvent.payload)}`);
      return proc;
    } catch (err) {
      console.error("[MultiAgentExecutor] Failed to spawn supervisor-lite:", err);
      return null;
    }
  }

  function emitSupervisorAgentStart(supervisorId: string): void {
    const evt: RuntimeEvent = {
      id: `evt-sup-start-${Date.now()}`,
      sessionId: config.sessionId ?? config.projectId,
      seq: 0,
      type: "AGENT_START",
      payload: { agentId: supervisorId, agentType: "supervisor-lite" },
      source: "runtime",
      timestamp: new Date().toISOString(),
    };
    void eventStore.append(evt);
    eventEmitter?.emit(evt);
  }

  // 为单个 Agent 构建 prompt，注入上游产出上下文
  function buildAgentPrompt(agentId: string, globalGoal: string): string {
    let prompt = globalGoal;

    // 注入上游 Agent 的完成结果
    const dependencies = topology.edges
      .filter((e) => e.to === agentId && e.type === "trigger")
      .map((e) => e.from);

    if (dependencies.length > 0) {
      const upstreamText = dependencies
        .map((depId) => {
          const depAgent = agents.find((a) => a.id === depId);
          const output = upstreamResults.readUpstreamOutput(depId, depAgent?.name ?? depId);
          return `- 【${depAgent?.name ?? depId}】的产出：\n${output}`;
        })
        .join("\n\n");
      prompt += `\n\n【上游 Agent 产出】\n${upstreamText}\n\n请基于上述上游产出继续执行你的任务。`;
    }

    // 注入 Human-in-the-Loop 审查请求指令
    prompt += `\n\n【人类审查请求】\n在执行过程中，如果你遇到需要用户确认的情况（如数据缺失、命名规则冲突、关键审查结果不达标），请输出一条 HUMAN_REVIEW_REQUEST 事件，说明你的问题和需要的确认内容，然后暂停等待用户回复。\n\n触发条件：\n- 数据缺失，需要用户确认是否创建\n- 命名规则冲突，需要用户决策\n- 关键审查结果不达标，需要用户确认继续\n- 任何需要人类判断的场景\n\n示例输出：{"type": "HUMAN_REVIEW_REQUEST", "agentId": "${agentId}", "question": "我遇到了X问题，请确认...", "context": {...}}`;

    return prompt;
  }

  // 从 Agent 事件中提取审查请求
  function findReviewRequest(agentEvents: RuntimeEvent[], agentId: string): RuntimeEvent | undefined {
    return agentEvents.find((e) => e.type === "HUMAN_REVIEW_REQUEST" && e.payload?.["agentId"] === agentId);
  }

  // 从 Agent 事件中提取输出
  function extractAgentOutput(agentEvents: RuntimeEvent[]): string {
    const lastAssistantMsg = agentEvents
      .filter((e) => e.type === "ASSISTANT_MESSAGE" || e.type === "AGENT_END")
      .pop();
    if (lastAssistantMsg) {
      const output = lastAssistantMsg.payload?.["content"]
        ?? lastAssistantMsg.payload?.["message"]
        ?? JSON.stringify(lastAssistantMsg.payload);
      return typeof output === "string" ? output : JSON.stringify(output);
    }
    return "";
  }

  // 4. 创建 DagExecutor
  const executor = new DagExecutor(
    eventStore,
    // AgentExecutor: 通过 AgentSpawner 启动子进程
    async (agentId: string) => {
      // 如果是 resume 场景，复用已有的进程
      const existingProc = waitingProcs.get(agentId);
      if (existingProc) {
        waitingProcs.delete(agentId);
        try {
          await existingProc.waitForReady();
          const events: RuntimeEvent[] = [];
          const output = extractAgentOutput(events);
          if (output) {
            const agent = agents.find((a) => a.id === agentId);
            upstreamResults.writeUpstreamOutput(agentId, agent?.name ?? agentId, output);
          }
          return { status: "completed" as const };
        } catch (err) {
          console.error(`[MultiAgentExecutor] Agent ${agentId} resume failed:`, err);
          return { status: "failed" as const };
        } finally {
          await getGlobalSpawner().destroy(agentId);
        }
      }

      const spawner = getGlobalSpawner();
      const workingDirectory = path.join(getDataRoot(), "projects", config.projectId, "agents", agentId);

      // 捕获该 Agent 的事件流，提取输出 + 检测审查请求
      const agentEvents: RuntimeEvent[] = [];
      const captureEvent = (event: RuntimeEvent): void => {
        agentEvents.push(event);
        void eventStore.append(event);
        eventEmitter?.emit(event);
        // Story 9.35: 检测 WORKER_BLOCK，懒加载 Lightweight Supervisor
        if (event.type === "WORKER_BLOCK") {
          void ensureLightweightSupervisor(event);
        }
      };

      const proc = await spawner.spawn(
        {
          projectId: config.projectId,
          agentId,
          workingDirectory,
          agentType: "originos",
          model: workerModel,
        },
        captureEvent
      );

      try {
        const prompt = buildAgentPrompt(agentId, config.globalGoal);
        await proc.prompt(prompt);

        // 检测 Human Review 请求
        const reviewRequest = findReviewRequest(agentEvents, agentId);
        if (reviewRequest) {
          // 保留进程引用，等待 resume
          waitingProcs.set(agentId, proc);
          return {
            status: "waiting" as const,
            reviewRequest: {
              question: (reviewRequest.payload?.["question"] as string) ?? "",
              context: (reviewRequest.payload?.["context"] as Record<string, unknown>) ?? {},
            },
          };
        }

        // 提取 Agent 输出
        const output = extractAgentOutput(agentEvents);
        if (output) {
          const agent = agents.find((a) => a.id === agentId);
          upstreamResults.writeUpstreamOutput(agentId, agent?.name ?? agentId, output);
        }

        return { status: "completed" as const };
      } catch (err) {
        console.error(`[MultiAgentExecutor] Agent ${agentId} failed:`, err);
        return { status: "failed" as const };
      } finally {
        // 只有在没有等待 resume 时才销毁进程
        if (!waitingProcs.has(agentId)) {
          await spawner.destroy(agentId);
        }
      }
    },
    {
      timeoutMs: config.timeoutMs,
      maxIterations: config.maxIterations,
    }
  );

  // 5. 执行 DAG
  try {
    const result = await executor.execute(topology);
    const statusMap: Record<string, MultiAgentExecutionResult["status"]> = {
      completed: "completed",
      failed: "failed",
      aborted: "aborted",
      timed_out: "timed_out",
      back_pressure: "failed",
    };
    return {
      status: statusMap[result.status] ?? "failed",
      completedAgents: result.completedAgents,
      failedAgents: result.failedAgents,
      events: result.events,
    };
  } catch (err) {
    return {
      status: "failed",
      completedAgents: [],
      failedAgents: [],
      events: [],
    };
  } finally {
    // Story 9.35: 销毁 Lightweight Supervisor（若已 spawn）
    if (lightweightSupervisorProc) {
      const supervisorId = `supervisor-lite-${config.sessionId ?? config.projectId}`;
      try {
        await getGlobalSpawner().destroy(supervisorId);
      } catch {
        // non-fatal
      }
      lightweightSupervisorProc = null;
    }
  }
}

// ============================================================================
// 独立拓扑加载（供 listSessions / 查看器调用）
// ============================================================================

/** 从项目 solution 加载拓扑，不执行 */
export async function loadProjectTopology(projectId: string): Promise<CollaborationTopology | null> {
  const manifestDir = await findLatestManifestDir(projectId);
  if (manifestDir === null) {
    return null;
  }

  try {
    // 加载 Agent 列表
    const agents = await loadAgentsJson(manifestDir);
    const edges = normalizeEdgesForTopologyView(extractEdges(agents));

    // --------------------------------------------------------------------
    // 超时保护：防止构图过慢阻塞 API
    // --------------------------------------------------------------------
    const timeoutMs = 5000;
    const topologyPromise = (async () => {
      const topology = buildTopology(agents, edges);
      await writeUnifiedManifest(projectId, agents, edges);
      return topology;
    })();

    const topology = await Promise.race([
      topologyPromise,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error(`Topology build timeout after ${timeoutMs}ms`)), timeoutMs)),
    ]);

    return topology;
  } catch (err) {
    console.error(`[loadProjectTopology] failed:`, err);
    return null;
  }
}

// ============================================================================
// Supervisor / Swarm Mode — Story 9.28
// ============================================================================


/**
 * 计算 SubTask 的依赖层级，用于 barrier-aware 并行执行。
 * - entryPoint agents（无上游 trigger）→ level 0
 * - 依赖上游的 agents → level = max(upstream levels) + 1
 * 返回按 level 分组的 SubTask 数组：[[level0], [level1], ...]
 */
export function computeTaskLevels(
  subTasks: SubTask[],
  topology: CollaborationTopology,
): SubTask[][] {
  const taskByAgentId = new Map(subTasks.map((task) => [task.assignedWorker ?? task.id, task]));
  const levels = new Map<string, number>();
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const agentId of taskByAgentId.keys()) {
    indegree.set(agentId, 0);
    outgoing.set(agentId, []);
  }

  for (const edge of topology.edges.filter((item) => item.type === "trigger")) {
    if (!taskByAgentId.has(edge.from) || !taskByAgentId.has(edge.to)) {
      continue;
    }
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue: string[] = [];
  for (const [agentId, degree] of indegree.entries()) {
    if (degree === 0) {
      levels.set(agentId, 0);
      queue.push(agentId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      levels.set(next, Math.max(levels.get(next) ?? 0, currentLevel + 1));
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  for (const agentId of taskByAgentId.keys()) {
    if (!levels.has(agentId)) {
      levels.set(agentId, 0);
    }
  }

  const maxLevel = Math.max(...levels.values(), 0);
  const result: SubTask[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const task of subTasks) {
    const level = levels.get(task.assignedWorker ?? task.id) ?? 0;
    result[level]!.push(task);
  }

  return result;
}
