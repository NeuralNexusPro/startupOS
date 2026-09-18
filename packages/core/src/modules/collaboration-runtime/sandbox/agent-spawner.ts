/**
 * Agent Spawner — Runtime 侧：通过 `npx tsx` 启动 Agent Worker 子进程。
 *
 * Story 9.6: PI Agent 桥接与子进程入口
 *
 * 通过 stdio JSON Line 协议与子进程通信：
 * - Runtime → 子进程：stdin 写入 JSON 命令
 * - 子进程 → Runtime：stdout 输出 JSON 事件
 *
 * 使用 `npx tsx` 运行子进程，以自动解析 TypeScript 路径别名（@/）。
 * 暂不使用 @anthropic-ai/sandbox-runtime（Story 9.10 再引入）。
 */

import { accessSync, readFileSync } from "fs";
import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "child_process";
import path from "path";
import { getMonorepoRoot } from '../../../lib/paths';

import type { RuntimeEvent } from "../session/types";
import type { RuntimeLLMConfig } from "../../../lib/integrations/pi-agent/llm-config";
import { normalizeAgentTokenUsage } from "../../../lib/integrations/pi-agent/token-usage";
import { CostController, type CostReport } from "../observability/cost-controller";
import { MetricsRegistry, type MetricSample } from "../observability/metrics";

type AgentCommandState = "ready" | "waiting";

// ============================================================================
// Env helpers
// ============================================================================

function summarizeModel(model?: (RuntimeLLMConfig & { id?: string }) | null): Record<string, unknown> {
  if (!model) return { provided: false };
  const credentialSource = model.anthropicCredentialSource
    ?? (model.anthropicAuthToken ? "anthropicAuthToken" : undefined)
    ?? (model.anthropicApiKey ? "anthropicApiKey" : undefined)
    ?? (model.authToken ? "authToken" : undefined)
    ?? (model.apiKey ? "apiKey" : undefined);
  return {
    provided: true,
    provider: model.provider ?? "default",
    model: model.model ?? model.id ?? "default",
    baseUrl: model.anthropicBaseUrl ?? model.baseUrl ?? "default",
    hasCredential: Boolean(model.anthropicAuthToken || model.anthropicApiKey || model.authToken || model.apiKey),
    credentialSource: credentialSource ?? "none",
    maxTokens: model.maxTokens ?? "default",
  };
}

function logRuntime(phase: string, data: Record<string, unknown>): void {
  console.error(`[MultiAgentRuntime] ${phase} ${JSON.stringify(data)}`);
}

/** 从项目 .env / .env.local 文件显式读取模型配置，避免子进程继承旧 env。
 *  优先级：.env.local > .env（与 Next.js 一致）
 */
function loadModelEnvFromEnvFile(): Record<string, string> {
  const parsed: Record<string, string> = {};

  // 按低→高优先级读取，后者覆盖前者
  for (const filename of [".env", ".env.local"]) {
    try {
      const envPath = path.join(getMonorepoRoot(), filename);
      const raw = readFileSync(envPath, "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        // 去掉包裹的引号（单引号或双引号）
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        parsed[key] = val;
      }
    } catch {
      // 文件不存在时跳过
    }
  }

  return parsed;
}

/** 构建子进程 env，显式注入 .env 中的模型配置。
 *  如果 .env 中某个键**未设置**（注释/不存在），则从子进程 env 中删除，避免 shell 旧值泄漏。
 */
function buildWorkerEnv(
  overrides: Record<string, string>,
  options?: { stripManagedLlmEnv?: boolean },
): Record<string, string> {
  const envFile = loadModelEnvFromEnvFile();
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }
  const managedKeys = [
    "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL", "LLM_PROVIDER",
    "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_RESOURCE_NAME", "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_DEPLOYMENT_NAME", "AZURE_OPENAI_API_VERSION", "AZURE_OPENAI_API_FORMAT",
    "GOOGLE_API_KEY", "GEMINI_API_KEY",
    "OPENAI_API_KEY", "OPENAI_BASE_URL",
  ];
  const strippedKeys: string[] = [];
  const overriddenKeys: string[] = [];
  for (const key of managedKeys) {
    if (options?.stripManagedLlmEnv) {
      delete merged[key];
      strippedKeys.push(key);
      continue;
    }
    if (envFile[key] !== undefined) {
      merged[key] = envFile[key];
      overriddenKeys.push(key);
    } else {
      // .env 中未设置 → 删除，防止 shell 旧值干扰
      delete merged[key];
      strippedKeys.push(key);
    }
  }
  if (options?.stripManagedLlmEnv) {
    console.error(`[buildWorkerEnv] stripped managed LLM env for runtime model: ${strippedKeys.join(", ") || "none"}`);
  } else {
    console.error(`[buildWorkerEnv] stripped keys (not in .env): ${strippedKeys.join(", ") || "none"}`);
    console.error(`[buildWorkerEnv] overridden keys (from .env): ${overriddenKeys.join(", ") || "none"}`);
  }
  return { ...merged, ...overrides };
}

