import { describe, expect, it } from "vitest";
import {
	createAgentTaskProgressFingerprint,
	projectPiTaskSnapshot,
} from "../projection";

describe("projectPiTaskSnapshot", () => {
	it("将 canonical snapshot 投影为有界 UI 状态", () => {
		const projection = projectPiTaskSnapshot({
			stateHash: "hash-1",
			scope: { revision: 3, cursor: "entry-3" },
			state: {
				activeTaskId: "T1",
				tasks: {
					T1: {
						title: "任务标题",
						objective: "0123456789012345678901234567890123456789",
						status: "active",
						progress: 33,
						currentStep: "执行实现",
						nextAction: "运行测试",
						planSteps: [
							{ id: "S1", text: "实现", expectedOutput: "代码", status: "active", evidenceIds: [] },
							{ id: "S2", text: "测试", expectedOutput: "通过", status: "pending", evidenceIds: [] },
						],
						acceptanceCriteria: [
							{ id: "AC1", text: "测试通过", status: "pending", evidenceIds: [] },
						],
						blockers: [],
						evidence: [{ id: "E1" }],
						warnings: [],
					},
				},
			},
		}, { maxItems: 1, maxTextLength: 8 });

		expect(projection).toMatchObject({
			taskId: "T1",
			status: "active",
			revision: 3,
			cursor: "entry-3",
			stateHash: "hash-1",
			truncated: true,
			actions: ["stop", "cancel"],
		});
		expect(projection?.objective).toBe("01234567890123456789012345678901…");
		expect(projection?.steps).toHaveLength(1);
		expect(projection?.criteria).toHaveLength(1);
	});

	it("不包含任务时返回 undefined", () => {
		expect(projectPiTaskSnapshot({ state: { tasks: {} } })).toBeUndefined();
	});

	it("进度指纹只依赖完整 canonical 投影", () => {
		const projection = projectPiTaskSnapshot({
			stateHash: "hash",
			scope: { revision: 1, cursor: "cursor" },
			state: {
				activeTaskId: "T1",
				tasks: {
					T1: {
						title: "T",
						objective: "O",
						status: "done",
						progress: 100,
						planSteps: [],
						acceptanceCriteria: [],
						blockers: [],
						evidence: [],
						warnings: [],
					},
				},
			},
		});
		expect(createAgentTaskProgressFingerprint(projection)).toContain("T1::1::hash::done::100");
	});
});
