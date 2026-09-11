// @ts-nocheck
/**
 * Agent Worker — 子进程入口点。
 *
 * Story 9.6: PI Agent 桥接与子进程入口
 *
 * 通过 stdio JSON Line 协议与 Runtime 通信：
 * - 接收 Runtime 命令（initialize / prompt / abort / shutdown）
 * - 输出 RuntimeEvent 到 stdout
 *
 * 子进程内完整运行：
 * 1. 读取 Agent.md / Tool.md / Skill.md
 * 2. 构建 system prompt（7 层或 OpenClaw 风格）
 * 3. 创建 PersistentAgent / OriginOSAgent
 * 4. 执行 agent loop（prompt → tool_call → tool_result → loop）
 * 5. CognitiveManager hooks 在子进程内运行
 *
 * 运行方式: npx tsx agent-worker.mts
 * 环境变量: AGENT_PROJECT_ID, AGENT_ID, AGENT_WORKING_DIR
 */

import { existsSync } from 'node:fs';
import process from "node:process";
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toEsmModuleSpecifier } from './agent-worker-module-specifier.mjs';

// stdout is reserved exclusively for the WorkerMessage JSON Line protocol.
process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"] = "1";
const workerStderr = console.error.bind(console);
console.log = (...args: unknown[]) => workerStderr("[INFO]", ...args);
console.info = (...args: unknown[]) => workerStderr("[INFO]", ...args);

// 动态导入路径，支持打包环境和开发环境
const packagedAgentWorkerDir = process.env["ORIGINOS_AGENT_WORKER_DIR"];
const packagedCoreSrcDir = process.env["ORIGINOS_CORE_SRC_DIR"];
const isPackaged = Boolean(packagedAgentWorkerDir);
const workerDir = path.dirname(fileURLToPath(import.meta.url));
const devCoreSrcDir = path.resolve(workerDir, '..', '..', '..');

function coreModulePath(modulePath: string): string {
  if (!isPackaged) {
    const candidates = [
      path.join(devCoreSrcDir, `${modulePath}.ts`),
      path.join(devCoreSrcDir, `${modulePath}.mts`),
      path.join(devCoreSrcDir, modulePath, 'index.ts'),
    ];
    const resolved = candidates.find((candidate) => existsSync(candidate));
    if (!resolved) {
      throw new Error(`Development agent worker module not found: ${modulePath}; tried ${candidates.join(', ')}`);
    }
    return toEsmModuleSpecifier(resolved);
  }
  if (!packagedCoreSrcDir) {
    throw new Error("ORIGINOS_CORE_SRC_DIR is required in packaged agent worker");
  }
  const candidates = [
    path.join(packagedCoreSrcDir, `${modulePath}.js`),
    path.join(packagedCoreSrcDir, modulePath, 'index.js'),
  ];
  if (packagedAgentWorkerDir) {
    candidates.push(
      path.join(packagedAgentWorkerDir, 'core', `${modulePath}.js`),
      path.join(packagedAgentWorkerDir, 'core', modulePath, 'index.js')
    );
  }
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(`Packaged agent worker module not found: ${modulePath}; tried ${candidates.join(', ')}`);
  }
  return toEsmModuleSpecifier(resolved);
}

function runtimeImport(modulePath: string): Promise<Record<string, unknown>> {
  return import(coreModulePath(modulePath)) as Promise<Record<string, unknown>>;
}

// 打包环境下使用 extraResources 中的文件，开发环境使用源文件
let getMonorepoRoot: () => string;
let extractDisplayContent: (content: unknown, options?: { allowThinkingFallback?: boolean }) => string;
let flushCognitiveSessionEnd: (cognitiveManager: unknown, messages: unknown[], agentType: string) => Promise<void>;

if (isPackaged) {
  const agentWorkerDir = packagedAgentWorkerDir as string;

  // 打包环境：从 extraResources 中导入
  const pathsModule = await import(toEsmModuleSpecifier(path.join(agentWorkerDir, 'lib', 'paths.js')));
  getMonorepoRoot = pathsModule.getMonorepoRoot;

  const displayContentModule = await import(toEsmModuleSpecifier(path.join(agentWorkerDir, 'lib', 'display-content.js')));
  extractDisplayContent = displayContentModule.extractDisplayContent;

  const cognitiveSessionEndModule = await import(toEsmModuleSpecifier(path.join(agentWorkerDir, 'cognitive-session-end.js')));
  flushCognitiveSessionEnd = cognitiveSessionEndModule.flushCognitiveSessionEnd;
} else {
  // 开发环境：直接导入
  const pathsModule = await import('../../../lib/paths');
  getMonorepoRoot = pathsModule.getMonorepoRoot;

  const displayContentModule = await import('../../../lib/integrations/pi-agent/display-content');
  extractDisplayContent = displayContentModule.extractDisplayContent;

  const cognitiveSessionEndModule = await import('./cognitive-session-end');
  flushCognitiveSessionEnd = cognitiveSessionEndModule.flushCognitiveSessionEnd;
}

// ============================================================================
// Stdio 协议类型
// ============================================================================

/** Runtime → Worker 命令 */
interface WorkerCommand {
  type: "initialize" | "prompt" | "abort" | "shutdown" | "resume" | "tool_result";
  config?: {
    projectId: string;
    agentId: string;
    workingDirectory: string;
    agentType?: "persistent" | "originos" | "skill" | "role-agent" | "supervisor";
    systemPrompt?: string;
    model?: WorkerModelConfig;
    tools?: Array<{ name: string; description: string }>;
  };
  message?: string;
  response?: string;
  /** tool_result 专用：对应 SUPERVISOR_TOOL_CALL 的 toolCallId */
  toolCallId?: string;
  /** tool_result 专用：glue 层返回的结果 JSON 字符串 */
  result?: string;
}

/** Worker → Runtime 事件 */
interface WorkerMessage {
  type: "ready" | "waiting" | "event" | "error";
  event?: unknown;
  message?: string;
  error?: string;
}

type WorkerModelConfig = {
  provider?: string;
  id?: string;
  model?: string;
  baseUrl?: string;
  anthropicBaseUrl?: string;
  apiKey?: string;
  maxTokens?: number;
  anthropicCredentialSource?: "anthropicAuthToken" | "anthropicApiKey" | "authToken" | "apiKey";
  anthropicAuthToken?: string;
  anthropicApiKey?: string;
  authToken?: string;
  mapping?: Record<string, string>;
};

function summarizeWorkerModel(modelConfig?: WorkerModelConfig): Record<string, unknown> {
  if (!modelConfig) return { provided: false };
  const credentialSource = modelConfig.anthropicCredentialSource
    ?? (modelConfig.anthropicAuthToken ? "anthropicAuthToken" : undefined)
    ?? (modelConfig.anthropicApiKey ? "anthropicApiKey" : undefined)
    ?? (modelConfig.authToken ? "authToken" : undefined)
    ?? (modelConfig.apiKey ? "apiKey" : undefined);
  return {
    provided: true,
    provider: modelConfig.provider ?? "default",
    model: modelConfig.model ?? modelConfig.id ?? "default",
    baseUrl: modelConfig.anthropicBaseUrl ?? modelConfig.baseUrl ?? "default",
    hasCredential: Boolean(modelConfig.anthropicAuthToken || modelConfig.anthropicApiKey || modelConfig.authToken || modelConfig.apiKey),
    credentialSource: credentialSource ?? "none",
    maxTokens: modelConfig.maxTokens ?? "default",
    hasMapping: Boolean(modelConfig.mapping),
  };
}

function logRuntime(phase: string, data: Record<string, unknown>): void {
  console.error(`[MultiAgentRuntime] ${phase} ${JSON.stringify(data)}`);
}

async function createWorkerModel(modelConfig?: WorkerModelConfig): Promise<unknown> {
  const { createAutoModel, createRuntimeModel } = await runtimeImport("lib/integrations/pi-agent/server-config") as {
    createAutoModel: () => unknown;
    createRuntimeModel: (config: Record<string, unknown>) => unknown;
  };
  logRuntime("worker.model.create.start", {
    model: summarizeWorkerModel(modelConfig),
  });
  console.error(`[createWorkerModel] modelConfig provided: ${!!modelConfig}`, modelConfig ? {
    provider: modelConfig.provider,
    baseUrl: modelConfig.anthropicBaseUrl ?? modelConfig.baseUrl,
    hasApiKey: !!modelConfig.apiKey,
    hasAnthropicApiKey: !!modelConfig.anthropicApiKey,
    hasAuthToken: !!modelConfig.authToken,
    hasAnthropicAuthToken: !!modelConfig.anthropicAuthToken,
    model: modelConfig.model ?? modelConfig.id,
    anthropicCredentialSource: modelConfig.anthropicCredentialSource,
    mapping: modelConfig.mapping,
  } : "undefined — will fallback to createAutoModel()");
  if (modelConfig) {
    const model = createRuntimeModel({
      provider: modelConfig.provider,
      baseUrl: modelConfig.baseUrl,
      anthropicBaseUrl: modelConfig.anthropicBaseUrl,
      apiKey: modelConfig.apiKey,
      anthropicAuthToken: modelConfig.anthropicAuthToken,
      anthropicApiKey: modelConfig.anthropicApiKey,
      authToken: modelConfig.authToken,
      model: modelConfig.model ?? modelConfig.id,
      maxTokens: modelConfig.maxTokens,
      anthropicCredentialSource: modelConfig.anthropicCredentialSource,
      mapping: modelConfig.mapping,
    });
    logRuntime("worker.model.create.done", {
      model: summarizeWorkerModel(modelConfig),
    });
    return model;
  }
  const model = createAutoModel();
  logRuntime("worker.model.create.done", {
    model: { provided: false, mode: "auto" },
  });
  return model;
}

// ============================================================================
// Stdio 通道
// ============================================================================

/** 向 Runtime 发送事件（stdout JSON Line） */
function sendToRuntime(msg: WorkerMessage): void {
  if (isWorkerAborted && msg.type === "event") return;
  process.stdout.write(JSON.stringify(msg) + "\n");
}

/** 发送错误 */
function sendError(error: string | Error): void {
  sendToRuntime({
    type: "error",
    message: error instanceof Error ? error.message : error,
    error: error instanceof Error ? error.stack : error,
  });
}

/** 发送 RuntimeEvent */
function emitEvent(event: unknown): void {
  sendToRuntime({ type: "event", event });
}

// ============================================================================
// 进程级 abort 标志，abort/shutdown 后立即停止所有 stdout 输出
// ============================================================================

let isWorkerAborted = false;

/** 标记 worker 已中止，后续所有 stdout 输出被拦截 */
function markWorkerAborted(): void {
  isWorkerAborted = true;
}

// ============================================================================
// Agent Worker 类
// ============================================================================

