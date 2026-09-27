/**
 * Blackboard — shared state for multi-agent collaboration.
 *
 * Event Sourcing: state is rebuilt from the event stream; all mutations
 * can optionally emit RuntimeEvents for auditability.
 */

import fs from "fs/promises";
import { parseMemoryKey } from "./memory-keys";
import path from "path";
import type {
  RuntimeEvent,
  ACLMessage,
  TaskItem,
  TaskState,
  BlackboardLock,
  BlackboardMessage,
  BlackboardArtifact,
  BlackboardEntry,
  BlackboardProvenance,
  BlackboardCorrection,
} from "./types";

export interface BlackboardState {
  sessionId: string;
  sharedData: Record<string, BlackboardEntry>;
  messages: BlackboardMessage[];
  tasks: TaskItem[];
  artifacts: Record<string, BlackboardArtifact>;
  locks: Record<string, BlackboardLock>;
}

interface DataFile<T = unknown> {
  version: string;
  createdAt: string;
  updatedAt: string;
  data: T;
}

const DEFAULT_LOCK_TTL_MS = 30_000;

export class Blackboard {
  readonly sessionId: string;
  private sharedData: Record<string, BlackboardEntry> = {};
  private messages: BlackboardMessage[] = [];
  private tasks: TaskItem[] = [];
  private artifacts: Record<string, BlackboardArtifact> = {};
  private locks: Record<string, BlackboardLock> = {};
  private registeredAgents: Set<string> = new Set();
  private msgSeq = 0;
  private snapshotDir: string;

  constructor(sessionId: string, snapshotDir: string) {
    this.sessionId = sessionId;
    this.snapshotDir = snapshotDir;
  }

  /** Derived from sharedData on demand, including after snapshot restoration. */
  get memoryIndex(): Record<string, Record<string, string[]>> {
    const index: Record<string, Record<string, string[]>> = Object.create(null);
    for (const key of Object.keys(this.sharedData)) {
      const parsed = parseMemoryKey(key);
      if (!parsed?.role || !parsed.category) continue;
      const categories = index[parsed.role] ??= Object.create(null);
      (categories[parsed.category] ??= []).push(key);
    }
    return index;
  }

  reportTask(taskId: string, output: unknown): void {
    const task = this.findTask(taskId);
    if (!task || task.status !== "running") throw new Error("Task is not running");
    task.status = "reported";
    task.output = output;
  }

  acceptTask(taskId: string): void {
    const task = this.findTask(taskId);
    if (!task || task.status !== "reported") throw new Error("Task is not reported");
    task.status = "completed";
    task.completedAt = new Date().toISOString();
  }

  // ==========================================================================
  // Event Sourcing (§3.3)
  // ==========================================================================

  fromEvents(events: RuntimeEvent[]): Blackboard {
    for (const event of events) {
      this.applyEvent(event);
    }
    return this as unknown as Blackboard;
  }

