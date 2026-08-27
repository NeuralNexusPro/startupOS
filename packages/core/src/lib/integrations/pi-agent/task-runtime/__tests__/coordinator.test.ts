import { describe, expect, it, vi } from "vitest";
import type { OriginOSAgent } from "../../core/agent";
import { AgentTaskRuntimeCoordinator } from "../coordinator";

function canonicalSnapshot(status: "active" | "blocked" | "done" = "active") {
	return {
		version: 1,
		stateHash: `hash-${status}`,
		scope: { sessionId: "session-1", revision: 1, cursor: "entry-1" },
		state: {
			activeTaskId: "T1",
			tasks: {
				T1: {
					title: "正式任务",
					objective: "完成纵向闭环",
					status,
					progress: status === "done" ? 100 : 20,
					planSteps: [{
						id: "T1-S1",
						text: "实现",
						expectedOutput: "代码",
						status: status === "done" ? "done" : "active",
						evidenceRequired: true,
						evidenceIds: status === "done" ? ["E1"] : [],
					}],
					acceptanceCriteria: [{
						id: "T1-AC1",
						text: "测试通过",
						status: status === "done" ? "satisfied" : "pending",
						evidenceIds: status === "done" ? ["E1"] : [],
					}],
					evidence: status === "done" ? [{ id: "E1" }] : [],
					blockers: status === "blocked" ? [{
						id: "B1",
						reason: "需要用户输入",
						blockedBy: "user",
						neededToUnblock: "提供确认",
					}] : [],
					warnings: [],
				},
			},
		},
	};
}

function createHarness(options: { createTaskOnPrompt?: boolean; status?: "active" | "blocked" | "done"; initialBridgeEpoch?: number } = {}) {
	let hostSnapshot: ReturnType<typeof canonicalSnapshot> | { version: 1; stateHash: string; scope: Record<string, unknown>; state: { tasks: Record<string, unknown> } } = {
		version: 1,
		stateHash: "empty",
		scope: { sessionId: "session-1", revision: 0, cursor: null },
		state: { tasks: {} },
	};
	let listener: ((state: { scope: { sessionId: string; cursor: string | null; revision: number; bridgeEpoch: number }; snapshot: typeof hostSnapshot }) => void) | null = null;
	let tools: unknown[] = [{ name: "read_file" }];
	const persist = vi.fn(async () => undefined);
	const onState = vi.fn();

	const host = {
		restore: vi.fn(async () => ({
			scope: { sessionId: "session-1", cursor: null, revision: 0, bridgeEpoch: 3 },
			snapshot: hostSnapshot,
		})),
		getSnapshot: () => hostSnapshot,
		getScope: () => ({
			sessionId: "session-1",
			cursor: typeof hostSnapshot.scope.cursor === "string" ? hostSnapshot.scope.cursor : null,
			revision: typeof hostSnapshot.scope.revision === "number" ? hostSnapshot.scope.revision : 0,
			bridgeEpoch: 3,
		}),
		getAgentTools: () => [{
			name: "task_plan",
			label: "Task Plan",
			description: "Create task",
			parameters: {},
			execute: vi.fn(),
		}],
		invoke: vi.fn(async (command: { toolName?: string }) => {
			if (command.toolName === "task_plan" && options.createTaskOnPrompt !== false) {
				hostSnapshot = canonicalSnapshot(options.status ?? "blocked");
				listener?.({
					scope: { sessionId: "session-1", cursor: "entry-1", revision: 1, bridgeEpoch: 3 },
					snapshot: hostSnapshot,
				});
			}
			return {};
		}),
		subscribeState: (nextListener: typeof listener) => {
			listener = nextListener;
			return () => { listener = null; };
		},
		invalidate: vi.fn(),
	};

	const agent = {
		state: { uiState: { isThinking: false } },
		getTools: () => tools,
		setTools: (nextTools: unknown[]) => { tools = nextTools; },
		waitForIdle: vi.fn(async () => undefined),
		abort: vi.fn(),
		prompt: vi.fn(async (_message: unknown, _images: unknown, promptOptions: unknown) => {
			if (options.createTaskOnPrompt !== false) {
				hostSnapshot = canonicalSnapshot(options.status ?? "blocked");
				listener?.({
					scope: { sessionId: "session-1", cursor: "entry-1", revision: 1, bridgeEpoch: 3 },
					snapshot: hostSnapshot,
				});
			}
			return promptOptions;
		}),
	};

	const coordinator = new AgentTaskRuntimeCoordinator({
		sessionId: "session-1",
		agent: agent as unknown as OriginOSAgent,
		initialState: {
			schemaVersion: 1,
			execution: {
				schemaVersion: 1,
				mode: "chat",
				status: "idle",
				bridgeEpoch: options.initialBridgeEpoch ?? 3,
				expectedRevision: 0,
				expectedCursor: null,
				continuationCount: 0,
				noProgressCount: 0,
				updatedAt: "2026-08-02T00:00:00.000Z",
			},
			branchEntries: [],
		},
		persist,
		onState,
		hostFactory: async () => host,
	});

	return { coordinator, agent, host, persist, onState, getTools: () => tools };
}

