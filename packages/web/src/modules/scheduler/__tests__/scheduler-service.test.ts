import { describe, expect, it } from "vitest";
import { Type } from "@sinclair/typebox";
import type { AgentToolResult } from "@originos/pi-agent-adapter";
import { SchedulerService, computeNextRunAt, DefaultSchedulerActionRunner, ScheduleStore } from "@originos/core/modules/scheduler";
import type { ScheduledTask, ScheduledTaskRun } from "@originos/core/modules/scheduler";
import { getToolRegistry, type ToolRegistration } from "@originos/core/lib/integrations/pi-agent/tools";

class MemoryScheduleStore extends ScheduleStore {
	tasks: ScheduledTask[] = [];
	runs: ScheduledTaskRun[] = [];

	override async listTasks(): Promise<ScheduledTask[]> {
		return this.tasks;
	}

	override async saveTasks(tasks: ScheduledTask[]): Promise<void> {
		this.tasks = tasks;
	}

	override async appendRun(run: ScheduledTaskRun): Promise<void> {
		this.runs.push(run);
	}
}

function textResult(text: string): AgentToolResult<unknown> {
	return { content: [{ type: "text", text }], details: { text } };
}

function futureIso(): string {
	return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

describe("SchedulerService", () => {
	it("computes once, interval, and simple cron nextRunAt values", () => {
		const from = new Date("2026-07-07T00:00:00.000Z");
		expect(computeNextRunAt({ type: "once", runAt: "2026-07-07T01:00:00.000Z" }, from)).toBe("2026-07-07T01:00:00.000Z");
		expect(computeNextRunAt({ type: "interval", everyMs: 60_000 }, from)).toBe("2026-07-07T00:01:00.000Z");
		expect(computeNextRunAt({ type: "cron", expression: "5 * * * *" }, from)).toBe("2026-07-07T00:05:00.000Z");
	});

	it("runs schedulable system tools and records run logs", async () => {
		const registry = getToolRegistry();
		registry.clear();
		const tool: ToolRegistration = {
			name: "scheduled_echo",
			label: "Scheduled Echo",
			description: "Test schedulable tool",
			parameters: Type.Object({ message: Type.String() }),
			category: "system",
			enabled: true,
			schedulable: true,
			execute: async (_toolCallId, params) => textResult(params.message),
		};
		registry.register(tool);

		const store = new MemoryScheduleStore();
		const service = new SchedulerService(store, new DefaultSchedulerActionRunner());
		const task = await service.createTask({
			title: "Echo",
			trigger: { type: "once", runAt: futureIso() },
			action: { type: "system-tool", toolName: "scheduled_echo", input: { message: "hello" } },
		});

		const run = await service.runTask(task.id);

		expect(run.status).toBe("success");
		expect(store.runs).toHaveLength(1);
		expect(store.tasks[0]?.status).toBe("completed");
	});

	it("rejects registered tools that are not marked schedulable", async () => {
		const registry = getToolRegistry();
		registry.clear();
		registry.register({
			name: "unsafe_tool",
			label: "Unsafe",
			description: "Not schedulable",
			parameters: Type.Object({}),
			category: "system",
			enabled: true,
			execute: async () => textResult("unsafe"),
		});

		const store = new MemoryScheduleStore();
		const service = new SchedulerService(store, new DefaultSchedulerActionRunner());
		const task = await service.createTask({
			title: "Unsafe",
			trigger: { type: "once", runAt: futureIso() },
			action: { type: "system-tool", toolName: "unsafe_tool", input: {} },
		});

		const run = await service.runTask(task.id);

		expect(run.status).toBe("failed");
		expect(run.error).toContain("not schedulable");
	});

	it("rejects system tool input that fails schema validation", async () => {
		const registry = getToolRegistry();
		registry.clear();
		registry.register({
			name: "strict_tool",
			label: "Strict",
			description: "Strict schedulable tool",
			parameters: Type.Object({ message: Type.String() }),
			category: "system",
			enabled: true,
			schedulable: true,
			execute: async () => textResult("strict"),
		});

		const store = new MemoryScheduleStore();
		const service = new SchedulerService(store, new DefaultSchedulerActionRunner());
		const task = await service.createTask({
			title: "Strict",
			trigger: { type: "once", runAt: futureIso() },
			action: { type: "system-tool", toolName: "strict_tool", input: { message: 42 } },
		});

		const run = await service.runTask(task.id);

		expect(run.status).toBe("failed");
		expect(run.error).toContain("schema validation");
	});
});
