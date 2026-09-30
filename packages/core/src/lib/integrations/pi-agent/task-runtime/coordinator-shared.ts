// task-runtime coordinator 的错误类型与模块级纯 helper。

import type { AgentMessage } from "@originos/pi-agent-adapter";
import type {
	AgentTaskExecutionStateV1,
	AgentTaskProjectionV1,
} from "./types";
import type {
	TaskBranchEntry,
	TaskSessionHost,
	TaskSessionHostFactoryOptions,
} from "./coordinator-types";

export class AgentTaskRuntimeConflictError extends Error {
	readonly code = "TASK_RUNTIME_CONFLICT";
}

export class AgentTaskRuntimeProtocolError extends Error {
	readonly code = "TASK_RUNTIME_PROTOCOL_ERROR";
}

export function toTaskBranchEntries(entries: readonly unknown[]): TaskBranchEntry[] {
	return entries.filter((entry): entry is TaskBranchEntry => {
		return entry !== null && typeof entry === "object"
			&& typeof (entry as { id?: unknown }).id === "string";
	});
}

export async function defaultHostFactory(
	options: TaskSessionHostFactoryOptions,
): Promise<TaskSessionHost> {
	const module = await import("@originos/pi-agent-adapter/task-runtime") as unknown as {
		createPiTaskSessionHost(input: TaskSessionHostFactoryOptions): Promise<TaskSessionHost>;
	};
	return module.createPiTaskSessionHost(options);
}

export function internalUserMessage(text: string): AgentMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
	} as unknown as AgentMessage;
}

export function visibleUserMessage(text: string): AgentMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
	} as unknown as AgentMessage;
}

export function taskStatusFromProjection(
	projection: AgentTaskProjectionV1,
): AgentTaskExecutionStateV1["status"] {
	switch (projection.status) {
		case "done":
			return "completed";
		case "cancelled":
			return "cancelled";
		case "blocked":
			return "waiting_user";
		default:
			return "running";
	}
}

export function isActiveExecution(status: AgentTaskExecutionStateV1["status"]): boolean {
	return status === "planning" || status === "running" || status === "waiting_user" || status === "paused";
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
