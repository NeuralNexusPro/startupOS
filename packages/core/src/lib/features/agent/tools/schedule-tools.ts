import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { AgentToolResult } from "@originos/pi-agent-adapter";
import type { ToolRegistration } from "../../../integrations/pi-agent/types";
import {
	DefaultSchedulerActionRunner,
	SchedulerService,
	type ScheduledAction,
	type ScheduleTrigger,
} from "../../../../modules/scheduler/index";
import { setToolContext } from "../../../integrations/pi-agent/tools/context";

const TriggerSchema = Type.Union([
	Type.Object({
		type: Type.Literal("once"),
		runAt: Type.String({ description: "ISO 8601 time when the task should run." }),
	}),
	Type.Object({
		type: Type.Literal("interval"),
		everyMs: Type.Number({ minimum: 1000 }),
		startAt: Type.Optional(Type.String()),
		endAt: Type.Optional(Type.String()),
	}),
	Type.Object({
		type: Type.Literal("cron"),
		expression: Type.String({ description: "Standard 5-field cron expression. Initial implementation supports numeric or * minute/hour fields." }),
	}),
]);

const ActionSchema = Type.Union([
	Type.Object({
		type: Type.Literal("system"),
		command: Type.Union([Type.Literal("open-window"), Type.Literal("notify"), Type.Literal("check-update")]),
		payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
	}),
	Type.Object({
		type: Type.Literal("system-tool"),
		toolName: Type.String({ minLength: 1 }),
		input: Type.Record(Type.String(), Type.Unknown()),
		projectId: Type.Optional(Type.String()),
		workingDirectory: Type.Optional(Type.String({
			description: "Optional working directory for project-bound scheduled system tools. Must be resolved by the caller; tools still enforce their own path boundaries.",
		})),
	}),
]);

const CreateScheduleParamsSchema = Type.Object({
	title: Type.String({ minLength: 1 }),
	description: Type.Optional(Type.String()),
	trigger: TriggerSchema,
	action: ActionSchema,
	timezone: Type.Optional(Type.String()),
});

const TaskIdParamsSchema = Type.Object({
	taskId: Type.String({ minLength: 1 }),
});

function result(data: unknown): AgentToolResult<unknown> {
	return {
		content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
		details: data,
	};
}

function errorResult(error: unknown): AgentToolResult<unknown> {
	return result({
		ok: false,
		error: error instanceof Error ? error.message : String(error),
	});
}

function service(): SchedulerService {
	return new SchedulerService(undefined, new DefaultSchedulerActionRunner());
}

function normalizeAction(action: Static<typeof ActionSchema>): ScheduledAction {
	return action;
}

const ScheduleTaskTool: ToolRegistration = {
	name: "schedule_task",
	label: "创建定时任务",
	description:
		"Create a system-level scheduled task. Supports safe system actions and schedulable system-tool actions only. Never accepts raw shell commands.",
	parameters: CreateScheduleParamsSchema,
	category: "system",
	enabled: true,
	async execute(_toolCallId: string, params: Static<typeof CreateScheduleParamsSchema>): Promise<AgentToolResult<unknown>> {
		try {
			const scheduler = service();
			const task = await scheduler.createTask({
				title: params.title,
				description: params.description,
				trigger: params.trigger as ScheduleTrigger,
				action: normalizeAction(params.action),
				timezone: params.timezone,
			});
			if (params.action.type === "system-tool" && params.action.workingDirectory) {
				setToolContext(task.id, { sessionId: task.id, workingDirectory: params.action.workingDirectory });
			}
			return result({ ok: true, task });
		} catch (error) {
			return errorResult(error);
		}
	},
};

const RunScheduleNowTool: ToolRegistration = {
	name: "run_schedule_now",
	label: "立即运行定时任务",
	description: "Run a scheduled task immediately by id and append a run log.",
	parameters: TaskIdParamsSchema,
	category: "system",
	enabled: true,
	async execute(_toolCallId: string, params: Static<typeof TaskIdParamsSchema>): Promise<AgentToolResult<unknown>> {
		try {
			const run = await service().runTask(params.taskId);
			return result({ ok: true, run });
		} catch (error) {
			return errorResult(error);
		}
	},
};

export const scheduleTools: ToolRegistration[] = [
	ScheduleTaskTool,
	RunScheduleNowTool,
];
