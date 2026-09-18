/**
 * Multi-Agent Executor — 集成层：加载 Solution Manifest → 构建拓扑 → DAG 执行。
 *
 * 职责：
 * - 从项目 solutions 目录加载 agents.json，提取协作边
 * - 构建标准 CollaborationTopology 供 runtime 消费
 * - 为每个 Agent 启动子进程 worker
 * - 通过 DagExecutor 编排执行
 *
 * 所有 manifest 加载、路径解析、格式适配都在此层完成。
 * collaboration-runtime 模块只负责纯执行，不碰文件系统。
 */

import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { getDataRoot } from '../../../lib/paths';

import { streamSimple as _streamSimpleRaw } from "@originos/pi-agent-adapter/ai";

import {
  parseTopology,
  DagExecutor,
  Blackboard,
  UpstreamResults,
} from "../../../modules/collaboration-runtime";
import { selectExecutionMode, type ExecutionMode } from "../../../modules/collaboration-runtime/engine/mode-router";
import { type SubTask } from "../../../modules/collaboration-runtime/engine/supervisor";
import { getGlobalSpawner, type AgentProcess } from "../../../modules/collaboration-runtime/sandbox";
import { runtimeLLMConfigToWorkerModel, type RuntimeLLMConfig } from "../../../lib/integrations/pi-agent/llm-config";
import { executeChannelOfficeCapabilityProxy } from "../../../lib/integrations/pi-agent/channel-office-capabilities";

import type { EventStore } from "../../../modules/collaboration-runtime/session/event-store";
import type { CollaborationTopology, RuntimeEvent } from "../../../modules/collaboration-runtime/session/types";


// ============================================================================
// Solution Manifest 适配类型
// ============================================================================

interface AgentCollaboration {
  targetAgentId: string;
  targetAgentName: string;
  type: string;
  description: string;
}

interface AgentsJsonAgent {
  id: string;
  name: string;
  type: string;
  responsibility: string;
  businessDomain: string;
  skills?: string[];
  dataOperations?: Record<string, string[]>;
  ontologyOperations?: Array<{ objectType: string; operations: string[] }>;
  collaborations?: AgentCollaboration[];
}

interface AgentsJson {
  agents: AgentsJsonAgent[];
}

function summarizeRuntimeConfig(config?: RuntimeLLMConfig): Record<string, unknown> {
  if (!config) return { provided: false };
  const credentialSource = config.anthropicCredentialSource
    ?? (config.anthropicAuthToken ? "anthropicAuthToken" : undefined)
    ?? (config.anthropicApiKey ? "anthropicApiKey" : undefined)
    ?? (config.authToken ? "authToken" : undefined)
    ?? (config.apiKey ? "apiKey" : undefined);
  return {
    provided: true,
    provider: config.provider ?? "default",
    model: config.model ?? "default",
    baseUrl: config.anthropicBaseUrl ?? config.baseUrl ?? "default",
    hasCredential: Boolean(config.anthropicAuthToken || config.anthropicApiKey || config.authToken || config.apiKey),
    credentialSource: credentialSource ?? "none",
    maxTokens: config.maxTokens ?? "default",
  };
}

function logRuntime(phase: string, data: Record<string, unknown>): void {
  console.error(`[MultiAgentRuntime] ${phase} ${JSON.stringify(data)}`);
}

interface MessageToolCallBlock {
  type: "toolCall";
  name: string;
  arguments?: { filePath?: string; path?: string; [key: string]: unknown };
}

interface MessageTextBlock {
  type: "text";
  text: string;
}

type MessageContentBlock = MessageToolCallBlock | MessageTextBlock | { type: string };

interface StreamChunk {
  type: string;
  delta?: string;
}

// Typed wrapper around the @ts-expect-error import above
const streamSimple = _streamSimpleRaw as (model: unknown, messages: unknown) => AsyncIterable<StreamChunk>;

interface UpstreamArtifactRef {
  name: string;
  ref: string;
  writer: string;
  sourceTaskId?: string;
}

interface UpstreamOutput {
  text: string;
  artifacts: UpstreamArtifactRef[];
}