// ============================================================================
// Agent Instance — 子进程包装
// ============================================================================

export interface AgentProcessConfig {
  projectId: string;
  agentId: string;
  workingDirectory: string;
  agentType?: "persistent" | "originos" | "skill" | "supervisor";
  systemPrompt?: string;
  model?: RuntimeLLMConfig & { id?: string };
  collaborationSessionId?: string;
  blackboardDir?: string;
}

interface PendingCommand {
  resolve: (value: AgentCommandState) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * AgentProcess 包装一个 Agent Worker 子进程。
 * 通过 stdio 发送/接收 RuntimeEvent。
 */
export class AgentProcess {
  readonly id: string;
  private child: ChildProcessWithoutNullStreams | null = null;
  private status: "starting" | "running" | "stopping" | "stopped" | "error" = "stopped";
  private eventHandler?: (event: RuntimeEvent) => void;
  private pendingCommand: PendingCommand | null = null;
  private promptQueue: Array<{ message: string; resolve: (s: AgentCommandState) => void; reject: (e: Error) => void }> = [];
  private buffer = "";
  private stderrTail = "";
  private config: AgentProcessConfig;

  constructor(id: string, _deps: unknown, config: AgentProcessConfig) {
    this.id = id;
    this.config = config;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /** 启动 Agent Worker 子进程 */
  async start(onEvent: (event: RuntimeEvent) => void): Promise<void> {
    this.eventHandler = onEvent;
    const startAt = Date.now();

    // 检测是否是打包环境
    const isPackaged = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron') as { app?: { isPackaged?: boolean } };
        return electron.app?.isPackaged === true;
      } catch {
        return false;
      }
    })();

    // 打包环境使用 extraResources 中的文件，开发环境使用源文件
    let workerPath: string;
    let packagedAgentWorkerDir: string | null = null;
    let packagedCoreSrcDir: string | null = null;
    let cmd: string;
    let args: string[];