  private applyEvent(event: RuntimeEvent): void {
    switch (event.type) {
      case "AGENT_REGISTERED":
        this.registeredAgents.add(event.source);
        break;
      case "AGENT_UNREGISTERED":
        this.registeredAgents.delete(event.source);
        break;

      case "BLACKBOARD_WRITE": {
        const key = event.payload["key"] as string;
        const value = event.payload["value"];
        if (key && value !== undefined) {
          const existing = this.sharedData[key];
          const nextVersion = existing ? existing.provenance.version + 1 : 1;
          this.sharedData[key] = this.makeEntry(value, event.source, event.timestamp, event.payload, nextVersion);
        }
        break;
      }

      case "BLACKBOARD_UPDATE": {
        const key = event.payload["key"] as string;
        const value = event.payload["value"];
        if (key && value !== undefined) {
          const existing = this.sharedData[key];
          const nextVersion = existing ? existing.provenance.version + 1 : 1;
          this.sharedData[key] = this.makeEntry(value, event.source, event.timestamp, event.payload, nextVersion);
        }
        break;
      }

      case "BLACKBOARD_LOCK": {
        const key = event.payload["key"] as string;
        if (key) {
          this.locks[key] = {
            holder: event.source,
            expiresAt:
              (event.payload["expiresAt"] as string) ??
              new Date(Date.now() + DEFAULT_LOCK_TTL_MS).toISOString(),
          };
        }
        break;
      }

      case "BLACKBOARD_RELEASE": {
        const key = event.payload["key"] as string;
        if (key) {
          delete this.locks[key];
        }
        break;
      }

      case "TASK_CREATED": {
        const task = event.payload["task"] as TaskItem;
        if (task) {
          this.tasks.push(task);
        }
        break;
      }

      case "TASK_ASSIGNED": {
        const taskId = event.payload["taskId"] as string;
        const task = this.tasks.find((t) => t.id === taskId);
        if (task) {
          task.assignedTo = event.payload["agentId"] as string;
          task.status = "assigned";
        }
        break;
      }

      case "TASK_STARTED": {
        const taskId = event.payload["taskId"] as string;
        const task = this.tasks.find((t) => t.id === taskId);
        if (task) task.status = "running";
        break;
      }

      case "TASK_REPORTED": {
        const task = this.tasks.find(item => item.id === event.payload["taskId"]);
        if (task) { task.status = "reported"; task.output = event.payload["output"]; }
        break;
      }

      case "TASK_COMPLETED": {
        const taskId = event.payload["taskId"] as string;
        const task = this.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = "completed";
          task.output = event.payload["output"];
          task.completedAt = event.timestamp;
        }
        break;
      }

      case "TASK_FAILED": {
        const taskId = event.payload["taskId"] as string;
        const task = this.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = "failed";
          task.completedAt = event.timestamp;
        }
        break;
      }

      case "AGENT_MESSAGE":
      case "AGENT_REQUEST":
      case "AGENT_RESPONSE":
      case "AGENT_DELEGATE":
        this.messages.push({
          id: event.id,
          from: event.source,
          to: event.target ?? "*",
          type: this.mapEventTypeToMessageType(event.type),
          content: event.payload,
          seq: event.seq,
          readBy: [],
        });
        break;

