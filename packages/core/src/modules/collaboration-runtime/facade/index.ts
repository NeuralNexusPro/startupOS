/**
 * Facade — 公共 API（组装层）
 *
 * Story 9.38 迁移后，API Routes 改为直接 import from '../../../modules/collaboration-runtime/facade'
 *
 * createSession / listSessions 等函数与旧 lib/collaboration-runtime-service 接口兼容。
 */

import { eventEmitter } from "./event-bus";
import { createSession as _createSession } from "./session-store";

// ============================================================================
// Re-export — session-store 公共 API
// ============================================================================
export type { CreateSessionInput } from "./session-store";
export { listSessions, getSession, getBlackboardState, getEvents } from "./session-store";

// ============================================================================
// Re-export — event-bus 公共 API
// ============================================================================
export type { SseClient } from "./event-bus";
export { subscribeToEvents, subscribeToRuntimeEvents, unsubscribeFromEvents, clientDisconnected } from "./event-bus";

// ============================================================================
// Re-export — dag-runner 公共 API
// ============================================================================
export { executeSession, abortSession } from "./dag-runner";
export {
  CollaborationExecutionStore,
  type CollaborationExecutionPort,
  type CollaborationRunSnapshot,
  type CollaborationWorkItem,
  type SolutionTaskBinding,
  type StartCollaborationRunInput,
  type WorkItemExecutionRequest,
  type WorkItemAttempt,
  type WorkerReceipt,
  type VerifierResult,
  type EvidenceReceipt,
  type WorkItemWorkerPort,
  type WorkItemVerifierPort,
  type WorkItemEvidenceSink,
  type CollaborationExecutionDependencies,
  type AcceptedExternalOutputInput,
  type AcceptedExternalOutputResult,
  type CollaborationRunStatus,
  type CollaborationRunTerminalStatus,
  type WorkItemStatus,
  type AttemptStatus,
  type WorkItemUsage,
  type WorkItemExecutionStage,
  type WorkItemReadinessInput,
  type WorkItemReadinessResult,
  type WorkItemReadinessReceipt,
  type WorkItemReadinessPort,
  type WorkerExecutionInput,
  type VerifierExecutionInput,
  type OutcomeCommitInput,
  type OutcomeReceipt,
  type WorkItemOutcomePort,
  type EvidenceSubmissionInput,
  type WorkItemHitlRequest,
  type WorkItemHitlPort,
  type HitlOpenInput,
  type HitlDecision,
  type HitlTrigger,
  type ResolveWorkItemHitlInput,
  type CollaborationMutationLockPort,
  type WorkItemStageClaim,
  type WorkItemHandoffCandidate,
  type ListWorkItemHandoffCandidatesInput,
  type WorkItemHandoffInput,
  type WorkItemHandoffReceipt,
  type WorkItemHandoffResult,
  FileCollaborationMutationLock,
  CollaborationMutationConflictError,
  CollaborationReconciliationError,
  CollaborationWorkItemHandoffError,
} from "./contract-execution";
export { createAgentTaskEvidenceSink } from "./task-runtime-evidence-sink";

// ============================================================================
// Re-export — hitl-dispatcher 公共 API
// ============================================================================
export { sendMessageToSupervisor, respondToHumanReview } from "./hitl-dispatcher";

// ============================================================================
// createSession — 组装层：注入 eventEmitter
// ============================================================================
import type { CollaborationSession } from "../../../modules/collaboration-runtime/session/types";
import type { CreateSessionInput } from "./session-store";

export async function createSession(input: CreateSessionInput): Promise<CollaborationSession> {
  // AG.2: agentDefinitionParser 通过动态 import 从 lib/integrations 获取，
  // 避免在模块顶层 import @/lib/**（违反模块边界规约）。
  const { parseAgentDefinition, parseToolDefinition } = await import("../../../lib/integrations/pi-agent/persistent-agent");
  return _createSession(input, eventEmitter, { parseAgentDefinition, parseToolDefinition });
}