    if (isPackaged) {
      // 打包环境：agent-worker.mjs 通过 extraResources 放在 process.resourcesPath 下
      const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? path.dirname(process.execPath);
      packagedAgentWorkerDir = path.join(resourcesPath, 'agent-worker');
      packagedCoreSrcDir = path.join(resourcesPath, 'app.asar', 'dist-electron', 'core', 'src');
      workerPath = path.join(packagedAgentWorkerDir, 'agent-worker.mjs');
      // 使用 Electron 自带的 Node.js（process.execPath）
      // 设置 ELECTRON_RUN_AS_NODE=1 让 Electron 以 Node.js 模式运行，而不是启动新应用
      cmd = process.execPath;
      args = [workerPath];
    } else {
      // 开发环境：使用源文件
      workerPath = path.resolve(getMonorepoRoot(), "packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts");
      // 开发环境：查找 tsx
      const candidates = [
        path.join(getMonorepoRoot(), "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "tsx", "dist", "cli.mjs"),
      ];
      const tsxCli = candidates.find(p => {
        try {
          accessSync(p);
          return true;
        } catch {
          return false;
        }
      });

      if (tsxCli) {
        cmd = "node";
        args = [path.resolve(tsxCli), workerPath];
      } else {
        cmd = "npx";
        args = ["tsx", workerPath];
      }
    }

    // Resolve workingDirectory to absolute path — the child process cwd()
    // may differ from the monorepo root (especially in Electron).
    const absWorkingDir = path.isAbsolute(this.config.workingDirectory)
      ? this.config.workingDirectory
      : path.resolve(getMonorepoRoot(), this.config.workingDirectory);

    const spawnOptions: SpawnOptionsWithoutStdio = {
      shell: false,
      cwd: getMonorepoRoot(),
      env: buildWorkerEnv({
        AGENT_PROJECT_ID: this.config.projectId,
        AGENT_ID: this.config.agentId,
        AGENT_WORKING_DIR: absWorkingDir,
        ...(this.config.collaborationSessionId ? { AGENT_COLLAB_SESSION_ID: this.config.collaborationSessionId } : {}),
        ...(this.config.blackboardDir ? { AGENT_BLACKBOARD_DIR: this.config.blackboardDir } : {}),
        // 打包环境：让 Electron 以 Node.js 模式运行，而不是启动新应用实例
        ...(isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        ...(packagedAgentWorkerDir ? { ORIGINOS_AGENT_WORKER_DIR: packagedAgentWorkerDir } : {}),
        ...(packagedCoreSrcDir ? { ORIGINOS_CORE_SRC_DIR: packagedCoreSrcDir } : {}),
      }, {
        // Multi-agent workers always receive an explicit runtime model from the
        // parent process. Avoid leaking .env LLM credentials into the child,
        // otherwise the SDK may read conflicting provider auth from env and
        // diverge from the runtime model used by normal windows.
        stripManagedLlmEnv: !!this.config.model,
      }) as NodeJS.ProcessEnv,
    };
    logRuntime("process.spawn.start", {
      projectId: this.config.projectId,
      agentId: this.config.agentId,
      agentType: this.config.agentType ?? "persistent",
      workingDirectory: absWorkingDir,
      cmd,
      args: args.map((arg) => path.basename(arg)),
      hasCollaborationSessionId: Boolean(this.config.collaborationSessionId),
      hasBlackboardDir: Boolean(this.config.blackboardDir),
      packagedAgentWorkerDir: packagedAgentWorkerDir ? path.basename(packagedAgentWorkerDir) : null,
      model: summarizeModel(this.config.model),
    });
    const child = spawn(cmd, args, spawnOptions) as ChildProcessWithoutNullStreams;
    this.child = child;

    this.status = "starting";
    logRuntime("process.spawned", {
      projectId: this.config.projectId,
      agentId: this.config.agentId,
      pid: child.pid ?? null,
      elapsedMs: Date.now() - startAt,
    });

    // stdout: JSON Line 事件流
    child.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf-8");
      this.flushLines();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      // Forward worker stderr to parent stderr for debugging
      const text = chunk.toString("utf-8");
      this.stderrTail = (this.stderrTail + text).slice(-4000);
      process.stderr.write(chunk);
    });

    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      console.error(`[AgentProcess:${this.id}] exited (code: ${code}, signal: ${signal})`);
      logRuntime("process.exit", {
        projectId: this.config.projectId,
        agentId: this.config.agentId,
        code,
        signal,
        stderrTail: this.stderrTail.trim().slice(-1200),
      });
      this.status = "stopped";
      this.eventHandler?.({
        id: `evt-agent-end-${Date.now()}`,
        sessionId: this.config.projectId,
        seq: 0,
        type: "AGENT_END",
        payload: { exitCode: code, signal },
        source: this.id,
        timestamp: new Date().toISOString(),
      });
      this.pendingCommand?.reject(new Error(`Agent process exited with code ${code}, signal ${signal}`));
      this.pendingCommand = null;
      // Reject all queued prompts
      const exitErr = new Error(`Agent process exited with code ${code}`);
      for (const q of this.promptQueue) q.reject(exitErr);
      this.promptQueue = [];
    });

    child.on("error", (err: Error) => {
      this.status = "error";
      this.pendingCommand?.reject(err);
      this.pendingCommand = null;
    });

    // 发送 initialize 命令
    await this.sendCommand({
      type: "initialize",
      config: {
        projectId: this.config.projectId,
        agentId: this.config.agentId,
        workingDirectory: absWorkingDir,
        agentType: this.config.agentType ?? "persistent",
        systemPrompt: this.config.systemPrompt,
        model: this.config.model,
      },
    });

    this.status = "running";
    logRuntime("process.initialize.ready", {
      projectId: this.config.projectId,
      agentId: this.config.agentId,
      pid: child.pid ?? null,
      elapsedMs: Date.now() - startAt,
    });
  }

  /** 发送 prompt 给 Agent Worker — 串行队列，确保不并发 */
  async prompt(message: string): Promise<AgentCommandState> {
    if (this.status !== "running") {
      throw new Error(`Agent ${this.id} is not running (status: ${this.status})`);
    }

    if (!this.child?.stdin) {
      throw new Error("Agent stdin not available");
    }

    // If a prompt is already in-flight, queue this one instead of clobbering
    if (this.pendingCommand) {
      return new Promise<AgentCommandState>((resolve, reject) => {
        this.promptQueue.push({ message, resolve, reject });
      });
    }

    return this._sendPrompt(message);
  }

  private _sendPrompt(message: string): Promise<AgentCommandState> {
    const promptAt = Date.now();
    logRuntime("process.prompt.send", {
      projectId: this.config.projectId,
      agentId: this.config.agentId,
      messageChars: message.length,
    });
    this.child!.stdin!.write(JSON.stringify({ type: "prompt", message }) + "\n");

    return new Promise<AgentCommandState>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommand = null;
        reject(new Error("Prompt timed out waiting for agent response"));
        this._drainPromptQueue();
      }, 300_000);

      this.pendingCommand = {
        resolve: (s) => {
          logRuntime("process.prompt.done", {
            projectId: this.config.projectId,
            agentId: this.config.agentId,
            state: s,
            elapsedMs: Date.now() - promptAt,
          });
          resolve(s);
          this._drainPromptQueue();
        },
        reject: (e) => {
          logRuntime("process.prompt.error", {
            projectId: this.config.projectId,
            agentId: this.config.agentId,
            error: e.message,
            elapsedMs: Date.now() - promptAt,
          });
          reject(e);
          this._drainPromptQueue();
        },
        timer,
      };
    });
  }

  private _drainPromptQueue(): void {
    this.pendingCommand = null;
    const next = this.promptQueue.shift();
    if (!next) return;
    if (this.status !== "running" || !this.child?.stdin) {
      next.reject(new Error(`Agent ${this.id} is not running`));
      this._drainPromptQueue();
      return;
    }
    this._sendPrompt(next.message).then(next.resolve, next.reject);
  }

  /** 中断当前操作 */
  async abort(): Promise<void> {
    if (this.status === "stopped") return;
    await this.sendCommand({ type: "abort" });
  }

  /** 发送 resume 给暂停的 Agent Worker，等待 agent loop 完成 */
  async resume(response: string): Promise<void> {
    if (this.status !== "running") {
      throw new Error(`Agent ${this.id} is not running (status: ${this.status})`);
    }
    if (!this.child?.stdin) {
      throw new Error("Agent stdin not available");
    }
    console.error(`[AgentProcess:${this.id}] resume: writing to stdin, response length=${response.length}`);
    // 清除任何 pending command（resume 不需要等待 ready）
    if (this.pendingCommand) {
      clearTimeout(this.pendingCommand.timer);
      this.pendingCommand = null;
    }
    // 设置等待 "ready" 信号（agent loop 完成后发送）
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("resume timed out waiting for agent response"));
      }, 300_000); // 5 分钟超时
      this.pendingCommand = { resolve: () => { /* noop */ }, reject, timer };
      this.pendingCommand.resolve = () => { clearTimeout(timer); resolve(); };
    });
    this.child.stdin.write(JSON.stringify({ type: "resume", response }) + "\n");
    await readyPromise;
    console.error(`[AgentProcess:${this.id}] resume: agent loop completed`);
  }

  /**
   * 向 Supervisor Worker 发送协调工具调用结果（SUPA-02）。
   * glue 层执行 dispatch_worker / wait_workers / run_verifier 后通过此方法
   * 将结果回传给 supervisor 子进程，以解除其 callCoordinatorTool 等待。
   */
  sendToolResult(toolCallId: string, result: string): void {
    if (!this.child?.stdin) return;
    this.child.stdin.write(JSON.stringify({ type: "tool_result", toolCallId, result }) + "\n");
  }

  /** 等待 Agent 下一次发出 "ready" 信号（resume 后使用） */
  async waitForReady(): Promise<AgentCommandState> {
    if (this.status !== "running") {
      throw new Error(`Agent ${this.id} is not running (status: ${this.status})`);
    }
    if (this.pendingCommand) {
      clearTimeout(this.pendingCommand.timer);
      this.pendingCommand = null;
    }
    return new Promise<AgentCommandState>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("waitForReady timed out waiting for agent response"));
      }, 300_000);
      this.pendingCommand = { resolve, reject, timer };
    });
  }

  /** 关闭子进程 */
  async shutdown(): Promise<void> {
    if (this.status === "stopped") {
      console.error(`[AgentProcess:${this.id}] already stopped, skipping shutdown`);
      return;
    }
    console.error(`[AgentProcess:${this.id}] shutting down (status: ${this.status})`);
    this.status = "stopping";
    try {
      await this.sendCommand({ type: "shutdown" });
      console.error(`[AgentProcess:${this.id}] shutdown command sent`);
    } catch {
      console.error(`[AgentProcess:${this.id}] shutdown command timed out, forcing kill`);
    }
    // 确保进程真正退出：先 kill，再等待 exit 事件
    if (this.child) {
      this.child.kill("SIGKILL");
      // 给进程 2s 退出时间
      await new Promise<void>(resolve => {
        this.child!.once("exit", () => resolve());
        setTimeout(resolve, 2000);
      });
      this.child = null;
    }
    this.status = "stopped";
    console.error(`[AgentProcess:${this.id}] process killed`);
  }

  getStatus() {
    return this.status;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private sendCommand(cmd: Record<string, unknown>): Promise<AgentCommandState> {
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin) {
        reject(new Error("Agent stdin not available"));
        return;
      }

      const timer = setTimeout(() => {
        console.error(`[AgentProcess:${this.id}] Command timed out after 300s waiting for child acknowledgment`);
        reject(new Error("Command timed out waiting for child acknowledgment"));
      }, 300_000); // 5 分钟 — 首次初始化需要动态加载大量模块

      this.pendingCommand = { resolve, reject, timer };
      this.child.stdin!.write(JSON.stringify(cmd) + "\n");
      // Do NOT resolve immediately — wait for worker to send 'ready' signal
      // which is handled by flushLines() parsing stdout.
    });
  }

  private flushLines(): void {
    const lines = this.buffer.split("\n");
    // 最后一行可能不完整，留到下次
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg["type"] === "ready") {
          this.pendingCommand?.resolve("ready");
          this.pendingCommand = null;
        } else if (msg["type"] === "waiting") {
          this.pendingCommand?.resolve("waiting");
          this.pendingCommand = null;
        } else if (msg["type"] === "event" && msg["event"]) {
          this.eventHandler?.(msg["event"] as RuntimeEvent);
        } else if (msg["type"] === "error") {
          const err = new Error(String(msg["message"] ?? msg["error"] ?? "Unknown error"));
          this.pendingCommand?.reject(err);
          this.pendingCommand = null;
        }
      } catch (e) {
        // 忽略非 JSON 行（如 agent 直接输出的文本内容）
      }
    }
  }
}

