import { describe, expect, it } from "vitest";
import {
	advanceAgentTaskExecutionProgress,
	TaskContinuationController,
} from "../continuation-controller";
import {
	createIdleAgentTaskExecutionState,
	type AgentTaskProjectionV1,
} from "../types";

function projection(overrides: Partial<AgentTaskProjectionV1> = {}): AgentTaskProjectionV1 {
	return {
		version: 1,
		taskId: "T1",
		title: "任务",
		objective: "完成任务",
		status: "active",
		progress: 20,
		steps: [],
		criteria: [],
		blockers: [],
		warnings: [],
		evidenceCount: 0,
		actions: ["stop"],
		revision: 1,
		cursor: "entry-1",
		stateHash: "hash-1",
		truncated: false,
		...overrides,
	};
}

function runningExecution() {
	return {
		...createIdleAgentTaskExecutionState(7),
		mode: "task_running" as const,
		status: "running" as const,
		expectedRevision: 1,
		expectedCursor: "entry-1",
	};
}

describe("TaskContinuationController", () => {
	const controller = new TaskContinuationController();

	it("仅在当前 scope、空闲且无用户消息时续跑", () => {
		expect(controller.decide({
			execution: runningExecution(),
			projection: projection(),
			agentIdle: true,
			hasPendingUserMessage: false,
			budgetRemaining: true,
			currentBridgeEpoch: 7,
		}).type).toBe("continue");
	});

	it("用户消息优先于内部 continuation", () => {
		expect(controller.decide({
			execution: runningExecution(),
			projection: projection(),
			agentIdle: true,
			hasPendingUserMessage: true,
			budgetRemaining: true,
			currentBridgeEpoch: 7,
		})).toMatchObject({ type: "wait_user", reason: "pending-user-message" });
	});

	it("阻塞、预算和 no-progress 都不会无限续跑", () => {
		const blocked = projection({
			status: "blocked",
			blockers: [{
				id: "B1",
				reason: "需要凭据",
				blockedBy: "user",
				neededToUnblock: "请提供凭据",
				resolved: false,
			}],
		});
		expect(controller.decide({
			execution: runningExecution(),
			projection: blocked,
			agentIdle: true,
			hasPendingUserMessage: false,
			budgetRemaining: true,
			currentBridgeEpoch: 7,
		}).type).toBe("wait_user");

		expect(controller.decide({
			execution: runningExecution(),
			projection: projection(),
			agentIdle: true,
			hasPendingUserMessage: false,
			budgetRemaining: false,
			currentBridgeEpoch: 7,
		}).type).toBe("pause");

		expect(controller.decide({
			execution: { ...runningExecution(), noProgressCount: 3 },
			projection: projection(),
			agentIdle: true,
			hasPendingUserMessage: false,
			budgetRemaining: true,
			currentBridgeEpoch: 7,
		}).type).toBe("pause");
	});

	it("完成状态结束 Task Runtime", () => {
		expect(controller.decide({
			execution: runningExecution(),
			projection: projection({ status: "done" }),
			agentIdle: true,
			hasPendingUserMessage: false,
			budgetRemaining: true,
			currentBridgeEpoch: 7,
		}).type).toBe("complete");
	});

	it("完整投影未变化时增加 no-progress 计数", () => {
		const first = advanceAgentTaskExecutionProgress(runningExecution(), projection(), "2026-08-02T00:00:00.000Z");
		const second = advanceAgentTaskExecutionProgress(first, projection(), "2026-08-02T00:00:01.000Z");
		expect(first.noProgressCount).toBe(0);
		expect(second.noProgressCount).toBe(1);
	});
});
