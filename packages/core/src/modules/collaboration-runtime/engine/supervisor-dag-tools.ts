/** Supervisor DAG 协调工具分派：SupervisorDagCtx 定义 + handleSupervisorToolCall 骨架 + 中小 case 实现（dispatch_worker 见 supervisor-dag-dispatch） */

import type { EventStore } from '../../../modules/collaboration-runtime/session/event-store';
import type { CollaborationTopology, RuntimeEvent } from '../../../modules/collaboration-runtime/session/types';
import type { Blackboard, UpstreamResults } from '../../../modules/collaboration-runtime';
import { getGlobalSpawner, type AgentProcess } from '../../../modules/collaboration-runtime/sandbox';
import type { RuntimeLLMConfig } from '../../../lib/integrations/pi-agent/llm-config';
import type { CapabilityMatcher } from './capability-matcher';
import type { ProtocolObserver } from './protocol-observer';
import type { AgentsJsonAgent, MultiAgentExecutorConfig, UpstreamArtifactRef, UpstreamOutput } from './supervisor-dag-types';
import { verifyTaskCompletion, verifierFallbackResult, type VerificationResult } from './supervisor-dag-verifier';
import { hitlResumerRegistry } from './supervisor-dag-hitl';

/** Worker 运行状态 */
export type WorkerStatus = "running" | "completed" | "failed";

/** workerResults 单条记录 */
export interface WorkerResultEntry {
  status: WorkerStatus;
  output: string;
  artifacts: UpstreamArtifactRef[];
  proc?: AgentProcess;
  messages?: Array<{ role: string; content?: unknown }>;
}

/**
 * executeSupervisorDag 闭包环境的显式化（D3）：
 * 原函数全部共享状态为闭包捕获（无 class/this），拆分后经 ctx 首参传递。
 * Map/数组字段持同一引用，原地变更语义不变；不得引入模块级可变全局。
 */
export interface SupervisorDagCtx {
  config: MultiAgentExecutorConfig;
  agents: AgentsJsonAgent[];
  edges: Array<{ from: string; to: string; type: string; description: string }>;
  topology: CollaborationTopology;
  bb: Blackboard;
  protocol: ProtocolObserver;
  eventStore: EventStore;
  eventEmitter?: { emit: (event: RuntimeEvent) => void };
  workerModel: (RuntimeLLMConfig & { id?: string }) | undefined;
  blackboardDir: string;
  attachmentsAbsDir: string;
  supervisorAgentId: string;
  workerTaskIds: Map<string, string>;
  workerResults: Map<string, WorkerResultEntry>;
  upstreamResults: UpstreamResults;
  upstreamOutputs: Map<string, UpstreamOutput>;
  completedAgents: string[];
  failedAgents: string[];
  supervisorEvents: RuntimeEvent[];
  spawner: ReturnType<typeof getGlobalSpawner>;
  workerCompletionCallbacks: Map<string, Array<() => void>>;
  /** escalate_to_human / ask_user_question 的挂起 resolver 写入点（原 pendingHitlResolve 重绑定，仅赋值无读取） */
  setPendingHitlResolve: (fn: ((reply: string) => void) | null) => void;
  recordTaskEvent: (type: RuntimeEvent["type"], payload: Record<string, unknown>, source?: string) => void;
  notifyWorkerCompletion: (workerId: string) => void;
  availableWorkers: () => ReturnType<CapabilityMatcher["match"]>;
  /** dispatch_worker case 主体（supervisor-dag-dispatch），经 ctx 注入保持 dispatch→tools 单向 */
  dispatchWorker: (args: Record<string, unknown>) => Promise<string>;
}