// ============================================================================
// Agent Spawner — 工厂 & 生命周期管理
// ============================================================================

export class AgentSpawner {
  private processes = new Map<string, AgentProcess>();
  private costs = new Map<string, CostController>();
  private metrics = new MetricsRegistry();

  constructor(_deps: unknown) {
    void _deps;
  }

  /** 启动一个新的 Agent 子进程。如果同 ID 已在运行，先 destroy 再 spawn。 */
  async spawn(config: AgentProcessConfig, onEvent: (event: RuntimeEvent) => void): Promise<AgentProcess> {
    // 如果同 ID 已在运行，先清理旧进程
    if (this.processes.has(config.agentId)) {
      logRuntime("spawner.replace_existing", {
        projectId: config.projectId,
        agentId: config.agentId,
      });
      await this.destroy(config.agentId);
    }

    logRuntime("spawner.spawn", {
      projectId: config.projectId,
      agentId: config.agentId,
      agentType: config.agentType ?? "persistent",
      model: summarizeModel(config.model),
    });
    const proc = new AgentProcess(config.agentId, null, config);
    await proc.start((event) => {
      this.recordUsageEvent(event);
      onEvent(event);
    });
    this.processes.set(config.agentId, proc);
    logRuntime("spawner.spawn.ready", {
      projectId: config.projectId,
      agentId: config.agentId,
      runningProcesses: this.processes.size,
    });
    return proc;
  }

