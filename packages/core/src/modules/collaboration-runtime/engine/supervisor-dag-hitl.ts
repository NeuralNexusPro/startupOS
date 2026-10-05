/** Supervisor DAG HITL 路由：globalThis 注册表（HMR 安全）+ 直连 Worker channel 恢复 + 事件包装 */

import type { RuntimeEvent } from '../../../modules/collaboration-runtime/session/types';

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

/** Per-session HITL resumer registry — HMR 安全：保存在 globalThis 避免热重载后实例被替换 */
declare global {
  // eslint-disable-next-line no-var
  var __hitlResumerRegistry: Map<string, (userReply: string) => void> | undefined;
}
if (!globalThis.__hitlResumerRegistry) {
  globalThis.__hitlResumerRegistry = new Map();
}
export const hitlResumerRegistry = globalThis.__hitlResumerRegistry;

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
