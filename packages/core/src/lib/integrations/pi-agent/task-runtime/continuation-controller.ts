import { createAgentTaskProgressFingerprint } from "./projection";
import type {
	AgentTaskExecutionStateV1,
	AgentTaskProjectionV1,
} from "./types";

export type AgentTaskContinuationDecision =
	| { type: "continue"; fingerprint: string }
	| { type: "complete"; fingerprint: string }
	| { type: "wait_user"; reason: string; fingerprint: string }
	| { type: "pause"; reason: string; fingerprint: string }
	| { type: "fail"; reason: string; fingerprint: string }
	| { type: "noop"; reason: string; fingerprint: string };

export interface AgentTaskContinuationInput {
	execution: AgentTaskExecutionStateV1;
	projection?: AgentTaskProjectionV1;
	agentIdle: boolean;
	hasPendingUserMessage: boolean;
	budgetRemaining: boolean;
	currentBridgeEpoch: number;
	maxContinuations?: number;
	maxNoProgressTurns?: number;
}

export class TaskContinuationController {
	decide(input: AgentTaskContinuationInput): AgentTaskContinuationDecision {
		const fingerprint = createAgentTaskProgressFingerprint(input.projection);
		const maxContinuations = input.maxContinuations ?? 24;
		const maxNoProgressTurns = input.maxNoProgressTurns ?? 3;

		if (input.execution.mode !== "task_running") {
			return { type: "noop", reason: "not-task-running", fingerprint };
		}
		if (input.execution.bridgeEpoch !== input.currentBridgeEpoch) {
			return { type: "fail", reason: "stale-bridge-epoch", fingerprint };
		}
		if (!input.projection) {
			return { type: "fail", reason: "canonical-task-missing", fingerprint };
		}
		if (
			input.projection.revision !== input.execution.expectedRevision
			|| input.projection.cursor !== input.execution.expectedCursor
		) {
			return { type: "fail", reason: "stale-task-scope", fingerprint };
		}
		if (input.projection.status === "done") {
			return { type: "complete", fingerprint };
		}
		if (input.projection.status === "cancelled") {
			return { type: "noop", reason: "task-cancelled", fingerprint };
		}
		const unresolvedBlocker = input.projection.blockers.find((blocker) => !blocker.resolved);
		if (input.projection.status === "blocked" || unresolvedBlocker) {
			return {
				type: "wait_user",
				reason: unresolvedBlocker?.neededToUnblock || unresolvedBlocker?.reason || "task-blocked",
				fingerprint,
			};
		}
		if (input.hasPendingUserMessage) {
			return { type: "wait_user", reason: "pending-user-message", fingerprint };
		}
		if (!input.agentIdle) {
			return { type: "noop", reason: "agent-busy", fingerprint };
		}
		if (!input.budgetRemaining) {
			return { type: "pause", reason: "task-budget-exhausted", fingerprint };
		}
		if (input.execution.continuationCount >= maxContinuations) {
			return { type: "pause", reason: "continuation-limit-reached", fingerprint };
		}
		if (input.execution.noProgressCount >= maxNoProgressTurns) {
			return { type: "pause", reason: "no-progress-limit-reached", fingerprint };
		}
		return { type: "continue", fingerprint };
	}
}

export function advanceAgentTaskExecutionProgress(
	execution: AgentTaskExecutionStateV1,
	projection: AgentTaskProjectionV1,
	updatedAt = new Date().toISOString(),
): AgentTaskExecutionStateV1 {
	const fingerprint = createAgentTaskProgressFingerprint(projection);
	const progressed = execution.lastProgressFingerprint !== fingerprint;
	return {
		...execution,
		taskId: projection.taskId,
		expectedRevision: projection.revision,
		expectedCursor: projection.cursor,
		projection,
		lastProgressFingerprint: fingerprint,
		noProgressCount: progressed ? 0 : execution.noProgressCount + 1,
		updatedAt,
	};
}