export function wrapWorkerHumanReviewRequest(
  event: RuntimeEvent,
  sessionId: string
): RuntimeEvent {
  const question = String(event.payload?.["question"] ?? "");
  const context = (event.payload?.["context"] as Record<string, unknown> | undefined) ?? {};
  return {
    id: `evt-worker-block-${event.source}-${Date.now()}`,
    sessionId,
    seq: 0,
    type: "WORKER_BLOCK",
    payload: {
      type: "need_input",
      workerId: event.source,
      missingFields: [],
      rationale: question,
      suggestedQuestion: question,
      context,
      originalEventType: event.type,
    },
    source: event.source,
    target: "supervisor",
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Manifest 加载 + 拓扑构建
// ============================================================================

/** 查找项目 solutions 目录中最新的 manifest 路径 */
async function findLatestManifestDir(projectId: string): Promise<string | null> {
  // 兼容两种 projectId 格式：有 proj- 前缀和没有前缀
  const candidates = [
    path.join(getDataRoot(), `projects/${projectId}/solutions`),
    path.join(getDataRoot(), `projects/proj-${projectId}/solutions`),
  ];

  for (const solutionsDir of candidates) {
    try {
      const entries = await (await import("fs/promises")).readdir(solutionsDir, { withFileTypes: true });
      const versionDirs = entries
        .filter((e) => e.isDirectory() && e.name.match(/^v\d+\.\d+$/))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
      if (versionDirs.length > 0) {
        return path.join(solutionsDir, versionDirs[0]!.name);
      }
    } catch {
      // 目录不存在，尝试下一个
    }
  }
  return null;
}

/** 从 agents.json 加载 Agent 列表 */
async function loadAgentsJson(manifestDir: string): Promise<AgentsJsonAgent[]> {
  const agentsPath = path.join(manifestDir, "agents.json");
  const content = await readFile(agentsPath, "utf-8");
  const data = JSON.parse(content) as AgentsJson;
  return data.agents;
}

/**
 * 将 agents.json 中的 per-agent collaborations 转换为扁平 edges 数组。
 *
 * 关键：将下游 → 上游的 back-edge（如 naming-reviewer → review-task-manager）
 * 标记为 notify 类型，避免 DAG 循环检测失败。
 * 只有上游 → 下游的 trigger 边参与 DAG 执行。
 */
function extractEdges(agents: AgentsJsonAgent[]): Array<{ from: string; to: string; type: string; description: string }> {
  const agentIds = new Set(agents.map((a) => a.id));

  // 第一轮：收集所有正向边（上游 → 下游），按首次出现顺序确定方向
  // 当 A→B 和 B→A 同时存在时，先出现的保持 trigger，后出现的标记为 notify
  const seenEdges = new Map<string, { from: string; to: string; type: string; description: string }>();
  for (const agent of agents) {
    if (agent.collaborations) {
      for (const collab of agent.collaborations) {
        if (!agentIds.has(collab.targetAgentId)) {continue;}
        const forwardKey = `${agent.id}->${collab.targetAgentId}`;
        const reverseKey = `${collab.targetAgentId}->${agent.id}`;

        if (seenEdges.has(reverseKey)) {
          // 反向边已存在，当前边标记为 notify（back-edge）
          seenEdges.set(forwardKey, {
            from: agent.id,
            to: collab.targetAgentId,
            type: "notify",
            description: collab.description ?? "",
          });
        } else if (!seenEdges.has(forwardKey)) {
          // 正向边首次出现，保持原始类型
          seenEdges.set(forwardKey, {
            from: agent.id,
            to: collab.targetAgentId,
            type: collab.type,
            description: collab.description ?? "",
          });
        }
      }
    }
  }

  return Array.from(seenEdges.values());
}

/**
 * 为拓扑查看器规范化边：
 * - 保留原始协作关系，避免 UI 丢失 loop/back-edge
 * - 若 trigger/depend 会形成环，则仅将该边降级为 notify
 * - notify 本身不参与 DAG 依赖，因此不会触发 parseTopology 的循环检测
 */
function normalizeEdgesForTopologyView(
  edgesInput: Array<{ from: string; to: string; type: string; description: string }>
): Array<{ from: string; to: string; type: string; description: string }> {
  const result: Array<{ from: string; to: string; type: string; description: string }> = [];
  const adjacency = new Map<string, Set<string>>();

  const ensureNode = (node: string): Set<string> => {
    let neighbors = adjacency.get(node);
    if (neighbors === undefined) {
      neighbors = new Set<string>();
      adjacency.set(node, neighbors);
    }
    return neighbors;
  };

  const hasPath = (from: string, to: string): boolean => {
    if (from === to) {
      return true;
    }

    const visited = new Set<string>();
    const stack = [from];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || visited.has(current)) {
        continue;
      }
      visited.add(current);

      for (const next of adjacency.get(current) ?? []) {
        if (next === to) {
          return true;
        }
        if (!visited.has(next)) {
          stack.push(next);
        }
      }
    }

    return false;
  };

  for (const edge of edgesInput) {
    const shouldParticipateInDag = edge.type === "trigger" || edge.type === "depend";
    if (!shouldParticipateInDag) {
      result.push(edge);
      continue;
    }

    if (hasPath(edge.to, edge.from)) {
      console.warn(
        `[Topology] preserving loop edge ${edge.from} -> ${edge.to} as notify for viewer`
      );
      result.push({
        ...edge,
        type: "notify",
      });
      continue;
    }

    ensureNode(edge.from).add(edge.to);
    result.push(edge);
  }

  return result;
}

interface ManifestAgent {
  id: string;
  name: string;
  domain: string;
  responsibility: string;
  dataOperations: Record<string, string[]>;
  skills: string[];
}

interface SolutionManifest {
  agents: ManifestAgent[];
  collaboration: { edges: Array<{ from: string; to: string; type: string; description: string }> };
}

function toManifestAgent(a: AgentsJsonAgent): ManifestAgent {
  return {
    id: a.id,
    name: a.name,
    domain: a.businessDomain,
    responsibility: a.responsibility,
    dataOperations: a.dataOperations ?? {},
    skills: a.skills ?? [],
  };
}

/** 构建标准 CollaborationTopology（适配 field name: businessDomain → domain） */
function buildTopology(agents: AgentsJsonAgent[], edges: Array<{ from: string; to: string; type: string; description: string }>): CollaborationTopology {
  const manifest: SolutionManifest = {
    agents: agents.map(toManifestAgent),
    collaboration: { edges },
  };
  return parseTopology(manifest as Parameters<typeof parseTopology>[0]);
}

