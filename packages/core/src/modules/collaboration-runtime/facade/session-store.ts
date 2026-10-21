/**
 * Facade — Session 状态机 + 持久化
 *
 * 迁移自 src/lib/collaboration-runtime-service/index.ts（Story 9.38）
 * 职责：sessions/eventStores/blackboards 全局 Map + 磁盘持久化 + Session CRUD
 *
 * 注意：此模块不 import event-bus，避免循环依赖。
 * getRuntime() 在 facade/index.ts 中初始化，此处通过 initRuntime() 注入。
 */

import { createHash } from "node:crypto";
import path from "path";

import {
  CollaborationRuntime,
  type CollaborationRuntimeDeps,
  type FileOps,
  type EventEmitter,
} from "../../../modules/collaboration-runtime";
import { Blackboard } from "../../../modules/collaboration-runtime/session/blackboard";
import { FsEventStore } from "../../../modules/collaboration-runtime/session/fs-event-store";
import { OrphanReconciler } from "../../../modules/collaboration-runtime/session/orphan-reconciler";
import type { CollaborationSession, RuntimeEvent } from "../../../modules/collaboration-runtime/session/types";
import { normalizeRuntimeLLMConfig, type RuntimeLLMConfig } from "../../../lib/integrations/pi-agent/llm-config";
import { readUserConfigWithProductDefaults, userLLMConfigToRuntimeLLMConfig } from "../../../lib/features/user-config";

// ============================================================================
// Session 管理（内存 + 磁盘持久化，Phase 3 升级数据库前用文件存储）
// ============================================================================

declare global {
  // eslint-disable-next-line no-var
  var __collaborationSessions: Map<string, CollaborationSession> | undefined;
  // eslint-disable-next-line no-var
  var __collaborationEventStores: Map<string, FsEventStore> | undefined;
  // eslint-disable-next-line no-var
  var __collaborationBlackboards: Map<string, Blackboard> | undefined;
  // eslint-disable-next-line no-var
  var __collaborationPendingMessages: Map<string, string[]> | undefined;
}

if (!globalThis.__collaborationSessions) {
  globalThis.__collaborationSessions = new Map();
}
if (!globalThis.__collaborationEventStores) {
  globalThis.__collaborationEventStores = new Map();
}
if (!globalThis.__collaborationBlackboards) {
  globalThis.__collaborationBlackboards = new Map();
}
if (!globalThis.__collaborationPendingMessages) {
  globalThis.__collaborationPendingMessages = new Map();
}
export const sessions = globalThis.__collaborationSessions;
export const eventStores = globalThis.__collaborationEventStores;
export const blackboards = globalThis.__collaborationBlackboards;
const pendingMessages = globalThis.__collaborationPendingMessages;

export function queueSessionMessage(sessionId: string, message: string): void {
  const queued = pendingMessages.get(sessionId) ?? [];
  queued.push(message);
  pendingMessages.set(sessionId, queued);
}

export function takeSessionMessages(sessionId: string): string[] {
  const queued = pendingMessages.get(sessionId) ?? [];
  pendingMessages.delete(sessionId);
  return queued;
}

export function buildContinuationGoal(previousGoal: string | undefined, messages: string[]): string {
  const previous = (previousGoal ?? "").trim().slice(-4_000);
  const updates = messages.map((message) => message.trim()).filter(Boolean).join("\n").slice(-4_000);
  return [
    "继续同一协作会话，请结合上一轮目标与用户最新补充直接推进，不要重新扫描完整事件日志。",
    previous ? `上一轮目标：\n${previous}` : "",
    updates ? `用户最新补充：\n${updates}` : "",
  ].filter(Boolean).join("\n\n");
}

function formalExecutionRequestId(sessionId: string, objective: string): string {
  const digest = createHash("sha256")
    .update(`${sessionId}\u0000${objective.trim()}`)
    .digest("hex");
  return `request:${digest}`;
}

export function updateFormalObjective(
  session: CollaborationSession,
  objective: string,
): void {
  const requestId = formalExecutionRequestId(session.id, objective);
  if (session.executionRequestId !== requestId) {
    session.executionRequestId = requestId;
    session.formalExecution = undefined;
  }
  session.globalGoal = objective;
}

