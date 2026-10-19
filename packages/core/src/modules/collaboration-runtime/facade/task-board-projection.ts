import { promises as fs } from "node:fs";
import path from "node:path";

import { getDataRoot } from "../../../lib/paths";

import { Blackboard } from "../session/blackboard";
import type { BlackboardArtifact, CollaborationSession, RuntimeEvent, TaskItem } from "../session/types";
import { deriveTaskTitle } from "../session/task-title";
import type {
  CollaborationRunSnapshot,
  WorkItemHitlRequest,
  WorkItemStatus,
} from "./contract-execution-types";
import { parseCollaborationArtifactRef } from './artifact-reference';

export type SupervisorTaskBoardStatus = WorkItemStatus | "planned";

export interface SupervisorTaskAcceptance {
  mode: "user" | "role";
  approverRole: string;
  approverName: string;
  requestId: string;
  attemptId: string;
  leaseEpoch: number;
  question: string;
  options: readonly ("approve" | "reject" | "edit")[];
}

export interface SupervisorTaskBoardTask extends Omit<TaskItem, "status" | "failure"> {
  status: SupervisorTaskBoardStatus;
  title: string;
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionGoal?: string;
  sessionStatus?: CollaborationSession["status"];
  agentName?: string;
  source: "supervisor" | "contract";
  runId?: string;
  designNodeId?: string;
  failure?: SupervisorTaskFailure;
  acceptance?: SupervisorTaskAcceptance;
  artifacts: SupervisorTaskArtifact[];
  dataChanges: SupervisorTaskDataChange[];
}

export interface SupervisorTaskFailure {
  stage: "readiness" | "worker" | "verifier" | "outcome" | "evidence" | "unknown";
  code: string;
  reason: string;
  recoveryAction: "retry" | "review" | "resolve_hitl" | "fix_input";
}

export interface SupervisorTaskArtifact {
  kind: "file" | "artifact";
  name: string;
  ref: string;
  operation?: string;
}

export interface SupervisorTaskDataChange {
  operation: string;
  label: string;
  reference?: string;
  details?: Record<string, unknown>;
}

export interface SupervisorTaskBoardProject {
  projectId: string;
  projectName: string;
  projectDescription?: string;
  tasks: SupervisorTaskBoardTask[];
  conversations: SupervisorTaskBoardConversation[];
  sessionCount: number;
  updatedAt?: string;
}

export interface SupervisorTaskBoardConversationEntry {
  id: string;
  sessionId: string;
  role: "user" | "supervisor" | "status";
  actorId: string;
  actorName: string;
  content: string;
  timestamp: string;
  state?: "working" | "completed" | "failed";
}

export interface SupervisorTaskBoardConversation {
  sessionId: string;
  status?: CollaborationSession["status"];
  createdAt?: string;
  updatedAt?: string;
  entries: SupervisorTaskBoardConversationEntry[];
}

export interface SupervisorTaskBoardProjection {
  projects: SupervisorTaskBoardProject[];
  taskCount: number;
  generatedAt: string;
}

interface ProjectMetadata {
  id?: string;
  name?: string;
  description?: string;
}

interface SessionStateFile {
  sessions?: CollaborationSession[];
}

interface ProtocolObservation {
  tasks?: TaskItem[];
}

interface BlackboardFile {
  data?: {
    artifacts?: Record<string, BlackboardArtifact>;
  };
}

interface ContractArtifactEnvelopeProjection {
  schemaVersion?: string;
  content?: string;
}

function formatBusinessValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => `- ${formatBusinessValue(item)}`).join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => `**${key}**：${formatBusinessValue(child)}`)
      .join('\n\n');
  }
  return String(value);
}

function presentContractWorkerContent(content: unknown): string | undefined {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const record = content as Record<string, unknown>;
  if (typeof record['summary'] === 'string' && record['summary'].trim()) {
    return record['summary'].trim();
  }
  const outcome = record['outcome'];
  if (outcome && typeof outcome === 'object' && !Array.isArray(outcome)) {
    const outputs = (outcome as Record<string, unknown>)['outputs'];
    if (Array.isArray(outputs)) {
      const rendered = outputs.flatMap((output) => {
        if (!output || typeof output !== 'object' || Array.isArray(output)) return [];
        const value = (output as Record<string, unknown>)['value'];
        const text = formatBusinessValue(value).trim();
        return text ? [text] : [];
      });
      if (rendered.length) return rendered.join('\n\n---\n\n');
    }
  }
  if (typeof record['result'] === 'string' && record['result'] !== 'success') {
    return record['result'];
  }
  return undefined;
}

