import { describe, expect, it, vi } from "vitest";
import type { OriginOSAgent } from "../../core/agent";
import type { AgentTaskProjectMetadataV1, AgentTaskRuntimePersistenceV1 } from "../types";
import { AgentTaskRuntimeCoordinator } from "../coordinator";

function canonicalSnapshot(status: "active" | "blocked" | "review" | "done" = "active") {
	const completionReady = status === "review" || status === "done";
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
					status: completionReady ? "done" : "active",
						evidenceRequired: true,
						evidenceIds: completionReady ? ["E1"] : [],
					}],
					acceptanceCriteria: [{
						id: "T1-AC1",
						text: "测试通过",
						status: completionReady ? "satisfied" : "pending",
						evidenceIds: completionReady ? ["E1"] : [],
					}],
					evidence: completionReady ? [{ id: "E1" }] : [],
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

function createHarness(options: { createTaskOnPrompt?: boolean; status?: "active" | "blocked" | "review" | "done"; initialBridgeEpoch?: number; initialProjectMetadata?: AgentTaskProjectMetadataV1 } = {}) {
	let hostSnapshot: ReturnType<typeof canonicalSnapshot> | { version: 1; stateHash: string; scope: Record<string, unknown>; state: { tasks: Record<string, unknown> } } = {
		version: 1,
		stateHash: "empty",
		scope: { sessionId: "session-1", revision: 0, cursor: null },
		state: { tasks: {} },
	};
	let listener: ((state: { scope: { sessionId: string; cursor: string | null; revision: number; bridgeEpoch: number }; snapshot: typeof hostSnapshot }) => void) | null = null;
	let tools: unknown[] = [{ name: "read_file" }];
	const persist = vi.fn(async (_state: AgentTaskRuntimePersistenceV1) => undefined);
	const onState = vi.fn();
	const next = vi.fn(async () => ({ content: [{ type: "text", text: "Continue active step" }] }));

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
		}, { name: "task_next", label: "Next", description: "Read next action", parameters: {}, execute: next }],
		invoke: vi.fn(async (command: { toolName?: string; input?: Record<string, unknown> }) => {
			if (command.toolName === "task_plan" && options.createTaskOnPrompt !== false) {
				hostSnapshot = canonicalSnapshot(options.status ?? "blocked");
				listener?.({
					scope: { sessionId: "session-1", cursor: "entry-1", revision: 1, bridgeEpoch: 3 },
					snapshot: hostSnapshot,
				});
			}
			if (command.toolName === "task_update" && command.input?.status === "review") {
				hostSnapshot = canonicalSnapshot("review");
				hostSnapshot.scope = { sessionId: "session-1", revision: 2, cursor: "entry-2" };
				listener?.({ scope: { sessionId: "session-1", cursor: "entry-2", revision: 2, bridgeEpoch: 3 }, snapshot: hostSnapshot });
			}
			if (command.toolName === "task_update" && command.input?.status === "active"
				&& (hostSnapshot.state.tasks as Record<string, { status?: string }>).T1?.status === "review") {
				hostSnapshot = canonicalSnapshot("active");
				hostSnapshot.scope = { sessionId: "session-1", revision: 2, cursor: "entry-2" };
				listener?.({ scope: { sessionId: "session-1", cursor: "entry-2", revision: 2, bridgeEpoch: 3 }, snapshot: hostSnapshot });
			}
			if (command.toolName === "task_complete") {
				hostSnapshot = canonicalSnapshot("done");
				hostSnapshot.scope = { sessionId: "session-1", revision: 2, cursor: "entry-2" };
				listener?.({ scope: { sessionId: "session-1", cursor: "entry-2", revision: 2, bridgeEpoch: 3 }, snapshot: hostSnapshot });
			}
			if (command.toolName === "task_update" && command.input?.activity
				&& command.input?.status === undefined) {
				const currentRevision = typeof hostSnapshot.scope.revision === "number"
					? hostSnapshot.scope.revision : 0;
				hostSnapshot = structuredClone(hostSnapshot);
				hostSnapshot.scope = {
					sessionId: "session-1",
					revision: currentRevision + 1,
					cursor: `entry-${currentRevision + 1}`,
				};
				hostSnapshot.stateHash = `hash-metadata-${currentRevision + 1}`;
				listener?.({
					scope: { sessionId: "session-1", cursor: `entry-${currentRevision + 1}`, revision: currentRevision + 1, bridgeEpoch: 3 },
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
		subscribe: vi.fn(() => vi.fn()),
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
		projectId: "project-1",
		agent: agent as unknown as OriginOSAgent,
		initialState: {
			schemaVersion: 1,
			execution: {
				schemaVersion: 1,
				mode: "chat",
				status: "idle",
				...(options.initialProjectMetadata ? { projectMetadata: options.initialProjectMetadata } : {}),
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

	return { coordinator, agent, host, persist, onState, next, getTools: () => tools };
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
		expect(harness.host.invoke).toHaveBeenCalledTimes(1);
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
		harness.host.invoke.mockClear();

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


describe("Task runtime shutdown and restore", () => {
  const create = (harness: ReturnType<typeof createHarness>) => harness.coordinator.createTask({ version: 1, requestId: "shutdown-task", sessionId: "session-1", objective: "Keep task progress" });
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it("does not persist a late abort as failure, and restores the same running task once", async () => {
    const harness = createHarness({ status: "active" });
    let rejectPrompt!: (error: Error) => void;
    harness.agent.prompt.mockImplementationOnce(() => new Promise((_, reject) => { rejectPrompt = reject; }));
    await create(harness);
    await vi.waitFor(() => expect(harness.agent.prompt).toHaveBeenCalledTimes(1));
    harness.coordinator.destroy();
    rejectPrompt(new Error("aborted during shutdown"));
    await settle();
    const persisted = harness.persist.mock.calls.at(-1)![0];
    expect(persisted.execution.status).toBe("running");
    expect(persisted.execution.lastError).toBeUndefined();
    harness.agent.prompt.mockClear();
    let finish!: () => void;
    harness.agent.prompt.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(undefined); }));
    const restored = new AgentTaskRuntimeCoordinator({ sessionId: "session-1", agent: harness.agent as unknown as OriginOSAgent, initialState: structuredClone(persisted), persist: harness.persist, hostFactory: async () => harness.host });
    await restored.resumeAfterRestore();
    await restored.resumeAfterRestore();
    await vi.waitFor(() => expect(harness.agent.prompt).toHaveBeenCalledTimes(1));
    expect(restored.getSnapshot().projection?.taskId).toBe("T1");
    restored.destroy(); finish(); await settle();
  });

  it.each(["persist", "task_next"] as const)("does not dispatch another prompt after shutdown during %s", async (stage) => {
    const harness = createHarness({ status: "active" });
    let release!: () => void;
    let entered = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    if (stage === "persist") {
      harness.persist.mockImplementation(async (state) => { if (state.execution.continuationCount > 0) { entered = true; await gate; } });
    } else {
      harness.next.mockImplementation(async () => { entered = true; await gate; return { content: [{ type: "text", text: "Continue active step" }] }; });
    }
    await create(harness);
    await vi.waitFor(() => expect(entered).toBe(true));
    harness.coordinator.destroy(); release(); await settle();
    expect(harness.agent.prompt).not.toHaveBeenCalled();
    expect(harness.coordinator.getSnapshot().execution.status).toBe("running");
  });

  it.each(["paused", "failed", "waiting_user"] as const)("does not automatically execute a restored %s task", async (status) => {
    const harness = createHarness({ status: "blocked" });
    await create(harness);
    const state = harness.coordinator.getPersistenceState();
    state.execution.status = status;
    harness.coordinator.destroy();
    const restored = new AgentTaskRuntimeCoordinator({ sessionId: "session-1", agent: harness.agent as unknown as OriginOSAgent, initialState: state, persist: harness.persist, hostFactory: async () => harness.host });
    await restored.resumeAfterRestore(); await settle();
    expect(restored.getSnapshot().execution.status).toBe(status);
    expect(harness.agent.prompt).not.toHaveBeenCalled();
    restored.destroy();
  });
});


describe("AgentTaskRuntimeCoordinator evidence boundary", () => {
	it("submits verified evidence through the current public Session host scope", async () => {
		const harness = createHarness({ status: "active" });
		await harness.coordinator.createTask({ version: 1, requestId: "create-evidence-task", sessionId: "session-1", objective: "Evidence task" });
		(harness.host.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ eventId: "evidence-event-1", revisionBefore: 1, revisionAfter: 2, stateHash: "evidence-hash-1" });
		await expect(harness.coordinator.recordVerifiedEvidence({ version: 1, requestId: "evidence-request-1", taskId: "T1", stepId: "T1-S1", summary: "Verifier passed", references: ["verification-1"], artifactRefs: ["artifact-1"], verifier: "deterministic-fixture", contentHash: "sha256:verification-content" })).resolves.toMatchObject({ eventId: "evidence-event-1", revisionAfter: 2 });
		expect(harness.host.invoke).toHaveBeenLastCalledWith(expect.objectContaining({ toolName: "task_evidence", scope: expect.objectContaining({ sessionId: "session-1", bridgeEpoch: 3 }), input: expect.objectContaining({ task_id: "T1", step_ids: ["T1-S1"], passed: "true" }) }));
	});

	it("rejects evidence outside the current canonical task", async () => {
		const harness = createHarness({ status: "active" });
		await harness.coordinator.createTask({ version: 1, requestId: "create-other-task", sessionId: "session-1", objective: "Evidence task" });
		await expect(harness.coordinator.recordVerifiedEvidence({ version: 1, requestId: "evidence-request-2", taskId: "other-task", summary: "Verifier passed", references: ["verification-1"], artifactRefs: ["artifact-1"], verifier: "deterministic-fixture", contentHash: "sha256:verification-content" })).rejects.toThrow(/当前 Agent Session/);
	});
});

describe("AgentTaskRuntimeCoordinator project metadata boundary", () => {
	it("creates versioned metadata for a legacy task and returns a stable idempotent receipt", async () => {
		const harness = createHarness({ status: "active" });
		await harness.coordinator.createTask({ version: 1, requestId: "create-priority-task", sessionId: "session-1", objective: "Priority task" });
		await harness.coordinator.controlTask({ version: 1, requestId: "pause-priority-task", sessionId: "session-1", action: "stop", expectedRevision: 1, expectedCursor: "entry-1", bridgeEpoch: 3 });
		harness.host.invoke.mockClear();
		const request = {
			version: 1 as const,
			projectId: "project-1",
			sessionId: "session-1",
			taskId: "T1",
			requestId: "priority-1",
			priority: "urgent" as const,
			expectedRevision: 1,
			expectedCursor: "entry-1",
			bridgeEpoch: 3,
		};
		const first = await harness.coordinator.updateProjectTaskMetadata(request);
		const repeated = await harness.coordinator.updateProjectTaskMetadata(request);
		expect(repeated).toEqual(first);
		expect(first).toMatchObject({ revisionBefore: 1, revisionAfter: 2, cursorAfter: "entry-2", metadata: { version: 1, priority: "urgent", semanticRefs: [], inputVersions: [] } });
		expect(harness.host.invoke).toHaveBeenCalledTimes(1);
		expect(harness.coordinator.getSnapshot().execution.projectMetadata).toEqual(first.metadata);
	});

	it("serializes concurrent CAS updates and preserves semantic metadata", async () => {
		const initialProjectMetadata: AgentTaskProjectMetadataV1 = {
			version: 1,
			priority: "low",
			semanticRefs: ["ontology://project/concept"],
			inputVersions: [{ inputRef: "fact://input", version: "7" }],
		};
		const harness = createHarness({ status: "active" });
		await harness.coordinator.createTask({ version: 1, requestId: "create-cas-task", sessionId: "session-1", objective: "CAS task" });
		await harness.coordinator.controlTask({ version: 1, requestId: "pause-cas-task", sessionId: "session-1", action: "stop", expectedRevision: 1, expectedCursor: "entry-1", bridgeEpoch: 3 });
		const persisted = harness.coordinator.getPersistenceState();
		persisted.execution.projectMetadata = initialProjectMetadata;
		harness.coordinator.destroy();
		const restored = new AgentTaskRuntimeCoordinator({ sessionId: "session-1", projectId: "project-1", agent: harness.agent as unknown as OriginOSAgent, initialState: persisted, persist: harness.persist, hostFactory: async () => harness.host });
		await restored.initialize();
		harness.host.invoke.mockClear();
		const base = { version: 1 as const, projectId: "project-1", sessionId: "session-1", taskId: "T1", expectedRevision: 1, expectedCursor: "entry-1", bridgeEpoch: 3 };
		const [first, second] = await Promise.allSettled([
			restored.updateProjectTaskMetadata({ ...base, requestId: "priority-a", priority: "high" }),
			restored.updateProjectTaskMetadata({ ...base, requestId: "priority-b", priority: "medium" }),
		]);
		expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
		expect(harness.host.invoke).toHaveBeenCalledTimes(1);
		expect(restored.getSnapshot().execution.projectMetadata).toEqual({
			...initialProjectMetadata,
			priority: "high",
		});
	});

	it("rejects cross-project writes and requestId reuse with different content", async () => {
		const harness = createHarness({ status: "active" });
		await harness.coordinator.createTask({ version: 1, requestId: "create-scope-task", sessionId: "session-1", objective: "Scope task" });
		await harness.coordinator.controlTask({ version: 1, requestId: "pause-scope-task", sessionId: "session-1", action: "stop", expectedRevision: 1, expectedCursor: "entry-1", bridgeEpoch: 3 });
		const base = { version: 1 as const, projectId: "project-1", sessionId: "session-1", taskId: "T1", requestId: "priority-scope", priority: "high" as const, expectedRevision: 1, expectedCursor: "entry-1", bridgeEpoch: 3 };
		await harness.coordinator.updateProjectTaskMetadata(base);
		await expect(harness.coordinator.updateProjectTaskMetadata({ ...base, priority: "low" })).rejects.toThrow(/requestId/);
		await expect(harness.coordinator.updateProjectTaskMetadata({ ...base, requestId: "other", projectId: "project-2", expectedRevision: 2, expectedCursor: "entry-2" })).rejects.toThrow(/Project/);
	});
});

describe("AgentTaskRuntimeCoordinator public review boundary", () => {
	it("requests review and approves completion through exact revision/cursor/lease CAS", async () => {
		const harness = createHarness({ status: "active" });
		await harness.coordinator.createTask({ version: 1, requestId: "create-review-task", sessionId: "session-1", objective: "Review task" });
		await harness.coordinator.controlTask({ version: 1, requestId: "pause-before-review", sessionId: "session-1", action: "stop", expectedRevision: 1, expectedCursor: "entry-1", bridgeEpoch: 3 });
		const reviewed = await harness.coordinator.requestReview({ version: 1, requestId: "review-1", sessionId: "session-1", taskId: "T1", expectedRevision: 1, expectedCursor: "entry-1", leaseEpoch: 3 });
		expect(reviewed.projection?.status).toBe("review");
		expect(harness.host.invoke).toHaveBeenLastCalledWith(expect.objectContaining({ toolName: "task_update", scope: expect.objectContaining({ expectedRevision: 1, expectedCursor: "entry-1", bridgeEpoch: 3 }), input: expect.objectContaining({ status: "review" }) }));
		const completed = await harness.coordinator.approveCompletion({ version: 1, requestId: "approve-1", sessionId: "session-1", taskId: "T1", expectedRevision: 2, expectedCursor: "entry-2", leaseEpoch: 3 });
		expect(completed.projection?.status).toBe("done");
		expect(harness.host.invoke).toHaveBeenLastCalledWith(expect.objectContaining({ toolName: "task_complete", input: expect.objectContaining({ evidence_ids: ["E1"], criterion_results: [expect.objectContaining({ criterionId: "T1-AC1", evidenceIds: ["E1"] })] }) }));
	});

	it("rejects a stale lease before invoking the host", async () => {
		const harness = createHarness({ status: "active" });
		await harness.coordinator.createTask({ version: 1, requestId: "create-stale-review", sessionId: "session-1", objective: "Review task" });
		harness.host.invoke.mockClear();
		await expect(harness.coordinator.requestReview({ version: 1, requestId: "review-stale", sessionId: "session-1", taskId: "T1", expectedRevision: 1, expectedCursor: "entry-1", leaseEpoch: 2 })).rejects.toThrow(/lease/);
		expect(harness.host.invoke).not.toHaveBeenCalled();
	});
});
