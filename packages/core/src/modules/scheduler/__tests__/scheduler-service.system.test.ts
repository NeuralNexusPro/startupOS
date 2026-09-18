import { describe, expect, it, vi } from "vitest";
import { SchedulerService } from "../scheduler-service";
import type { ScheduleStore } from "../schedule-store";
import type { ScheduledTask, ScheduledTaskRun } from "../types";

const flush = async (): Promise<void> => {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

function memoryStore(tasks: ScheduledTask[] = []): ScheduleStore {
	return {
		listTasks: vi.fn(async () => tasks),
		saveTasks: vi.fn(async (next: ScheduledTask[]) => { tasks = next; }),
		getTask: vi.fn(async (id: string) => tasks.find((task) => task.id === id)),
		appendRun: vi.fn(async (_run: ScheduledTaskRun) => undefined),
	} as unknown as ScheduleStore;
}

describe("SchedulerService system tasks", () => {
	it("keeps legacy user tasks visible while system callbacks remain internal", async () => {
		const legacy = {
			id: "legacy", title: "legacy", status: "enabled", trigger: { type: "interval", everyMs: 1000 },
			action: { type: "system", command: "notify" }, timezone: "UTC", nextRunAt: new Date(2000).toISOString(),
			createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
		} satisfies ScheduledTask;
		const persistedInternal = { ...legacy, id: "internal", ownerKind: "system", ownerId: "plugin", visibility: "internal" } satisfies ScheduledTask;
		const scheduler = new SchedulerService(memoryStore([legacy, persistedInternal]), undefined, { now: () => 0 });
		scheduler.registerSystemTask({ id: "mail:a:poll", ownerId: "mail:a", intervalMs: 1000, callback: async () => undefined });

		expect(await scheduler.listTasks()).toEqual([{
			...legacy, ownerKind: "user", ownerId: "user", visibility: "user",
		}]);
		expect(scheduler.listSystemTasks()).toMatchObject([{
			id: "mail:a:poll", ownerId: "mail:a", ownerKind: "system", visibility: "internal", state: "scheduled",
		}]);
		const created = await scheduler.createTask({
			title: "new", trigger: { type: "interval", everyMs: 1000 }, action: { type: "system", command: "notify" }, timezone: "UTC",
		});
		expect(created).toMatchObject({ ownerKind: "user", ownerId: "user", visibility: "user" });
		await expect(scheduler.updateTask("internal", { title: "changed" })).rejects.toThrow("not found");
		expect(await scheduler.deleteTask("internal")).toBe(false);
		await expect(scheduler.runTask("internal")).rejects.toThrow("not found");
		const runner = { run: vi.fn(async () => undefined) };
		const internalOnly = new SchedulerService(memoryStore([{ ...persistedInternal, nextRunAt: new Date(0).toISOString() }]), runner);
		expect(await internalOnly.runDueTasks(new Date(1000))).toEqual([]);
		expect(runner.run).not.toHaveBeenCalled();
	});

	it("dispatches owners independently and skips overlap for only the running task", async () => {
		let now = 0;
		let release!: () => void;
		const slow = new Promise<void>((resolve) => { release = resolve; });
		const first = vi.fn(async () => slow);
		const second = vi.fn(async () => undefined);
		const scheduler = new SchedulerService(memoryStore(), undefined, { now: () => now, random: () => 0 });
		scheduler.registerSystemTask({ id: "mail:a:poll", ownerId: "mail:a", intervalMs: 1000, callback: first });
		scheduler.registerSystemTask({ id: "mail:b:poll", ownerId: "mail:b", intervalMs: 1000, callback: second });

		now = 1000;
		expect(scheduler.runDueSystemTasks()).toBe(2);
		await flush();
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();

		now = 2000;
		expect(scheduler.runDueSystemTasks()).toBe(1);
		await flush();
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledTimes(2);
		expect(scheduler.listSystemTasks().find((task) => task.id === "mail:a:poll")?.lastOutcome).toBe("overlap-skipped");
		release();
		await scheduler.stopSystemTasks();
	});

	it("applies bounded per-task backoff, resets after success, and redacts failures", async () => {
		let now = 0;
		const callback = vi.fn()
			.mockRejectedValueOnce(new Error("password=secret message body"))
			.mockResolvedValue(undefined);
		const scheduler = new SchedulerService(memoryStore(), undefined, { now: () => now, random: () => 1 });
		scheduler.registerSystemTask({
			id: "mail:a:poll", ownerId: "mail:a", intervalMs: 1000, maxBackoffMs: 2500, jitterRatio: 0.5, callback,
		});

		now = 1000;
		scheduler.runDueSystemTasks();
		await flush();
		const failed = scheduler.listSystemTasks()[0];
		expect(failed).toMatchObject({ state: "backoff", consecutiveFailures: 1, safeCode: "SYSTEM_TASK_FAILED" });
		expect(JSON.stringify(failed)).not.toContain("secret");
		expect(failed?.nextRunAt).toBe(new Date(3500).toISOString());

		now = 3500;
		scheduler.runDueSystemTasks();
		await flush();
		expect(scheduler.listSystemTasks()[0]).toMatchObject({ state: "scheduled", consecutiveFailures: 0, lastOutcome: "success" });
		expect(scheduler.listSystemTasks()[0]?.safeCode).toBeUndefined();
	});

	it("stops new dispatch and waits for an in-flight callback", async () => {
		let now = 0;
		let release!: () => void;
		const callback = vi.fn(async () => new Promise<void>((resolve) => { release = resolve; }));
		const scheduler = new SchedulerService(memoryStore(), undefined, { now: () => now });
		scheduler.registerSystemTask({ id: "mail:a:poll", ownerId: "mail:a", intervalMs: 1000, callback });
		now = 1000;
		scheduler.runDueSystemTasks();
		await flush();
		let stopped = false;
		const stopping = scheduler.stopSystemTasks().then(() => { stopped = true; });
		await flush();
		expect(stopped).toBe(false);
		now = 2000;
		expect(scheduler.runDueSystemTasks()).toBe(0);
		release();
		await stopping;
		expect(stopped).toBe(true);
	});

	it("dispatches only once after a long clock jump", async () => {
		let now = 0;
		const callback = vi.fn(async () => undefined);
		const scheduler = new SchedulerService(memoryStore(), undefined, { now: () => now });
		scheduler.registerSystemTask({ id: "mail:a:poll", ownerId: "mail:a", intervalMs: 1000, callback });

		now = 60_000;
		expect(scheduler.runDueSystemTasks()).toBe(1);
		await flush();
		expect(scheduler.runDueSystemTasks()).toBe(0);
		expect(callback).toHaveBeenCalledOnce();
	});

	it("supports an explicit immediate run", async () => {
		const callback = vi.fn(async () => undefined);
		const scheduler = new SchedulerService(memoryStore(), undefined, { now: () => 0 });
		scheduler.registerSystemTask({ id: "mail:a:poll", ownerId: "mail:a", intervalMs: 1000, callback });

		expect(scheduler.runSystemTask("mail:a:poll")).toBe(true);
		await flush();
		expect(callback).toHaveBeenCalledOnce();
		expect(scheduler.runSystemTask("missing")).toBe(false);
	});
});
