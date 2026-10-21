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
import type { CollaborationRunSnapshot } from './contract-execution-types';
import { readContractWorkerOutput } from './contract-worker-output';

import {
  sessions,
  eventStores,
  blackboards,
  loadPersistedSessions,
  saveProjectSessions,
  buildContinuationGoal,
  takeSessionMessages,
  updateFormalObjective,
} from "./session-store";
import { eventEmitter } from "./event-bus";
import { setStartDag, setResumeSupervisorHitl } from "./hitl-dispatcher";
import { registerHitlNotificationForwarder } from "./hitl-notify";
import { getDataRoot } from "../../../lib/paths";

import { resumeSupervisorHitl } from "../../../modules/collaboration-runtime/engine/supervisor-dag";
import {
  getSupervisorWorkItemRuntimePort,
  type SupervisorWorkItemBindingReceipt,
  type SupervisorWorkItemDesignGap,
} from './supervisor-workitem-runtime';

// 注入 hitl-dispatcher 需要的函数引用（避免循环依赖）
setStartDag(startDag);
setResumeSupervisorHitl(resumeSupervisorHitl);
// Story 9.44 模块 5：注册 HITL → 通知中心 转发（模块加载组装点，Web 与 Electron 共用事件总线）
registerHitlNotificationForwarder();

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
    if (session.status === "greeting") {
      return { status: "greeting", result: null };
    }
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

  const runtime = getSupervisorWorkItemRuntimePort();
  if (!runtime) {
    await reportDesignGaps(store, session, id, [{
      code: 'SUPERVISOR_WORKITEM_RUNTIME_UNAVAILABLE',
      message: '正式多 Agent 任务运行时尚未完成装配。',
      remediation: '重新打开项目任务看板后重试；系统不会回退创建 Blackboard 任务。',
    }]);
    return { status: 'design_gap', result: null };
  }

  const requestId = session.executionRequestId ?? `request:${id}`;
  session.executionRequestId = requestId;
  const bound = await runtime.bind({
    projectId: session.projectId,
    collaborationSessionId: id,
    requestId,
    objective: session.globalGoal ?? '',
  });
  if (bound.ok === false) {
    await reportDesignGaps(store, session, id, bound.gaps);
    return { status: 'design_gap', result: { gaps: bound.gaps } };
  }

  await persistFormalBinding(session, bound.receipt);
  await appendAndEmit(store, {
    id: `formal-binding-${Date.now()}`,
    sessionId: id,
    seq: 0,
    type: 'SUPERVISOR_DECOMPOSITION',
    payload: {
      authority: 'collaboration-workitem-ledger',
      parentTaskId: bound.receipt.parentTaskId,
      parentStepId: bound.receipt.parentStepId,
      runId: bound.receipt.runId,
      workItems: bound.receipt.snapshot.workItems.map((item) => ({
        workItemId: item.id,
        agentId: item.assignedAgentId,
        inputRefs: item.inputRefs,
        outputRefs: item.outputRefs,
      })),
    },
    source: 'supervisor',
    timestamp: new Date().toISOString(),
  });
  await appendAndEmit(store, {
    id: `formal-binding-message-${Date.now()}`,
    sessionId: id,
    seq: 0,
    type: 'ASSISTANT_MESSAGE',
    payload: {
      content: `任务已绑定正式项目任务 ${bound.receipt.parentTaskId}，Run ${bound.receipt.runId} 正在按已发布契约执行。`,
    },
    source: 'supervisor',
    timestamp: new Date().toISOString(),
  });

  // 正式 WorkItem runtime 自带五阶段确定性推进和进程恢复；HTTP 不等待长任务。
  void runtime.advance({ binding: bound.receipt, requestId }).then(async (snapshot) => {
    await synchronizeFormalRunSnapshot(snapshot, id);
  }).catch(async (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[collaboration] formal execution ${id} failed:`, error);
    await appendAndEmit(store, {
      id: `formal-run-failed-${Date.now()}`,
      sessionId: id,
      seq: 0,
      type: 'DAG_FAIL',
      payload: {
        authority: 'collaboration-workitem-ledger',
        parentTaskId: bound.receipt.parentTaskId,
        runId: bound.receipt.runId,
        failureStage: 'runtime',
        failureReason: reason,
      },
      source: 'supervisor',
      timestamp: new Date().toISOString(),
    });
    await appendAndEmit(store, {
      id: `formal-run-failed-message-${Date.now()}`,
      sessionId: id,
      seq: 0,
      type: 'ASSISTANT_MESSAGE',
      payload: {
        content: `任务 ${bound.receipt.parentTaskId} 执行失败：${reason}。请根据失败原因修正后重试。`,
      },
      source: 'supervisor',
      timestamp: new Date().toISOString(),
    });
    session.status = 'aborted';
    session.updatedAt = new Date().toISOString();
    await saveProjectSessions(session.projectId);
  });

  return {
    status: 'running',
    result: {
      parentTaskId: bound.receipt.parentTaskId,
      parentStepId: bound.receipt.parentStepId,
      runId: bound.receipt.runId,
    },
  };
}

export function formalRunStatusMessage(
  parentTaskId: string,
  snapshot: Pick<CollaborationRunSnapshot, 'runId' | 'status' | 'terminalStatus' | 'failureReason' | 'workItems'>,
  workerOutputs: readonly { agentId: string; output: string }[] = [],
): string {
  if (snapshot.terminalStatus === 'completed') {
    const renderedOutputs = workerOutputs
      .map(({ agentId, output }) => `### ${agentId} 的产出\n\n${output}`)
      .join('\n\n---\n\n');
    return renderedOutputs
      ? `任务 ${parentTaskId} 已完成。\n\n${renderedOutputs}`
      : `任务 ${parentTaskId} 已完成，Run ${snapshot.runId} 的产出与验收结果已写入任务看板。`;
  }
  if (snapshot.terminalStatus === 'canceled') {
    return `任务 ${parentTaskId} 已取消（Run ${snapshot.runId}）。`;
  }
  if (snapshot.terminalStatus === 'failed') {
    const failedItem = snapshot.workItems.find(({ status }) => status === 'failed');
    const itemReason = failedItem?.attempts.at(-1)?.reason;
    const reason = snapshot.failureReason ?? itemReason ?? '未提供失败原因';
    return `任务 ${parentTaskId} 执行失败（Run ${snapshot.runId}）：${reason}。请重新发布任务以启动新的 Run。`;
  }
  const blockedItem = snapshot.workItems.find(({ status }) =>
    status === 'blocked'
    || status === 'failed'
    || status === 'needs_review'
    || status === 'revision');
  const reason = blockedItem?.attempts.at(-1)?.reason;
  return reason
    ? `任务 ${parentTaskId} 暂未继续推进（Run ${snapshot.runId}）：${reason}。`
    : `任务 ${parentTaskId} 已更新（Run ${snapshot.runId}），当前状态：${snapshot.status}。`;
}

