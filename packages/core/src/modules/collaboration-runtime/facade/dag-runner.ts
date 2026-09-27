import { stopProtocolObserver } from "../engine/protocol-observer";
/**
 * Facade — DAG 启动 + abort
 *
 * 迁移自 src/lib/collaboration-runtime-service/index.ts（Story 9.38）
 * 职责：executeSession、startDag、abortSession
 *
 * 依赖：session-store、event-bus（eventEmitter）
 * import executeSupervisorDag 暂时从 engine/supervisor-dag（步骤 5 更新后）
 */

import path from "path";
import { Blackboard } from "../../../modules/collaboration-runtime/session/blackboard";
import { FsEventStore } from "../../../modules/collaboration-runtime/session/fs-event-store";
import { getGlobalSpawner } from "../../../modules/collaboration-runtime/sandbox";
import type { CollaborationSession, RuntimeEvent } from "../../../modules/collaboration-runtime/session/types";

import {
  sessions,
  eventStores,
  blackboards,
  loadPersistedSessions,
  saveProjectSessions,
} from "./session-store";
import { eventEmitter } from "./event-bus";
import { setStartDag, setResumeSupervisorHitl } from "./hitl-dispatcher";
import { getDataRoot } from "../../../lib/paths";

import { executeSupervisorDag, resumeSupervisorHitl } from "../../../modules/collaboration-runtime/engine/supervisor-dag";

// 注入 hitl-dispatcher 需要的函数引用（避免循环依赖）
setStartDag(startDag);
setResumeSupervisorHitl(resumeSupervisorHitl);

export async function executeSession(id: string): Promise<{ status: string; result: unknown }> {
  await loadPersistedSessions();
  const session = sessions.get(id);
  if (!session) {
    throw new Error(`Session ${id} not found`);
  }

  // 确保 EventStore 和 Blackboard 存在（HMR 后内存丢失）
  let bb = blackboards.get(id);
  let store = eventStores.get(id);
  if (!bb || !store) {
    const sessionDir = path.join(getDataRoot(), "projects", session.projectId, "collaboration-sessions");
    store = new FsEventStore(sessionDir);
    bb = new Blackboard(id, path.join(getDataRoot(), "projects", session.projectId, "collaboration-sessions", id));
    blackboards.set(id, bb);
    eventStores.set(id, store);
  }

  // 无全局目标时进入欢迎模式：发出欢迎消息，等待用户输入目标
  if (!session.globalGoal) {
    session.status = "greeting";
    session.updatedAt = new Date().toISOString();
    await saveProjectSessions(session.projectId);

    const welcomeEvent: RuntimeEvent = {
      id: `evt-welcome-${Date.now()}`,
      sessionId: id,
      seq: 0,
      type: "ASSISTANT_MESSAGE",
      payload: {
        content: "你好！我是多 Agent 协作系统的 Supervisor。请告诉我你想完成什么目标，我会负责分解任务并协调各 Agent 为你执行。",
      },
      source: "supervisor",
      timestamp: new Date().toISOString(),
    };
    // Await persistence before emitting so the welcome message is durable
    // before any renderer receives it.
    await store.append(welcomeEvent);
    eventEmitter.emit(welcomeEvent);

    return { status: "greeting", result: null };
  }

  return startDag(session, store, id);
}

export async function startDag(
  session: CollaborationSession,
  store: FsEventStore,
  id: string
): Promise<{ status: string; result: unknown }> {
  session.status = "running";
  session.updatedAt = new Date().toISOString();
  await saveProjectSessions(session.projectId);
  const llmConfig = session.config.llmConfig;
  const credentialSource = llmConfig?.anthropicCredentialSource
    ?? (llmConfig?.anthropicAuthToken ? "anthropicAuthToken" : undefined)
    ?? (llmConfig?.anthropicApiKey ? "anthropicApiKey" : undefined)
    ?? (llmConfig?.authToken ? "authToken" : undefined)
    ?? (llmConfig?.apiKey ? "apiKey" : undefined);
  console.error(`[MultiAgentRuntime] facade.dag.start ${JSON.stringify({
    sessionId: id,
    projectId: session.projectId,
    goalChars: (session.globalGoal ?? "").length,
    timeoutMs: session.config.timeoutMs ?? "default",
    maxIterations: session.config.maxIterations ?? "default",
    llmConfig: llmConfig ? {
      provided: true,
      provider: llmConfig.provider ?? "default",
      model: llmConfig.model ?? "default",
      baseUrl: llmConfig.anthropicBaseUrl ?? llmConfig.baseUrl ?? "default",
      hasCredential: Boolean(llmConfig.anthropicAuthToken || llmConfig.anthropicApiKey || llmConfig.authToken || llmConfig.apiKey),
      credentialSource: credentialSource ?? "none",
      maxTokens: llmConfig.maxTokens ?? "default",
    } : { provided: false },
  })}`);

  // Supervisor 在后台运行，不阻塞 HTTP 请求（支持 HITL 长时间暂停）
  void executeSupervisorDag(
    {
      projectId: session.projectId,
      globalGoal: session.globalGoal ?? "",
      sessionId: id,
      timeoutMs: session.config.timeoutMs,
      maxIterations: session.config.maxIterations,
      llmConfig: session.config.llmConfig,
    },
    store,
    eventEmitter
  ).then(async () => {
    // DAG 完成后保持 "running" 状态 — supervisor 进程仍存活，用户可以继续发送消息触发新 DAG
    session.updatedAt = new Date().toISOString();
    await saveProjectSessions(session.projectId);
  }).catch(async (err) => {
    console.error(`[collaboration] executeSession ${id} failed:`, err);
    session.status = "aborted";
    session.updatedAt = new Date().toISOString();
    await saveProjectSessions(session.projectId);
  });

  return { status: "running", result: null };
}

// abortSession 通过集成层取消正在运行的 DAG
export async function abortSession(id: string): Promise<void> {
  await stopProtocolObserver(id, true);
  await loadPersistedSessions();

  const session = sessions.get(id);
  if (session) {
    session.status = "aborted";
    session.updatedAt = new Date().toISOString();
    await saveProjectSessions(session.projectId);
  }

  // Destroy all collaboration processes for this session
  const spawner = getGlobalSpawner();
  try { await spawner.destroy(`supervisor-${id}`); } catch { /* already gone */ }
}