/** 等待指定 Worker 完成（或超时），返回完成/失败/等待分组与下一步提示 */
export async function runWaitWorkers(
  ctx: SupervisorDagCtx,
  args: Record<string, unknown>,
): Promise<string> {
          const workerIds = Array.isArray(args["workerIds"]) ? (args["workerIds"] as string[]) : [];
          const timeoutMs = typeof args["timeoutMs"] === "number" ? args["timeoutMs"] : 300_000;

          if (workerIds.length === 0) {
            return JSON.stringify({ completed: [], failed: [], waiting: [] });
          }

          // 等待所有指定 Worker 完成（或超时）
          const waitPromises = workerIds.map((wId) => {
            const wResult = ctx.workerResults.get(wId);
            if (wResult && (wResult.status === "completed" || wResult.status === "failed")) {
              return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
              const callbacks = ctx.workerCompletionCallbacks.get(wId) ?? [];
              callbacks.push(resolve);
              ctx.workerCompletionCallbacks.set(wId, callbacks);
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
            const wResult = ctx.workerResults.get(wId);
            if (!wResult || wResult.status === "running") {
              resultWaiting.push(wId);
            } else if (wResult.status === "completed") {
              resultCompleted.push({ workerId: wId, output: wResult.output, artifacts: wResult.artifacts });
            } else {
              resultFailed.push(wId);
            }
          }

          // 计算还有多少 Worker 未被派发，提示 Supervisor 继续
          const dispatchedIds = Array.from(ctx.workerResults.keys());
          const remainingWorkers = ctx.agents.filter((a) => !dispatchedIds.includes(a.id)).map((a) => a.id);
          const nextStep = remainingWorkers.length > 0
            ? `还有 ${remainingWorkers.length} 个 Worker 未派发：${remainingWorkers.join(", ")}。必须继续调用 dispatch_worker 派发下一个 Worker。`
            : "所有 Worker 已派发完毕，请输出最终汇总报告并结束任务。";

          return JSON.stringify({ completed: resultCompleted, failed: resultFailed, waiting: resultWaiting, nextStep });
}
/** 取消运行中的 Worker 子进程 */
export async function runCancelWorker(
  ctx: SupervisorDagCtx,
  args: Record<string, unknown>,
): Promise<string> {
          const workerId = String(args["workerId"] ?? "");
          if (workerId) {
            const wResult = ctx.workerResults.get(workerId);
            if (wResult?.proc) {
              try { await ctx.spawner.destroy(workerId); } catch { /* ignore */ }
              wResult.status = "failed";
              ctx.notifyWorkerCompletion(workerId);
            }
          }
          return JSON.stringify({ cancelled: workerId, status: "ok" });
}
/** LLM 验收 Worker 产出（run_verifier），通过则接受任务 */
export async function runVerifier(
  ctx: SupervisorDagCtx,
  args: Record<string, unknown>,
): Promise<string> {
          const workerId = String(args["workerId"] ?? "");
          const criteria = String(args["criteria"] ?? "");

          const wResult = ctx.workerResults.get(workerId);
          if (!wResult || wResult.status !== "completed") {
            return JSON.stringify({ passed: false, reasoning: `Worker ${workerId} is not completed (status: ${wResult?.status ?? "not found"})` });
          }

          // 优先使用 workerResult 中保存的 messages，其次从 ctx.supervisorEvents 中查找
          const messages = wResult.messages
            ?? (ctx.supervisorEvents.filter((e) => e.source === workerId && e.type === "AGENT_END")
              .at(-1)?.payload?.["messages"] as Array<{ role: string; content?: unknown }> | undefined);

          const verifyingTaskId = ctx.workerTaskIds.get(workerId);
          let verification: VerificationResult;
          if (messages && messages.length > 0) {
            verification = await verifyTaskCompletion(criteria || wResult.output, messages, ctx.config.modelFactory);
          } else {
            verification = verifierFallbackResult([wResult.output], wResult.artifacts.map((a) => a.ref), 0);
          }

          const verifiedTaskId = verifyingTaskId;
          if (ctx.protocol.isClosed || ctx.workerTaskIds.get(workerId) !== verifyingTaskId || ctx.workerResults.get(workerId) !== wResult) {
            return JSON.stringify({ passed: false, reason: "STALE_VERIFICATION" });
          }
          if (verification.passed && verifiedTaskId && ctx.bb.getTask(verifiedTaskId)?.status === "reported") {
            ctx.bb.acceptTask(verifiedTaskId);
            ctx.recordTaskEvent("TASK_COMPLETED", { taskId: verifiedTaskId, output: wResult.output });
            if (!ctx.completedAgents.includes(workerId)) ctx.completedAgents.push(workerId);
            ctx.bb.setData(`swarm$tasks$${workerId}`, { taskId: verifiedTaskId, assignedTo: workerId, status: "completed", completedAt: new Date().toISOString() }, "supervisor");
            ctx.protocol.persist();
          }
          return JSON.stringify({ passed: verification.passed, reasoning: verification.reasoning });
}
/** 列出黑板 artifacts */
export function runBbListArtifacts(
  ctx: SupervisorDagCtx,
): string {
          const artifactList = Object.values(ctx.bb.listArtifacts());
          return JSON.stringify({ artifacts: artifactList });
}
/** 按名称读取黑板 artifact */
export function runBbGetArtifact(
  ctx: SupervisorDagCtx,
  args: Record<string, unknown>,
): string {
          const artifactName = String((args as { name?: string })["name"] ?? "");
          const artifact = ctx.bb.getArtifact(artifactName);
          if (!artifact) {
            return JSON.stringify({ error: `Artifact '${artifactName}' not found` });
          } else {
            return JSON.stringify(artifact);
          }
}
/** 恢复阻塞中的 Worker（注入用户回复） */
export async function runResumeWorker(
  ctx: SupervisorDagCtx,
  args: Record<string, unknown>,
): Promise<string> {
          const targetWorkerId = String(args["workerId"] ?? "");
          const answer = String(args["answer"] ?? "");

          if (!targetWorkerId) {
            return JSON.stringify({ error: "workerId is required", candidates: ctx.availableWorkers() });
          }

          const workerProc = ctx.spawner.get(targetWorkerId);
          if (!workerProc) {
            return JSON.stringify({ error: `Worker "${targetWorkerId}" not found or already finished` });
          }

          // 清除直连 channel（Worker 将恢复运行，channel 已不再需要）
          const wRes = ctx.workerResults.get(targetWorkerId);
          if (wRes && ctx.config.sessionId) {
            globalThis.__hitlChannelByWorker?.get(ctx.config.sessionId)?.delete(targetWorkerId);
          }

          try {
            ctx.protocol.start();
            ctx.protocol.worker(targetWorkerId).updateProgress({ currentStep: "resumed" });
            await workerProc.resume(answer);
            const resultJson = JSON.stringify({
              status: "resumed",
              workerId: targetWorkerId,
              nextStep: `Worker "${targetWorkerId}" 已恢复运行。必须立即调用 wait_workers(workerIds=["${targetWorkerId}"]) 等待 Worker 完成。`,
            });
            console.error(`[SupervisorDag] resume_worker: resumed ${targetWorkerId} with answer`);
            return resultJson;
          } catch (resumeErr) {
            return JSON.stringify({ error: (resumeErr as Error).message });
          }
}
/** 升级给人类（escalate_to_human）：发 HITL 事件并挂起等待回复 */
export async function runEscalateToHuman(
  ctx: SupervisorDagCtx,
  args: Record<string, unknown>,
): Promise<string> {
  let resultJson = JSON.stringify({ status: "ok" });
          ctx.protocol.pause();
          const question = String(args["question"] ?? "");
          const mergedContext = args["mergedContext"] as Record<string, unknown> | undefined;

          // Emit HUMAN_REVIEW_REQUEST so the UI shows the HITL input
          const hitlEvent: RuntimeEvent = {
            id: `evt-hitl-${Date.now()}`,
            sessionId: ctx.config.sessionId ?? "supervisor",
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
          void ctx.eventStore.append(hitlEvent);
          ctx.eventEmitter?.emit(hitlEvent);

          // Suspend: hold resolve fn and wait for user reply.
          // hitlResumerRegistry entry will be called by resumeSupervisorHitl in sendMessageToSupervisor.
          await new Promise<void>((resolve) => {
            const hitlResolveFn = (reply: string) => {
              ctx.protocol.start();
              resultJson = JSON.stringify({ userReply: reply });
              resolve();
            };
            ctx.setPendingHitlResolve(hitlResolveFn);
            // Register in module-level registry so service layer can call it
            if (ctx.config.sessionId) {
              hitlResumerRegistry.set(ctx.config.sessionId, hitlResolveFn);
            }
          });
          // resultJson is set by the resolver above — fall through to sendToolResult
  return resultJson;
}
/** 向用户提问（ask_user_question）：发交互问题卡片并挂起等待回复 */
export async function runAskUserQuestion(
  ctx: SupervisorDagCtx,
  args: Record<string, unknown>,
): Promise<string> {
  let resultJson = JSON.stringify({ status: "ok" });
          ctx.protocol.pause();
          const question = String(args["question"] ?? "");
          const options = (args["options"] as Array<{ label: string; description: string }> | undefined) ?? [];
          const multiSelect = Boolean(args["multiSelect"] ?? false);

          // Emit HUMAN_REVIEW_REQUEST so the UI shows the interactive question card
          const askEvent: RuntimeEvent = {
            id: `evt-hitl-ask-${Date.now()}`,
            sessionId: ctx.config.sessionId ?? "supervisor",
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
          void ctx.eventStore.append(askEvent);
          ctx.eventEmitter?.emit(askEvent);

          // Suspend until user selects an option / sends a reply
          await new Promise<void>((resolve) => {
            const hitlResolveFn = (reply: string) => {
              ctx.protocol.start();
              resultJson = JSON.stringify({ userReply: reply });
              resolve();
            };
            ctx.setPendingHitlResolve(hitlResolveFn);
            if (ctx.config.sessionId) {
              hitlResumerRegistry.set(ctx.config.sessionId, hitlResolveFn);
            }
          });
  return resultJson;
}
/** HITL 暂停标记（wait_for_human），返回裸字符串 HITL_PAUSE */
export function runWaitForHuman(
  ctx: SupervisorDagCtx,
): string {
          ctx.protocol.pause();
          return "HITL_PAUSE";
}

/**
 * Supervisor 工具调用分派骨架（原 1238–1890）：try/switch/catch + sendToolResult 尾部逐字。
 * case 体已外移为本文件 runXxx 与 ctx.dispatchWorker；`resultJson` 赋值语义由各 case 的返回值承接。
 */
export async function handleSupervisorToolCall(
  ctx: SupervisorDagCtx,
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<void> {
    if (ctx.protocol.isClosed) return;
    let resultJson: string = JSON.stringify({ status: "ok" });

    try {
      switch (toolName) {
        case "dispatch_worker": {
          resultJson = await ctx.dispatchWorker(args);
          break;
        }
        case "wait_workers": {
          resultJson = await runWaitWorkers(ctx, args);
          break;
        }
        case "cancel_worker": {
          resultJson = await runCancelWorker(ctx, args);
          break;
        }
        case "run_verifier": {
          resultJson = await runVerifier(ctx, args);
          break;
        }
        case "bb_list_artifacts": {
          resultJson = runBbListArtifacts(ctx);
          break;
        }
        case "bb_get_artifact": {
          resultJson = runBbGetArtifact(ctx, args);
          break;
        }
        case "resume_worker": {
          resultJson = await runResumeWorker(ctx, args);
          break;
        }
        case "escalate_to_human": {
          resultJson = await runEscalateToHuman(ctx, args);
          break;
        }
        case "ask_user_question": {
          resultJson = await runAskUserQuestion(ctx, args);
          break;
        }
        case "wait_for_human": {
          resultJson = runWaitForHuman(ctx);
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
    const supervisorProc = ctx.spawner.get(ctx.supervisorAgentId);
    if (supervisorProc) {
      console.error(`[SupervisorDag] sendToolResult: toolName=${toolName}, toolCallId=${toolCallId}, resultLen=${resultJson.length}`);
      supervisorProc.sendToolResult(toolCallId, resultJson);
    } else {
      console.error(`[SupervisorDag] Supervisor process not found, cannot send tool result for ${toolCallId}`);
    }
  }