async function readContractWorkerOutput(
  dataRoot: string,
  refs: readonly string[],
): Promise<string | undefined> {
  for (const ref of refs) {
    if (!ref.startsWith('artifact://collaboration/')) continue;
    try {
      const raw = await fs.readFile(parseCollaborationArtifactRef(dataRoot, ref), 'utf8');
      const envelope = JSON.parse(raw) as ContractArtifactEnvelopeProjection;
      if (typeof envelope.content !== 'string') continue;
      const presented = presentContractWorkerContent(JSON.parse(envelope.content) as unknown);
      if (presented) return presented;
    } catch {
      // A missing/corrupt internal receipt must not break the complete task-board projection.
    }
  }
  return undefined;
}

interface AgentDisplayEntry {
  id?: string;
  name?: string;
}

interface CollaborationContext {
  agents?: AgentDisplayEntry[];
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    return undefined;
  }
}

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.split("\n").flatMap((line) => {
      const value = line.trim();
      if (!value) return [];
      try { return [JSON.parse(value) as T]; } catch { return []; }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

function isSupervisorSource(source: string): boolean {
  return source === "supervisor" || source.startsWith("supervisor-");
}

function readableAgentName(agentId: string, agentNames: Map<string, string>): string {
  if (isSupervisorSource(agentId)) return "Supervisor";
  return agentNames.get(agentId) ?? agentId;
}

function conversationEntries(
  sessionId: string,
  events: RuntimeEvent[],
  agentNames: Map<string, string>,
): SupervisorTaskBoardConversationEntry[] {
  const dispatchedWorkers = new Set<string>();
  const entries: SupervisorTaskBoardConversationEntry[] = [];
  const append = (event: RuntimeEvent, entry: Omit<SupervisorTaskBoardConversationEntry, "id" | "sessionId" | "timestamp">): void => {
    entries.push({ id: event.id, sessionId, timestamp: event.timestamp, ...entry });
  };

  for (const event of events) {
    if (event.type === "USER_INPUT" && event.source === "user") {
      const content = String(event.payload["message"] ?? "").trim();
      if (content) append(event, { role: "user", actorId: "user", actorName: "我", content });
      continue;
    }
    if (event.type === "SUPERVISOR_AGENT_START") {
      append(event, { role: "status", actorId: "supervisor", actorName: "Supervisor", content: "正在理解请求并组织协作", state: "working" });
      continue;
    }
    if (event.type === "ASSISTANT_MESSAGE" && isSupervisorSource(event.source)) {
      const content = String(event.payload["content"] ?? "").trim();
      if (content && !content.startsWith("你好！我是多 Agent 协作系统")) {
        append(event, { role: "supervisor", actorId: "supervisor", actorName: "Supervisor", content });
      }
      continue;
    }
    if (event.type === "SUPERVISOR_TOOL_CALL" && event.payload["toolName"] === "dispatch_worker") {
      const args = event.payload["args"] && typeof event.payload["args"] === "object"
        ? event.payload["args"] as Record<string, unknown>
        : {};
      const workerId = String(args["workerId"] ?? "").trim();
      if (!workerId) continue;
      dispatchedWorkers.add(workerId);
      const taskTitle = deriveTaskTitle(String(args["specificAction"] ?? ""), typeof args["taskTitle"] === "string" ? args["taskTitle"] : undefined);
      const actorName = readableAgentName(workerId, agentNames);
      append(event, {
        role: "status", actorId: workerId, actorName,
        content: taskTitle ? `正在承接「${taskTitle}」` : "正在承接任务",
        state: "working",
      });
      continue;
    }
    if (event.type === "TASK_ASSIGNED") {
      const workerId = String(event.payload["agentId"] ?? "").trim();
      if (!workerId || dispatchedWorkers.has(workerId)) continue;
      append(event, { role: "status", actorId: workerId, actorName: readableAgentName(workerId, agentNames), content: "正在承接任务", state: "working" });
      continue;
    }
    if (event.type === "SUPERVISOR_WORKER_COMPLETE" || event.type === "SUPERVISOR_WORKER_FAILED") {
      const workerId = String(event.payload["workerId"] ?? event.source ?? "").trim();
      const completed = event.type === "SUPERVISOR_WORKER_COMPLETE";
      append(event, {
        role: "status", actorId: workerId, actorName: readableAgentName(workerId, agentNames),
        content: completed ? "已完成承接任务" : "执行任务时遇到问题",
        state: completed ? "completed" : "failed",
      });
    }
  }
  return entries.slice(-120);
}

function extractAssistantText(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const encoded = record["output"];
  if (typeof encoded !== "string") {
    return value;
  }
  try {
    const parsed = JSON.parse(encoded) as { messages?: Array<{ role?: string; content?: unknown }> };
    const messages = parsed.messages ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "assistant") {
        continue;
      }
      if (typeof message.content === "string") {
        return message.content;
      }
      if (!Array.isArray(message.content)) {
        continue;
      }
      const text = message.content
        .filter((block): block is { type: string; text: string } => Boolean(block)
          && typeof block === "object"
          && (block as Record<string, unknown>)["type"] === "text"
          && typeof (block as Record<string, unknown>)["text"] === "string")
        .map((block) => block.text)
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
  } catch {
    return encoded;
  }
  return value;
}

interface ToolTrace {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function messageText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .flatMap((block) => block && typeof block === "object" && typeof (block as Record<string, unknown>)["text"] === "string"
      ? [(block as Record<string, unknown>)["text"] as string]
      : [])
    .join("\n");
  return text || undefined;
}

const FILE_MUTATIONS = new Set(["write_file", "edit_file", "write_document", "update_document"]);
const DATA_MUTATIONS = new Map<string, string>([
  ["create_instance", "创建业务数据"],
  ["update_instance", "更新业务数据"],
  ["delete_instance", "删除业务数据"],
  ["submit_ontology_action", "提交业务动作"],
  ["execute_ontology_action", "执行业务动作"],
]);

function extractTaskProducts(value: unknown): { artifacts: SupervisorTaskArtifact[]; dataChanges: SupervisorTaskDataChange[] } {
  if (!value || typeof value !== "object") return { artifacts: [], dataChanges: [] };
  const encoded = (value as Record<string, unknown>)["output"];
  if (typeof encoded !== "string") return { artifacts: [], dataChanges: [] };
  const envelope = parseJsonObject(encoded);
  const messages = Array.isArray(envelope?.["messages"]) ? envelope["messages"] : [];
  const calls = new Map<string, ToolTrace>();
  const artifacts = new Map<string, SupervisorTaskArtifact>();
  const dataChanges: SupervisorTaskDataChange[] = [];

  for (const item of messages) {
    if (!item || typeof item !== "object") continue;
    const message = item as Record<string, unknown>;
    if (message["role"] === "assistant" && Array.isArray(message["content"])) {
      for (const rawBlock of message["content"]) {
        if (!rawBlock || typeof rawBlock !== "object") continue;
        const block = rawBlock as Record<string, unknown>;
        if (block["type"] !== "toolCall" || typeof block["id"] !== "string" || typeof block["name"] !== "string") continue;
        calls.set(block["id"], {
          id: block["id"],
          name: block["name"],
          arguments: parseJsonObject(block["arguments"]) ?? {},
        });
      }
      continue;
    }
    if (message["role"] !== "toolResult" || typeof message["toolCallId"] !== "string") continue;
    const call = calls.get(message["toolCallId"]);
    if (!call) continue;
    const result = parseJsonObject(messageText(message["content"]));
    if (!result || result["success"] === false || result["ok"] === false) continue;
    const details = parseJsonObject(result["details"]);
    if (FILE_MUTATIONS.has(call.name)) {
      const rawPath = result["filePath"] ?? details?.["filePath"] ?? call.arguments["filePath"] ?? call.arguments["path"];
      if (typeof rawPath === "string" && rawPath.trim()) {
        const ref = rawPath.trim();
        artifacts.set(ref, { kind: "file", name: path.basename(ref), ref, operation: call.name === "edit_file" ? "更新" : "创建" });
      }
      continue;
    }
    const label = DATA_MUTATIONS.get(call.name);
    if (label) {
      const referenceValue = result["instanceId"] ?? details?.["instanceId"] ?? result["operationId"] ?? details?.["operationId"];
      dataChanges.push({
        operation: call.name,
        label,
        ...(typeof referenceValue === "string" ? { reference: referenceValue } : {}),
        details: call.arguments,
      });
    }
  }
  return { artifacts: [...artifacts.values()], dataChanges };
}

function blackboardTaskArtifacts(file: BlackboardFile | undefined, task: TaskItem): SupervisorTaskArtifact[] {
  return Object.entries(file?.data?.artifacts ?? {}).flatMap(([key, artifact]) => {
    if (artifact.sourceTaskId !== task.id) return [];
    return [{ kind: "artifact" as const, name: artifact.name, ref: artifact.ref ?? key, operation: "产出" }];
  });
}

async function listDirectories(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function pendingAcceptance(
  attempts: CollaborationRunSnapshot["workItems"][number]["attempts"],
  agentNames: Map<string, string>,
): SupervisorTaskAcceptance | undefined {
  const request = [...attempts]
    .reverse()
    .flatMap((attempt) => [...(attempt.hitlRequests ?? [])].reverse())
    .find((candidate): candidate is WorkItemHitlRequest => candidate.status === "pending");
  if (!request) return undefined;
  const userApproval = request.approverRole === "user";
  return {
    mode: userApproval ? "user" : "role",
    approverRole: request.approverRole,
    approverName: userApproval
      ? "用户"
      : agentNames.get(request.approverRole) ?? request.approverRole,
    requestId: request.requestId,
    attemptId: request.attemptId,
    leaseEpoch: request.leaseEpoch,
    question: request.question,
    options: request.options,
  };
}

function contractTaskDescription(
  run: CollaborationRunSnapshot,
  designNodeId: string,
): string {
  return run.contract.semanticContext?.taskTemplates?.find(
    (template) => template.designNodeId === designNodeId,
  )?.objective ?? designNodeId;
}

function workItemFailure(
  item: CollaborationRunSnapshot["workItems"][number],
): SupervisorTaskFailure | undefined {
  const attempt = item.attempts.at(-1);
  if (!attempt?.reason) return undefined;
  const stage = !attempt.readinessReceipt
    ? "readiness"
    : !attempt.workerReceipt
      ? "worker"
      : !attempt.verifierResult
        ? "verifier"
        : !attempt.outcomeReceipt
          ? "outcome"
          : !attempt.evidenceReceipt
            ? "evidence"
            : "unknown";
  return {
    stage,
    code: attempt.reason.split(":", 1)[0] || "WORKITEM_FAILED",
    reason: attempt.reason,
    recoveryAction: item.status === "waiting_hitl"
      ? "resolve_hitl"
      : item.status === "needs_review"
        ? "review"
        : stage === "readiness"
          ? "fix_input"
          : "retry",
  };
}

function legacyTaskFailure(
  failure: TaskItem["failure"],
): SupervisorTaskFailure | undefined {
  if (!failure) return undefined;
  const knownStages = new Set<SupervisorTaskFailure["stage"]>([
    "readiness",
    "worker",
    "verifier",
    "outcome",
    "evidence",
  ]);
  const stage = knownStages.has(failure.stage as SupervisorTaskFailure["stage"])
    ? failure.stage as SupervisorTaskFailure["stage"]
    : "unknown";
  return {
    stage,
    code: failure.code ?? "LEGACY_TASK_FAILED",
    reason: failure.reason,
    recoveryAction: stage === "readiness" ? "fix_input" : "retry",
  };
}

async function contractRunTasks(
  dataRoot: string,
  projectDirectory: string,
  projectId: string,
  projectName: string,
  agentNames: Map<string, string>,
  collaborationSessionByRunId: ReadonlyMap<string, CollaborationSession>,
): Promise<SupervisorTaskBoardTask[]> {
  const runsDirectory = path.join(projectDirectory, "collaboration-runs");
  const files = await listJsonFiles(runsDirectory);
  const runs = await Promise.all(files.map((file) =>
    readJson<CollaborationRunSnapshot>(path.join(runsDirectory, file))
  ));
  const projectedRuns = await Promise.all(runs.map(async (run) => {
    if (!run || run.projectId !== projectId || !Array.isArray(run.workItems)) {
      return [];
    }
    const visibleItems = run.terminalStatus
      ? run.workItems.filter((item) => item.attempts.length > 0 || item.status === "completed")
      : run.workItems;
    const completedIds = new Set(
      run.workItems.filter(({ status }) => status === "completed").map(({ id }) => id),
    );
    return Promise.all(visibleItems.map(async (item: CollaborationRunSnapshot["workItems"][number]): Promise<SupervisorTaskBoardTask> => {
      const collaborationSession = collaborationSessionByRunId.get(run.runId);
      const attempt = item.attempts.at(-1);
      const description = contractTaskDescription(run, item.designNodeId);
      const output = attempt?.workerReceipt
        ? await readContractWorkerOutput(dataRoot, attempt.workerReceipt.outputRefs)
        : undefined;
      const acceptance = item.status === "waiting_hitl"
        ? pendingAcceptance(item.attempts, agentNames)
        : undefined;
      const failure = workItemFailure(item);
      return {
        id: item.id,
        title: deriveTaskTitle(description),
        description,
        status: item.status === "pending"
          && item.dependsOn.some((dependencyId) => !completedIds.has(dependencyId))
          ? "planned"
          : item.status,
        assignedTo: item.assignedAgentId,
        dependsOn: [...item.dependsOn],
        input: { refs: [...item.inputRefs] },
        output: output ?? (attempt?.workerReceipt
          ? `Agent 已完成执行${attempt.verifierResult?.status === 'passed' ? '，并通过验证' : ''}。`
          : undefined),
        createdAt: item.attempts[0]?.createdAt ?? run.createdAt,
        ...(item.status === "completed" && attempt?.updatedAt
          ? { completedAt: attempt.updatedAt }
          : {}),
        projectId,
        projectName,
        sessionId: collaborationSession?.id
          ?? run.binding.parentSessionId
          ?? run.runId,
        sessionGoal: collaborationSession?.globalGoal ?? description,
        ...(collaborationSession?.status
          ? { sessionStatus: collaborationSession.status }
          : {}),
        agentName: agentNames.get(item.assignedAgentId)
          ?? item.assignedAgentId,
        source: "contract",
        runId: run.runId,
        designNodeId: item.designNodeId,
        ...(failure ? { failure } : {}),
        ...(acceptance ? { acceptance } : {}),
        // outputRefs are runtime receipt envelopes, not files created for the user.
        artifacts: [],
        dataChanges: [],
      };
    }));
  }));
  return projectedRuns.flat();
}

async function projectTaskGroup(dataRoot: string, projectId: string): Promise<SupervisorTaskBoardProject | null> {
  const projectDirectory = path.join(dataRoot, "projects", projectId);
  const sessionsDirectory = path.join(projectDirectory, "collaboration-sessions");
  const [metadata, state, context, sessionIds] = await Promise.all([
    readJson<ProjectMetadata>(path.join(projectDirectory, "project.json")),
    readJson<SessionStateFile>(path.join(sessionsDirectory, "collaboration-sessions.state.json")),
    readJson<CollaborationContext>(path.join(projectDirectory, "project-collaboration-context.json")),
    listDirectories(sessionsDirectory),
  ]);
  const projectName = metadata?.name?.trim() || projectId;
  const sessions = new Map((state?.sessions ?? []).map((session) => [session.id, session]));
  const collaborationSessionByRunId = new Map(
    [...sessions.values()].flatMap((session) => session.formalExecution?.runId
      ? [[session.formalExecution.runId, session] as const]
      : []),
  );
  const agentNames = new Map((context?.agents ?? [])
    .filter((agent): agent is Required<Pick<AgentDisplayEntry, "id" | "name">> => Boolean(agent.id && agent.name))
    .map((agent) => [agent.id, agent.name]));

  const formalTasks = await contractRunTasks(
    dataRoot,
    projectDirectory,
    projectId,
    projectName,
    agentNames,
    collaborationSessionByRunId,
  );

  const sessionProjections = await Promise.all(sessionIds.map(async (sessionId) => {
    const sessionDirectory = path.join(sessionsDirectory, sessionId);
    const [observation, blackboard, events] = await Promise.all([
      readJson<ProtocolObservation>(path.join(sessionsDirectory, sessionId, "protocol-observation.json")),
      readJson<BlackboardFile>(path.join(sessionsDirectory, sessionId, "blackboard.json")),
      readJsonLines<RuntimeEvent>(path.join(sessionDirectory, "events.jsonl")),
    ]);
    const session = sessions.get(sessionId);
    const tasksById = new Map((observation?.tasks ?? []).map((task) => [task.id, task]));
    const historicalTasks = new Blackboard(sessionId, sessionDirectory).fromEvents(events).getTasks();
    for (const historicalTask of historicalTasks) {
      const snapshotTask = tasksById.get(historicalTask.id);
      tasksById.set(historicalTask.id, snapshotTask
        ? { ...snapshotTask, ...historicalTask }
        : historicalTask);
    }
    // 新运行的任务状态只来自正式 WorkItem 账本。旧 Blackboard 数据仍保留
    // 在磁盘和事件会话中，但同一会话已有正式绑定时不再投影为第二套任务。
    const legacyTasks = session?.formalExecution?.runId
      ? []
      : [...tasksById.values()];
    const tasks = legacyTasks.map((task): SupervisorTaskBoardTask => {
      const { failure: legacyFailure, ...taskProjection } = task;
      const products = extractTaskProducts(task.output);
      const failure = legacyTaskFailure(legacyFailure);
      const artifacts = [...products.artifacts, ...blackboardTaskArtifacts(blackboard, task)]
        .filter((artifact, index, all) => all.findIndex((candidate) => candidate.ref === artifact.ref) === index);
      return {
        ...taskProjection,
        title: deriveTaskTitle(task.description, task.title),
        input: task.input ?? { request: task.description },
        output: extractAssistantText(task.output),
        artifacts,
        dataChanges: products.dataChanges,
        projectId,
        projectName,
        sessionId,
        source: "supervisor",
        ...(failure ? { failure } : {}),
        ...(session?.globalGoal ? { sessionGoal: session.globalGoal } : {}),
        ...(session?.status ? { sessionStatus: session.status } : {}),
        ...(task.assignedTo && agentNames.has(task.assignedTo)
          ? { agentName: agentNames.get(task.assignedTo) }
          : {}),
      };
    });
    const entries = conversationEntries(sessionId, events, agentNames);
    return {
      tasks,
      conversation: entries.length > 0 ? {
        sessionId,
        ...(session?.status ? { status: session.status } : {}),
        ...(session?.createdAt ? { createdAt: session.createdAt } : {}),
        updatedAt: entries.at(-1)?.timestamp ?? session?.updatedAt,
        entries,
      } satisfies SupervisorTaskBoardConversation : undefined,
    };
  }));
  const tasks = [
    ...sessionProjections.flatMap((item) => item.tasks),
    ...formalTasks,
  ].sort((left, right) => {
    const leftTime = left.completedAt ?? left.createdAt;
    const rightTime = right.completedAt ?? right.createdAt;
    return rightTime.localeCompare(leftTime);
  });
  const conversations = sessionProjections
    .flatMap((item) => item.conversation ? [item.conversation] : [])
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  if (tasks.length === 0 && conversations.length === 0) {
    return null;
  }
  return {
    projectId,
    projectName,
    ...(metadata?.description ? { projectDescription: metadata.description } : {}),
    tasks,
    conversations,
    sessionCount: new Set([...tasks.map((task) => task.sessionId), ...conversations.map((item) => item.sessionId)]).size,
    updatedAt: conversations[0]?.updatedAt ?? tasks[0]?.completedAt ?? tasks[0]?.createdAt,
  };
}

/** Read-only projection for the global or project-scoped Supervisor task board. */
export async function readSupervisorTaskBoard(
  dataRoot = getDataRoot(),
  projectId?: string,
): Promise<SupervisorTaskBoardProjection> {
  const availableProjectIds = await listDirectories(path.join(dataRoot, "projects"));
  const projectIds = projectId && availableProjectIds.includes(projectId)
    ? [projectId]
    : projectId
      ? []
      : availableProjectIds;
  const groups = await Promise.all(projectIds.map((projectId) => projectTaskGroup(dataRoot, projectId)));
  const projects = groups
    .filter((group): group is SupervisorTaskBoardProject => group !== null)
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  return {
    projects,
    taskCount: projects.reduce((total, project) => total + project.tasks.length, 0),
    generatedAt: new Date().toISOString(),
  };
}