/** 判断文本是否像工具调用语法（函数式、YAML 描述式或 JSON 式） */
function isToolCallLike(text: string): boolean {
  const trimmed = text.trim();
  // 匹配: functionName(key=value) 或 functionName("...")
  if (/^[a-z_]+\s*\([^)]{0,200}\)/i.test(trimmed)) return true;
  // 匹配 YAML 工具描述: tool_name: xxx, arguments:, call_list:, - tool_name:
  if (/^(call_list|tool_name|arguments|-\s*tool_name|- tool_name)\s*[:\[]/i.test(trimmed)) return true;
  // 匹配 JSON 工具调用: {"name": "read_file", ...} 或 [{"name": ...}]
  if (/".*name".*:.*"(read_file|write_file|list_directory|bash|file)/i.test(trimmed)) return true;
  // 匹配 JSON 数组开头
  if (/^\[\s*\{\s*".*name"/i.test(trimmed)) return true;
  // 匹配 code block 内含工具描述
  if (/```(?:json)?\s*\[\s*\{.*"name"/s.test(trimmed)) return true;
  // 纯 code block 格式的工具描述
  if (/```(?:json)?\s*\n\s*\[\s*\n\s*\{\s*\n\s*"name"/s.test(trimmed)) return true;
  // 如果已累积较长文本且包含 "name":"xxx_file" 和 "arguments"，判定为工具描述
  if (text.length > 50 && /"name"\s*:.*_file/.test(text) && /"arguments"/.test(text)) return true;
  // 匹配: *(调用工具: read_file) 或 Calling tool: xxx 等自然语言工具调用标记
  if (/[*`]*\s*[\(（]\s*(调用工具|Calling|Tool call)\s*[:：\s]/i.test(trimmed)) return true;
  // 匹配 **工具: xxx** 格式
  if (/^\*\*工具\s*[:：\s]/i.test(trimmed)) return true;
  // 匹配纯 JSON 结果: {"status": "..."}
  if (/^\{?\s*"status"\s*:/i.test(trimmed)) return true;
  return false;
}

/** 从文本中移除工具调用的 code block 和内联工具语法 */
/** 检测文本是否以问题结尾（Agent 需要用户输入的信号） */
function endsWithQuestion(text: string): boolean {
  if (!text) return false;
  // 取最后一个非空行
  const lastLine = text.split("\n").map(l => l.trim()).filter(Boolean).at(-1) ?? "";
  return lastLine.endsWith("?") || lastLine.endsWith("？");
}

function stripToolCodeBlocks(text: string): string {
  // 1. 移除 ```json ... ``` 格式的 code block（如果是工具调用或纯 JSON 结果）
  let result = text.replace(/```(?:json)?\s*\n([\s\S]*?)```/g, (match) => {
    return isToolCallLike(match) ? '' : match;
  });
  // 2. 逐行过滤：移除工具调用描述行
  result = result.split('\n').filter(line => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    // 移除 *(调用工具: xxx)* 格式的行
    if (/[*`]*\s*[\(（]\s*(调用工具|Calling|Tool call)\s*[:：\s]/i.test(trimmed)) return false;
    // 移除 **工具: xxx** 行
    if (/^\*\*工具\s*[:：\s]/i.test(trimmed)) return false;
    // 移除纯 JSON 结果行
    if (/^\{?\s*"status"\s*:/i.test(trimmed)) return false;
    if (isToolCallLike(trimmed)) return false;
    return true;
  }).join('\n');
  // 3. 移除行内的 functionName(...) 模式
  result = result.replace(/[a-z_]+\s*\([^)]{0,200}\)/gi, '').trim();
  // 4. 清理空行
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  return result;
}

class AgentWorker {
  private projectId: string;
  private agentId: string;
  private workingDirectory: string;
  private agentType: "persistent" | "originos" | "skill" | "role-agent" | "supervisor" | "supervisor-lite";
  private persistentAgent: unknown = null; // 延迟加载
  private originOSAgent: unknown = null; // OriginOS Agent
  private initialized = false;
  private abortController: AbortController | null = null;
  /** 跟踪当前 turn 是否有工具调用，有则不逐帧推送 text_delta */
  private turnHasToolCall = false;
  /** 整个 agent 会话是否有工具调用（跨 turn，用于 HITL 判定标准） */
  private sessionHasToolCalls = false;
  /** 累积当前 turn 的文本，用于检测整段是否为工具调用描述 */
  private turnTextBuffer = '';
  /** 标记当前 turn 是否包含工具调用描述 */
  private turnIsToolDescription = false;
  /** OriginOS Agent 路径的 CognitiveManager（延迟创建） */
  private originosCognitiveManager: unknown = null;
  /** RecallMemory 引用，用于上下文压缩时注入历史摘要 */
  private recallMemory: import("../../memory-core").RecallMemory | null = null;
  /** OriginOS Agent turn 计数器 */
  private originosTurnCounter = 0;
  /** PersistentAgent 路径的 CognitiveManager */
  private persistentCognitiveManager: unknown = null;
  /** PersistentAgent turn 计数器 */
  private persistentTurnCounter = 0;
  /** Human-in-the-Loop: 标记 Agent 是否暂停等待用户确认 */
  pausedForHumanReview = false;
  /** 用户回复注入，供 resume 使用 */
  private humanReviewResponse: string | null = null;
  /** Story 9.33: escalate_to_human 防滥用计数 — key: `${workerId}:${blockType}` */
  private escalationCounts = new Map<string, number>();
  /** Story 9.33: decisions.jsonl 路径（协作会话目录下） */
  private decisionsLogPath: string | null = null;
  /** resolve 函数：由 resume() 调用，解除 continueAfterResume 内部的等待 */
  private resumeResolver: (() => void) | null = null;
  /** continueAfterResume() 的 Promise，供 case "resume" await */
  private resumeContinuation: Promise<void> | null = null;
  private collaborationSessionId: string | null = process.env["AGENT_COLLAB_SESSION_ID"] ?? null;
  private blackboardDir: string | null = process.env["AGENT_BLACKBOARD_DIR"] ?? null;
  /**
   * Supervisor 协调工具调用的挂起解析器 — SUPA-02。
   * key = toolCallId, value = resolve(result) 回调。
   * glue 层发送 tool_result 命令时，resolveToolResult() 查表解除等待。
   */
  private pendingToolResults = new Map<string, (result: string) => void>();

  constructor(
    projectId: string,
    agentId: string,
    workingDirectory: string,
    agentType: "persistent" | "originos" | "skill" | "role-agent" | "supervisor" | "supervisor-lite" = "persistent"
  ) {
    this.projectId = projectId;
    this.agentId = agentId;
    this.workingDirectory = workingDirectory;
    this.agentType = agentType;
  }

  /**
   * 多 Agent worker 的认知统一归属于业务 Project。
   * workingDirectory 仍用于会话记忆与工具，但 cognition bank 固定写入 Project owner。
   */
  private async createProjectCognitiveRuntime(): Promise<{
    memoryCore: import("../../memory-core").MemoryCore;
    cognitiveManager: unknown;
  }> {
    const { getDataRoot } = await runtimeImport("lib/paths");
    const { ObservationPolicyResolver } = await runtimeImport("modules/memory-core/index");
    const { CognitiveManager } = await runtimeImport("lib/integrations/pi-agent/cognitive/manager");
    const { PracticeLogger } = await runtimeImport("lib/integrations/pi-agent/cognitive/practice-logger");
    const { createOwnedCognitiveProviders } = await runtimeImport("lib/integrations/pi-agent/cognitive/provider-factory");
    const dataRoot = getDataRoot();
    const ownerDirectory = path.join(dataRoot, "projects", this.projectId);
    const observationContext = new ObservationPolicyResolver().resolve({
      entryType: "project",
      sessionId: this.agentId,
      projectId: this.projectId,
    });
    const providers = createOwnedCognitiveProviders({
      ownerScope: "project",
      ownerId: this.projectId,
      userId: "default",
      dataRoot,
      workingDirectory: this.workingDirectory,
      ownerDirectory,
      sessionId: this.agentId,
    }, observationContext);
    const cognitiveManager = new CognitiveManager(this.workingDirectory);
    cognitiveManager.register(new PracticeLogger(this.workingDirectory));
    cognitiveManager.register(providers.knowledgeProvider);
    cognitiveManager.register(providers.memoryProvider);
    await providers.patternProvider.initialize();
    cognitiveManager.register(providers.patternProvider);
    return { memoryCore: providers.memoryCore, cognitiveManager };
  }

  getRuntimeLogContext(): Record<string, unknown> {
    return {
      projectId: this.projectId,
      agentId: this.agentId,
      agentType: this.agentType,
    };
  }

  // ==========================================================================
  // Supervisor 协调工具结果注入（SUPA-02）
  // ==========================================================================

  /**
   * 由主进程 processCommand("tool_result") 调用：
   * 查找对应的挂起 Promise 并 resolve，解除 callCoordinatorTool 的等待。
   */
  resolveToolResult(toolCallId: string, result: string): void {
    const resolver = this.pendingToolResults.get(toolCallId);
    if (resolver) {
      this.pendingToolResults.delete(toolCallId);
      resolver(result);
    } else {
      console.error(`[AgentWorker] resolveToolResult: no pending resolver for toolCallId=${toolCallId}`);
    }
  }

  /**
   * Supervisor 协调工具调用辅助方法（SUPA-02）。
   * 向 Runtime 的 glue 层发射 SUPERVISOR_TOOL_CALL 事件，然后等待
   * glue 层通过 sendToolResult (stdin tool_result 命令) 回传结果。
   */
  private async callCoordinatorTool(toolCallId: string, toolName: string, args: unknown): Promise<string> {
    return new Promise<string>((resolve) => {
      this.pendingToolResults.set(toolCallId, resolve);
      emitEvent({
        id: `evt-sup-tool-${toolCallId}`,
        sessionId: this.collaborationSessionId ?? this.projectId,
        seq: 0,
        type: "SUPERVISOR_TOOL_CALL",
        payload: { toolCallId, toolName, args },
        source: this.agentId,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Story 9.33: 追加决策日志到 decisions.jsonl。
   * 路径：data/projects/{projectId}/collaboration-sessions/{sessionId}/supervisor/memory/decisions.jsonl
   */
  private async appendDecisionLog(entry: {
    toolCallId: string;
    blockKey: string;
    decision: string;
    rationale: string;
    mergedContext?: unknown;
  }): Promise<void> {
    try {
      const { appendFile, mkdir } = await import("fs/promises");
      const path = await import("path");
      const sessionId = this.collaborationSessionId ?? this.projectId;
      const logDir = path.join(
        getMonorepoRoot(),
        "data/projects",
        this.projectId,
        "collaboration-sessions",
        sessionId,
        "supervisor/memory"
      );
      await mkdir(logDir, { recursive: true });
      const logPath = path.join(logDir, "decisions.jsonl");
      this.decisionsLogPath = logPath;
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        toolCallId: entry.toolCallId,
        blockKey: entry.blockKey,
        decision: entry.decision,
        rationale: entry.rationale,
        ...(entry.mergedContext ? { mergedContext: entry.mergedContext } : {}),
      });
      await appendFile(logPath, line + "\n", "utf-8");
    } catch {
      // non-fatal: log write failure should not block HITL flow
    }
  }

  /**
   * 等待 HITL 用户回复：通过 pendingToolResults 挂起当前工具调用，
   * 直到 glue 层调用 resume() 注入用户回复。
   * 不抛异常，而是真正地 await，保持 agent tool 调用处于挂起状态。
   */
  private async waitForHumanResponse(toolCallId: string): Promise<string> {
    this.pausedForHumanReview = true;
    emitEvent({
      id: `evt-pause-hitl-${Date.now()}`,
      sessionId: this.collaborationSessionId ?? this.projectId,
      seq: 0,
      type: "AGENT_PAUSED",
      payload: { reason: "human_review", agentId: this.agentId, toolCallId },
      source: this.agentId,
      timestamp: new Date().toISOString(),
    });
    // 真正地挂起：等待 resume() 或 resolveToolResult() 注入用户回复
    return new Promise<string>((resolve) => {
      // 优先用 resumeResolver（resume stdin 命令路径）
      this.resumeResolver = () => {
        this.pausedForHumanReview = false;
        this.resumeResolver = null;
        resolve(this.humanReviewResponse ?? "");
        this.humanReviewResponse = null;
      };
      // 同时注册到 pendingToolResults（tool_result stdin 命令路径）
      this.pendingToolResults.set(toolCallId, (result: string) => {
        this.pausedForHumanReview = false;
        this.resumeResolver = null;
        resolve(result);
      });
    });
  }

  /** 初始化：读取文件 → 构建 prompt → 创建 Agent */
  async initialize(
    extra?: {
      systemPrompt?: string;
      model?: WorkerModelConfig;
      tools?: Array<{ name: string; description: string }>;
    }
  ): Promise<void> {
    if (this.initialized) {
      sendError("Agent already initialized");
      return;
    }

    const startedAt = Date.now();
    logRuntime("worker.initialize.start", {
      projectId: this.projectId,
      agentId: this.agentId,
      agentType: this.agentType,
      workingDirectory: this.workingDirectory,
      collaborationSessionId: this.collaborationSessionId,
      model: summarizeWorkerModel(extra?.model),
      toolsCount: extra?.tools?.length ?? 0,
    });
    try {
      // Supervisor Agent 路径
      if (this.agentType === "supervisor") {
        await this.initializeSupervisorAgent(extra);
        logRuntime("worker.initialize.done", {
          projectId: this.projectId,
          agentId: this.agentId,
          agentType: this.agentType,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }

      // Story 9.35: Lightweight Supervisor 路径（最小 4 层 prompt，受限工具集）
      if (this.agentType === "supervisor-lite") {
        await this.initializeSuperviseLiteAgent(extra);
        logRuntime("worker.initialize.done", {
          projectId: this.projectId,
          agentId: this.agentId,
          agentType: this.agentType,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }

      // OriginOS / Skill Agent 路径 — 检测是否为多 Agent 协作场景
      if (this.agentType === "originos" || this.agentType === "skill") {
        const collaborationContextPath = path.join(this.workingDirectory, "project-collaboration-context.json");
        const isCollaboration = existsSync(collaborationContextPath);

        if (isCollaboration) {
          await this.initializeProjectAgent(extra);
        } else {
          await this.initializeOriginOSAgent({ ...extra, agentType: this.agentType });
        }
        logRuntime("worker.initialize.done", {
          projectId: this.projectId,
          agentId: this.agentId,
          agentType: this.agentType,
          isCollaboration,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }

      // Persistent Agent 路径 — 原有逻辑
      await this.initializePersistentAgent();
      logRuntime("worker.initialize.done", {
        projectId: this.projectId,
        agentId: this.agentId,
        agentType: this.agentType,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      sendError(error);
      logRuntime("worker.initialize.error", {
        projectId: this.projectId,
        agentId: this.agentId,
        agentType: this.agentType,
        error: error.message,
        elapsedMs: Date.now() - startedAt,
      });
      console.error("[AgentWorker] Initialization failed:", error);
    }
  }

  /** 初始化多 Agent 协作 Agent（project-collaboration-context.json 场景） */
  private async initializeProjectAgent(
    extra?: {
      systemPrompt?: string;
      model?: WorkerModelConfig;
      tools?: Array<{ name: string; description: string }>;
    }
  ): Promise<void> {
    // 1. 加载协作上下文
    const { loadProjectCollaborationContext } = await runtimeImport("lib/integrations/pi-agent/project-agent/project-collaboration-context");
    const collabCtx = await loadProjectCollaborationContext(
      this.workingDirectory,
      this.projectId,
      this.agentId,
    );

    if (!collabCtx) {
      sendError("Agent.md not found in working directory");
      return;
    }

    // 2. 构建 7 层协作 prompt
    const { buildCollaborationPrompt } = await runtimeImport("lib/integrations/pi-agent/project-agent/collaboration-prompt");
    const systemPrompt = buildCollaborationPrompt(collabCtx, extra?.systemPrompt);
    console.error(`[AgentWorker] ProjectAgent: Built 7-layer collaboration prompt for agent ${this.agentId}`);

    // 3. 创建模型
    const model = await createWorkerModel(extra?.model);

    // 4. 注册工具，按 Tool.md allowedTools 白名单过滤
    const { initializeBuiltInTools, getAgentTools } = await runtimeImport("lib/integrations/pi-agent/tools");
    initializeBuiltInTools();
    const allTools = getAgentTools();

    // 工具分组别名映射（Tool.md allowedTools 字段使用这些别名）
    const toolGroupMap: Record<string, string[]> = {
      "file-ops":    ["read_file", "write_file", "edit_file", "list_files", "delete_file"],
      "document-ops": ["read_document", "read_spreadsheet", "list_document_structure", "extract_document_tables"],
      "ontology-ops": ["query_ontology", "create_domain", "create_concept", "search_ontology",
                       "create_instance", "get_instance", "update_instance", "delete_instance",
                       "query_instances", "list_concepts", "get_concept_schema"],
      "bash":        ["execute_command"],
      "system":      ["get_current_time"],
    };
    // 协作 agent 始终注入：system 工具（HITL 由下方 coordinator tool 提供）
    const alwaysIncluded = new Set(["get_current_time"]);

    let allowedToolNames: Set<string>;
    if (collabCtx.allowedTools.length > 0) {
      allowedToolNames = new Set(alwaysIncluded);
      for (const alias of collabCtx.allowedTools) {
        const group = toolGroupMap[alias];
        if (group) {
          group.forEach(n => allowedToolNames.add(n));
        } else {
          // 直接是工具名称
          allowedToolNames.add(alias);
        }
      }
    } else {
      // 无 Tool.md 配置：排除 skill、url
      const excluded = new Set(["list_skills", "Skill", "generate_file_url"]);
      allowedToolNames = new Set((allTools as { name: string }[]).map(t => t.name).filter(n => !excluded.has(n)));
    }

    const tools = (allTools as { name: string }[]).filter(t => allowedToolNames.has(t.name));
    console.error(`[AgentWorker] ProjectAgent: registered ${tools.length}/${allTools.length} tools (allowedTools: ${collabCtx.allowedTools.join(", ") || "default"})`);

    // Worker 不允许直接向用户提问。移除 ask_user_question，避免 Worker → User 直连。
    const filteredTools = tools.filter(t => t.name !== "ask_user_question");

    // 5. 设置工具执行上下文
    const { setToolContext, getToolContextManager } = await runtimeImport("lib/integrations/pi-agent/tools/context");
    setToolContext(this.agentId, { sessionId: this.agentId, workingDirectory: this.workingDirectory });
    getToolContextManager().setDefaultContext({ sessionId: this.agentId, workingDirectory: this.workingDirectory });

    // 6. 创建 OriginOSAgent
    const { OriginOSAgent } = await runtimeImport("lib/integrations/pi-agent/core/agent");
    const agent = new OriginOSAgent({
      sessionId: this.agentId,
      systemPrompt,
      model,
      tools: [],
      projectContext: {
        projectId: this.projectId,
        currentPath: this.workingDirectory,
      },
    });

    // 7. 注入已注册工具（暂时设置，后续替换为含 HITL ask_user_question 的完整工具集）
    agent.setTools(filteredTools);

    // 8. 创建 Memory Core 系统（协作 Agent 也需要记忆）
    const { memoryCore, cognitiveManager } = await this.createProjectCognitiveRuntime();
    this.recallMemory = memoryCore.recall;
    this.originosCognitiveManager = cognitiveManager;

    // 注册 Memory 工具
    const { CoreMemoryTools } = await runtimeImport("modules/memory-core/tools/core-memory-tools");
    const { ArchivalMemoryTools } = await runtimeImport("modules/memory-core/tools/archival-memory-tools");

    const coreMemoryTools = new CoreMemoryTools(memoryCore.memory);
    const archivalMemoryTools = new ArchivalMemoryTools(memoryCore.archival);

    const memoryTools = [
      {
        name: "core_memory_append",
        description: "Append content to a core memory block. Available blocks: human, persona, project, scratchpad, temporal. Use the 'label' parameter to specify which block.",
        label: "core_memory_append",
        parameters: {
          type: "object",
          properties: { label: { type: "string" }, content: { type: "string" } },
          required: ["label", "content"],
        },
        execute: async (_toolCallId: string, args: { label: string; content: string }) => {
          if (!args?.label) return { content: [{ type: "text" as const, text: "Error: 'label' parameter is required and must be a non-empty string. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
          if (!args?.content) return { content: [{ type: "text" as const, text: "Error: 'content' parameter is required and must be a non-empty string." }], details: {} };
          const result = await coreMemoryTools.core_memory_append(args.label, args.content);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "core_memory_replace",
        description: "Replace content in a core memory block with precise find-and-replace. Available blocks: human, persona, project, scratchpad, temporal. Use the 'label' parameter to specify which block.",
        label: "core_memory_replace",
        parameters: {
          type: "object",
          properties: { label: { type: "string" }, old_content: { type: "string" }, new_content: { type: "string" } },
          required: ["label", "old_content", "new_content"],
        },
        execute: async (_toolCallId: string, args: { label: string; old_content: string; new_content: string }) => {
          if (!args?.label) return { content: [{ type: "text" as const, text: "Error: 'label' parameter is required and must be a non-empty string. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
          if (!args?.old_content) return { content: [{ type: "text" as const, text: "Error: 'old_content' parameter is required." }], details: {} };
          if (!args?.new_content) return { content: [{ type: "text" as const, text: "Error: 'new_content' parameter is required." }], details: {} };
          const result = await coreMemoryTools.core_memory_replace(args.label, args.old_content, args.new_content);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "insert_memory_block",
        description: "Create a new custom core memory block.",
        label: "insert_memory_block",
        parameters: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "string" }, description: { type: "string" } },
          required: ["label", "value"],
        },
        execute: async (_toolCallId: string, args: { label: string; value: string; description?: string }) => {
          const result = await coreMemoryTools.insert_memory_block(args.label, args.value, args.description);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "read_memory_block",
        description: "Read the full content of a core memory block.",
        label: "read_memory_block",
        parameters: {
          type: "object",
          properties: { label: { type: "string" } },
          required: ["label"],
        },
        execute: async (_toolCallId: string, args: { label: string }) => {
          const result = await coreMemoryTools.read_memory_block(args.label);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "archival_memory_insert",
        description: "Insert text into archival (long-term) memory for future semantic search.",
        label: "archival_memory_insert",
        parameters: {
          type: "object",
          properties: { text: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
          required: ["text"],
        },
        execute: async (_toolCallId: string, args: { text: string; tags?: string[] }) => {
          const result = await archivalMemoryTools.archival_memory_insert(args.text, args.tags);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "archival_memory_search",
        description: "Semantically search archival (long-term) memory.",
        label: "archival_memory_search",
        parameters: {
          type: "object",
          properties: { query: { type: "string" }, limit: { type: "number" } },
          required: ["query"],
        },
        execute: async (_toolCallId: string, args: { query: string; limit?: number }) => {
          const result = await archivalMemoryTools.archival_memory_search(args.query, args.limit);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
    ];

    // Worker 在协作模式下的 ask_user_question：用 HITL 挂起版本替换原始工具（原始工具立即返回 YAML，不挂起）
    const workerAskUserTool = {
      name: "ask_user_question",
      label: "向用户提问（协作 HITL）",
      description: "向用户提出一个问题并等待用户回复后再继续。在协作模式下会通过 HITL 机制挂起并等待用户实际回答。",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "object" } },
          multiSelect: { type: "boolean" },
        },
        required: ["question"],
      },
      category: "system",
      enabled: true,
      execute: async (toolCallId: string, args: {
        question: string;
        options?: Array<{ label: string; description: string }>;
        multiSelect?: boolean;
      }) => {
        const options = args.options ?? [];
        // Worker 不直接向用户提问，而是向 Supervisor 上报 HITL_ESCALATE，
        // 由 Supervisor 中转后再向用户提问，保证所有 HITL 都在 Supervisor 对话里可见。
        emitEvent({
          id: `evt-hitl-escalate-${toolCallId}`,
          sessionId: this.collaborationSessionId ?? this.projectId,
          seq: 0,
          type: "HITL_ESCALATE",
          payload: {
            question: args.question,
            options,
            multiSelect: args.multiSelect ?? false,
            workerId: this.agentId,
            toolCallId,
          },
          source: this.agentId,
          timestamp: new Date().toISOString(),
        });
        const reply = await this.waitForHumanResponse(toolCallId);
        return {
          content: [{ type: "text" as const, text: `用户回复: ${reply}` }],
        };
      },
    };

    agent.setTools([...filteredTools, workerAskUserTool, ...memoryTools]);

    // 9. 将 Memory 快照注入 system prompt
    try {
      const memoryBlock = await memoryProvider.system_prompt_block();
      if (memoryBlock) {
        const augmentedPrompt = systemPrompt + '\n\n---\n\n# Core Memory\n\n' + memoryBlock;
        (agent as any).setSystemPrompt?.(augmentedPrompt);
        console.error('[AgentWorker] ProjectAgent: Injected Core Memory into system prompt');
      }
    } catch (err) {
      console.error('[AgentWorker] Failed to inject memory block into system prompt:', err);
    }

    // 10. 写入 Project Context 到 Blackboard（协作共享记忆）
    try {
      // 避免循环导入，仅在需要时动态加载
      const { ProjectContextWriter } = await runtimeImport("modules/collaboration-runtime/engine/agent-context-writer");
      const blackboard = await this.loadCollaborationBlackboard();
      if (blackboard) {
        const ctxWriter = new ProjectContextWriter(blackboard, this.projectId);
        const ctxData = {
          agentId: this.agentId,
          agentMd: collabCtx.agentMd ?? "",
          toolMd: collabCtx.toolMd ?? null,
          tasteMd: collabCtx.tasteMd ?? null,
          memoryMd: collabCtx.memoryMd ?? null,
          knowledgeMd: collabCtx.knowledgeMd ?? null,
          patternsMd: collabCtx.patternsMd ?? null,
          installedSkills: collabCtx.installedSkills ?? [],
          allowedTools: collabCtx.allowedTools ?? [],
          workingDirectory: this.workingDirectory,
          originosProjectId: collabCtx.originosProjectId ?? null,
        };
        ctxWriter.writeProjectContext(ctxData);
        console.error(`[AgentWorker] ProjectAgent: Wrote project context to Blackboard for agent ${this.agentId}`);
        await blackboard.snapshot();
      }
    } catch (err) {
      console.error('[AgentWorker] Failed to write project context to Blackboard:', err);
    }

    this.originOSAgent = agent;

    // 10. 订阅事件并转发到 Runtime
    this.subscribeToOriginOSEvents();

    this.initialized = true;
    sendToRuntime({ type: "ready" });
    console.error(`[AgentWorker] Initialized ProjectAgent (collaboration): agentId=${this.agentId}`);
  }

  /** 初始化 Supervisor Agent（协作调度官模式 — SUPA-02） */
  private async initializeSupervisorAgent(
    extra?: {
      systemPrompt?: string;
      model?: WorkerModelConfig;
      tools?: Array<{ name: string; description: string }>;
    }
  ): Promise<void> {
    // 1. 读取 Supervisor Agent 模板目录（工作目录即 data/agents/supervisor/）
    const { loadProjectCollaborationContext } = await runtimeImport("lib/integrations/pi-agent/project-agent/project-collaboration-context");
    const collabCtx = await loadProjectCollaborationContext(
      this.workingDirectory,
      this.projectId,
      this.agentId,
    );

    if (!collabCtx) {
      sendError("Supervisor Agent.md not found in working directory");
      return;
    }

    // 2. 读取项目协作上下文 JSON（agents、topology、globalGoal）
    // 项目协作上下文已在启动时由 glue 层写入到 workingDirectory/project-collaboration-context.json
    let projectCollabContext = "";
    try {
      const collabJsonPath = path.join(this.workingDirectory, "project-collaboration-context.json");

      if (existsSync(collabJsonPath)) {
        const { readFile } = await import("fs/promises");
        const collabJson = JSON.parse(await readFile(collabJsonPath, "utf-8"));

        // 构建 Workers 列表
        const workersList = collabJson.agents?.map((a: { name: string; id: string; responsibility: string }) =>
          `- **${a.name}** (ID: ${a.id})\n  职责: ${a.responsibility}`
        ).join("\n") || "无 Workers 定义";

        // 构建拓扑描述
        const topologyDesc = collabJson.topology?.edges?.map((e: { from: string; to: string; type: string }) =>
          e.type === "trigger"
            ? `  [触发] ${e.from} → ${e.to}`
            : `  [通知] ${e.to} → ${e.from}`
        ).join("\n") || "无拓扑定义";

        projectCollabContext = [
          "",
          `## 项目协作上下文`,
          "",
          `**业务项目 ID**: ${collabJson.originosProjectId || this.projectId}`,
          `**本体 ID（ontologyId）**: ${collabJson.ontologyId || `ontology-${collabJson.originosProjectId || this.projectId}`}`,
          `> ⚠️ 上方"业务项目 ID"是 OriginOS 工作区容器的系统标识符（形如 proj-xxx），用于定位文件目录和本体数据。它与本体中用户自定义的"项目"概念实例（业务实体）是完全不同的两个东西，请勿混淆。调用本体工具时，必须使用上方"本体 ID"字段的值，不要自己拼接。`,
          collabJson.globalGoal ? `**全局目标**: ${collabJson.globalGoal}` : "",
          "",
          "### Workers 团队",
          workersList,
          "",
          "### 协作拓扑",
          topologyDesc,
        ].filter(Boolean).join("\n");

        console.error(`[AgentWorker] Loaded project collaboration context from ${collabJsonPath}`);
      } else {
        console.warn(`[AgentWorker] project-collaboration-context.json not found in ${this.workingDirectory}`);
        projectCollabContext = "\n\n## 注意\n\n未能加载项目协作上下文，请确保 Supervisor 工作目录中存在 project-collaboration-context.json 文件。";
      }
    } catch (err) {
      console.warn(`[AgentWorker] Failed to load project collaboration context:`, err);
      projectCollabContext = "\n\n## 注意\n\n未能加载项目协作上下文，请检查 Supervisor 工作目录中的 project-collaboration-context.json 文件。";
    }

    // 3. 构建 7 层协作 prompt（复用 buildCollaborationPrompt，追加项目协作上下文）
    const { buildCollaborationPrompt } = await runtimeImport("lib/integrations/pi-agent/project-agent/collaboration-prompt");

    // 在 Layer 1 (identity) 之后插入项目协作上下文
    let systemPrompt = buildCollaborationPrompt(collabCtx, extra?.systemPrompt);

    // 将项目协作上下文插入到 Layer 1 之后（替换第一个分隔符之前的部分）
    const identityLayerMatch = systemPrompt.match(/(.*?)\n\n---/s);
    if (identityLayerMatch && projectCollabContext) {
      systemPrompt = `${identityLayerMatch[1]}\n\n${projectCollabContext}\n\n${systemPrompt.slice(identityLayerMatch[0].length)}`;
    } else if (projectCollabContext) {
      // 如果找不到分隔符，直接追加
      systemPrompt = `${projectCollabContext}\n\n${systemPrompt}`;
    }

    console.error(`[AgentWorker] SupervisorAgent: Built 7-layer prompt with project context for supervisor agentId=${this.agentId}`);

    // 3. 创建模型
    const { OriginOSAgent } = await runtimeImport("lib/integrations/pi-agent/core/agent");

    const model = await createWorkerModel(extra?.model);

    // 4. 构建协调工具 — 工具调用通过 SUPERVISOR_TOOL_CALL 事件发往 glue 层执行（SUPA-02）
    const coordinatorTools = [
      {
        name: "dispatch_worker",
        label: "派发 Worker",
        description: "派发一个 Worker Agent 执行具体子任务，立即返回 dispatchId。参数：workerId（Agent ID）、specificAction（具体动作指令）、acceptanceCriteria（验收标准）。",
        parameters: {
          type: "object" as const,
          properties: {
            workerId: { type: "string" },
            specificAction: { type: "string" },
            acceptanceCriteria: { type: "string" },
          },
          required: ["workerId", "specificAction", "acceptanceCriteria"],
        },
        category: "system",
        enabled: true,
        execute: async (toolCallId: string, args: { workerId: string; specificAction: string; acceptanceCriteria: string }) => {
          const result = await this.callCoordinatorTool(toolCallId, "dispatch_worker", args);
          return { content: [{ type: "text" as const, text: result }] };
        },
      },
      {
        name: "wait_workers",
        label: "等待 Worker 完成",
        description: "等待一批 Worker 完成（或超时），返回 {completed, failed, waiting} 列表。参数：workerIds（Agent ID 数组）、timeoutMs（可选超时毫秒数）。",
        parameters: {
          type: "object" as const,
          properties: {
            workerIds: { type: "array", items: { type: "string" } },
            timeoutMs: { type: "number" },
          },
          required: ["workerIds"],
        },
        category: "system",
        enabled: true,
        execute: async (toolCallId: string, args: { workerIds: string[]; timeoutMs?: number }) => {
          const result = await this.callCoordinatorTool(toolCallId, "wait_workers", args);
          return { content: [{ type: "text" as const, text: result }] };
        },
      },
      {
        name: "cancel_worker",
        label: "取消 Worker",
        description: "取消指定 Worker Agent 的执行。参数：workerId（Agent ID）、reason（取消原因）。",
        parameters: {
          type: "object" as const,
          properties: {
            workerId: { type: "string" },
            reason: { type: "string" },
          },
          required: ["workerId"],
        },
        category: "system",
        enabled: true,
        execute: async (toolCallId: string, args: { workerId: string; reason?: string }) => {
          const result = await this.callCoordinatorTool(toolCallId, "cancel_worker", args);
          return { content: [{ type: "text" as const, text: result }] };
        },
      },
      {
        name: "run_verifier",
        label: "运行验收器",
        description: "对指定 Worker 的产出运行验收器，返回 {passed, reasoning}。参数：workerId（Agent ID）、criteria（验收标准）。",
        parameters: {
          type: "object" as const,
          properties: {
            workerId: { type: "string" },
            criteria: { type: "string" },
          },
          required: ["workerId", "criteria"],
        },
        category: "system",
        enabled: true,
        execute: async (toolCallId: string, args: { workerId: string; criteria: string }) => {
          const result = await this.callCoordinatorTool(toolCallId, "run_verifier", args);
          return { content: [{ type: "text" as const, text: result }] };
        },
      },
      {
        name: "bb_list_artifacts",
        label: "列出 Blackboard Artifacts",
        description: "列出当前会话 Blackboard 中的所有 Artifact。",
        parameters: {
          type: "object" as const,
          properties: {},
          required: [],
        },
        category: "system",
        enabled: true,
        execute: async (toolCallId: string, args: unknown) => {
          const result = await this.callCoordinatorTool(toolCallId, "bb_list_artifacts", args);
          return { content: [{ type: "text" as const, text: result }] };
        },
      },
      {
        name: "bb_get_artifact",
        label: "读取 Blackboard Artifact",
        description: "读取指定名称的 Blackboard Artifact。参数：name（artifact 名称）。",
        parameters: {
          type: "object" as const,
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
        category: "system",
        enabled: true,
        execute: async (toolCallId: string, args: { name: string }) => {
          const result = await this.callCoordinatorTool(toolCallId, "bb_get_artifact", args);
          return { content: [{ type: "text" as const, text: result }] };
        },
      },
      {
        name: "resume_worker",
        label: "将用户回复转给 Worker",
        description: "将用户对 HITL 问题的回复转发给指定 Worker，解除该 Worker 的等待状态。在 escalate_to_human 收到用户回复后，必须立即调用此工具将回复传递给相应的 Worker。参数：workerId（Worker Agent ID）、answer（用户的回复内容）。",
        parameters: {
          type: "object" as const,
          properties: {
            workerId: { type: "string" },
            answer: { type: "string" },
          },
          required: ["workerId", "answer"],
        },
        category: "system",
        enabled: true,
        execute: async (toolCallId: string, args: { workerId: string; answer: string }) => {
          const result = await this.callCoordinatorTool(toolCallId, "resume_worker", args);
          return { content: [{ type: "text" as const, text: result }] };
        },
      },
      {
        name: "escalate_to_human",
        label: "向用户提问（整合上下文）",
        description: "向用户提问，发起 HITL 请求。必须提供 mergedContext 说明代哪个 Worker 询问、已知信息和待补字段。参数：question（整合后的问题文本）、mergedContext.onBehalfOf（Worker ID）、mergedContext.workerBlocks（触发阻塞列表）、mergedContext.knownInfo（已知信息）、mergedContext.remainingFields（待补字段）。",
        parameters: {
          type: "object" as const,
          properties: {
            question: { type: "string" },
            mergedContext: {
              type: "object" as const,
              properties: {
                onBehalfOf: { type: "string" },
                workerBlocks: { type: "array", items: { type: "object" } },
                knownInfo: { type: "object" },
                remainingFields: { type: "array", items: { type: "string" } },
              },
              required: ["onBehalfOf", "workerBlocks", "remainingFields"],
            },
          },
          required: ["question", "mergedContext"],
        },
        category: "system",
        enabled: true,
        execute: async (toolCallId: string, args: {
          question: string;
          mergedContext: {
            onBehalfOf: string;
            workerBlocks: unknown[];
            knownInfo?: Record<string, unknown>;
            remainingFields: string[];
          };
        }) => {
          const { onBehalfOf } = args.mergedContext;

          // 防滥用计数：同一 (onBehalfOf, remainingFields[0]) 组合 ≥3 次拒绝
          const blockKey = `${onBehalfOf}:${args.mergedContext.remainingFields[0] ?? "unknown"}`;
          const count = (this.escalationCounts.get(blockKey) ?? 0) + 1;
          this.escalationCounts.set(blockKey, count);

          if (count > 3) {
            const msg = `max_escalations_reached for ${blockKey} (count=${count}), must change strategy (try dispatch_worker with补充参数 or cancel_worker)`;
            // 记录决策日志
            await this.appendDecisionLog({
              toolCallId,
              blockKey,
              decision: "rejected_max_escalations",
              rationale: msg,
            });
            return { content: [{ type: "text" as const, text: `[ERROR] ${msg}` }] };
          }

          // 记录决策日志
          await this.appendDecisionLog({
            toolCallId,
            blockKey,
            decision: "escalate_to_human",
            rationale: args.question,
            mergedContext: args.mergedContext,
          });

          // 发送 HITL 事件到 Runtime（source 是 supervisor，event-mapper 会透传）
          emitEvent({
            id: `evt-hitl-${toolCallId}`,
            sessionId: this.collaborationSessionId ?? this.projectId,
            seq: 0,
            type: "HUMAN_REVIEW_REQUEST",
            payload: {
              question: args.question,
              mergedContext: args.mergedContext,
              toolCallId,
              agentId: this.agentId,
            },
            source: this.agentId,
            timestamp: new Date().toISOString(),
          });

          // 等待用户回复
          const result = await this.waitForHumanResponse(toolCallId);
          return { content: [{ type: "text" as const, text: result }] };
        },
      },
    ];

    // 5. 注册工具：协调工具通过 registerTool 注册（ToolRegistration 格式），文件工具从全局表获取
    const { initializeBuiltInTools, getAgentTools, registerTool } = await runtimeImport("lib/integrations/pi-agent/tools");
    initializeBuiltInTools();

    // 注册协调工具到全局表
    for (const tool of coordinatorTools) {
      registerTool(tool);
    }

    // 获取已注册的 AgentTool 列表（包含刚注册的协调工具 + 文件工具）
    // Supervisor 使用 escalate_to_human 进行 HITL，移除 ask_user_question 避免直接返回 YAML 绕过挂起机制
    const allAgentTools = getAgentTools().filter((t: { name: string }) => t.name !== "ask_user_question");

    // 6. 创建 OriginOSAgent（对齐 initializeOriginOSAgent 的构造签名）
    const agent = new OriginOSAgent({
      sessionId: this.agentId,
      systemPrompt,
      model,
      tools: allAgentTools,
      projectContext: {
        projectId: this.projectId,
        currentPath: this.workingDirectory,
      },
    });

    this.originOSAgent = agent;

    // 5. 订阅事件并转发到 Runtime
    this.subscribeToOriginOSEvents();

    this.initialized = true;
    sendToRuntime({ type: "ready" });
    console.error(`[AgentWorker] Initialized SupervisorAgent (SUPA-02 coordinator tools): agentId=${this.agentId}`);
  }

  /**
   * Story 9.35: Lightweight Supervisor 初始化。
   * 使用 4 层最小 prompt（身份 + 工具箱 + 工作目录 + 安全约束），
   * 跳过记忆/知识/模式层，只注册受限工具集。
   */
  private async initializeSuperviseLiteAgent(
    extra?: {
      systemPrompt?: string;
      model?: WorkerModelConfig;
    }
  ): Promise<void> {
    const { readFile } = await import("fs/promises");
    const nodePath = await import("path");

    const agentMdPath = nodePath.join(getMonorepoRoot(), this.workingDirectory, "Agent.md");
    let agentIdentity = "";
    try {
      agentIdentity = await readFile(agentMdPath, "utf-8");
    } catch {
      agentIdentity = "# Lightweight Supervisor\n你是 Workflow 模式的 HITL 中转代理，负责处理 Worker 阻塞并升级给用户。";
    }

    // 尝试加载项目协作上下文（从项目目录中）
    let projectContextSection = "";
    try {
      // 从projectId推断项目目录
      const projectDir = nodePath.join(getMonorepoRoot(), "data/projects", this.projectId);
      const collabCtxPath = nodePath.join(projectDir, "agents", "project-config", "project-collaboration-context.json");

      if (existsSync(collabCtxPath)) {
        const collabCtx = JSON.parse(await readFile(collabCtxPath, "utf-8"));

        // 构建项目上下文描述
        const agentsList = collabCtx.agents?.map((a: { name: string; id: string; responsibility: string }) =>
          `- **${a.name}** (${a.id}): ${a.responsibility}`
        ).join("\n") || "";

        const topologyDesc = collabCtx.topology?.edges?.map((e: { from: string; to: string; type: string }) =>
          e.type === "trigger"
            ? `${e.from} → ${e.to} (触发)`
            : `${e.to} → ${e.from} (通知)`
        ).join("\n") || "";

        projectContextSection = [
          "## 项目上下文",
          "",
          `**业务项目 ID**: ${collabCtx.originosProjectId || this.projectId}`,
          `**本体 ID（ontologyId）**: ${collabCtx.ontologyId || `ontology-${collabCtx.originosProjectId || this.projectId}`}`,
          `> ⚠️ 上方"业务项目 ID"是 OriginOS 工作区容器的系统标识符（形如 proj-xxx），用于定位文件目录和本体数据。它与本体中用户自定义的"项目"概念实例（业务实体）是完全不同的两个东西，请勿混淆。调用本体工具时，必须使用上方"本体 ID"字段的值，不要自己拼接。`,
          `**全局目标**: ${collabCtx.globalGoal || "未设置"}`,
          "",
          "### 可用 Workers",
          agentsList,
          "",
          "### 协作拓扑",
          topologyDesc,
        ].join("\n");

        console.error(`[AgentWorker] Loaded project context from ${collabCtxPath}`);
      }
    } catch (err) {
      console.warn(`[AgentWorker] Failed to load project context:`, err);
    }

    const systemPrompt =
      extra?.systemPrompt ??
      [
        "## Layer 1: 身份",
        agentIdentity,
        "",
        projectContextSection,
        "",
        "## Layer 2: 工具箱",
        "允许工具：escalate_to_human, wait_for_human, dispatch_worker, bb_get_artifact。",
        "禁止工具：所有文件写工具、本体写工具、execute_command。",
        "",
        "## Layer 3: 工作目录",
        `工作目录：${nodePath.join(getMonorepoRoot(), this.workingDirectory)}`,
        "",
        "## Layer 4: 安全约束",
        "不做任务分解，不写业务工件，不改派到其他 Worker，每次 escalate_to_human 必须填写 mergedContext.onBehalfOf。",
      ].filter(Boolean).join("\n");

    const model = await createWorkerModel(extra?.model);

    const { createOriginOSAgent } = await runtimeImport("lib/integrations/pi-agent/core/agent");
    const agent = await createOriginOSAgent({ sessionId: this.agentId, systemPrompt, model });
    this.originOSAgent = agent;

    this.initialized = true;
    sendToRuntime({ type: "ready" });
    console.error(`[AgentWorker] Initialized supervisor-lite: agentId=${this.agentId}`);
  }


  private async initializeOriginOSAgent(
    extra?: {
      systemPrompt?: string;
      model?: WorkerModelConfig;
      tools?: Array<{ name: string; description: string }>;
      agentType?: string;
    }
  ): Promise<void> {
    const { OriginOSAgent } = await runtimeImport("lib/integrations/pi-agent/core/agent");

    // 创建模型
    const model = await createWorkerModel(extra?.model);

    // 注册工具（子进程独立注册，不受主进程 registry 影响）
    // 使用 scopes 过滤：skill 类型自动排除 ontology 创建工具，worker 类型排除 ask_user_question
    const { initializeBuiltInTools, getAgentToolsForScope } = await runtimeImport("lib/integrations/pi-agent/tools");
    initializeBuiltInTools();
    const scopeAgentType = extra?.agentType ?? this.agentType;
    const tools = getAgentToolsForScope(scopeAgentType);
    console.error(`[AgentWorker] OriginOS Agent (type=${scopeAgentType}): registered ${tools.length} tools via scope filtering`);

    // 设置工具执行上下文 — 文件工具依赖 workingDirectory，否则回退到 process.cwd()
    const { setToolContext, getToolContextManager } = await runtimeImport("lib/integrations/pi-agent/tools/context");
    setToolContext(this.agentId, { sessionId: this.agentId, workingDirectory: this.workingDirectory });
    getToolContextManager().setDefaultContext({ sessionId: this.agentId, workingDirectory: this.workingDirectory });

    // 从项目上下文构建 system prompt（与 PersistentAgent 对齐）
    let systemPrompt = extra?.systemPrompt;
    if (!systemPrompt || systemPrompt === "You are a helpful assistant.") {
      // 优先使用 7 层 prompt 体系
      const { buildProjectPromptLayers, assembleProjectPrompt } =
        await runtimeImport("lib/integrations/pi-agent/project-agent/project-prompt");
      const { loadProjectContext } =
        await runtimeImport("lib/integrations/pi-agent/project-agent/project-context");

      const ctx = await loadProjectContext(this.workingDirectory, this.projectId, this.agentId);
      if (ctx) {
        const layers = buildProjectPromptLayers(ctx);
        systemPrompt = assembleProjectPrompt(layers);
        console.error(`[AgentWorker] OriginOS Agent: Built 7-layer system prompt for project ${this.projectId}`);
      }
    }

    // 创建 OriginOS Agent
    const agent = new OriginOSAgent({
      sessionId: this.agentId,
      systemPrompt: systemPrompt ?? "You are a helpful assistant.",
      model,
      tools: [],
      projectContext: {
        projectId: this.projectId,
        currentPath: this.workingDirectory,
      },
    });

    // 注入已注册工具
    agent.setTools(tools);

    // Worker Agent 专用的 HITL 工具：向用户提问并暂停等待回复
    const workerHitlTool = {
      name: "ask_user_with_approval",
      label: "向用户提问（需确认）",
      description: "向用户提出一个问题，并等待用户确认后再继续执行。用于在协作场景中需要用户决策的情况。参数：question（问题）、options（选项列表，可选）。",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            items: { type: "object" },
          },
        },
        required: ["question"],
      },
      category: "system",
      enabled: true,
      execute: async (toolCallId: string, args: {
        question: string;
        options?: Array<{ label: string; description: string }>;
      }) => {
        const options = args.options ?? [];

        // 发送 HITL 事件
        emitEvent({
          id: `evt-hitl-worker-${toolCallId}`,
          sessionId: this.collaborationSessionId ?? this.projectId,
          seq: 0,
          type: "HUMAN_REVIEW_REQUEST",
          payload: {
            question: args.question,
            options,
            multiSelect: false,
            agentId: this.agentId,
            toolCallId,
          },
          source: this.agentId,
          timestamp: new Date().toISOString(),
        });

        // 发送 WORKER_BLOCK 事件（触发 Lightweight Supervisor）
        emitEvent({
          id: `evt-worker-block-${toolCallId}`,
          sessionId: this.collaborationSessionId ?? this.projectId,
          seq: 0,
          type: "WORKER_BLOCK",
          payload: {
            type: "decision_required",
            options: options.map(o => ({
              id: o.label,
              label: o.label,
              impact: o.description,
            })),
            rationale: `Worker ${this.agentId} 需要用户确认：${args.question}`,
            suggestedQuestion: args.question,
          },
          source: this.agentId,
          timestamp: new Date().toISOString(),
        });

        // 等待用户回复
        const reply = await this.waitForHumanResponse(toolCallId);
        return {
          content: [
            {
              type: "text" as const,
              text: `用户反馈: ${reply}`,
            },
          ],
          details: {},
        };
      },
    };

    // HITL 工具仅在协作场景下注册（skill/role-agent 无 HITL UI，会死锁）
    if (this.agentType !== "skill" && this.agentType !== "role-agent") {
      agent.setTools([...tools, workerHitlTool]);
    } else {
      agent.setTools(tools);
    }

    this.registerCollaborationBlackboardTools(agent);

    // 创建 Memory Core 系统（三层记忆 + CognitiveManager）
    // Skill 类型 Agent 不需要记忆模块，跳过初始化
    if (this.agentType !== "skill") {
      const { memoryCore, cognitiveManager } = await this.createProjectCognitiveRuntime();
      this.recallMemory = memoryCore.recall;
      this.originosCognitiveManager = cognitiveManager;

      // 注册 Memory 工具到 Agent
      const { CoreMemoryTools } = await runtimeImport("modules/memory-core/tools/core-memory-tools");
      const { ArchivalMemoryTools } = await runtimeImport("modules/memory-core/tools/archival-memory-tools");

    const coreMemoryTools = new CoreMemoryTools(memoryCore.memory);
    const archivalMemoryTools = new ArchivalMemoryTools(memoryCore.archival);

    const memoryTools = [
      {
        name: "core_memory_append",
        description: "Append content to a core memory block. Available blocks: human, persona, project, scratchpad, temporal. Use the 'label' parameter to specify which block.",
        label: "core_memory_append",
        parameters: {
          type: "object",
          properties: { label: { type: "string" }, content: { type: "string" } },
          required: ["label", "content"],
        },
        execute: async (_toolCallId: string, args: { label: string; content: string }) => {
          if (!args?.label) return { content: [{ type: "text" as const, text: "Error: 'label' parameter is required and must be a non-empty string. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
          if (!args?.content) return { content: [{ type: "text" as const, text: "Error: 'content' parameter is required and must be a non-empty string." }], details: {} };
          const result = await coreMemoryTools.core_memory_append(args.label, args.content);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "core_memory_replace",
        description: "Replace content in a core memory block with precise find-and-replace. Available blocks: human, persona, project, scratchpad, temporal. Use the 'label' parameter to specify which block.",
        label: "core_memory_replace",
        parameters: {
          type: "object",
          properties: { label: { type: "string" }, old_content: { type: "string" }, new_content: { type: "string" } },
          required: ["label", "old_content", "new_content"],
        },
        execute: async (_toolCallId: string, args: { label: string; old_content: string; new_content: string }) => {
          if (!args?.label) return { content: [{ type: "text" as const, text: "Error: 'label' parameter is required and must be a non-empty string. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
          if (!args?.old_content) return { content: [{ type: "text" as const, text: "Error: 'old_content' parameter is required." }], details: {} };
          if (!args?.new_content) return { content: [{ type: "text" as const, text: "Error: 'new_content' parameter is required." }], details: {} };
          const result = await coreMemoryTools.core_memory_replace(args.label, args.old_content, args.new_content);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "insert_memory_block",
        description: "Create a new custom core memory block.",
        label: "insert_memory_block",
        parameters: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "string" }, description: { type: "string" } },
          required: ["label", "value"],
        },
        execute: async (_toolCallId: string, args: { label: string; value: string; description?: string }) => {
          const result = await coreMemoryTools.insert_memory_block(args.label, args.value, args.description);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "read_memory_block",
        description: "Read the full content of a core memory block.",
        label: "read_memory_block",
        parameters: {
          type: "object",
          properties: { label: { type: "string" } },
          required: ["label"],
        },
        execute: async (_toolCallId: string, args: { label: string }) => {
          const result = await coreMemoryTools.read_memory_block(args.label);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "archival_memory_insert",
        description: "Insert text into archival (long-term) memory for future semantic search.",
        label: "archival_memory_insert",
        parameters: {
          type: "object",
          properties: { text: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
          required: ["text"],
        },
        execute: async (_toolCallId: string, args: { text: string; tags?: string[] }) => {
          const result = await archivalMemoryTools.archival_memory_insert(args.text, args.tags);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
      {
        name: "archival_memory_search",
        description: "Semantically search archival (long-term) memory.",
        label: "archival_memory_search",
        parameters: {
          type: "object",
          properties: { query: { type: "string" }, limit: { type: "number" } },
          required: ["query"],
        },
        execute: async (_toolCallId: string, args: { query: string; limit?: number }) => {
          const result = await archivalMemoryTools.archival_memory_search(args.query, args.limit);
          return { content: [{ type: "text" as const, text: result }], details: {} };
        },
      },
    ];

    // 注入 memory 工具到现有工具列表
    agent.setTools([...tools, ...memoryTools]);

    // 将 Memory 快照注入 system prompt
    try {
      const memoryBlock = await memoryProvider.system_prompt_block();
      if (memoryBlock) {
        const existingPrompt = agent.setSystemPrompt ? (agent as any).agent?.state?.systemPrompt ?? '' : '';
        const augmentedPrompt = existingPrompt
          ? existingPrompt + '\n\n---\n\n# Core Memory\n\n' + memoryBlock
          : memoryBlock;
        (agent as any).setSystemPrompt?.(augmentedPrompt);
        console.error('[AgentWorker] OriginOS Agent: Injected Core Memory into system prompt');
      }
    } catch (err) {
      console.error('[AgentWorker] Failed to inject memory block into system prompt:', err);
    }
    } // end if (agentType !== "skill")

    this.originOSAgent = agent;

    // 订阅事件并转发到 Runtime
    this.subscribeToOriginOSEvents();

    this.initialized = true;
    sendToRuntime({ type: "ready" });
    console.error(`[AgentWorker] Initialized OriginOS Agent: agentId=${this.agentId}`);
  }

  private async loadCollaborationBlackboard() {
    if (this.collaborationSessionId === null || this.blackboardDir === null) {
      return null;
    }
    const { Blackboard } = await runtimeImport("modules/collaboration-runtime/session/blackboard");
    const loaded = await Blackboard.loadSnapshot(this.collaborationSessionId, this.blackboardDir);
    return loaded ?? new Blackboard(this.collaborationSessionId, this.blackboardDir);
  }

  private registerCollaborationBlackboardTools(agent: any): void {
    const registerTool = (tool: {
      name: string;
      description: string;
      label: string;
      parameters: Record<string, unknown>;
      execute: (toolCallId: string, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }>;
    }): void => {
      agent.registerTool(tool);
    };

    registerTool({
      name: "blackboard_set_artifact",
      description: "Write a structured artifact reference into the collaboration blackboard so downstream agents can consume it.",
      label: "blackboard_set_artifact",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          path: { type: "string" },
          content: { type: "string" },
          sourceTaskId: { type: "string" },
        },
        required: ["name"],
      },
      execute: async (_toolCallId, args) => {
        const blackboard = await this.loadCollaborationBlackboard();
        if (blackboard === null) {
          return { content: [{ type: "text", text: "Error: collaboration blackboard is not available in this session." }], details: {} };
        }

        const name = typeof args["name"] === "string" ? args["name"] : "";
        const pathArg = typeof args["path"] === "string" ? args["path"] : undefined;
        const contentArg = typeof args["content"] === "string" ? args["content"] : undefined;
        const sourceTaskId = typeof args["sourceTaskId"] === "string" ? args["sourceTaskId"] : undefined;
        const ref = blackboard.setArtifact(
          name,
          { path: pathArg, content: contentArg },
          this.agentId,
          { sourceTaskId },
        );
        await blackboard.snapshot();
        return { content: [{ type: "text", text: JSON.stringify({ success: true, ref }) }], details: { ref } };
      },
    });

    registerTool({
      name: "blackboard_get_artifact",
      description: "Read an artifact from the collaboration blackboard by name or artifact ref.",
      label: "blackboard_get_artifact",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          ref: { type: "string" },
        },
      },
      execute: async (_toolCallId, args) => {
        const blackboard = await this.loadCollaborationBlackboard();
        if (blackboard === null) {
          return { content: [{ type: "text", text: "Error: collaboration blackboard is not available in this session." }], details: {} };
        }

        const directName = typeof args["name"] === "string" ? args["name"] : "";
        const refArg = typeof args["ref"] === "string" ? args["ref"] : "";
        const derivedName = refArg.startsWith(`artifact://${this.collaborationSessionId ?? ""}/`)
          ? refArg.split("/").at(-1) ?? ""
          : "";
        const artifact = blackboard.getArtifact(directName || derivedName);
        if (!artifact) {
          return { content: [{ type: "text" as const, text: "Error: artifact not found." }], details: {} };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(artifact) }], details: artifact as unknown as Record<string, unknown> };
      },
    });
  }

  /** 初始化 Persistent Agent（项目/访谈场景） */
  private async initializePersistentAgent(): Promise<void> {
    // 1. 从项目目录加载文件
    const { loadWorkspaceFiles, parseAgentDefinition, parseToolDefinition, parseSkillDefinition } =
      await runtimeImport("lib/integrations/pi-agent/persistent-agent");

    const workspaceFiles = await loadWorkspaceFiles(this.workingDirectory);
    const agentDef = parseAgentDefinition(
      workspaceFiles.find((f: { name: string }) => f.name === "Agent.md")?.content ?? ""
    );
    const toolDef = parseToolDefinition(
      workspaceFiles.find((f: { name: string }) => f.name === "Tool.md")?.content ?? ""
    );
    const skillDef = await parseSkillDefinition(this.workingDirectory);

    // 2. 从项目上下文构建 system prompt
    const { buildProjectPromptLayers, assembleProjectPrompt } =
      await runtimeImport("lib/integrations/pi-agent/project-agent/project-prompt");
    const { loadProjectContext } =
      await runtimeImport("lib/integrations/pi-agent/project-agent/project-context");

    const ctx = await loadProjectContext(this.workingDirectory);
    let systemPrompt: string | undefined;
    if (ctx) {
      const layers = buildProjectPromptLayers(ctx);
      systemPrompt = assembleProjectPrompt(layers);
    } else {
      console.error(`[AgentWorker] ProjectContext not loaded, using workspace files only`);
    }

    // 3-4c. 创建显式 Project ownership 的统一认知 Provider 集合
    const { memoryCore, cognitiveManager } = await this.createProjectCognitiveRuntime();

    this.persistentCognitiveManager = cognitiveManager;

    // 5. 创建 PersistentAgent
    const { PersistentAgent } = await runtimeImport("lib/integrations/pi-agent/persistent-agent");
    const { SleepComputeScheduler } = await runtimeImport("lib/integrations/pi-agent/cognitive/sleep-compute");
    const sleepScheduler = new SleepComputeScheduler();

    this.persistentAgent = new PersistentAgent({
      projectId: this.projectId,
      workingDirectory: this.workingDirectory,
      agentDefinition: agentDef,
      toolDefinition: toolDef,
      skillDefinition: skillDef,
      workspaceFiles,
      builtSystemPrompt: systemPrompt,
      cognitiveManager,
      sleepScheduler,
    });

    // 6. 初始化 Agent
    await (this.persistentAgent as any).initialize();

    // 6b. 注入 Memory Core 工具到内部 OriginOSAgent
    try {
      const { CoreMemoryTools } = await runtimeImport("modules/memory-core/tools/core-memory-tools");
      const { ArchivalMemoryTools } = await runtimeImport("modules/memory-core/tools/archival-memory-tools");
      const innerAgent = (this.persistentAgent as any).getAgent();
      if (innerAgent) {
        const coreMemoryTools = new CoreMemoryTools(memoryCore.memory);
        const archivalMemoryTools = new ArchivalMemoryTools(memoryCore.archival);

        const registerMemoryTool = (name: string, description: string, label: string, params: unknown, execute: (toolCallId: string, args: any) => Promise<{ content: { type: string; text: string }[]; details: {} }>) => {
          innerAgent.registerTool({
            name,
            description,
            label,
            parameters: params,
            execute,
          } as any);
        };

        registerMemoryTool(
          "core_memory_append",
          "Append content to a core memory block. Available blocks: human, persona, project, scratchpad, temporal.",
          "core_memory_append",
          { type: "object", properties: { label: { type: "string" }, content: { type: "string" } }, required: ["label", "content"] },
          async (_toolCallId, args) => {
            if (!args?.label) return { content: [{ type: "text", text: "Error: 'label' parameter is required. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
            if (!args?.content) return { content: [{ type: "text", text: "Error: 'content' parameter is required." }], details: {} };
            const result = await coreMemoryTools.core_memory_append(args.label, args.content);
            return { content: [{ type: "text", text: result }], details: {} };
          },
        );
        registerMemoryTool(
          "core_memory_replace",
          "Replace content in a core memory block with precise find-and-replace.",
          "core_memory_replace",
          { type: "object", properties: { label: { type: "string" }, old_content: { type: "string" }, new_content: { type: "string" } }, required: ["label", "old_content", "new_content"] },
          async (_toolCallId, args) => {
            if (!args?.label) return { content: [{ type: "text", text: "Error: 'label' parameter is required. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
            if (!args?.old_content) return { content: [{ type: "text", text: "Error: 'old_content' parameter is required." }], details: {} };
            if (!args?.new_content) return { content: [{ type: "text", text: "Error: 'new_content' parameter is required." }], details: {} };
            const result = await coreMemoryTools.core_memory_replace(args.label, args.old_content, args.new_content);
            return { content: [{ type: "text", text: result }], details: {} };
          },
        );
        registerMemoryTool(
          "insert_memory_block",
          "Create a new custom core memory block.",
          "insert_memory_block",
          { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, description: { type: "string" } }, required: ["label", "value"] },
          async (_toolCallId, args) => {
            const result = await coreMemoryTools.insert_memory_block(args.label, args.value, args.description);
            return { content: [{ type: "text", text: result }], details: {} };
          },
        );
        registerMemoryTool(
          "read_memory_block",
          "Read the full content of a core memory block.",
          "read_memory_block",
          { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
          async (_toolCallId, args) => {
            const result = await coreMemoryTools.read_memory_block(args.label);
            return { content: [{ type: "text", text: result }], details: {} };
          },
        );
        registerMemoryTool(
          "archival_memory_insert",
          "Insert text into archival (long-term) memory for future semantic search.",
          "archival_memory_insert",
          { type: "object", properties: { text: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["text"] },
          async (_toolCallId, args) => {
            const result = await archivalMemoryTools.archival_memory_insert(args.text, args.tags);
            return { content: [{ type: "text", text: result }], details: {} };
          },
        );
        registerMemoryTool(
          "archival_memory_search",
          "Semantically search archival (long-term) memory.",
          "archival_memory_search",
          { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
          async (_toolCallId, args) => {
            const result = await archivalMemoryTools.archival_memory_search(args.query, args.limit);
            return { content: [{ type: "text", text: result }], details: {} };
          },
        );

        console.error('[AgentWorker] PersistentAgent: Injected 6 Memory Core tools');
      }
    } catch (err) {
      console.error('[AgentWorker] Failed to inject Memory Core tools into PersistentAgent:', err);
    }

    // 7. 订阅事件并转发到 Runtime
    this.subscribeToEvents();

    this.initialized = true;
    sendToRuntime({ type: "ready" });

    console.error(`[AgentWorker] Initialized: agentId=${this.agentId}, projectId=${this.projectId}`);
  }

  /** 订阅 Agent 事件并转发到 Runtime */
  private subscribeToEvents(): void {
    if (!this.persistentAgent) return;

    (this.persistentAgent as any).subscribe((event: any) => {
      if (isWorkerAborted) return;
      const runtimeEvent = this.mapAgentEventToRuntimeEvent(event);
      if (runtimeEvent) {
        emitEvent(runtimeEvent);
      }

      // Human-in-the-Loop: detect HUMAN_REVIEW_REQUEST → abort current prompt, wait for resume
      if (runtimeEvent?.type === "HUMAN_REVIEW_REQUEST") {
        this.pausedForHumanReview = true;
        console.error("[AgentWorker] HUMAN_REVIEW_REQUEST detected — aborting current prompt, waiting for resume");
        try {
          if (this.persistentAgent) { (this.persistentAgent as any).abort(); }
        } catch (err) {
          console.error("[AgentWorker] Failed to abort on human review:", err);
        }
        return;
      }

      // Cognitive: turn_end → sync_turn（MemoryCore 自动记录到 Recall + Archival）
      if (event.type === "turn_end" && this.persistentCognitiveManager) {
        const cm = this.persistentCognitiveManager as { on_turn_end: (data: any) => Promise<void> };
        cm.on_turn_end({
          turnNumber: ++this.persistentTurnCounter,
          userMessage: this.extractUserMessageFromTurn(event),
          assistantMessage: this.extractAssistantMessageFromTurn(event),
          assistantThinking: "",
          toolCalls: this.extractToolCallsFromTurn(event),
          outcome: { resolved: true, toolChainLength: event.toolResults?.length ?? 0 },
          timestamp: Date.now(),
        }).catch(err => console.error('[AgentWorker] Persistent cognitive sync_turn error:', err));
      }
    });
  }

  /** 订阅 OriginOS Agent 事件并转发到 Runtime */
  private subscribeToOriginOSEvents(): void {
    if (!this.originOSAgent) return;

    (this.originOSAgent as any).subscribe((event: any) => {
      if (isWorkerAborted) return;
      const runtimeEvent = this.mapAgentEventToRuntimeEvent(event);
      if (runtimeEvent) {
        emitEvent(runtimeEvent);
      }

      // Human-in-the-Loop: detect HUMAN_REVIEW_REQUEST → abort current prompt, wait for resume
      if (runtimeEvent?.type === "HUMAN_REVIEW_REQUEST") {
        this.pausedForHumanReview = true;
        console.error("[AgentWorker] HUMAN_REVIEW_REQUEST detected — aborting current prompt, waiting for resume");
        // Abort the running prompt so handleMessage() returns
        try {
          if (this.originOSAgent) { (this.originOSAgent as any).abort(); }
        } catch (err) {
          console.error("[AgentWorker] Failed to abort on human review:", err);
        }
        return;
      }

      // Cognitive: turn_end → sync_turn（MemoryCore 自动记录到 Recall + Archival）
      if (event.type === "turn_end" && this.originosCognitiveManager) {
        const cm = this.originosCognitiveManager as { on_turn_end: (data: any) => Promise<void> };
        cm.on_turn_end({
          turnNumber: ++this.originosTurnCounter,
          userMessage: this.extractUserMessageFromTurn(event),
          assistantMessage: this.extractAssistantMessageFromTurn(event),
          assistantThinking: "",
          toolCalls: this.extractToolCallsFromTurn(event),
          outcome: { resolved: true, toolChainLength: event.toolResults?.length ?? 0 },
          timestamp: Date.now(),
        }).catch(err => console.error('[AgentWorker] OriginOS cognitive sync_turn error:', err));
      }
    });
  }

  /** 处理用户消息 */
  async handleMessage(message: string): Promise<void> {
    if (!this.initialized) {
      sendError("Agent not initialized");
      return;
    }

    // 重置 abort 标志，允许新的事件输出
    isWorkerAborted = false;
    this.abortController = new AbortController();

    try {
      // 发送 AGENT_START 事件
      emitEvent({
        id: `evt-start-${Date.now()}`,
        sessionId: this.collaborationSessionId ?? this.projectId,
        seq: 0,
        type: "AGENT_START",
        payload: { agentId: this.agentId, agentType: this.agentType },
        source: this.agentId,
        timestamp: new Date().toISOString(),
      });

      // 发送 AGENT_THINKING 事件
      emitEvent({
        id: `evt-thinking-${Date.now()}`,
        sessionId: this.collaborationSessionId ?? this.projectId,
        seq: 0,
        type: "AGENT_THINKING",
        payload: { message },
        source: this.agentId,
        timestamp: new Date().toISOString(),
      });

      // OriginOSAgent 使用 prompt，PersistentAgent 使用 handleMessage
      const t0 = Date.now();
      console.error(`[AgentWorker] handleMessage: calling agent.prompt() | msgLen=${message.length} | hasOriginOSAgent=${!!this.originOSAgent} | hasPersistentAgent=${!!this.persistentAgent}`);
      if (this.originOSAgent) {
        const agent = this.originOSAgent as any;
        const modelInfo = agent?.agent?.state?.model;
        console.error(`[AgentWorker] Model: provider=${modelInfo?.provider}, id=${modelInfo?.id}, baseUrl=${modelInfo?.baseUrl}, hasApiKey=${!!modelInfo?.apiKey}`);
        const msgs: unknown[] = agent?.agent?.state?.messages ?? [];
        console.error(`[AgentWorker] Message history count: ${msgs.length}`);

        await agent.prompt(message);
        console.error(`[AgentWorker] originOSAgent.prompt() resolved in ${Date.now() - t0}ms`);
      } else if (this.persistentAgent) {
        await (this.persistentAgent as any).handleMessage(message);
        console.error(`[AgentWorker] persistentAgent.handleMessage() resolved in ${Date.now() - t0}ms`);
      } else {
        console.error(`[AgentWorker] ERROR: No agent instance available!`);
      }
    } catch (err) {
      // 如果是因为 human review 被 abort，不算 error — 继续执行到后面的 pause 检查
      if (!this.pausedForHumanReview) {
        const error = err instanceof Error ? err : new Error(String(err));
        emitEvent({
          id: `evt-fail-${Date.now()}`,
          sessionId: this.collaborationSessionId ?? this.projectId,
          seq: 0,
          type: "AGENT_FAIL_TASK",
          payload: { error: error.message },
          source: this.agentId,
          timestamp: new Date().toISOString(),
        });
        sendError(error);
      }
      // pausedForHumanReview 为 true 时，不发送 error，继续到后面的等待逻辑
    } finally {
      this.abortController = null;
    }

    // 正常结束时发送 AGENT_END 事件（非暂停情况）
    if (!this.pausedForHumanReview) {
      emitEvent({
        id: `evt-end-${Date.now()}`,
        sessionId: this.collaborationSessionId ?? this.projectId,
        seq: 0,
        type: "AGENT_END",
        payload: { agentId: this.agentId, completed: true },
        source: this.agentId,
        timestamp: new Date().toISOString(),
      });
    }

    // 如果因 HUMAN_REVIEW_REQUEST 被 abort，返回 — case "prompt" 会发送 {type:"waiting"}
    // resume 后的继续执行由 continueAfterResume() 负责，由 case "resume" 触发
    if (this.pausedForHumanReview) {
      console.error("[AgentWorker] Agent paused for human review, returning from handleMessage");
      this.resumeContinuation = this.continueAfterResume();
    }
  }

  /** resume 后继续执行：等待用户回复信号，然后把回复发给 Agent */
  private async continueAfterResume(): Promise<void> {
    console.error("[AgentWorker] continueAfterResume: waiting for resume signal...");
    await new Promise<void>((resolve) => { this.resumeResolver = resolve; });
    this.resumeResolver = null;

    const response = this.humanReviewResponse ?? "";
    this.pausedForHumanReview = false;
    this.humanReviewResponse = null;
    console.error(`[AgentWorker] Resumed with response: ${response.slice(0, 100)}`);

    emitEvent({
      id: `evt-thinking-resume-${Date.now()}`,
      sessionId: this.collaborationSessionId ?? this.projectId,
      seq: 0,
      type: "AGENT_THINKING",
      payload: { message: `[HUMAN REVIEW RESPONSE] ${response}`, resume: true },
      source: this.agentId,
      timestamp: new Date().toISOString(),
    });

    try {
      if (this.originOSAgent) {
        await (this.originOSAgent as any).prompt(response);
        console.error("[AgentWorker] originOSAgent.prompt(resume) completed");
      } else if (this.persistentAgent) {
        await (this.persistentAgent as any).handleMessage(response);
        console.error("[AgentWorker] persistentAgent.handleMessage(resume) completed");
      }
    } catch (resumeErr) {
      console.error("[AgentWorker] Resume prompt failed:", resumeErr);
    }
  }

  /** 注入用户回复并解除暂停 */
  resume(response: string): void {
    if (!this.pausedForHumanReview) {
      console.error("[AgentWorker] resume() called but agent is not paused");
      return;
    }
    this.humanReviewResponse = response;
    if (this.resumeResolver) {
      this.resumeResolver();
    }
  }

  /** 等待 continueAfterResume() 执行完毕（供 case "resume" 使用） */
  waitForResumeContinuation(): Promise<void> {
    return this.resumeContinuation ?? Promise.resolve();
  }

  /** 中断当前操作 */
  async abort(): Promise<void> {
    markWorkerAborted();
    if (this.originOSAgent) {
      try { (this.originOSAgent as any).abort(); } catch (err) { console.error("[AgentWorker] Abort error:", err); }
    }
    if (this.persistentAgent) {
      try { (this.persistentAgent as any).abort(); } catch (err) { console.error("[AgentWorker] Abort error:", err); }
    }
    this.abortController?.abort();
    this.abortController = null;
    sendToRuntime({ type: "ready" });
  }

  /** 关闭 Agent — 先 abort 停止事件输出，再销毁实例 */
  async shutdown(): Promise<void> {
    // 先标记中止，阻止所有后续 stdout 输出
    markWorkerAborted();
    if (this.originOSAgent) {
      try { (this.originOSAgent as any).abort(); } catch {}
    }
    if (this.persistentAgent) {
      try { (this.persistentAgent as any).abort(); } catch {}
    }
    await flushCognitiveSessionEnd(
      this.originosCognitiveManager,
      (this.originOSAgent as any)?.state?.messages ?? [],
      'OriginOS',
    );
    await flushCognitiveSessionEnd(
      this.persistentCognitiveManager,
      [],
      'Persistent',
    );
    // 再关闭 Agent 实例
    if (this.originOSAgent) {
      try { await (this.originOSAgent as any).destroy(); } catch (err) { console.error("[AgentWorker] Shutdown error:", err); }
      this.originOSAgent = null;
    }
    if (this.persistentAgent) {
      try { await (this.persistentAgent as any).shutdown(); } catch (err) { console.error("[AgentWorker] Shutdown error:", err); }
      this.persistentAgent = null;
    }
    this.initialized = false;
    process.exit(0);
  }

  /** 将 Agent 事件映射为 RuntimeEvent */
  private mapAgentEventToRuntimeEvent(event: any): unknown | null {
    const now = new Date().toISOString();
    const seq = Date.now();
    // Use collaboration session ID so events are routed to the correct session store
    const sessionId = this.collaborationSessionId ?? this.projectId;

    switch (event.type) {
      case "agent_start":
      case "turn_start":
        this.turnHasToolCall = false;
        this.turnTextBuffer = '';
        this.turnIsToolDescription = false;
        return {
          id: `evt-start-${seq}`,
          sessionId,
          seq,
          type: "AGENT_THINKING",
          payload: { message: "Agent started" },
          source: this.agentId,
          timestamp: now,
        };

      case "tool_execution_start":
        this.turnHasToolCall = true;
        this.sessionHasToolCalls = true;
        return {
          id: `evt-tool-start-${seq}`,
          sessionId,
          seq,
          type: "TOOL_CALL",
          payload: {
            toolName: event.toolName,
            args: event.args,
            toolCallId: event.toolCallId,
          },
          source: this.agentId,
          timestamp: now,
        };

      case "tool_execution_end":
        this.turnIsToolDescription = false;
        this.turnTextBuffer = '';
        return {
          id: `evt-tool-end-${seq}`,
          sessionId,
          seq,
          type: "TOOL_RESULT",
          payload: {
            toolName: event.toolName,
            result: event.result,
            toolCallId: event.toolCallId,
            isError: event.isError,
          },
          source: this.agentId,
          timestamp: now,
        };

      case "thinking_delta":
        return {
          id: `evt-thinking-${seq}`,
          sessionId,
          seq,
          type: "AGENT_THINKING",
          payload: { delta: event.delta, thinking: true },
          source: this.agentId,
          timestamp: now,
        };

      case "message_update": {
        const ame = event.assistantMessageEvent;
        // 过滤 toolcall 子事件（工具调用语法帧）
        if (!ame || ame.type === "toolcall_start" || ame.type === "toolcall_delta" || ame.type === "toolcall_end") {
          return null;
        }

        // text_delta — 所有 agent 类型实时逐帧推送
        if (ame.type === "text_delta" && ame.delta) {
          // 累积到 buffer（用于检测整段是否为工具调用描述）
          this.turnTextBuffer += ame.delta;
          if (isToolCallLike(this.turnTextBuffer)) {
            this.turnIsToolDescription = true;
          }
          // 只在检测到工具调用描述时才过滤，不阻塞后续正常文本
          if (this.turnIsToolDescription) {
            return null;
          }
          // 实时推送当前 delta
          return {
            id: `evt-text-${seq}`,
            sessionId,
            seq,
            type: "MESSAGE_SENT",
            payload: { text: ame.delta },
            source: this.agentId,
            timestamp: now,
          };
        }

        // text_end — 不再发送（已在 text_delta 逐帧推送）
        if (ame?.type === "text_end") {
          return null;
        }
        // thinking_delta — 暂不推送
        // thinking_start / thinking_end — 跳过
        return null;
      }

      case "message_end": {
        // message_end fires for BOTH user and assistant messages.
        // Only map to AGENT_COMPLETE_TASK for assistant messages.
        // For user messages, silently ignore — task is not complete.
        if (event.message?.role === "assistant") {
          return {
            id: `evt-msg-end-${seq}`,
            sessionId,
            seq,
            type: "MESSAGE_SENT",
            payload: { message: event.message },
            source: this.agentId,
            timestamp: now,
          };
        }
        return null;
      }

      case "turn_end": {
        const msg = event.message;
        // 参考 handleAgentEvent 的 turn_end 处理：msg.content 是 block 数组
        // 每个 block 有 type: "toolCall" | "text" | "thinking"
        let textContent = '';
        if (msg?.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && block.text) {
              textContent += block.text;
            }
          }
        }

        // 从文本中移除工具调用的 code block（保留自然语言文本）
        if (textContent) {
          textContent = stripToolCodeBlocks(textContent);
        }

        // 有文本时发送 — 所有回复都必须传递给 runtime 进行处理
        // runtime 需要提取输出写入 upstreamResults 供下游 agent 使用
        // supervisor/supervisor-lite 的所有回复都会发到前端（由 SSE 过滤器决定是否展示）
        if (textContent) {
          return {
            id: `evt-turn-msg-${seq}`,
            sessionId,
            seq,
            type: 'ASSISTANT_MESSAGE',
            payload: { content: textContent },
            source: this.agentId,
            timestamp: now,
          };
        }

        // 仅在有工具结果时发送 TOOL_RESULT 事件供观察
        if (event.toolResults?.length > 0) {
          return {
            id: `evt-turn-end-${seq}`,
            sessionId,
            seq,
            type: "TOOL_RESULT",
            payload: {
              toolResults: event.toolResults,
              turnNumber: event.turnNumber,
            },
            source: this.agentId,
            timestamp: now,
          };
        }
        return null;
      }

      case "agent_end": {
        // agent_end 发出原始事件，任务是否完成由协作层判断
        return {
          id: `evt-agent-end-${seq}`,
          sessionId,
          seq,
          type: "AGENT_END",
          payload: { messages: event.messages },
          source: this.agentId,
          timestamp: now,
        };
      }

      case "agent_error":
        return {
          id: `evt-error-${seq}`,
          sessionId,
          seq,
          type: "AGENT_FAIL_TASK",
          payload: { error: event.error?.message || "Unknown error" },
          source: this.agentId,
          timestamp: now,
        };

      default:
        return null;
    }
  }

  // ==========================================================================
  // Cognitive data extraction helpers (for turn_end → sync_turn)
  // ==========================================================================

  private extractTextContent(content: unknown): string {
    return extractDisplayContent(content);
  }

  private extractUserMessageFromTurn(event: any): string {
    const messages = event.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return this.extractTextContent(messages[i].content);
      }
    }
    return '';
  }

  private extractAssistantMessageFromTurn(event: any): string {
    const msg = event.message;
    if (msg) return this.extractTextContent(msg.content);
    const messages = event.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return this.extractTextContent(messages[i].content);
      }
    }
    return '';
  }

  private extractToolCallsFromTurn(event: any): Array<{ name: string; params: unknown; result: string; success: boolean }> {
    return (event.toolResults ?? []).map((tr: any) => ({
      name: tr.toolName ?? 'unknown',
      params: {},
      result: this.extractTextContent(tr.content),
      success: !tr.isError,
    }));
  }
}

// ============================================================================
// Stdio 命令处理
// ============================================================================

let worker: AgentWorker | null = null;
const stdinBuffer: string[] = [];
let processing = false;

async function processCommand(commandStr: string): Promise<void> {
  let command: WorkerCommand;
  try {
    command = JSON.parse(commandStr);
  } catch {
    sendError("Invalid JSON command");
    return;
  }

  switch (command.type) {
    case "initialize": {
      logRuntime("worker.command.initialize", {
        projectId: command.config?.projectId ?? "unknown",
        agentId: command.config?.agentId ?? "unknown",
        agentType: command.config?.agentType ?? "persistent",
        workingDirectory: command.config?.workingDirectory ?? "unknown",
        model: summarizeWorkerModel(command.config?.model),
      });
      if (command.config) {
        worker = new AgentWorker(
          command.config.projectId,
          command.config.agentId,
          command.config.workingDirectory,
          command.config.agentType ?? "persistent"
        );
      }
      if (worker) {
        await worker.initialize({
          systemPrompt: command.config?.systemPrompt,
          model: command.config?.model,
          tools: command.config?.tools,
        });
      }
      break;
    }

    case "prompt": {
      if (!worker) {
        sendError("Agent not initialized. Send 'initialize' command first.");
        return;
      }
      const promptAt = Date.now();
      const context = worker.getRuntimeLogContext();
      logRuntime("worker.command.prompt.start", {
        ...context,
        messageChars: (command.message ?? "").length,
      });
      try {
        await worker.handleMessage(command.message ?? "");
        // Check if agent paused for human review
        if (worker.pausedForHumanReview) {
          logRuntime("worker.command.prompt.waiting", {
            ...context,
            elapsedMs: Date.now() - promptAt,
          });
          sendToRuntime({ type: "waiting" });
        } else {
          // Signal completion so Runtime can resolve the promise
          logRuntime("worker.command.prompt.ready", {
            ...context,
            elapsedMs: Date.now() - promptAt,
          });
          sendToRuntime({ type: "ready" });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logRuntime("worker.command.prompt.error", {
          ...context,
          error: err.message,
          elapsedMs: Date.now() - promptAt,
        });
        sendError(err);
      }
      break;
    }

    case "resume": {
      if (!worker) {
        sendError("Agent not initialized. Send 'initialize' command first.");
        return;
      }
      console.error(`[AgentWorker] case "resume": pausedForHumanReview=${worker.pausedForHumanReview}`);
      if (!worker.pausedForHumanReview) {
        sendError("Agent is not paused — cannot resume. Agent must be in waiting state first.");
        return;
      }
      // resume() 会 resolve waitForHumanResponse 的 Promise，agent loop 继续执行
      // agent loop 执行完毕后会发出 AGENT_END，agent-spawner 通过 stdout 监听 ready 信号
      worker.resume(command.response ?? "");
      // 不需要 await waitForResumeContinuation —— agent loop 已经在 handleMessage 里运行
      // agent loop 结束时会 sendToRuntime({ type: "ready" })（通过 AGENT_END 后的正常流程）
      console.error(`[AgentWorker] resume: injected response, agent loop will continue`);
      // 发送 ready 让 AgentProcess 知道 resume 命令已处理（agent loop 仍在运行中）
      sendToRuntime({ type: "ready" });
      break;
    }

    case "tool_result": {
      // Glue 层回传协调工具调用结果（SUPA-02）
      // 不发送 ready — worker 的 agent loop 仍在等待，不需要重新 prompt
      if (worker && command.toolCallId) {
        worker.resolveToolResult(command.toolCallId, command.result ?? "");
      }
      break;
    }

    case "abort": {
      if (worker) {
        await worker.abort();
      }
      break;
    }

    case "shutdown": {
      if (worker) {
        await worker.shutdown();
      } else {
        process.exit(0);
      }
      break;
    }

    default:
      sendError(`Unknown command type: ${(command as any).type}`);
  }
}

// 从 stdin 读取命令
// tool_result 和 resume 命令是异步注入命令，必须立即处理，不能进入串行队列。
// 否则当 agent loop 正阻塞在 callCoordinatorTool/waitForHumanResponse 时，
// processing=true 会导致 tool_result 永远无法被消费，形成死锁。
const IMMEDIATE_COMMAND_TYPES = new Set(["tool_result", "resume"]);

let stdinLineBuffer = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk: string) => {
  stdinLineBuffer += chunk;
  const lines = stdinLineBuffer.split("\n");
  // 最后一段可能不完整，留存
  stdinLineBuffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;

    // 检查是否是立即处理的命令类型
    let cmdType: string | undefined;
    try {
      const parsed = JSON.parse(line) as { type?: string };
      cmdType = parsed.type;
    } catch {
      // 解析失败，走普通队列
    }

    if (cmdType && IMMEDIATE_COMMAND_TYPES.has(cmdType)) {
      // 立即处理，不走队列，不阻塞串行状态机
      processCommand(line).catch((err) => {
        sendError(err instanceof Error ? err : String(err));
      });
    } else {
      stdinBuffer.push(line);
      if (!processing) {
        processNextCommand();
      }
    }
  }
});

async function processNextCommand(): Promise<void> {
  if (stdinBuffer.length === 0) {
    processing = false;
    return;
  }
  processing = true;

  const line = stdinBuffer.shift()!;
  try {
    await processCommand(line);
  } catch (err) {
    sendError(err instanceof Error ? err : String(err));
  }

  // 继续处理
  if (stdinBuffer.length > 0) {
    processNextCommand();
  } else {
    processing = false;
  }
}

// 从环境变量获取默认配置（如果 Runtime 在 initialize 中未传入）
const projectId = process.env.AGENT_PROJECT_ID;
const agentId = process.env.AGENT_ID;
const workingDir = process.env.AGENT_WORKING_DIR;

console.error(`[AgentWorker] Started: pid=${process.pid}, projectId=${projectId ?? "pending"}`);