  /** 停止指定 Agent */
  async stop(agentId: string): Promise<void> {
    const proc = this.processes.get(agentId);
    if (!proc) return;
    await proc.shutdown();
    this.processes.delete(agentId);
  }

  /** 停止并立即清理指定 Agent（同步标记，不等待） */
  forceStop(agentId: string): void {
    const proc = this.processes.get(agentId);
    if (!proc) return;
    // 立即从 map 中移除，避免竞态
    this.processes.delete(agentId);
    // 触发异步关闭（内部会 kill）
    proc.shutdown().catch(() => {});
  }

  /** 停止并彻底销毁指定 Agent（保证子进程被清理） */
  async destroy(agentId: string): Promise<void> {
    const proc = this.processes.get(agentId);
    if (!proc) return;
    // shutdown 内部会 kill，等它完成
    await proc.shutdown();
    // 从 map 中移除
    this.processes.delete(agentId);
  }

  /** 获取 Agent 实例 */
  get(agentId: string): AgentProcess | undefined {
    return this.processes.get(agentId);
  }

  /** 列出所有运行中的 Agent */
  list(): AgentProcess[] {
    return Array.from(this.processes.values());
  }

  /** Record usage once at the parent-process boundary for every worker mode. */
  recordUsageEvent(event: RuntimeEvent): void {
    const usage = normalizeAgentTokenUsage(event.payload["usage"]);
    if (!usage) return;
    const cost = this.costs.get(event.sessionId) ?? new CostController();
    this.costs.set(event.sessionId, cost);
    cost.recordUsage(event.source, usage);
    this.metrics.recordTokenUsage(event.source, event.sessionId, usage);
  }