async function appendAndEmit(store: FsEventStore, event: RuntimeEvent): Promise<void> {
  await store.append(event);
  eventEmitter.emit(event);
}

/**
 * Projects a formal Run ledger snapshot back into its Supervisor conversation.
 * HITL and manual retry routes use the same boundary as background execution so
 * the board, conversation and persisted session cannot disagree about terminal state.
 */
export async function synchronizeFormalRunSnapshot(
  snapshot: CollaborationRunSnapshot,
  preferredSessionId?: string,
): Promise<void> {
  await loadPersistedSessions();
  const sessionId = [preferredSessionId, snapshot.binding.parentSessionId]
    .find((candidate): candidate is string => Boolean(candidate && sessions.has(candidate)))
    ?? [...sessions.values()].find(({ formalExecution }) =>
      formalExecution?.runId === snapshot.runId)?.id;
  if (!sessionId) return;
  const session = sessions.get(sessionId);
  if (!session) return;
  let store = eventStores.get(sessionId);
  if (!store) {
    store = new FsEventStore(path.join(
      getDataRoot(),
      'projects',
      session.projectId,
      'collaboration-sessions',
    ));
    eventStores.set(sessionId, store);
  }

  const terminal = snapshot.terminalStatus;
  const stalled = !terminal && snapshot.workItems.some(({ status }) =>
    status === 'needs_review' || status === 'revision' || status === 'blocked');
  const timestamp = new Date().toISOString();
  await appendAndEmit(store, {
    id: `formal-run-${snapshot.runId}-${snapshot.revision}`,
    sessionId,
    seq: 0,
    type: terminal === 'completed' ? 'DAG_COMPLETE' : terminal === 'failed' ? 'DAG_FAIL' : 'CHECKPOINT',
    payload: {
      authority: 'collaboration-workitem-ledger',
      parentTaskId: snapshot.binding.parentTaskId,
      runId: snapshot.runId,
      runStatus: snapshot.status,
      terminalStatus: terminal,
      failureReason: snapshot.failureReason,
      workItems: snapshot.workItems.map((item) => ({
        workItemId: item.id,
        agentId: item.assignedAgentId,
        status: item.status,
        failureStage: workItemFailureStage(item),
        failureReason: item.attempts.at(-1)?.reason,
        outputRefs: item.attempts.at(-1)?.workerReceipt?.outputRefs ?? item.outputRefs,
      })),
    },
    source: 'supervisor',
    timestamp,
  });
  const workerOutputs = (await Promise.all(snapshot.workItems.map(async (item) => {
    const refs = item.attempts.at(-1)?.workerReceipt?.outputRefs ?? item.outputRefs;
    const output = await readContractWorkerOutput(getDataRoot(), refs);
    return output ? { agentId: item.assignedAgentId, output } : undefined;
  }))).filter((item): item is { agentId: string; output: string } => Boolean(item));
  await appendAndEmit(store, {
    id: `formal-run-message-${snapshot.runId}-${snapshot.revision}`,
    sessionId,
    seq: 0,
    type: 'ASSISTANT_MESSAGE',
    payload: {
      content: formalRunStatusMessage(
        snapshot.binding.parentTaskId,
        snapshot,
        workerOutputs,
      ),
      runId: snapshot.runId,
      kind: workerOutputs.length > 0 ? 'formal-run-result' : 'formal-run-status',
    },
    source: 'supervisor',
    timestamp,
  });
  session.status = terminal === 'completed'
    ? 'completed'
    : terminal === 'failed' || terminal === 'canceled'
      ? 'aborted'
      : stalled
        ? 'aborted'
        : 'running';
  session.updatedAt = timestamp;
  await saveProjectSessions(session.projectId);

  if (terminal || stalled) {
    const pendingMessages = takeSessionMessages(sessionId);
    if (pendingMessages.length > 0) {
      updateFormalObjective(
        session,
        buildContinuationGoal(session.globalGoal, pendingMessages),
      );
      await startDag(session, store, sessionId);
    }
  }
}