describe("AgentTaskRuntimeCoordinator", () => {
	it("在同一 Agent Session 中规划任务并关闭 Chat Completion Guard", async () => {
		const harness = createHarness({ status: "blocked" });
		const snapshot = await harness.coordinator.createTask({
			version: 1,
			requestId: "request-1",
			sessionId: "session-1",
			objective: "完成纵向闭环",
			context: "沿用当前 Session 的项目材料",
		});

		expect(harness.agent.prompt).not.toHaveBeenCalled();
		expect(harness.host.invoke).toHaveBeenCalledWith(expect.objectContaining({
			toolName: "task_plan",
			input: expect.objectContaining({
				objective: "完成纵向闭环",
				initial_steps: ["执行任务目标并验证交付结果"],
			}),
		}));
		expect(snapshot.projection?.taskId).toBe("T1");
		expect(snapshot.execution.draft?.context).toBe("沿用当前 Session 的项目材料");
		expect(snapshot.execution.status).toBe("waiting_user");
		expect(harness.getTools()).toEqual(expect.arrayContaining([
			expect.objectContaining({ name: "read_file" }),
			expect.objectContaining({ name: "task_plan" }),
		]));
		expect(harness.persist).toHaveBeenCalled();
		expect(harness.onState).toHaveBeenCalled();
	});

	it("恢复 legacy epoch 时同步到 runtime bridge epoch，避免 stale-bridge-epoch", async () => {
		const harness = createHarness({ status: "blocked", initialBridgeEpoch: 0 });
		const snapshot = await harness.coordinator.createTask({
			version: 1,
			requestId: "request-legacy-epoch",
			sessionId: "session-1",
			objective: "完成纵向闭环",
		});

		expect(snapshot.execution.bridgeEpoch).toBe(3);
		expect(snapshot.execution.lastError).toBeUndefined();
	});

	it("相同 requestId 幂等，不再次调用模型", async () => {
		const harness = createHarness({ status: "blocked" });
		const request = {
			version: 1 as const,
			requestId: "request-1",
			sessionId: "session-1",
			objective: "完成纵向闭环",
		};
		await harness.coordinator.createTask(request);
		await harness.coordinator.createTask(request);
		expect(harness.agent.prompt).toHaveBeenCalledTimes(1);
	});

	it("planning turn 未创建 canonical Task 时返回可见失败并恢复普通工具", async () => {
		const harness = createHarness({ createTaskOnPrompt: false });
		const snapshot = await harness.coordinator.createTask({
			version: 1,
			requestId: "request-1",
			sessionId: "session-1",
			objective: "完成纵向闭环",
		});
		expect(snapshot.execution).toMatchObject({
			mode: "chat",
			status: "failed",
			lastError: { code: "TASK_PLANNING_FAILED", retryable: true },
		});
		expect(harness.getTools()).toEqual([{ name: "read_file" }]);
	});

	it("拒绝 stale control scope", async () => {
		const harness = createHarness({ status: "blocked" });
		await harness.coordinator.createTask({
			version: 1,
			requestId: "request-1",
			sessionId: "session-1",
			objective: "完成纵向闭环",
		});
		await expect(harness.coordinator.controlTask({
			version: 1,
			requestId: "control-1",
			sessionId: "session-1",
			action: "resume",
			expectedRevision: 0,
			expectedCursor: null,
			bridgeEpoch: 3,
		})).rejects.toThrow("scope 已过期");
	});

	it("waiting_user 答复仍由 Task Runtime 在原 Session 消费", async () => {
		const harness = createHarness({ status: "blocked" });
		await harness.coordinator.createTask({
			version: 1,
			requestId: "request-1",
			sessionId: "session-1",
			objective: "完成纵向闭环",
		});

		const snapshot = await harness.coordinator.submitUserReply("我确认继续执行");
		expect(harness.agent.prompt).toHaveBeenCalledTimes(1);
		expect(harness.agent.prompt).toHaveBeenLastCalledWith(
			[
				expect.objectContaining({ role: "user" }),
				expect.objectContaining({
					role: "user",
					content: [{ type: "text", text: "我确认继续执行" }],
				}),
			],
			undefined,
			{ completionPolicy: "task_runtime", internalMessageIndexes: [0] },
		);
		expect(snapshot.execution.mode).toBe("task_running");
		expect(snapshot.execution.status).toBe("waiting_user");
	});

	it("停止只暂停 execution 并保留 canonical Task", async () => {
		const harness = createHarness({ status: "blocked" });
		await harness.coordinator.createTask({
			version: 1,
			requestId: "request-1",
			sessionId: "session-1",
			objective: "完成纵向闭环",
		});

		const snapshot = await harness.coordinator.controlTask({
			version: 1,
			requestId: "control-stop",
			sessionId: "session-1",
			action: "stop",
			expectedRevision: 1,
			expectedCursor: "entry-1",
			bridgeEpoch: 3,
		});
		expect(snapshot.execution).toMatchObject({
			mode: "task_running",
			status: "paused",
			projection: { taskId: "T1", status: "blocked" },
		});
		expect(harness.host.invoke).not.toHaveBeenCalled();
		expect(harness.getTools()).toEqual([{ name: "read_file" }]);
	});

	it("取消通过 canonical mutation 终止任务且不可恢复", async () => {
		const harness = createHarness({ status: "blocked" });
		await harness.coordinator.createTask({
			version: 1,
			requestId: "request-1",
			sessionId: "session-1",
			objective: "完成纵向闭环",
		});

		const snapshot = await harness.coordinator.controlTask({
			version: 1,
			requestId: "control-cancel",
			sessionId: "session-1",
			action: "cancel",
			expectedRevision: 1,
			expectedCursor: "entry-1",
			bridgeEpoch: 3,
		});
		expect(harness.host.invoke).toHaveBeenCalledWith(expect.objectContaining({
			toolName: "task_update",
			input: expect.objectContaining({ task_id: "T1", status: "cancelled" }),
		}));
		expect(snapshot.execution).toMatchObject({ mode: "chat", status: "cancelled" });
		await expect(harness.coordinator.controlTask({
			version: 1,
			requestId: "control-resume",
			sessionId: "session-1",
			action: "resume",
			expectedRevision: 1,
			expectedCursor: "entry-1",
			bridgeEpoch: 3,
		})).rejects.toThrow("只有暂停或等待用户的任务可以恢复");
	});
});