      case "AGENT_BROADCAST":
        this.messages.push({
          id: event.id,
          from: event.source,
          to: "*",
          type: this.mapEventTypeToMessageType(event.type),
          content: event.payload,
          seq: event.seq,
          readBy: [],
        });
        break;
    }
  }

  private mapEventTypeToMessageType(
    eventType: RuntimeEvent["type"]
  ): BlackboardMessage["type"] {
    switch (eventType) {
      case "AGENT_REQUEST":
        return "request";
      case "AGENT_RESPONSE":
        return "inform";
      case "AGENT_DELEGATE":
        return "inform";
      case "AGENT_MESSAGE":
        return "inform";
      case "AGENT_BROADCAST":
        return "inform";
      default:
        return "inform";
    }
  }

  // ==========================================================================
  // SharedData — read/write with provenance (§3.3, §3.5)
  // ==========================================================================

  getData(key: string): unknown {
    const entry = this.sharedData[key];
    return entry?.value;
  }

  getDataEntry(key: string): BlackboardEntry | undefined {
    return this.sharedData[key];
  }

  setData(key: string, value: unknown, agentId: string, options?: { sourceUri?: string; toolCallsCited?: string[] }): void {
    if (this.isLocked(key) && this.locks[key]?.holder !== agentId) {
      throw new Error(
        `Blackboard key "${key}" is locked by ${this.locks[key]?.holder}`
      );
    }
    const existing = this.sharedData[key];
    const nextVersion = existing ? existing.provenance.version + 1 : 1;
    this.sharedData[key] = this.makeEntry(value, agentId, new Date().toISOString(), {
      sourceUri: options?.sourceUri,
      toolCallsCited: options?.toolCallsCited,
    }, nextVersion);
  }

  /**
   * Append-only correction (§3.5): instead of overwriting, creates a new correction entry.
   * The old value remains intact; the corrected value is stored separately.
   * Used by Verifier agents or self-correction.
   */
  correctData(key: string, newValue: unknown, correctorId: string, reason: string): void {
    const existing = this.sharedData[key];
    if (!existing) {
      throw new Error(`Blackboard key "${key}" does not exist to correct`);
    }

    const correction: BlackboardCorrection = {
      id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      key,
      newValue,
      supersededBy: "",
      correctedBy: correctorId,
      reason,
      timestamp: new Date().toISOString(),
    };

    // Append correction to the existing entry's history
    existing.corrections.push(correction);

    // Update the effective value (append-only: old value + provenance preserved)
    const nextVersion = existing.provenance.version + 1;
    this.sharedData[key] = {
      value: newValue,
      provenance: {
        writer: correctorId,
        timestamp: correction.timestamp,
        sourceUri: `correction://${correction.id}`,
        toolCallsCited: [],
        version: nextVersion,
      },
      corrections: existing.corrections,
    };
  }

  deleteData(key: string, agentId: string): void {
    if (this.isLocked(key) && this.locks[key]?.holder !== agentId) {
      throw new Error(
        `Blackboard key "${key}" is locked by ${this.locks[key]?.holder}`
      );
    }
    delete this.sharedData[key];
  }

  /**
   * Build a BlackboardEntry with provenance metadata.
   */
  private makeEntry(
    value: unknown,
    agentId: string,
    timestamp: string,
    eventPayload: Record<string, unknown>,
    version: number
  ): BlackboardEntry {
    const provenance: BlackboardProvenance = {
      writer: agentId,
      timestamp,
      sourceUri: (eventPayload["sourceUri"] as string) ?? undefined,
      toolCallsCited: (eventPayload["toolCallsCited"] as string[]) ?? undefined,
      version,
    };

    return {
      value,
      provenance,
      corrections: [],
    };
  }

  /**
   * Get provenance for a key. Returns undefined if key doesn't exist.
   */
  getProvenance(key: string): BlackboardProvenance | undefined {
    return this.sharedData[key]?.provenance;
  }

  /**
   * Get correction history for a key.
   */
  getCorrections(key: string): BlackboardCorrection[] {
    return this.sharedData[key]?.corrections ?? [];
  }

  // ==========================================================================
  // Locks (§3.3)
  // ==========================================================================

  lock(key: string, agentId: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): boolean {
    this.pruneExpiredLocks();

    if (this.locks[key] && this.locks[key].holder !== agentId) {
      return false;
    }

    this.locks[key] = {
      holder: agentId,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    return true;
  }

  release(key: string, agentId: string): void {
    const lock = this.locks[key];
    if (!lock) return;
    if (lock.holder === agentId) {
      delete this.locks[key];
    }
  }

  isLocked(key: string): boolean {
    const lock = this.locks[key];
    if (!lock) return false;
    if (new Date(lock.expiresAt) < new Date()) {
      delete this.locks[key];
      return false;
    }
    return true;
  }

  private pruneExpiredLocks(): void {
    const now = new Date();
    for (const [key, lock] of Object.entries(this.locks)) {
      if (new Date(lock.expiresAt) < now) {
        delete this.locks[key];
      }
    }
  }

  getLocks(): Record<string, BlackboardLock> {
    this.pruneExpiredLocks();
    return { ...this.locks };
  }

  // ==========================================================================
  // Messages (§3.3)
  // ==========================================================================

  sendMessage(msg: ACLMessage): void {
    this.msgSeq += 1;
    this.messages.push({
      id: msg.id,
      from: msg.sender,
      to: msg.receiver,
      type: this.mapPerformativeToMessageType(msg.performative),
      content: msg.content,
      seq: this.msgSeq,
      readBy: [],
      timestamp: msg.timestamp,
      conversationId: msg.conversationId,
      replyWith: msg.replyWith,
      inReplyTo: msg.inReplyTo,
    });
  }

  getMessages(agentId: string): ACLMessage[] {
    return this.messages
      .filter(
        (m) =>
          m.to === agentId || m.to === "*" || m.from === agentId
      )
      .map((m) => ({
        id: m.id,
        performative: this.mapMessageTypeToPerformative(m.type),
        sender: m.from,
        receiver: m.to,
        content: m.content,
        timestamp: m.timestamp ?? new Date().toISOString(),
        conversationId: m.conversationId,
        replyWith: m.replyWith,
        inReplyTo: m.inReplyTo,
      }));
  }

  markMessageRead(messageId: string, agentId: string): void {
    const msg = this.messages.find((m) => m.id === messageId);
    if (msg && !msg.readBy.includes(agentId)) {
      msg.readBy.push(agentId);
    }
  }

  private mapPerformativeToMessageType(
    performative: ACLMessage["performative"]
  ): BlackboardMessage["type"] {
    const map: Record<ACLMessage["performative"], BlackboardMessage["type"]> = {
      inform: "inform",
      request: "request",
      propose: "propose",
      accept: "accept",
      reject: "reject",
      cfp: "cfp",
      query: "inform",
      subscribe: "inform",
      notify: "inform",
      failure: "inform",
      refuse: "reject",
      agree: "accept",
      delegate: "inform",
    };
    return map[performative];
  }

  private mapMessageTypeToPerformative(
    type: BlackboardMessage["type"]
  ): ACLMessage["performative"] {
    const map: Record<BlackboardMessage["type"], ACLMessage["performative"]> = {
      inform: "inform",
      request: "request",
      propose: "propose",
      accept: "accept",
      reject: "reject",
      cfp: "cfp",
    };
    return map[type];
  }

  // ==========================================================================
  // Tasks (§3.3)
  // ==========================================================================

  createTask(
    description: string,
    dependsOn?: string[]
  ): TaskItem {
    const now = new Date().toISOString();
    const task: TaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description,
      status: "pending",
      dependsOn,
      createdAt: now,
    };
    this.tasks.push(task);
    return task;
  }

  assignTask(taskId: string, agentId: string): void {
    const task = this.findTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status !== "pending")
      throw new Error(
        `Task ${taskId} cannot be assigned (status: ${task.status})`
      );
    task.assignedTo = agentId;
    task.status = "assigned";
  }

  startTask(taskId: string): void {
    const task = this.findTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status !== "assigned")
      throw new Error(
        `Task ${taskId} cannot be started (status: ${task.status})`
      );
    task.status = "running";
  }

  completeTask(taskId: string, output: unknown): void {
    const task = this.findTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status !== "running")
      throw new Error(
        `Task ${taskId} cannot be completed (status: ${task.status})`
      );
    task.status = "completed";
    task.output = output;
    task.completedAt = new Date().toISOString();
  }

  failTask(taskId: string, reason?: string): void {
    const task = this.findTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status === "completed")
      throw new Error(
        `Task ${taskId} cannot be failed (status: ${task.status})`
      );
    task.status = "failed";
    task.completedAt = new Date().toISOString();
    if (reason !== undefined) {
      task.output = { error: reason };
    }
  }

  reassignTask(taskId: string, agentId: string): void {
    const task = this.findTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    task.assignedTo = agentId;
    task.status = "assigned";
  }

  getTask(taskId: string): TaskItem | undefined {
    return this.tasks.find((t) => t.id === taskId);
  }

  getTasks(status?: TaskState): TaskItem[] {
    if (status) {
      return this.tasks.filter((t) => t.status === status);
    }
    return [...this.tasks];
  }

  private findTask(taskId: string): TaskItem | undefined {
    return this.tasks.find((t) => t.id === taskId);
  }

  // ==========================================================================
  // Artifacts
  // ==========================================================================

  addArtifact(
    name: string,
    producer: string,
    data: unknown,
    options?: { sourceTaskId?: string; ref?: string }
  ): string {
    const createdAt = new Date().toISOString();
    const ref = options?.ref ?? `artifact://${this.sessionId}/${name}`;
    this.artifacts[name] = {
      name,
      producer,
      ref,
      sourceTaskId: options?.sourceTaskId,
      data,
      createdAt,
      provenance: {
        writer: producer,
        timestamp: createdAt,
        sourceTaskId: options?.sourceTaskId,
      },
    };
    return ref;
  }

  setArtifact(
    name: string,
    data: unknown,
    producer: string,
    options?: { sourceTaskId?: string; ref?: string }
  ): string {
    return this.addArtifact(name, producer, data, options);
  }

  getArtifact(name: string): BlackboardArtifact | undefined {
    return this.artifacts[name];
  }

  listArtifacts(): Record<string, BlackboardArtifact> {
    return { ...this.artifacts };
  }

  // ==========================================================================
  // Agent Registration
  // ==========================================================================

  registerAgent(agentId: string): void {
    this.registeredAgents.add(agentId);
  }

  unregisterAgent(agentId: string): void {
    this.registeredAgents.delete(agentId);
  }

  getRegisteredAgents(): string[] {
    return Array.from(this.registeredAgents);
  }

  /**
   * 获取所有 Blackboard entries（用于 SharedMemoryHelper 等模块查询）
   */
  getEntries(): Array<{ key: string; value: unknown; provenance: BlackboardProvenance }> {
    const entries: Array<{ key: string; value: unknown; provenance: BlackboardProvenance }> = [];

    for (const [key, entry] of Object.entries(this.sharedData)) {
      entries.push({
        key,
        value: entry.value,
        provenance: entry.provenance,
      });
    }

    return entries;
  }

  /**
   * 根据 agents.json 映射获取 Agent 名称（需要从外部传入）
   *
   * 注意：Blackboard 本身不存储 Agent 元信息，这里只是一个占位符
   * 实际调用时需通过 `CollaborationRuntime` 或其他机制管理 Agent 名称映射
   */
  getAgentName(agentId: string): string {
    // 这里暂时返回 agentId 本身，实际应用中应从 topology.nodes 映射
    return agentId;
  }

  // ==========================================================================
  // Snapshot / Restore
  // ==========================================================================

  async snapshot(): Promise<void> {
    await fs.mkdir(this.snapshotDir, { recursive: true });
    const now = new Date().toISOString();

    const dataFile: DataFile<BlackboardState> = {
      version: "1.0.0",
      createdAt: now,
      updatedAt: now,
      data: this.toState(),
    };

    await fs.writeFile(
      path.join(this.snapshotDir, "blackboard.json"),
      JSON.stringify(dataFile, null, 2),
      "utf-8"
    );
  }

  static async loadSnapshot(
    sessionId: string,
    snapshotDir: string
  ): Promise<Blackboard | null> {
    try {
      const filePath = path.join(snapshotDir, "blackboard.json");
      const content = await fs.readFile(filePath, "utf-8");
      const dataFile = JSON.parse(content) as DataFile<BlackboardState>;
      const bb = new Blackboard(sessionId, snapshotDir);
      bb.restoreFromState(dataFile.data);
      return bb;
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // State Export
  // ==========================================================================

  toState(): BlackboardState {
    return {
      sessionId: this.sessionId,
      sharedData: { ...this.sharedData },
      messages: [...this.messages],
      tasks: [...this.tasks],
      artifacts: { ...this.artifacts },
      locks: { ...this.locks },
    };
  }

  restoreFromState(state: BlackboardState): void {
    this.sharedData = { ...state.sharedData };
    this.messages = [...state.messages];
    this.tasks = [...state.tasks];
    this.artifacts = { ...state.artifacts };
    this.locks = { ...state.locks };
  }
}