  getCostReport(sessionId: string): CostReport | undefined {
    return this.costs.get(sessionId)?.getCostReport(sessionId);
  }

  getTokenMetrics(sessionId?: string): MetricSample[] {
    const samples = this.metrics.collect().filter((sample) => sample.name.includes("tokens"));
    return sessionId ? samples.filter((sample) => sample.labels["sessionId"] === sessionId) : samples;
  }

  /** 停止所有 Agent */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.processes.keys()).map((id) => this.stop(id));
    await Promise.all(promises);
  }

  /** 清理已停止的 Agent */
  cleanup(): void {
    for (const [id, proc] of this.processes) {
      if (proc.getStatus() === "stopped") {
        this.processes.delete(id);
      }
    }
  }
}

// ============================================================================
// Global singleton — 挂载到 globalThis 避免 Next.js HMR 实例隔离
// ============================================================================

declare global {
  // eslint-disable-next-line no-var
  var __globalSpawner: AgentSpawner | undefined;
  var __cleanupTimer: ReturnType<typeof setInterval> | undefined;
}

function getGlobalSpawnerVar(): AgentSpawner | undefined { return globalThis.__globalSpawner; }
function setGlobalSpawnerVar(v: AgentSpawner | undefined) { globalThis.__globalSpawner = v; }
function getCleanupTimerVar(): ReturnType<typeof setInterval> | undefined { return globalThis.__cleanupTimer; }
function setCleanupTimerVar(v: ReturnType<typeof setInterval> | undefined) { globalThis.__cleanupTimer = v; }

export function getGlobalSpawner(): AgentSpawner {
  let globalSpawner = getGlobalSpawnerVar();
  let cleanupTimer = getCleanupTimerVar();
  if (!globalSpawner) {
    globalSpawner = new AgentSpawner(null);
    setGlobalSpawnerVar(globalSpawner);
    cleanupTimer = setInterval(() => {
      getGlobalSpawnerVar()?.cleanup();
    }, 60 * 1000);
    setCleanupTimerVar(cleanupTimer);
    cleanupTimer.unref();
  }
  return globalSpawner;
}

export async function shutdownGlobalSpawner(): Promise<void> {
  console.error(`[AgentSpawner] Global shutdown started`);
  let cleanupTimer = getCleanupTimerVar();
  if (cleanupTimer) { clearInterval(cleanupTimer); setCleanupTimerVar(undefined); }
  let globalSpawner = getGlobalSpawnerVar();
  if (globalSpawner) {
    const processes = globalSpawner.list();
    console.error(`[AgentSpawner] Stopping ${processes.length} running processes`);
    await globalSpawner.stopAll();
  }
  setGlobalSpawnerVar(undefined);
  console.error(`[AgentSpawner] Global shutdown complete`);
}

// 进程退出时自动清理所有子进程
process.on('exit', () => {
  const g = getGlobalSpawnerVar();
  if (g) {
    const procs = g.list();
    if (procs.length > 0) {
      console.error(`[AgentSpawner] Process exit: force killing ${procs.length} subprocesses`);
      for (const p of procs) {
        try { p['child']?.kill('SIGKILL'); } catch {}
      }
    }
  }
});