import { getDataRoot } from '../../../lib/paths';

export const STATE_ROOT_DIR = path.join(getDataRoot(), "projects");

export function getProjectStateDir(projectId: string): string {
  return path.join(STATE_ROOT_DIR, projectId, "collaboration-sessions");
}

export async function saveProjectSessions(projectId: string): Promise<void> {
  const reconciler = new OrphanReconciler(getProjectStateDir(projectId));
  const persisted = await reconciler.loadSessions();
  const projectSessions = Array.from(sessions.values()).filter((session) => session.projectId === projectId);
  const merged = new Map(persisted.map((session) => [session.id, session]));
  for (const session of projectSessions) merged.set(session.id, session);
  await reconciler.saveSessions(Array.from(merged.values()));
}

/** 生成唯一 session ID */
export function generateId(): string {
  return `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// FileOps 实现（使用 fs/promises）
// ============================================================================

const fileOps: FileOps = {
  read: async (p: string) => {
    const { readFile } = await import("fs/promises");
    return readFile(p, "utf-8");
  },
  write: async (p: string, content: string) => {
    const { mkdir, writeFile } = await import("fs/promises");
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, content, "utf-8");
  },
  exists: async (p: string) => {
    const { stat } = await import("fs/promises");
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  },
  listDir: async (p: string) => {
    const { readdir } = await import("fs/promises");
    return readdir(p);
  },
};

// ============================================================================
// Runtime 实例（懒加载，由 facade/index.ts 调用时传入 eventEmitter）
// ============================================================================

let runtime: CollaborationRuntime | null = null;

export function getRuntime(emitter: EventEmitter, agentDefinitionParser?: import("../../../modules/collaboration-runtime/config").AgentDefinitionParser): CollaborationRuntime {
  if (!runtime) {
    const parser = agentDefinitionParser ?? {
      parseAgentDefinition: (content: string) => ({ content }),
      parseToolDefinition: (_content: string) => ({ allowedTools: [] as string[] }),
    };
    const deps: CollaborationRuntimeDeps = {
      agentEngine: {
        startAgent: async () => {
          throw new Error("Not implemented in Phase 1 — use /execute endpoint");
        },
        stopAgent: async () => {},
        getAgent: () => null,
      },
      toolExecutor: {
        execute: async () => ({}),
        listTools: () => [],
      },
      ontologyStore: {
        query: async () => [],
        save: async () => {},
        delete: async () => {},
      },
      fileOps,
      eventEmitter: emitter,
      agentDefinitionParser: parser,
    };
    runtime = new CollaborationRuntime(deps);
  }
  return runtime;
}

// ============================================================================
// 持久化 + 孤儿回收
// ============================================================================

let persistenceInitialized = false;

/**
 * Hydrate every persisted conversation, including terminal runs.
 *
 * A completed/aborted/terminated Run has no live worker, but its conversation
 * remains resumable: the next user message creates a fresh formal Run in the
 * same board conversation. Dropping terminal sessions here makes the UI able
 * to render the persisted event log while the message route reports
 * `Session ... not found` after an application restart.
 */
export function hydratePersistedSessions(
  persisted: readonly CollaborationSession[],
): void {
  for (const session of persisted) {
    sessions.set(session.id, session);
  }
}

/** 从磁盘加载已保存的会话，并运行孤儿回收 */
export async function loadPersistedSessions(): Promise<void> {
  if (persistenceInitialized) {return;}
  persistenceInitialized = true;
  const { readdir } = await import("fs/promises");

  try {
    const projectIds = await readdir(STATE_ROOT_DIR);
    for (const projectId of projectIds) {
      const persisted = await new OrphanReconciler(getProjectStateDir(projectId)).loadSessions();
      hydratePersistedSessions(persisted);
    }
  } catch {
    // ignore empty state root
  }
}

// ============================================================================
// Public API — Session CRUD
// ============================================================================

export interface CreateSessionInput {
  projectId: string;
  globalGoal?: string;
  requestId?: string;
  maxIterations?: number;
  timeoutMs?: number;
  mode?: "workflow" | "system";
  llmConfig?: RuntimeLLMConfig;
}

function summarizeRuntimeLLMConfig(config?: RuntimeLLMConfig): Record<string, unknown> {
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

export async function createSession(input: CreateSessionInput, emitter: EventEmitter, agentDefinitionParser?: import("../../../modules/collaboration-runtime/config").AgentDefinitionParser): Promise<CollaborationSession> {
  await loadPersistedSessions();
  const projectId = input.projectId.startsWith("proj-") ? input.projectId : `proj-${input.projectId}`;
  if (!input.globalGoal?.trim()) {
    const reusable = Array.from(sessions.values())
      .filter((session) => session.projectId === projectId
        && !session.globalGoal
        && (session.status === "created" || session.status === "greeting"))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (reusable) {
      logRuntime("facade.session.reuse", {
        sessionId: reusable.id,
        projectId,
        status: reusable.status,
      });
      return reusable;
    }
  }
  const id = generateId();
  const now = new Date().toISOString();
  const llmConfig = normalizeRuntimeLLMConfig(input.llmConfig)
    ?? userLLMConfigToRuntimeLLMConfig(readUserConfigWithProductDefaults().llm);
  logRuntime("facade.session.create", {
    sessionId: id,
    projectId: input.projectId,
    mode: input.mode ?? "default",
    hasGlobalGoal: Boolean(input.globalGoal),
    llmConfig: summarizeRuntimeLLMConfig(llmConfig),
    llmConfigSource: normalizeRuntimeLLMConfig(input.llmConfig) ? "request" : llmConfig ? "persisted" : "missing",
  });

  const session: CollaborationSession = {
    id,
    projectId,
    globalGoal: input.globalGoal,
    status: "created",
    createdAt: now,
    updatedAt: now,
    executionRequestId: input.requestId ?? `request:${id}`,
    config: {
      maxIterations: input.maxIterations,
      timeoutMs: input.timeoutMs,
      mode: input.mode,
      llmConfig,
    },
  };

  // 记录宿主进程 PID（Story 9.24）
  const sessionWithPid = new OrphanReconciler(getProjectStateDir(projectId)).recordPid(session);

  sessions.set(id, sessionWithPid);

  // 持久化到磁盘
  await saveProjectSessions(projectId);

  // 创建 EventStore — baseDir 不含 sessionId，由 FsEventStore.sessionDir() 拼接
  const sessionDir = path.join(getDataRoot(), "projects", projectId, "collaboration-sessions");
  const store = new FsEventStore(sessionDir);
  eventStores.set(id, store);

  // 创建 Blackboard
  const bb = new Blackboard(id, path.join(getDataRoot(), "projects", projectId, "collaboration-sessions", id));
  blackboards.set(id, bb);

  // 注册到 Runtime
  getRuntime(emitter, agentDefinitionParser).createSession(sessionWithPid);

  return sessionWithPid;
}

export async function listSessions(): Promise<CollaborationSession[]> {
  await loadPersistedSessions();

  // 运行孤儿回收（Story 9.24）
  const allSessions = Array.from(sessions.values());
  const reports = (
    await Promise.all(
      Array.from(new Set(allSessions.map((session) => session.projectId))).map((projectId) =>
        new OrphanReconciler(getProjectStateDir(projectId)).runReconciliation(
          allSessions.filter((session) => session.projectId === projectId)
        )
      )
    )
  ).flat();

  // 更新内存中的会话
  for (const report of reports) {
    if (report.action === "terminated") {
      const session = sessions.get(report.sessionId);
      if (session) {
        session.status = "terminated";
        session.terminationReason = report.reason;
        session.updatedAt = new Date().toISOString();
      }
    }
  }

  return Array.from(sessions.values());
}

export async function getSession(id: string): Promise<CollaborationSession | null> {
  await loadPersistedSessions();
  return sessions.get(id) ?? null;
}

export async function getBlackboardState(id: string): Promise<unknown> {
  const bb = blackboards.get(id);
  if (!bb) {return null;}
  return bb.toState();
}

export async function getEvents(id: string): Promise<RuntimeEvent[]> {
  const store = eventStores.get(id);
  if (!store) {return [];}
  return store.read(id);
}
