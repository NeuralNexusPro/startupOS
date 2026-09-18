/**
 * Collaboration Runtime — Core Type Definitions
 *
 * Pure type definitions with zero runtime dependencies.
 * Source: docs/design/multi-agent-runtime.md §3.2, §3.3, §4.1, §4.3, §5.2
 */

import type { RuntimeLLMConfig } from "../../../lib/integrations/pi-agent/llm-config";

// ============================================================================
// Event Model (§3.2)
// ============================================================================

export type EventType =
  // Lifecycle
  | "SESSION_CREATED"
  | "SESSION_COMPLETE"
  | "SESSION_ABORTED"
  | "SESSION_END"
  | "SESSION_ERROR"
  | "DAG_COMPLETE"
  | "DAG_FAIL"
  | "CHECKPOINT"

  // User interaction
  | "USER_INPUT"
  | "USER_RESPONSE"

  // Agent activity
  | "AGENT_REGISTERED"
  | "AGENT_UNREGISTERED"
  | "AGENT_THINKING"
  | "AGENT_ACT"
  | "AGENT_END"
  | "AGENT_START"
  | "AGENT_PAUSED"
  | "AGENT_COMPLETE_TASK"
  | "AGENT_FAIL_TASK"

  // Agent communication
  | "AGENT_MESSAGE"
  | "AGENT_BROADCAST"
  | "AGENT_REQUEST"
  | "AGENT_RESPONSE"
  | "AGENT_DELEGATE"
  | "MESSAGE_SENT"

  // Coordination
  | "DAG_PROGRESS" // DAG execution progress snapshot (all node states)
  | "HUMAN_REVIEW_REQUEST" // Agent requests human review/confirmation
  | "HUMAN_REVIEW_RESPONSE" // User response injected back to Agent
  | "TASK_CREATED"
  | "TASK_ASSIGNED"
  | "TASK_STARTED"
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_REASSIGNED"

  // Blackboard operations
  | "BLACKBOARD_WRITE"
  | "BLACKBOARD_UPDATE"
  | "BLACKBOARD_LOCK"
  | "BLACKBOARD_RELEASE"

  // Conflict
  | "CONFLICT_DETECTED"
  | "CONFLICT_RESOLVED"

  // Sandbox execution
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "TOOL_FAILURE"

  // Assistant message (pure text from turn_end, excluding tool syntax)
  | "ASSISTANT_MESSAGE"

  // Supervisor Agent events (Story 9.30)
  | "SUPERVISOR_AGENT_START"
  | "SUPERVISOR_DECOMPOSITION"
  | "SUPERVISOR_DISPATCH"
  | "SUPERVISOR_WORKER_COMPLETE"
  | "SUPERVISOR_WORKER_FAILED"
  | "SUPERVISOR_AGGREGATE"
  | "SUPERVISOR_TOOL_CALL"
  | "HOST_TOOL_CALL"
  | "WORKER_BLOCK"
  // Story 9.33: Supervisor 决策事件
  | "SUPERVISOR_DECIDE"
  // Story 9.34: 用户回复路由收敛
  | "USER_REPLY_TO_SUPERVISOR"
  // Worker 向 Supervisor 上报需要人工输入（Supervisor 中转 HITL）
  | "HITL_ESCALATE";

// ============================================================================
// Worker 结构化阻塞契约 (Story 9.32)
// ============================================================================

export type WorkerBlock =
  | { type: "need_input"; missingFields: string[]; rationale: string; suggestedQuestion?: string }
  | { type: "decision_required"; options: Array<{ id: string; label: string; impact?: string }>; rationale: string }
  | { type: "conflict_detected"; conflictWith: string; conflictField: string; details: string }
  | { type: "capability_missing"; missing: string; suggestedAgent?: string };

export interface WorkerBlockEvent {
  type: "WORKER_BLOCK";
  workerId: string;
  dispatchId: string;
  block: WorkerBlock;
  timestamp: string;
}

export interface RuntimeEvent {
  id: string;
  sessionId: string;
  seq: number;
  type: EventType;
  payload: Record<string, unknown>;
  source: string; // Agent ID, 'user', or 'system'
  target?: string; // Target Agent ID (directed messages)
  broadcast?: boolean; // Whether this is a broadcast event
  correlationId?: string; // Correlates related events in the same collaboration session
  timestamp: string; // ISO 8601
}

// ============================================================================
// Blackboard (§3.3)
// ============================================================================

export type TaskState = "pending" | "assigned" | "running" | "completed" | "failed" | "blocked" | "reported";

export interface TaskItem {
  id: string;
  description: string;
  status: TaskState;
  assignedTo?: string;
  dependsOn?: string[];
  input?: unknown;
  output?: unknown;
  createdAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
}

export interface BlackboardMessage {
  id: string;
  from: string; // Sender Agent ID
  to: string; // Receiver Agent ID ('*' for broadcast)
  type: "inform" | "request" | "propose" | "accept" | "reject" | "cfp";
  content: unknown;
  seq: number;
  readBy: string[]; // Agent IDs that have read this message
  timestamp?: string; // ISO 8601
  conversationId?: string; // Isolates different conversation flows
  replyWith?: string; // Identifier for matching responses
  inReplyTo?: string; // References the request this responds to
}

export interface BlackboardArtifact {
  name: string;
  producer: string; // Producer Agent ID
  ref?: string; // Stable artifact reference exposed to downstream Agents
  sourceTaskId?: string;
  data: unknown;
  createdAt: string; // ISO 8601
  provenance?: {
    writer: string;
    timestamp: string;
    sourceTaskId?: string;
  };
}

