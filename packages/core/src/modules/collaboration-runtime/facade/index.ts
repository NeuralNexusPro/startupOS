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

// ============================================================================
// Re-export — hitl-dispatcher 公共 API
// ============================================================================
export { sendMessageToSupervisor, respondToHumanReview } from "./hitl-dispatcher";

// ============================================================================
// Re-export — topology 工具（从 engine 层 re-export）
// ============================================================================
export { loadProjectTopology } from "../../../modules/collaboration-runtime/engine/supervisor-dag";

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