/** 写入统一 manifest 供向后兼容（optional, 不影响执行） */
async function writeUnifiedManifest(projectId: string, agents: AgentsJsonAgent[], edges: Array<{ from: string; to: string; type: string; description: string }>): Promise<void> {
  const solutionsDir = path.join(getDataRoot(), `projects/${projectId}/solutions`);
  await mkdir(solutionsDir, { recursive: true });
  const manifestPath = path.join(solutionsDir, "solution-v1.0-manifest.json");
  const manifest = {
    version: "1.0.0",
    agents: agents.map(toManifestAgent),
    collaboration: { edges },
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

// ============================================================================
// 多 Agent DAG 执行
// ============================================================================

export interface MultiAgentExecutionResult {
  status: "completed" | "failed" | "aborted" | "timed_out";
  completedAgents: string[];
  failedAgents: string[];
  events: RuntimeEvent[];
}

export interface MultiAgentExecutorConfig {
  projectId: string;
  globalGoal: string;
  sessionId?: string;
  timeoutMs?: number;
  maxIterations?: number;
  /** Story 9.35: 检测到首个 WORKER_BLOCK 时懒加载 supervisor-lite。默认 true。设为 false 则 WORKER_BLOCK → failed。 */
  enableLightweightSupervisor?: boolean;
  /** AG.2: 模型工厂，通过 DI 注入，避免直接 import lib/integrations */
  modelFactory?: { createAutoModel(): unknown };
  llmConfig?: RuntimeLLMConfig;
}

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

/**
 * LLM-based Verifier — 判断 Agent 是否完成了任务。
 *
 * 接收任务描述 + Agent 本轮对话消息，通过 LLM 分析判断：
 * - 任务是否完成（pass/fail）
 * - 失败原因
 * - 提取产出物（写入的文件路径等）
 */
export interface VerificationResult {
  passed: boolean;
  reasoning: string;
  extractedArtifacts: string[];
  outputText: string;
}

async function verifyTaskCompletion(
  taskDescription: string,
  agentMessages: Array<{ role: string; content?: unknown }>,
  modelFactory?: { createAutoModel(): unknown },
): Promise<VerificationResult> {
  if (agentMessages.length === 0) {
    return { passed: false, reasoning: "无对话消息", extractedArtifacts: [], outputText: "" };
  }

  // 提取工具调用和文本
  const artifacts: string[] = [];
  const textParts: string[] = [];
  let toolCallCount = 0;

  for (const msg of agentMessages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) { continue; }
    const blocks = msg.content as MessageContentBlock[];
    for (const block of blocks) {
      if (block.type === "toolCall") {
        toolCallCount += 1;
        const args = (block as MessageToolCallBlock).arguments;
        if (args?.filePath !== null && args?.filePath !== undefined) { artifacts.push(args.filePath); }
        if (args?.path !== null && args?.path !== undefined) { artifacts.push(args.path); }
      }
      if (block.type === "text") {
        const text = (block as MessageTextBlock).text;
        if (text.length > 0) { textParts.push(text); }
      }
    }
  }

  // 构建 verifier prompt
  const conversationSummary = agentMessages
    .map((m) => {
      if (m.role === "assistant") {
        const blocks = (Array.isArray(m.content) ? m.content : []) as MessageContentBlock[];
        const toolCalls = blocks
          .filter((b): b is MessageToolCallBlock => b.type === "toolCall")
          .map((b) => `[调用工具: ${b.name}]`)
          .join(" ");
        const texts = blocks
          .filter((b): b is MessageTextBlock => b.type === "text")
          .map((b) => b.text)
          .join(" ");
        return `Assistant: ${toolCalls} ${texts}`;
      }
      if (m.role === "toolResult") {
        const content = typeof m.content === "string" ? m.content.slice(0, 200) : "[工具结果]";
        return `Tool Result: ${content}`;
      }
      return `${m.role}: ${typeof m.content === "string" ? m.content : ""}`;
    })
    .join("\n");

  const systemPrompt = `你是一个任务完成度验证器。你的职责是分析 Agent 的对话历史，判断它是否完成了给定的任务。

判断规则：
1. 如果 Agent 有实质性工具调用（读文件、查询本体等）且最终文本产出了审查结论、分析报告或明确结果，则任务通过——即使没有写文件（read-only 审查角色）。
2. 如果任务明确要求写入文件或创建内容，Agent 必须有相应的工具调用（write/create）。
3. 如果 Agent 最后一条消息是提问（以"？"结尾、包含"请提供"/"请告诉"/"请确认"且无后续工具调用），则判定为未完成——但这应触发 HITL 等待，而非直接 fail。
4. 如果 Agent 完成了任务要求的所有步骤，则任务通过。

请以 JSON 格式回复，格式如下：
{"passed": true/false, "reasoning": "判断原因", "outputText": "Agent 的最终文本输出摘要"}`;

  const userPrompt = `任务描述：${taskDescription}

Agent 对话历史：
${conversationSummary}

工具调用次数：${toolCallCount}
产出的文件路径：${artifacts.length > 0 ? artifacts.join(", ") : "无"}

请判断任务是否完成，以 JSON 格式回复。`;

  try {
    const factory = modelFactory ?? (await import("../../../lib/integrations/pi-agent/server-config"));
    const model = factory.createAutoModel();
    let responseText = "";

    const stream = streamSimple(model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    for await (const chunk of stream) {
      if (chunk.type === "text_delta" && chunk.delta !== null && chunk.delta !== undefined && chunk.delta.length > 0) {
        responseText += chunk.delta;
      }
    }

    // 解析 JSON 回复
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { passed?: boolean; reasoning?: string; outputText?: string };
      return {
        passed: parsed.passed ?? false,
        reasoning: parsed.reasoning ?? responseText,
        extractedArtifacts: artifacts,
        outputText: parsed.outputText ?? textParts.join("\n"),
      };
    }

    // 回退：如果无法解析 JSON
    return {
      passed: responseText.includes("true") || responseText.includes("通过"),
      reasoning: responseText,
      extractedArtifacts: artifacts,
      outputText: textParts.join("\n"),
    };
  } catch (err) {
    console.error("[Verifier] LLM verification failed, falling back to rule-based check:", err);
    return verifierFallbackResult(textParts, artifacts, toolCallCount);
  }
}

/** 可测试的纯函数：Verifier LLM 失败时的回退判定逻辑（SUP-09） */
export function verifierFallbackResult(
  textParts: string[],
  artifacts: string[],
  toolCallCount: number,
): VerificationResult {
  const output = textParts.join("\n");
  const lastAssistantText = textParts.at(-1) ?? "";
  const isQuestioning = /请[您你]?提供|需要[您你]?|请告诉|请您确认|等待您的回复|等待用户|请回复|请确认|请反馈/.test(lastAssistantText)
    && lastAssistantText.trim().endsWith("？");
  const hasWrite = artifacts.some((a) => !a.endsWith("/"));
  const hasToolCalls = toolCallCount > 0;
  const passed = (hasToolCalls && !isQuestioning) || hasWrite;
  return {
    passed,
    reasoning: `Verifier LLM 调用失败，使用回退规则: ${hasWrite ? "有文件写入" : "无文件写入"}, ${hasToolCalls ? `有工具调用(${toolCallCount})` : "无工具调用"}, ${isQuestioning ? "是提问模式" : "非提问模式"}`,
    extractedArtifacts: artifacts,
    outputText: output,
  };
}

/** Per-session HITL resumer registry — HMR 安全：保存在 globalThis 避免热重载后实例被替换 */
declare global {
  // eslint-disable-next-line no-var
  var __hitlResumerRegistry: Map<string, (userReply: string) => void> | undefined;
}
if (!globalThis.__hitlResumerRegistry) {
  globalThis.__hitlResumerRegistry = new Map();
}
const hitlResumerRegistry = globalThis.__hitlResumerRegistry;

/** Per-session HITL direct channel — Worker HITL 直连路由表（HMR 安全） */
declare global {
  // eslint-disable-next-line no-var
  var __hitlChannelByWorker: Map<string, Map<string, { resume: (reply: string) => Promise<void>; question: string; onBehalfOfName: string }>> | undefined;
}
if (!globalThis.__hitlChannelByWorker) {
  globalThis.__hitlChannelByWorker = new Map();
}

export function resumeSupervisorHitl(sessionId: string, userReply: string, workerId?: string): boolean {
  // 优先：直连 Worker channel（不依赖 Supervisor LLM 决策）
  const workerChannels = globalThis.__hitlChannelByWorker?.get(sessionId);
  if (workerChannels && workerChannels.size > 0) {
    // 有 workerId → 精确路由；否则取最后注册的（向后兼容）
    let targetWorkerId: string | undefined;
    if (workerId && workerChannels.has(workerId)) {
      targetWorkerId = workerId;
    } else {
      const entries = Array.from(workerChannels.entries());
      const last = entries[entries.length - 1];
      if (!last) return false;
      targetWorkerId = last[0];
    }

    const channel = workerChannels.get(targetWorkerId);
    if (!channel) return false;
    workerChannels.delete(targetWorkerId);
    channel.resume(userReply).catch((err: Error) => {
      console.error(`[HITL] direct worker resume failed for ${targetWorkerId}:`, err);
    });
    // 最后一个 worker channel 消费完后清理 session 级别的 hitlResumerRegistry
    if (workerChannels.size === 0) {
      globalThis.__hitlResumerRegistry?.delete(sessionId);
    }
    return true;
  }

  // Fallback：supervisor 自身的 escalate_to_human 挂起态
  const registry = globalThis.__hitlResumerRegistry;
  if (!registry) return false;
  const resumer = registry.get(sessionId);
  if (!resumer) return false;
  registry.delete(sessionId);
  resumer(userReply);
  return true;
}

/**
 * executeSupervisorDag — Story 9.30 SUPA-02
 *
 * 胶水层（Glue Layer）：生成一个真实的 Supervisor 子进程，通过
 * SUPERVISOR_TOOL_CALL 事件拦截协调工具调用，由本层执行实际工作
 * （派发 Worker、等待 Worker、验收等），并通过 sendToolResult 将
 * 结果回传给 Supervisor 子进程。
 *
 * Supervisor 子进程通过 coordinator tools 完成任务分解和调度，
 * 不再需要本层的静态 rewriteSubTaskGoal。
 *
 * 生命周期：
 *   1. 加载 manifest + 构建拓扑
 *   2. 写入 project-collaboration-context.json 到 Supervisor 工作目录
 *   3. 启动 Supervisor 子进程（agentType: "supervisor"）
 *   4. Supervisor 调用 dispatch_worker → glue 层 spawn Worker
 *   5. Supervisor 调用 wait_workers → glue 层等待 Worker 完成
 *   6. Supervisor 调用 run_verifier → glue 层 LLM 验收
 *   7. Supervisor 完成（agent_end） → 返回汇总结果
 */
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
  type WorkerStatus = "running" | "completed" | "failed";
  const workerResults = new Map<string, {
    status: WorkerStatus;
    output: string;
    artifacts: UpstreamArtifactRef[];
    proc?: AgentProcess;
    messages?: Array<{ role: string; content?: unknown }>;
  }>();

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
  let pendingHitlResolve: ((reply: string) => void) | null = null;

  // Supervisor 完成信号
  let supervisorResolveDone!: (result: { completedAgents: string[]; failedAgents: string[] }) => void;
  let supervisorRejectDone!: (err: Error) => void;
  const supervisorDonePromise = new Promise<{ completedAgents: string[]; failedAgents: string[] }>((resolve, reject) => {
    supervisorResolveDone = resolve;
    supervisorRejectDone = reject;
  });

  // 事件处理器 — 拦截 SUPERVISOR_TOOL_CALL 事件
  const onSupervisorEvent = (event: RuntimeEvent): void => {
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
      // Register resume handler: when user replies, call supervisorProc.resume()
      if (config.sessionId) {
        hitlResumerRegistry.set(config.sessionId, (reply: string) => {
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
      void handleSupervisorToolCall(toolCallId, toolName, args as Record<string, unknown>);
    }
  };

  // 工具调用处理器（SUPA-02 核心胶水逻辑）
  async function handleSupervisorToolCall(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    let resultJson: string = JSON.stringify({ status: "ok" });

    try {
      switch (toolName) {
        case "dispatch_worker": {
          const workerId = String(args["workerId"] ?? "");
          const specificAction = String(args["specificAction"] ?? config.globalGoal);
          const acceptanceCriteria = String(args["acceptanceCriteria"] ?? "完成任务");

          if (!workerId) {
            resultJson = JSON.stringify({ error: "workerId is required" });
            break;
          }

          const agent = agents.find((a) => a.id === workerId);
          if (!agent) {
            resultJson = JSON.stringify({ error: `Agent ${workerId} not found in manifest` });
            break;
          }

          // 已有运行中的 Worker，不重复 spawn
          if (workerResults.has(workerId) && workerResults.get(workerId)?.status === "running") {
            resultJson = JSON.stringify({ dispatchId: workerId, status: "already_running", nextStep: `必须立即调用 wait_workers(workerIds=["${workerId}"]) 等待 Worker 完成。` });
            break;
          }

          // P2: 写入 swarm$tasks$<workerId> 到 Blackboard（pending 状态）
          bb.setData(`swarm$tasks$${workerId}`, {
            taskId: workerId,
            status: "pending",
            assignedTo: workerId,
            goal: specificAction,
            acceptanceCriteria,
            createdAt: new Date().toISOString(),
          }, "supervisor", {
            sourceUri: `supervisor:dispatch:${config.sessionId ?? "supervisor"}`,
          });
          void bb.snapshot();

          // 派发 Worker 子进程 - Worker 不能直接 ask_user_question 或编辑本体 schema
          // 显式过滤掉不允许的工具
          const forbiddenTools = ["ask_user_question", "create_domain", "create_concept", "update_concept", "delete_concept", "update_domain", "delete_domain"];
          const workerSkills = (agent.skills ?? []).filter((skill: string) => !forbiddenTools.includes(skill));

          const workingDirectory = path.join(getDataRoot(), "projects", config.projectId, "agents", workerId);
          await mkdir(workingDirectory, { recursive: true });

          // 写入 Worker 的协作上下文
          const workerCtxPath = path.join(workingDirectory, "project-collaboration-context.json");
          const workerCtx = {
            // 包含业务项目 ID，用于区分 OriginOS 业务项目和本体中的"项目"概念
            originosProjectId: config.projectId,
            ontologyId: `ontology-${config.projectId}`,
            projectId: config.projectId,
            agentId: workerId,
            agents: agents.map((a) => ({ id: a.id, name: a.name, responsibility: a.responsibility })),
            topology: { edges: edges.map((e) => ({ from: e.from, to: e.to, type: e.type })) },
            globalGoal: config.globalGoal,
            allowedTools: workerSkills,  // 使用过滤后的工具列表
          };
          await writeFile(workerCtxPath, JSON.stringify(workerCtx, null, 2), "utf-8");

          const workerEvents: RuntimeEvent[] = [];
          const captureWorkerEvent = (ev: RuntimeEvent): void => {
            if (ev.type === "HOST_TOOL_CALL" && ev.source === workerId) {
              const toolCallId = typeof ev.payload?.["toolCallId"] === "string" ? ev.payload["toolCallId"] : "";
              const toolName = typeof ev.payload?.["toolName"] === "string" ? ev.payload["toolName"] : "";
              const workerProc = spawner.get(workerId);
              if (!toolCallId || !workerProc) return;
              void executeChannelOfficeCapabilityProxy(ev.sessionId, toolName, toolCallId, ev.payload?.["args"])
                .then(result => workerProc.sendToolResult(toolCallId, JSON.stringify({ ok: true, result })))
                .catch((error: unknown) => {
                  const code = error instanceof Error && /^IM_CAPABILITY_[A-Z_]+$/.test(error.message)
                    ? error.message : "IM_CAPABILITY_FAILED";
                  workerProc.sendToolResult(toolCallId, JSON.stringify({ ok: false, code }));
                });
              return;
            }
            if (ev.type === "HITL_ESCALATE" && ev.source === workerId) {
              // 直连路径：bridge 直接 emit HUMAN_REVIEW_REQUEST，不依赖 Supervisor LLM 中转
              workerEvents.push(ev);
              void eventStore.append(ev);

              const question = String(ev.payload?.["question"] ?? "");
              const options = ev.payload?.["options"] as Array<{ label: string; description: string }> | undefined;
              const multiSelect = Boolean(ev.payload?.["multiSelect"] ?? false);
              const onBehalfOfName = String(ev.payload?.["onBehalfOfName"] ?? ev.payload?.["agentName"] ?? workerId);

              // 1. 直接 emit HUMAN_REVIEW_REQUEST（前端立即显示 HITL 输入框）
              const directHitlEvent: RuntimeEvent = {
                id: `evt-hitl-direct-${workerId}-${Date.now()}`,
                sessionId: config.sessionId ?? "supervisor",
                seq: 0,
                type: "HUMAN_REVIEW_REQUEST",
                payload: {
                  question,
                  options: options ?? [],
                  multiSelect,
                  agentId: workerId,
                  onBehalfOf: workerId,
                  onBehalfOfName,
                  directChannel: true,
                },
                source: "supervisor",
                timestamp: new Date().toISOString(),
              };
              void eventStore.append(directHitlEvent);
              eventEmitter?.emit(directHitlEvent);

              // 2. 注册直连 resume channel（用户回复后直接 resume worker 子进程）
              const workerProc = spawner.get(workerId);
              if (config.sessionId && workerProc) {
                if (!globalThis.__hitlChannelByWorker) {
                  globalThis.__hitlChannelByWorker = new Map();
                }
                const sessionChannels = globalThis.__hitlChannelByWorker.get(config.sessionId) ?? new Map();
                sessionChannels.set(workerId, {
                  resume: (reply: string) => workerProc.resume(reply),
                  question,
                  onBehalfOfName,
                });
                globalThis.__hitlChannelByWorker.set(config.sessionId, sessionChannels);

                // 同时注册到 hitlResumerRegistry 作为 fallback
                hitlResumerRegistry.set(config.sessionId, (reply: string) => {
                  workerProc.resume(reply).catch((err: Error) => {
                    console.error(`[SupervisorDag] HITL fallback resume failed for ${workerId}:`, err);
                  });
                });
              }

              // 3. wait_workers 继续等待（不 notify），Worker 恢复完成后再通知
              console.error(`[SupervisorDag] HITL_ESCALATE from worker ${workerId}: direct channel registered, waiting for user reply`);
              return;
            }

            if (ev.type === "HUMAN_REVIEW_REQUEST" && ev.source === workerId) {
              // 旧路径兜底（Worker 直接发 HUMAN_REVIEW_REQUEST，不经过 Supervisor）
              workerEvents.push(ev);
              void eventStore.append(ev);
              eventEmitter?.emit(ev);

              if (config.sessionId) {
                const existingResumer = hitlResumerRegistry.get(config.sessionId);
                hitlResumerRegistry.set(config.sessionId, (reply: string) => {
                  const workerProc = spawner.get(workerId);
                  if (workerProc) {
                    workerProc.resume(reply).catch((err: Error) => {
                      console.error(`[SupervisorDag] worker ${workerId} resume failed:`, err);
                    });
                  } else if (existingResumer) {
                    existingResumer(reply);
                  }
                });
              }
              return;
            }

            workerEvents.push(ev);
            void eventStore.append(ev);
            eventEmitter?.emit(ev);

            if (ev.type === "AGENT_END" && ev.source === workerId) {
              // 只处理一次：已经标记为 completed 则跳过重复的 AGENT_END
              const workerResult = workerResults.get(workerId);
              if (workerResult?.status === "completed" || workerResult?.status === "failed") {
                return;
              }

              // Worker 完成
              const output = extractAgentOutputFromEvents(workerEvents);
              if (workerResult) {
                workerResult.status = "completed";
                workerResult.output = output;
                // 保存 LLM messages 供 run_verifier 使用
                const endMessages = ev.payload?.["messages"] as Array<{ role: string; content?: unknown }> | undefined;
                if (endMessages && endMessages.length > 0) {
                  workerResult.messages = endMessages;
                }
              }
              upstreamOutputs.set(workerId, { text: output, artifacts: [] });
              completedAgents.push(workerId);

              // P0+P2: 写入 Blackboard upstream 产出（Event Sourcing）+ 更新 task status
              const agent = agents.find((a) => a.id === workerId);
              upstreamResults.writeUpstreamOutput(workerId, agent?.name ?? workerId, output);
              bb.setData(`swarm$tasks$${workerId}`, {
                taskId: workerId,
                status: "completed",
                assignedTo: workerId,
                completedAt: new Date().toISOString(),
                outputKey: `upstream$${workerId}$output`,
              }, workerId, {
                sourceUri: `worker:complete:${config.sessionId ?? "supervisor"}`,
              });
              void bb.snapshot();

              // 从 Blackboard 读取 artifacts，更新 workerResults 和 upstreamOutputs
              void (async () => {
                const snap = await Blackboard.loadSnapshot(config.sessionId ?? "supervisor", blackboardDir);
                if (snap) {
                  const wResult = workerResults.get(workerId);
                  if (wResult) {
                    const allArtifactsMap = snap.listArtifacts();
                    const allArtifactsArr = Object.values(allArtifactsMap);
                    wResult.artifacts = allArtifactsArr
                      .filter((a) => a.producer === workerId)
                      .map((a) => ({ name: a.name, ref: a.ref ?? `artifact://${config.sessionId ?? "supervisor"}/${a.name}`, writer: a.producer }));
                    // 同步更新 upstreamOutputs artifacts（供 wait_workers 返回）
                    const upstream = upstreamOutputs.get(workerId);
                    if (upstream) {
                      upstream.artifacts = wResult.artifacts;
                    }
                  }
                }
                notifyWorkerCompletion(workerId);

                const completeEvent: RuntimeEvent = {
                  id: `sup-worker-complete-${workerId}-${Date.now()}`,
                  sessionId: config.sessionId ?? "supervisor",
                  seq: 0,
                  type: "SUPERVISOR_WORKER_COMPLETE",
                  payload: { workerId, output },
                  source: "supervisor",
                  timestamp: new Date().toISOString(),
                };
                void eventStore.append(completeEvent);
                eventEmitter?.emit(completeEvent);
              })();
            } else if (ev.type === "AGENT_FAIL_TASK" && ev.source === workerId) {
              const workerResult = workerResults.get(workerId);
              if (workerResult) {
                workerResult.status = "failed";
              }
              failedAgents.push(workerId);

              // P2: 更新 Blackboard task status = failed
              bb.setData(`swarm$tasks$${workerId}`, {
                taskId: workerId,
                status: "failed",
                failedAt: new Date().toISOString(),
              }, workerId, {
                sourceUri: `worker:fail:${config.sessionId ?? "supervisor"}`,
              });
              void bb.snapshot();

              notifyWorkerCompletion(workerId);

              const failEvent: RuntimeEvent = {
                id: `sup-worker-failed-${workerId}-${Date.now()}`,
                sessionId: config.sessionId ?? "supervisor",
                seq: 0,
                type: "SUPERVISOR_WORKER_FAILED",
                payload: { workerId, error: ev.payload?.["error"] ?? "Unknown error" },
                source: "supervisor",
                timestamp: new Date().toISOString(),
              };
              void eventStore.append(failEvent);
              eventEmitter?.emit(failEvent);
            }
          };

          let proc: AgentProcess;
          try {
            const workerSpawnAt = Date.now();
            logRuntime("worker.spawn.start", {
              projectId: config.projectId,
              sessionId: config.sessionId ?? "default",
              workerId,
              workingDirectory,
              model: summarizeRuntimeConfig(workerModel),
            });
            proc = await spawner.spawn(
              {
                projectId: config.projectId,
                agentId: workerId,
                workingDirectory,
                agentType: "originos",
                collaborationSessionId: config.sessionId,
                blackboardDir,
                model: workerModel,
              },
              captureWorkerEvent,
            );
            logRuntime("worker.spawn.ready", {
              projectId: config.projectId,
              sessionId: config.sessionId ?? "default",
              workerId,
              elapsedMs: Date.now() - workerSpawnAt,
            });

            workerResults.set(workerId, { status: "running", output: "", artifacts: [], proc });

            // 非阻塞地执行 Worker prompt（不等待完成）
            const prompt = buildWorkerPrompt(agent, specificAction, acceptanceCriteria, upstreamOutputs, topology, agents, attachmentsAbsDir);
            logRuntime("worker.prompt.dispatch", {
              projectId: config.projectId,
              sessionId: config.sessionId ?? "default",
              workerId,
              promptChars: prompt.length,
            });
            proc.prompt(prompt).catch((err) => {
              console.error(`[SupervisorDag] Worker ${workerId} prompt error:`, err);
              logRuntime("worker.prompt.error", {
                projectId: config.projectId,
                sessionId: config.sessionId ?? "default",
                workerId,
                error: err instanceof Error ? err.message : String(err),
              });
              const wResult = workerResults.get(workerId);
              if (wResult && wResult.status === "running") {
                wResult.status = "failed";
                failedAgents.push(workerId);
                notifyWorkerCompletion(workerId);
              }
            });

            resultJson = JSON.stringify({ dispatchId: workerId, status: "dispatched", nextStep: `必须立即调用 wait_workers(workerIds=["${workerId}"]) 等待 Worker 完成，不允许在等待前结束任务。` });
          } catch (spawnErr) {
            console.error(`[SupervisorDag] Failed to spawn worker ${workerId}:`, spawnErr);
            logRuntime("worker.spawn.error", {
              projectId: config.projectId,
              sessionId: config.sessionId ?? "default",
              workerId,
              error: spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
            });
            workerResults.set(workerId, { status: "failed", output: "", artifacts: [] });
            failedAgents.push(workerId);
            resultJson = JSON.stringify({ error: `Failed to spawn worker: ${(spawnErr as Error).message}` });
          }
          break;
        }

        case "wait_workers": {
          const workerIds = Array.isArray(args["workerIds"]) ? (args["workerIds"] as string[]) : [];
          const timeoutMs = typeof args["timeoutMs"] === "number" ? args["timeoutMs"] : 300_000;

          if (workerIds.length === 0) {
            resultJson = JSON.stringify({ completed: [], failed: [], waiting: [] });
            break;
          }

          // 等待所有指定 Worker 完成（或超时）
          const waitPromises = workerIds.map((wId) => {
            const wResult = workerResults.get(wId);
            if (wResult && (wResult.status === "completed" || wResult.status === "failed")) {
              return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
              const callbacks = workerCompletionCallbacks.get(wId) ?? [];
              callbacks.push(resolve);
              workerCompletionCallbacks.set(wId, callbacks);
            });
          });

          await Promise.race([
            Promise.all(waitPromises),
            new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
          ]);

          const resultCompleted: Array<{ workerId: string; output: string; artifacts: UpstreamArtifactRef[] }> = [];
          const resultFailed: string[] = [];
          const resultWaiting: string[] = [];

          for (const wId of workerIds) {
            const wResult = workerResults.get(wId);
            if (!wResult || wResult.status === "running") {
              resultWaiting.push(wId);
            } else if (wResult.status === "completed") {
              resultCompleted.push({ workerId: wId, output: wResult.output, artifacts: wResult.artifacts });
            } else {
              resultFailed.push(wId);
            }
          }

          // 计算还有多少 Worker 未被派发，提示 Supervisor 继续
          const dispatchedIds = Array.from(workerResults.keys());
          const remainingWorkers = agents.filter((a) => !dispatchedIds.includes(a.id)).map((a) => a.id);
          const nextStep = remainingWorkers.length > 0
            ? `还有 ${remainingWorkers.length} 个 Worker 未派发：${remainingWorkers.join(", ")}。必须继续调用 dispatch_worker 派发下一个 Worker。`
            : "所有 Worker 已派发完毕，请输出最终汇总报告并结束任务。";

          resultJson = JSON.stringify({ completed: resultCompleted, failed: resultFailed, waiting: resultWaiting, nextStep });
          break;
        }

        case "cancel_worker": {
          const workerId = String(args["workerId"] ?? "");
          if (workerId) {
            const wResult = workerResults.get(workerId);
            if (wResult?.proc) {
              try { await spawner.destroy(workerId); } catch { /* ignore */ }
              wResult.status = "failed";
              notifyWorkerCompletion(workerId);
            }
          }
          resultJson = JSON.stringify({ cancelled: workerId, status: "ok" });
          break;
        }

        case "run_verifier": {
          const workerId = String(args["workerId"] ?? "");
          const criteria = String(args["criteria"] ?? "");

          const wResult = workerResults.get(workerId);
          if (!wResult || wResult.status !== "completed") {
            resultJson = JSON.stringify({ passed: false, reasoning: `Worker ${workerId} is not completed (status: ${wResult?.status ?? "not found"})` });
            break;
          }

          // 优先使用 workerResult 中保存的 messages，其次从 supervisorEvents 中查找
          const messages = wResult.messages
            ?? (supervisorEvents.filter((e) => e.source === workerId && e.type === "AGENT_END")
              .at(-1)?.payload?.["messages"] as Array<{ role: string; content?: unknown }> | undefined);

          let verification: VerificationResult;
          if (messages && messages.length > 0) {
            verification = await verifyTaskCompletion(criteria || wResult.output, messages, config.modelFactory);
          } else {
            verification = verifierFallbackResult([wResult.output], wResult.artifacts.map((a) => a.ref), 0);
          }

          resultJson = JSON.stringify({ passed: verification.passed, reasoning: verification.reasoning });
          break;
        }

        case "bb_list_artifacts": {
          const artifactList = Object.values(bb.listArtifacts());
          resultJson = JSON.stringify({ artifacts: artifactList });
          break;
        }

        case "bb_get_artifact": {
          const artifactName = String((args as { name?: string })["name"] ?? "");
          const artifact = bb.getArtifact(artifactName);
          if (!artifact) {
            resultJson = JSON.stringify({ error: `Artifact '${artifactName}' not found` });
          } else {
            resultJson = JSON.stringify(artifact);
          }
          break;
        }

        case "resume_worker": {
          const targetWorkerId = String(args["workerId"] ?? "");
          const answer = String(args["answer"] ?? "");

          if (!targetWorkerId) {
            resultJson = JSON.stringify({ error: "workerId is required" });
            break;
          }

          const workerProc = spawner.get(targetWorkerId);
          if (!workerProc) {
            resultJson = JSON.stringify({ error: `Worker "${targetWorkerId}" not found or already finished` });
            break;
          }

          // 清除直连 channel（Worker 将恢复运行，channel 已不再需要）
          const wRes = workerResults.get(targetWorkerId);
          if (wRes && config.sessionId) {
            globalThis.__hitlChannelByWorker?.get(config.sessionId)?.delete(targetWorkerId);
          }

          try {
            await workerProc.resume(answer);
            resultJson = JSON.stringify({
              status: "resumed",
              workerId: targetWorkerId,
              nextStep: `Worker "${targetWorkerId}" 已恢复运行。必须立即调用 wait_workers(workerIds=["${targetWorkerId}"]) 等待 Worker 完成。`,
            });
            console.error(`[SupervisorDag] resume_worker: resumed ${targetWorkerId} with answer`);
          } catch (resumeErr) {
            resultJson = JSON.stringify({ error: (resumeErr as Error).message });
          }
          break;
        }

        case "escalate_to_human": {
          const question = String(args["question"] ?? "");
          const mergedContext = args["mergedContext"] as Record<string, unknown> | undefined;

          // Emit HUMAN_REVIEW_REQUEST so the UI shows the HITL input
          const hitlEvent: RuntimeEvent = {
            id: `evt-hitl-${Date.now()}`,
            sessionId: config.sessionId ?? "supervisor",
            seq: 0,
            type: "HUMAN_REVIEW_REQUEST",
            payload: {
              question,
              agentId: "supervisor",
              onBehalfOf: (mergedContext?.["onBehalfOf"] as string | undefined) ?? "supervisor",
              context: mergedContext,
            },
            source: "supervisor",
            timestamp: new Date().toISOString(),
          };
          void eventStore.append(hitlEvent);
          eventEmitter?.emit(hitlEvent);

          // Suspend: hold resolve fn and wait for user reply.
          // hitlResumerRegistry entry will be called by resumeSupervisorHitl in sendMessageToSupervisor.
          await new Promise<void>((resolve) => {
            pendingHitlResolve = (reply: string) => {
              resultJson = JSON.stringify({ userReply: reply });
              resolve();
            };
            // Register in module-level registry so service layer can call it
            if (config.sessionId) {
              hitlResumerRegistry.set(config.sessionId, pendingHitlResolve);
            }
          });
          // resultJson is set by the resolver above — fall through to sendToolResult
          break;
        }

        case "ask_user_question": {
          const question = String(args["question"] ?? "");
          const options = (args["options"] as Array<{ label: string; description: string }> | undefined) ?? [];
          const multiSelect = Boolean(args["multiSelect"] ?? false);

          // Emit HUMAN_REVIEW_REQUEST so the UI shows the interactive question card
          const askEvent: RuntimeEvent = {
            id: `evt-hitl-ask-${Date.now()}`,
            sessionId: config.sessionId ?? "supervisor",
            seq: 0,
            type: "HUMAN_REVIEW_REQUEST",
            payload: {
              question,
              options,
              multiSelect,
              agentId: "supervisor",
            },
            source: "supervisor",
            timestamp: new Date().toISOString(),
          };
          void eventStore.append(askEvent);
          eventEmitter?.emit(askEvent);

          // Suspend until user selects an option / sends a reply
          await new Promise<void>((resolve) => {
            pendingHitlResolve = (reply: string) => {
              resultJson = JSON.stringify({ userReply: reply });
              resolve();
            };
            if (config.sessionId) {
              hitlResumerRegistry.set(config.sessionId, pendingHitlResolve);
            }
          });
          break;
        }

        case "wait_for_human": {
          resultJson = "HITL_PAUSE";
          break;
        }

        default:
          resultJson = JSON.stringify({ error: `Unknown coordinator tool: ${toolName}` });
      }
    } catch (err) {
      console.error(`[SupervisorDag] handleSupervisorToolCall(${toolName}) error:`, err);
      resultJson = JSON.stringify({ error: (err as Error).message });
    }

    // 将结果发回 Supervisor 子进程
    const supervisorProc = spawner.get(supervisorAgentId);
    if (supervisorProc) {
      console.error(`[SupervisorDag] sendToolResult: toolName=${toolName}, toolCallId=${toolCallId}, resultLen=${resultJson.length}`);
      supervisorProc.sendToolResult(toolCallId, resultJson);
    } else {
      console.error(`[SupervisorDag] Supervisor process not found, cannot send tool result for ${toolCallId}`);
    }
  }

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
  try {
    finalResult = await supervisorDonePromise;
  } catch (err) {
    console.error(`[SupervisorDag] Supervisor failed:`, err);
    logRuntime("dag.supervisor.failed", {
      projectId: config.projectId,
      sessionId: config.sessionId ?? "default",
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - dagStartedAt,
    });
    finalResult = { completedAgents, failedAgents };
  }

  // Emit SUPERVISOR_AGGREGATE event
  const aggregateEvent: RuntimeEvent = {
    id: `sup-aggregate-${Date.now()}`,
    sessionId: config.sessionId ?? "supervisor",
    seq: 0,
    type: "SUPERVISOR_AGGREGATE",
    payload: {
      state: finalResult.failedAgents.length === 0 ? "completed" : "partial",
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
    status: finalResult.failedAgents.length === 0 ? "completed" : "failed",
    completedAgents: finalResult.completedAgents,
    failedAgents: finalResult.failedAgents,
    elapsedMs: Date.now() - dagStartedAt,
  });

  return {
    status: finalResult.failedAgents.length === 0 ? "completed" : "failed",
    completedAgents: finalResult.completedAgents,
    failedAgents: finalResult.failedAgents,
    events: supervisorEvents,
  };
}

/** 为 Worker Agent 构建任务 prompt（Supervisor 下发的具体指令） */
function buildWorkerPrompt(
  agent: AgentsJsonAgent,
  specificAction: string,
  acceptanceCriteria: string,
  upstreamOutputs: Map<string, UpstreamOutput>,
  topology: CollaborationTopology,
  allAgents: AgentsJsonAgent[],
  attachmentsAbsDir?: string,
): string {
  let prompt = `【具体任务】\n${specificAction}\n\n【完成判定】\n${acceptanceCriteria}`;

  const dependencies = topology.edges
    .filter((e) => e.to === agent.id && e.type === "trigger")
    .map((e) => e.from);

  if (dependencies.length > 0) {
    const upstreamText = dependencies
      .map((depId) => {
        const depAgent = allAgents.find((a) => a.id === depId);
        const upstream = upstreamOutputs.get(depId);
        const output = upstream?.text ?? "（无输出）";
        const artifacts = upstream?.artifacts ?? [];
        const artifactText = artifacts.length > 0
          ? `\n  Artifact 引用:\n${artifacts.map((a) => `  - ${a.name}: ${a.ref}`).join("\n")}`
          : "";
        return `- 【${depAgent?.name ?? depId}】的产出：\n${output}${artifactText}`;
      })
      .join("\n\n");
    prompt += `\n\n【上游 Agent 产出】\n${upstreamText}\n\n请基于上述上游产出继续执行你的任务。`;
  }

  prompt += `\n\n【执行约束】\n- 若所需数据不存在（本体为空、无实例、无记录），直接输出状态说明，不要向用户提问。\n- 不允许使用 ask_user_question 工具。\n- 完成任务后直接输出结果，不需要等待用户确认。`;

  if (attachmentsAbsDir) {
    const { readdirSync } = require("fs") as typeof import("fs");
    let fileList = "";
    try {
      const files = readdirSync(attachmentsAbsDir).filter((f: string) => !f.startsWith(".") && f !== "README.md");
      if (files.length > 0) {
        fileList = files.map((f: string) => `  - ${path.join(attachmentsAbsDir, f)}`).join("\n");
      }
    } catch {
      // 目录不存在或无法读取，跳过
    }
    if (fileList) {
      prompt += `\n\n【用户上传的附件文件】\n以下文件已上传，可通过绝对路径直接读取，无需搜索：\n${fileList}`;
    }
  }

  return prompt;
}

/** 从 Agent 事件流中提取最终文本输出 */
function extractAgentOutputFromEvents(agentEvents: RuntimeEvent[]): string {
  const lastMsg = agentEvents
    .filter((e) => e.type === "ASSISTANT_MESSAGE" || e.type === "AGENT_END")
    .pop();
  if (lastMsg) {
    const output = lastMsg.payload?.["content"]
      ?? lastMsg.payload?.["message"]
      ?? JSON.stringify(lastMsg.payload);
    return typeof output === "string" ? output : JSON.stringify(output);
  }
  return "";
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
