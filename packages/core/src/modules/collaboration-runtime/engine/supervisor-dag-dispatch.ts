/** Supervisor DAG dispatch_worker 工具实现：Worker 子进程派发、事件捕获、任务 prompt 构建 */

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getDataRoot } from '../../../lib/paths';
import { Blackboard } from '../../../modules/collaboration-runtime';
import { DependencyChecker } from './dependency-checker';
import { executeChannelOfficeCapabilityProxy } from '../../../lib/integrations/pi-agent/channel-office-capabilities';
import type { AgentProcess } from '../../../modules/collaboration-runtime/sandbox';
import type { CollaborationTopology, RuntimeEvent } from '../../../modules/collaboration-runtime/session/types';
import type { AgentsJsonAgent, UpstreamOutput } from './supervisor-dag-types';
import { logRuntime, summarizeRuntimeConfig } from './supervisor-dag-types';
import type { SupervisorDagCtx } from './supervisor-dag-tools';
import { hitlResumerRegistry as hitlResumerRegistryFromHitl } from './supervisor-dag-hitl';

/**
 * dispatch_worker case 主体（SUPA-02 glue）：派发 Worker 子进程。
 * D3 变换：闭包捕获状态经 ctx 注入；`resultJson = X; break;` → `return X;`；
 * 裸 `break;`（protocol.isClosed 守卫，resultJson 仍为初始值）→ `return JSON.stringify({ status: "ok" });`。
 */