async function persistFormalBinding(
  session: CollaborationSession,
  receipt: SupervisorWorkItemBindingReceipt,
): Promise<void> {
  session.formalExecution = {
    requestId: receipt.requestId,
    parentTaskId: receipt.parentTaskId,
    parentStepId: receipt.parentStepId,
    ...(receipt.parentSessionId ? { parentSessionId: receipt.parentSessionId } : {}),
    runId: receipt.runId,
  };
  session.updatedAt = new Date().toISOString();
  await saveProjectSessions(session.projectId);
}

async function reportDesignGaps(
  store: FsEventStore,
  session: CollaborationSession,
  sessionId: string,
  gaps: readonly SupervisorWorkItemDesignGap[],
): Promise<void> {
  session.status = 'greeting';
  session.updatedAt = new Date().toISOString();
  await saveProjectSessions(session.projectId);
  await appendAndEmit(store, {
    id: `formal-design-gap-${Date.now()}`,
    sessionId,
    seq: 0,
    type: 'SESSION_ERROR',
    payload: { authority: 'collaboration-workitem-ledger', stage: 'binding', gaps },
    source: 'supervisor',
    timestamp: new Date().toISOString(),
  });
  await appendAndEmit(store, {
    id: `formal-design-gap-message-${Date.now()}`,
    sessionId,
    seq: 0,
    type: 'ASSISTANT_MESSAGE',
    payload: {
      content: `当前任务还不能安全执行：${gaps.map((item) => `${item.message} ${item.remediation}`).join('；')}`,
    },
    source: 'supervisor',
    timestamp: new Date().toISOString(),
  });
}

function workItemFailureStage(item: SupervisorWorkItemBindingReceipt['snapshot']['workItems'][number]): string | undefined {
  const attempt = item.attempts.at(-1);
  if (!attempt?.reason) return undefined;
  if (!attempt.readinessReceipt || attempt.readinessReceipt.status === 'blocked') return 'readiness';
  if (!attempt.workerReceipt) return 'worker';
  if (!attempt.verifierResult) return 'verifier';
  if (!attempt.outcomeReceipt) return 'outcome';
  if (!attempt.evidenceReceipt) return 'evidence';
  return undefined;
}

// abortSession 通过集成层取消正在运行的 DAG
export async function abortSession(id: string): Promise<void> {
  await stopProtocolObserver(id, true);
  await loadPersistedSessions();

  // Messages queued for the active formal Run belong to that Run's context.
  // Once the user aborts it they must not be replayed after a later, unrelated
  // task completes.
  takeSessionMessages(id);

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
