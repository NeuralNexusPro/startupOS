import type {
	CreateScheduledTaskInput,
	ScheduledTask,
	ScheduledTaskRun,
	SchedulerActionRunner,
	SchedulerRuntimeOptions,
	ScheduleTrigger,
	SystemScheduledTaskInput,
	SystemScheduledTaskSnapshot,
	UpdateScheduledTaskInput,
} from "./types";
import { scheduleStore, type ScheduleStore } from "./schedule-store";

function nowIso(): string {
	return new Date().toISOString();
}

function createId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSystemTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isUserTask(task: ScheduledTask): boolean {
	return task.ownerKind !== "system" && task.visibility !== "internal";
}

function parseDate(value: string, fieldName: string): Date {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid ${fieldName}: ${value}`);
	}
	return date;
}

function parseCron(expression: string): { minute: number | "*"; hour: number | "*" } {
	const parts = expression.trim().split(/\s+/);
	if (parts.length !== 5) {
		throw new Error("Only standard 5-field cron expressions are supported");
	}
	const [minutePart, hourPart] = parts;
	if (!minutePart || !hourPart) {
		throw new Error("Cron expression must include minute and hour fields");
	}
	const parsePart = (value: string, min: number, max: number, label: string): number | "*" => {
		if (value === "*") return "*";
		if (!/^\d+$/.test(value)) {
			throw new Error(`Unsupported cron ${label}: ${value}`);
		}
		const parsed = Number(value);
		if (parsed < min || parsed > max) {
			throw new Error(`Cron ${label} out of range: ${value}`);
		}
		return parsed;
	};
	return {
		minute: parsePart(minutePart, 0, 59, "minute"),
		hour: parsePart(hourPart, 0, 23, "hour"),
	};
}

export function computeNextRunAt(trigger: ScheduleTrigger, from: Date = new Date()): string {
	if (trigger.type === "once") {
		const runAt = parseDate(trigger.runAt, "runAt");
		if (runAt.getTime() <= from.getTime()) {
			throw new Error("once trigger runAt must be in the future");
		}
		return runAt.toISOString();
	}

	if (trigger.type === "interval") {
		if (!Number.isFinite(trigger.everyMs) || trigger.everyMs < 1000) {
			throw new Error("interval trigger everyMs must be at least 1000");
		}
		const start = trigger.startAt ? parseDate(trigger.startAt, "startAt") : from;
		const end = trigger.endAt ? parseDate(trigger.endAt, "endAt") : undefined;
		let next = start.getTime() > from.getTime() ? start.getTime() : from.getTime() + trigger.everyMs;
		if (end && next > end.getTime()) {
			throw new Error("interval trigger has no future run before endAt");
		}
		return new Date(next).toISOString();
	}

	const cron = parseCron(trigger.expression);
	const candidate = new Date(from.getTime() + 60_000);
	candidate.setSeconds(0, 0);
	for (let i = 0; i < 366 * 24 * 60; i += 1) {
		const minuteMatches = cron.minute === "*" || candidate.getMinutes() === cron.minute;
		const hourMatches = cron.hour === "*" || candidate.getHours() === cron.hour;
		if (minuteMatches && hourMatches) {
			return candidate.toISOString();
		}
		candidate.setMinutes(candidate.getMinutes() + 1);
	}
	throw new Error("cron trigger has no future run in search window");
}

export class SchedulerService {
	private readonly systemTasks = new Map<string, SystemScheduledTask>();
	private readonly systemRuns = new Set<Promise<void>>();
	private readonly clock: () => number;
	private readonly random: () => number;
	private systemDispatchEnabled = true;

	constructor(
		private readonly store: ScheduleStore = scheduleStore,
		private readonly runner?: SchedulerActionRunner,
		options: SchedulerRuntimeOptions = {}
	) {
		this.clock = options.now ?? Date.now;
		this.random = options.random ?? Math.random;
	}

	async listTasks(): Promise<ScheduledTask[]> {
		return (await this.store.listTasks())
			.filter(isUserTask)
			.map((task) => ({
				...task,
				ownerKind: "user",
				ownerId: task.ownerId ?? "user",
				visibility: "user",
			}));
	}

	async createTask(input: CreateScheduledTaskInput): Promise<ScheduledTask> {
		const timestamp = nowIso();
		const task: ScheduledTask = {
			id: createId("schedule"),
			ownerKind: "user",
			ownerId: "user",
			visibility: "user",
			title: input.title,
			...(input.description ? { description: input.description } : {}),
			status: "enabled",
			trigger: input.trigger,
			action: input.action,
			timezone: input.timezone ?? getSystemTimezone(),
			nextRunAt: computeNextRunAt(input.trigger),
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		const tasks = await this.store.listTasks();
		await this.store.saveTasks([...tasks, task]);
		return task;
	}

	async updateTask(taskId: string, input: UpdateScheduledTaskInput): Promise<ScheduledTask> {
		const tasks = await this.store.listTasks();
		const index = tasks.findIndex((task) => task.id === taskId && isUserTask(task));
		if (index < 0) throw new Error(`Scheduled task not found: ${taskId}`);
		const existing = tasks[index];
		if (!existing) throw new Error(`Scheduled task not found: ${taskId}`);
		const trigger = input.trigger ?? existing.trigger;
		const status = input.status ?? existing.status;
		const task: ScheduledTask = {
			...existing,
			...input,
			status,
			trigger,
			nextRunAt: status === "enabled" && (input.trigger || existing.status !== "enabled")
				? computeNextRunAt(trigger)
				: existing.nextRunAt,
			updatedAt: nowIso(),
		};
		tasks[index] = task;
		await this.store.saveTasks(tasks);
		return task;
	}

	async deleteTask(taskId: string): Promise<boolean> {
		const tasks = await this.store.listTasks();
		const index = tasks.findIndex((task) => task.id === taskId && isUserTask(task));
		if (index < 0) return false;
		tasks.splice(index, 1);
		await this.store.saveTasks(tasks);
		return true;
	}

	async runTask(taskId: string): Promise<ScheduledTaskRun> {
		const tasks = await this.store.listTasks();
		const index = tasks.findIndex((task) => task.id === taskId && isUserTask(task));
		if (index < 0) throw new Error(`Scheduled task not found: ${taskId}`);
		return this.runAndPersist(tasks, index);
	}

	async runDueTasks(referenceTime: Date = new Date()): Promise<ScheduledTaskRun[]> {
		const tasks = await this.store.listTasks();
		const runs: ScheduledTaskRun[] = [];
		for (let i = 0; i < tasks.length; i += 1) {
			const task = tasks[i];
			if (!task) continue;
			if (!isUserTask(task)) continue;
			if (task.status !== "enabled") continue;
			if (parseDate(task.nextRunAt, "nextRunAt").getTime() > referenceTime.getTime()) continue;
			runs.push(await this.runAndPersist(tasks, i, referenceTime));
		}
		return runs;
	}

	registerSystemTask(input: SystemScheduledTaskInput): void {
		if (!input.id.trim() || !input.ownerId.trim()) throw new Error("System task id and ownerId are required");
		if (!Number.isFinite(input.intervalMs) || input.intervalMs < 1000) {
			throw new Error("System task intervalMs must be at least 1000");
		}
		const jitterRatio = input.jitterRatio ?? 0.1;
		if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
			throw new Error("System task jitterRatio must be between 0 and 1");
		}
		const maxBackoffMs = input.maxBackoffMs ?? Math.max(input.intervalMs, 15 * 60_000);
		if (!Number.isFinite(maxBackoffMs) || maxBackoffMs < input.intervalMs) {
			throw new Error("System task maxBackoffMs must be at least intervalMs");
		}
		this.systemTasks.set(input.id, {
			...input,
			maxBackoffMs,
			jitterRatio,
			nextRunAt: this.clock() + (input.runImmediately === false ? input.intervalMs : 0),
			running: false,
			consecutiveFailures: 0,
		});
	}

	cancelSystemTask(taskId: string): boolean {
		return this.systemTasks.delete(taskId);
	}

	listSystemTasks(): SystemScheduledTaskSnapshot[] {
		return [...this.systemTasks.values()].map((task) => ({
			id: task.id,
			ownerId: task.ownerId,
			ownerKind: "system",
			visibility: "internal",
			intervalMs: task.intervalMs,
			nextRunAt: new Date(task.nextRunAt).toISOString(),
			...(task.lastRunAt === undefined ? {} : { lastRunAt: new Date(task.lastRunAt).toISOString() }),
			state: task.running ? "running" : task.consecutiveFailures > 0 ? "backoff" : "scheduled",
			consecutiveFailures: task.consecutiveFailures,
			...(task.lastOutcome ? { lastOutcome: task.lastOutcome } : {}),
			...(task.safeCode ? { safeCode: task.safeCode } : {}),
		}));
	}

	runDueSystemTasks(referenceTime = this.clock()): number {
		if (!this.systemDispatchEnabled) return 0;
		let dispatched = 0;
		for (const task of this.systemTasks.values()) {
			if (task.nextRunAt > referenceTime) continue;
			if (this.dispatchSystemTask(task, referenceTime)) dispatched += 1;
		}
		return dispatched;
	}

	runSystemTask(taskId: string, referenceTime = this.clock()): boolean {
		const task = this.systemTasks.get(taskId);
		return Boolean(this.systemDispatchEnabled && task && this.dispatchSystemTask(task, referenceTime));
	}

	startSystemTasks(): void {
		this.systemDispatchEnabled = true;
	}

	pauseSystemTasks(): void {
		this.systemDispatchEnabled = false;
	}

	async stopSystemTasks(): Promise<void> {
		this.pauseSystemTasks();
		await Promise.allSettled([...this.systemRuns]);
	}

	private dispatchSystemTask(task: SystemScheduledTask, referenceTime: number): boolean {
		if (task.running) {
			task.lastOutcome = "overlap-skipped";
			task.nextRunAt = referenceTime + task.intervalMs;
			return false;
		}
		task.running = true;
		task.lastRunAt = referenceTime;
		task.nextRunAt = referenceTime + task.intervalMs;
		let run!: Promise<void>;
		run = Promise.resolve()
			.then(task.callback)
			.then(() => {
				task.consecutiveFailures = 0;
				task.lastOutcome = "success";
				task.safeCode = undefined;
			})
			.catch(() => {
				task.consecutiveFailures += 1;
				task.lastOutcome = "failed";
				task.safeCode = "SYSTEM_TASK_FAILED";
				const base = Math.min(task.intervalMs * 2 ** task.consecutiveFailures, task.maxBackoffMs);
				const jitter = Math.floor(base * task.jitterRatio * this.random());
				task.nextRunAt = this.clock() + Math.min(base + jitter, task.maxBackoffMs);
			})
			.finally(() => {
				task.running = false;
				this.systemRuns.delete(run);
			});
		this.systemRuns.add(run);
		return true;
	}

	private async runAndPersist(tasks: ScheduledTask[], index: number, referenceTime: Date = new Date()): Promise<ScheduledTaskRun> {
		const task = tasks[index];
		if (!task) throw new Error(`Scheduled task not found at index: ${index}`);
		const startedAt = nowIso();
		let run: ScheduledTaskRun;
		try {
			const result = this.runner ? await this.runner.run(task) : { skipped: true, reason: "No scheduler action runner configured" };
			run = {
				id: createId("schedule-run"),
				taskId: task.id,
				startedAt,
				endedAt: nowIso(),
				status: this.runner ? "success" : "skipped",
				actionType: task.action.type,
				result,
			};
			tasks[index] = this.advanceTask(task, referenceTime, run.status === "success" ? undefined : "failed");
		} catch (error) {
			run = {
				id: createId("schedule-run"),
				taskId: task.id,
				startedAt,
				endedAt: nowIso(),
				status: "failed",
				actionType: task.action.type,
				error: error instanceof Error ? error.message : String(error),
			};
			tasks[index] = this.advanceTask(task, referenceTime, "failed");
		}
		await this.store.appendRun(run);
		await this.store.saveTasks(tasks);
		return run;
	}

	private advanceTask(task: ScheduledTask, referenceTime: Date, failureStatus?: "failed"): ScheduledTask {
		const timestamp = nowIso();
		if (task.trigger.type === "once") {
			return {
				...task,
				status: failureStatus ?? "completed",
				lastRunAt: timestamp,
				updatedAt: timestamp,
			};
		}
		try {
			return {
				...task,
				status: failureStatus ?? "enabled",
				lastRunAt: timestamp,
				nextRunAt: computeNextRunAt(task.trigger, referenceTime),
				updatedAt: timestamp,
			};
		} catch {
			return {
				...task,
				status: "completed",
				lastRunAt: timestamp,
				updatedAt: timestamp,
			};
		}
	}
}

interface SystemScheduledTask extends SystemScheduledTaskInput {
	maxBackoffMs: number;
	jitterRatio: number;
	nextRunAt: number;
	lastRunAt?: number;
	running: boolean;
	consecutiveFailures: number;
	lastOutcome?: SystemScheduledTaskSnapshot["lastOutcome"];
	safeCode?: SystemScheduledTaskSnapshot["safeCode"];
}