export async function runDispatchWorker(
  ctx: SupervisorDagCtx,
  args: Record<string, unknown>,
): Promise<string> {
          const workerId = String(args["workerId"] ?? "");
          const specificAction = String(args["specificAction"] ?? ctx.config.globalGoal);
          const acceptanceCriteria = String(args["acceptanceCriteria"] ?? "完成任务");

          if (!workerId) {
            return JSON.stringify({ error: "workerId is required", candidates: ctx.availableWorkers() });
          }

          const agent = ctx.agents.find((a) => a.id === workerId);
          if (!agent) {
            return JSON.stringify({ error: `Agent ${workerId} not found in manifest` });
          }

          // 已有运行中的 Worker，不重复 spawn
          if (ctx.workerResults.has(workerId) && ctx.workerResults.get(workerId)?.status === "running") {
            return JSON.stringify({ dispatchId: workerId, status: "already_running", candidates: ctx.availableWorkers(), nextStep: `必须立即调用 wait_workers(workerIds=["${workerId}"]) 等待 Worker 完成。` });
          }

          const checker = new DependencyChecker(ctx.bb);
          const dependencies = checker.deriveDependenciesFromTopology(workerId, ctx.topology);
          const readiness = checker.checkDependencies(dependencies);
          if (!readiness.satisfied) {
            ctx.protocol.worker(workerId).reportBlock("dependencies", readiness.missingDeps.map((dep) => dep.agentId), readiness.blockedReason);
            ctx.protocol.persist();
            return JSON.stringify({ status: "blocked", reason: readiness.blockedReason });
          }
          const task = ctx.bb.createTask(specificAction);
          ctx.recordTaskEvent("TASK_CREATED", { task: { ...task } });
          ctx.bb.assignTask(task.id, workerId);
          ctx.recordTaskEvent("TASK_ASSIGNED", { taskId: task.id, agentId: workerId });
          ctx.bb.startTask(task.id);
          ctx.recordTaskEvent("TASK_STARTED", { taskId: task.id }, workerId);
          ctx.workerTaskIds.set(workerId, task.id);
          ctx.protocol.worker(workerId).startTask(task.id, ctx.config.timeoutMs ?? 300_000, dependencies.map((dep) => dep.agentId));

          // P2: 写入 swarm$tasks$<workerId> 到 Blackboard（pending 状态）
          ctx.bb.setData(`swarm$tasks$${workerId}`, {
            taskId: workerId,
            status: "pending",
            assignedTo: workerId,
            goal: specificAction,
            acceptanceCriteria,
            createdAt: new Date().toISOString(),
          }, "supervisor", {
            sourceUri: `supervisor:dispatch:${ctx.config.sessionId ?? "supervisor"}`,
          });
          ctx.protocol.persist();

          // 派发 Worker 子进程 - Worker 不能直接 ask_user_question 或编辑本体 schema
          // 显式过滤掉不允许的工具
          const forbiddenTools = ["ask_user_question", "create_domain", "create_concept", "update_concept", "delete_concept", "update_domain", "delete_domain"];
          const workerSkills = (agent.skills ?? []).filter((skill: string) => !forbiddenTools.includes(skill));

          const workingDirectory = path.join(getDataRoot(), "projects", ctx.config.projectId, "agents", workerId);
          await mkdir(workingDirectory, { recursive: true });

          // 写入 Worker 的协作上下文
          const workerCtxPath = path.join(workingDirectory, "project-collaboration-context.json");
          const workerCtx = {
            // 包含业务项目 ID，用于区分 OriginOS 业务项目和本体中的"项目"概念
            originosProjectId: ctx.config.projectId,
            ontologyId: `ontology-${ctx.config.projectId}`,
            projectId: ctx.config.projectId,
            agentId: workerId,
            agents: ctx.agents.map((a) => ({ id: a.id, name: a.name, responsibility: a.responsibility })),
            topology: { edges: ctx.edges.map((e) => ({ from: e.from, to: e.to, type: e.type })) },
            globalGoal: ctx.config.globalGoal,
            allowedTools: workerSkills,  // 使用过滤后的工具列表
          };
          await writeFile(workerCtxPath, JSON.stringify(workerCtx, null, 2), "utf-8");

          const workerEvents: RuntimeEvent[] = [];
          const captureWorkerEvent = (ev: RuntimeEvent): void => {
            if (ctx.protocol.isClosed || ctx.workerTaskIds.get(workerId) !== task.id) return;
            if (ev.type === "HOST_TOOL_CALL" && ev.source === workerId) {
              const toolCallId = typeof ev.payload?.["toolCallId"] === "string" ? ev.payload["toolCallId"] : "";
              const toolName = typeof ev.payload?.["toolName"] === "string" ? ev.payload["toolName"] : "";
              const workerProc = ctx.spawner.get(workerId);
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
              ctx.protocol.worker(workerId).reportBlock("human-input", []);
              ctx.protocol.pause();
              // 直连路径：bridge 直接 emit HUMAN_REVIEW_REQUEST，不依赖 Supervisor LLM 中转
              workerEvents.push(ev);
              void ctx.eventStore.append(ev);

              const question = String(ev.payload?.["question"] ?? "");
              const options = ev.payload?.["options"] as Array<{ label: string; description: string }> | undefined;
              const multiSelect = Boolean(ev.payload?.["multiSelect"] ?? false);
              const onBehalfOfName = String(ev.payload?.["onBehalfOfName"] ?? ev.payload?.["agentName"] ?? workerId);

              // 1. 直接 emit HUMAN_REVIEW_REQUEST（前端立即显示 HITL 输入框）
              const directHitlEvent: RuntimeEvent = {
                id: `evt-hitl-direct-${workerId}-${Date.now()}`,
                sessionId: ctx.config.sessionId ?? "supervisor",
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
              void ctx.eventStore.append(directHitlEvent);
              ctx.eventEmitter?.emit(directHitlEvent);

              // 2. 注册直连 resume channel（用户回复后直接 resume worker 子进程）
              const workerProc = ctx.spawner.get(workerId);
              if (ctx.config.sessionId && workerProc) {
                if (!globalThis.__hitlChannelByWorker) {
                  globalThis.__hitlChannelByWorker = new Map();
                }
                const sessionChannels = globalThis.__hitlChannelByWorker.get(ctx.config.sessionId) ?? new Map();
                sessionChannels.set(workerId, {
                  resume: (reply: string) => { ctx.protocol.start(); ctx.protocol.worker(workerId).updateProgress({ currentStep: "resumed" }); return workerProc.resume(reply); },
                  question,
                  onBehalfOfName,
                });
                globalThis.__hitlChannelByWorker.set(ctx.config.sessionId, sessionChannels);

                // 同时注册到 hitlResumerRegistryFromHitl 作为 fallback
                hitlResumerRegistryFromHitl.set(ctx.config.sessionId, (reply: string) => {
                  ctx.protocol.start();
                  ctx.protocol.worker(workerId).updateProgress({ currentStep: "resumed" });
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
              ctx.protocol.worker(workerId).reportBlock("human-input", []);
              ctx.protocol.pause();
              // 旧路径兜底（Worker 直接发 HUMAN_REVIEW_REQUEST，不经过 Supervisor）
              workerEvents.push(ev);
              void ctx.eventStore.append(ev);
              ctx.eventEmitter?.emit(ev);

              if (ctx.config.sessionId) {
                const existingResumer = hitlResumerRegistryFromHitl.get(ctx.config.sessionId);
                hitlResumerRegistryFromHitl.set(ctx.config.sessionId, (reply: string) => {
                  ctx.protocol.start();
                  const workerProc = ctx.spawner.get(workerId);
                  if (workerProc) {
                    ctx.protocol.worker(workerId).updateProgress({ currentStep: "resumed" });
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
            void ctx.eventStore.append(ev);
            ctx.eventEmitter?.emit(ev);

            if (ev.type === "AGENT_END" && ev.source === workerId) {
              // 只处理一次：已经标记为 completed 则跳过重复的 AGENT_END
              const workerResult = ctx.workerResults.get(workerId);
              if (workerResult?.status === "completed" || workerResult?.status === "failed") {
                return;
              }

              const taskId = ctx.workerTaskIds.get(workerId);
              if (taskId) {
                ctx.bb.reportTask(taskId, { output: extractAgentOutputFromEvents(workerEvents) });
                ctx.recordTaskEvent("TASK_REPORTED", { taskId, output: extractAgentOutputFromEvents(workerEvents) }, workerId);
              }
              ctx.protocol.worker(workerId).completeTask({ files: [] });
              ctx.protocol.persist();
              // Worker 返回只表示 reported；由 run_verifier 接纳完成。
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
              ctx.upstreamOutputs.set(workerId, { text: output, artifacts: [] });


              // P0+P2: 写入 Blackboard upstream 产出（Event Sourcing）+ 更新 task status
              const agent = ctx.agents.find((a) => a.id === workerId);
              ctx.upstreamResults.writeUpstreamOutput(workerId, agent?.name ?? workerId, output);
              ctx.bb.setData(`swarm$tasks$${workerId}`, {
                taskId: workerId,
                status: "reported",
                assignedTo: workerId,
                completedAt: new Date().toISOString(),
                outputKey: `upstream$${workerId}$output`,
              }, workerId, {
                sourceUri: `worker:complete:${ctx.config.sessionId ?? "supervisor"}`,
              });
              ctx.protocol.persist();

              // 从 Blackboard 读取 artifacts，更新 ctx.workerResults 和 ctx.upstreamOutputs
              void (async () => {
                const snap = await Blackboard.loadSnapshot(ctx.config.sessionId ?? "supervisor", ctx.blackboardDir);
                if (ctx.protocol.isClosed || ctx.workerResults.get(workerId) !== workerResult) return;
                if (snap) {
                  const wResult = ctx.workerResults.get(workerId);
                  if (wResult) {
                    const allArtifactsMap = snap.listArtifacts();
                    const allArtifactsArr = Object.values(allArtifactsMap);
                    wResult.artifacts = allArtifactsArr
                      .filter((a) => a.producer === workerId)
                      .map((a) => ({ name: a.name, ref: a.ref ?? `artifact://${ctx.config.sessionId ?? "supervisor"}/${a.name}`, writer: a.producer }));
                    // 同步更新 ctx.upstreamOutputs artifacts（供 wait_workers 返回）
                    const upstream = ctx.upstreamOutputs.get(workerId);
                    if (upstream) {
                      upstream.artifacts = wResult.artifacts;
                    }
                  }
                }
                if (taskId && ctx.workerTaskIds.get(workerId) === taskId) {
                  ctx.protocol.worker(workerId).updateReportedDeliverables(taskId, ctx.workerResults.get(workerId)?.artifacts.map(artifact => artifact.ref) ?? []);
                  ctx.protocol.persist();
                }
                ctx.notifyWorkerCompletion(workerId);

                const completeEvent: RuntimeEvent = {
                  id: `sup-worker-complete-${workerId}-${Date.now()}`,
                  sessionId: ctx.config.sessionId ?? "supervisor",
                  seq: 0,
                  type: "SUPERVISOR_WORKER_COMPLETE",
                  payload: { workerId, output },
                  source: "supervisor",
                  timestamp: new Date().toISOString(),
                };
                void ctx.eventStore.append(completeEvent);
                ctx.eventEmitter?.emit(completeEvent);
              })();
            } else if (ev.type === "AGENT_FAIL_TASK" && ev.source === workerId) {
              const workerResult = ctx.workerResults.get(workerId);
              if (workerResult) {
                workerResult.status = "failed";
              }
              const failedTaskId = ctx.workerTaskIds.get(workerId);
              if (failedTaskId) ctx.bb.failTask(failedTaskId);
              ctx.protocol.worker(workerId).failTask("WORKER_FAILED");
              ctx.protocol.persist();
              ctx.failedAgents.push(workerId);

              // P2: 更新 Blackboard task status = failed
              ctx.bb.setData(`swarm$tasks$${workerId}`, {
                taskId: workerId,
                status: "failed",
                failedAt: new Date().toISOString(),
              }, workerId, {
                sourceUri: `worker:fail:${ctx.config.sessionId ?? "supervisor"}`,
              });
              ctx.protocol.persist();

              ctx.notifyWorkerCompletion(workerId);

              const failEvent: RuntimeEvent = {
                id: `sup-worker-failed-${workerId}-${Date.now()}`,
                sessionId: ctx.config.sessionId ?? "supervisor",
                seq: 0,
                type: "SUPERVISOR_WORKER_FAILED",
                payload: { workerId, error: ev.payload?.["error"] ?? "Unknown error" },
                source: "supervisor",
                timestamp: new Date().toISOString(),
              };
              void ctx.eventStore.append(failEvent);
              ctx.eventEmitter?.emit(failEvent);
            }
          };

          let proc: AgentProcess;
          try {
            const workerSpawnAt = Date.now();
            logRuntime("worker.spawn.start", {
              projectId: ctx.config.projectId,
              sessionId: ctx.config.sessionId ?? "default",
              workerId,
              workingDirectory,
              model: summarizeRuntimeConfig(ctx.workerModel),
            });
            if (ctx.protocol.isClosed) return JSON.stringify({ status: "ok" });
            proc = await ctx.spawner.spawn(
              {
                projectId: ctx.config.projectId,
                agentId: workerId,
                workingDirectory,
                agentType: "originos",
                collaborationSessionId: ctx.config.sessionId,
                blackboardDir: ctx.blackboardDir,
                model: ctx.workerModel,
              },
              captureWorkerEvent,
            );
            logRuntime("worker.spawn.ready", {
              projectId: ctx.config.projectId,
              sessionId: ctx.config.sessionId ?? "default",
              workerId,
              elapsedMs: Date.now() - workerSpawnAt,
            });

            if (ctx.protocol.isClosed) { await ctx.spawner.destroy(workerId); return JSON.stringify({ status: "ok" }); }
            ctx.workerResults.set(workerId, { status: "running", output: "", artifacts: [], proc });

            // 非阻塞地执行 Worker prompt（不等待完成）
            const prompt = buildWorkerPrompt(agent, specificAction, acceptanceCriteria, ctx.upstreamOutputs, ctx.topology, ctx.agents, ctx.attachmentsAbsDir);
            logRuntime("worker.prompt.dispatch", {
              projectId: ctx.config.projectId,
              sessionId: ctx.config.sessionId ?? "default",
              workerId,
              promptChars: prompt.length,
            });
            proc.prompt(prompt).catch((err) => {
              if (ctx.protocol.isClosed) return;
              console.error(`[SupervisorDag] Worker ${workerId} prompt error:`, err);
              logRuntime("worker.prompt.error", {
                projectId: ctx.config.projectId,
                sessionId: ctx.config.sessionId ?? "default",
                workerId,
                error: err instanceof Error ? err.message : String(err),
              });
              const wResult = ctx.workerResults.get(workerId);
              if (wResult && wResult.status === "running") {
                wResult.status = "failed";
                const failedTaskId = ctx.workerTaskIds.get(workerId);
                if (failedTaskId) ctx.bb.failTask(failedTaskId);
                ctx.protocol.worker(workerId).failTask("WORKER_FAILED");
                ctx.protocol.persist();
                ctx.failedAgents.push(workerId);
                ctx.notifyWorkerCompletion(workerId);
              }
            });

            return JSON.stringify({ dispatchId: workerId, status: "dispatched", candidates: ctx.availableWorkers(), nextStep: `必须立即调用 wait_workers(workerIds=["${workerId}"]) 等待 Worker 完成，不允许在等待前结束任务。` });
          } catch (spawnErr) {
            ctx.protocol.worker(workerId).failTask("SPAWN_FAILED");
            const taskId = ctx.workerTaskIds.get(workerId);
            if (taskId) ctx.bb.failTask(taskId, "SPAWN_FAILED");
            ctx.protocol.persist();
            console.error(`[SupervisorDag] Failed to spawn worker ${workerId}:`, spawnErr);
            logRuntime("worker.spawn.error", {
              projectId: ctx.config.projectId,
              sessionId: ctx.config.sessionId ?? "default",
              workerId,
              error: spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
            });
            ctx.workerResults.set(workerId, { status: "failed", output: "", artifacts: [] });
            ctx.failedAgents.push(workerId);
            return JSON.stringify({ error: `Failed to spawn worker: ${(spawnErr as Error).message}` });
          }
}

/** 为 Worker Agent 构建任务 prompt（Supervisor 下发的具体指令） */
export function buildWorkerPrompt(
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
export function extractAgentOutputFromEvents(agentEvents: RuntimeEvent[]): string {
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