export interface BlackboardLock {
  holder: string; // Holder Agent ID
  expiresAt: string; // ISO 8601
}

/**
 * Provenance metadata for each blackboard write (§3.5).
 * Tracks who wrote what, when, and with what sources — defends against memory poisoning.
 */
export interface BlackboardProvenance {
  writer: string;       // Agent ID that wrote this entry
  timestamp: string;    // ISO 8601 — when the write occurred
  sourceUri?: string;   // Optional: source that informed this write (e.g., tool result URI)
  toolCallsCited?: string[]; // Optional: tool call IDs cited as evidence
  version: number;      // Monotonically increasing per key
}

/**
 * Append-only correction entry (§3.5).
 * Instead of overwriting, corrections create a new entry referencing the superseded one.
 */
export interface BlackboardCorrection {
  id: string;           // Unique correction ID
  key: string;          // The key being corrected
  newValue: unknown;    // The corrected value
  supersededBy: string; // The correction ID that supersedes this one (if any)
  correctedBy: string;  // Agent ID that issued the correction
  reason: string;       // Why this correction was made
  timestamp: string;    // ISO 8601
}

/**
 * A blackboard data entry with provenance tracking.
 * Every shared data value is wrapped in this envelope for auditability.
 */
export interface BlackboardEntry {
  value: unknown;
  provenance: BlackboardProvenance;
  corrections: BlackboardCorrection[]; // Append-only correction history
}

export interface Blackboard {
  sessionId: string;

  globalGoal: {
    description: string;
    constraints: string[];
    successCriteria: string[];
  };

  sharedData: Record<string, BlackboardEntry>;

  messages: BlackboardMessage[];

  tasks: TaskItem[];

  artifacts: Record<string, BlackboardArtifact>;

  locks: Record<string, BlackboardLock>;
}

// ============================================================================
// ACL Message (§4.1)
// ============================================================================

export type Performative =
  | "inform" // Inform a fact
  | "request" // Request an action
  | "query" // Query information
  | "propose" // Propose a suggestion
  | "accept" // Accept a proposal
  | "reject" // Reject a proposal
  | "cfp" // Call for proposal (bidding)
  | "subscribe" // Subscribe to events
  | "notify" // Notify an event
  | "failure" // Execution failure notification
  | "refuse" // Refuse to execute
  | "agree" // Agree to execute
  | "delegate"; // Delegate a task

export interface ACLMessage {
  id: string;
  performative: Performative;
  sender: string; // Sender Agent ID
  receiver: string; // Receiver Agent ID ('*' for broadcast)
  content: unknown;
  conversationId?: string; // Isolates different conversation flows
  replyWith?: string; // Identifier for matching responses
  inReplyTo?: string; // References the request this responds to
  timestamp: string; // ISO 8601
}

// ============================================================================
// Conflict (§4.3)
// ============================================================================

export type Conflict =
  | {
      type: "resource_conflict"; // Multiple agents competing for the same resource
      agents: string[];
      resource: string;
      resolution: "first_come_first_serve" | "priority_based" | "negotiation";
    }
  | {
      type: "data_conflict"; // Multiple agents writing to the same key
      agents: string[];
      key: string;
      resolution: "lock_based" | "last_write_wins" | "merge";
    }
  | {
      type: "goal_conflict"; // Agent goals are inconsistent
      agents: string[];
      goals: string[];
      resolution: "supervisor_decision" | "negotiation" | "voting";
    }
  | {
      type: "deadlock"; // Circular dependency causing deadlock
      agents: string[];
      cycle: string[];
      resolution: "break_cycle" | "timeout";
    };

// ============================================================================
// Collaboration Topology (§5.2)
// ============================================================================

export type EdgeType = "trigger" | "notify" | "depend";

export interface AgentNode {
  id: string;
  name: string;
  domain: string;
  responsibility: string;
  capabilities: string[];
  dataOperations: Record<string, string[]>;
  skills: string[];
}

export interface CollaborationEdge {
  from: string; // Source Agent ID
  to: string; // Target Agent ID
  type: EdgeType;
  description: string;
}

export interface CollaborationTopology {
  agents: Record<string, AgentNode>;
  edges: CollaborationEdge[];
  entryPoints: string[]; // Agent IDs with no incoming edges
  exitPoints: string[]; // Agent IDs with no outgoing edges
  mode: "workflow" | "system"; // workflow = all trigger; system = has notify/depend
}

// ============================================================================
// Collaboration Session (§3)
// ============================================================================

export type SessionStatus = "created" | "greeting" | "running" | "completed" | "aborted" | "terminated";

export interface CollaborationSession {
  id: string;
  projectId: string;
  globalGoal?: string;
  status: SessionStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  config: {
    maxIterations?: number;
    timeoutMs?: number;
    mode?: "workflow" | "system";
    llmConfig?: {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      anthropicAuthToken?: string;
      anthropicApiKey?: string;
      anthropicBaseUrl?: string;
      anthropicCredentialSource?: "anthropicAuthToken" | "anthropicApiKey" | "authToken" | "apiKey";
      authToken?: string;
      model?: string;
      maxTokens?: number;
    } & RuntimeLLMConfig;
  };
  /** 创建会话的宿主进程 PID（Story 9.24：孤儿会话回收） */
  hostPid?: number;
  /** 会话终止原因（孤儿回收等） */
  terminationReason?: string;
}

/** 孤儿检测报告（Story 9.24） */
export interface OrphanReport {
  sessionId: string;
  hostPid: number | null;
  status: "orphan" | "alive" | "unknown";
  reason: string;
  action: "terminated" | "kept" | "pending";
}
