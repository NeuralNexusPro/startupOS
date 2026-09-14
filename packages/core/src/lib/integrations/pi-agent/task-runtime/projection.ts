import type {
	AgentTaskAction,
	AgentTaskBlockerProjectionV1,
	AgentTaskCriterionProjectionV1,
	AgentTaskProjectionV1,
	AgentTaskStepProjectionV1,
} from "./types";

const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_MAX_TEXT_LENGTH = 2_000;

export interface PiTaskSnapshotLike {
	state?: unknown;
	stateHash?: unknown;
	scope?: unknown;
	truncation?: unknown;
}

export interface AgentTaskProjectionOptions {
	maxItems?: number;
	maxTextLength?: number;
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function text(value: unknown, maxLength: number): { value: string; truncated: boolean } {
	const normalized = typeof value === "string" ? value : "";
	if (normalized.length <= maxLength) {
		return { value: normalized, truncated: false };
	}
	return { value: `${normalized.slice(0, maxLength)}…`, truncated: true };
}

function number(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function taskActions(status: AgentTaskProjectionV1["status"]): AgentTaskAction[] {
	switch (status) {
		case "done":
		case "cancelled":
			return ["return_to_chat"];
		case "blocked":
			return ["cancel"];
		default:
			return ["stop", "cancel"];
	}
}

function normalizeStatus(value: unknown): AgentTaskProjectionV1["status"] {
	return value === "pending" || value === "active" || value === "blocked"
		|| value === "review" || value === "done" || value === "cancelled"
		? value
		: "pending";
}

function normalizeStepStatus(value: unknown): AgentTaskStepProjectionV1["status"] {
	return value === "active" || value === "done" || value === "skipped" ? value : "pending";
}

function normalizeCriterionStatus(value: unknown): AgentTaskCriterionProjectionV1["status"] {
	return value === "satisfied" || value === "failed" || value === "skipped" ? value : "pending";
}

function normalizeBlockedBy(value: unknown): AgentTaskBlockerProjectionV1["blockedBy"] {
	return value === "user" || value === "external" || value === "environment"
		|| value === "dependency" || value === "ambiguity"
		? value
		: "environment";
}

export function projectPiTaskSnapshot(
	snapshot: PiTaskSnapshotLike,
	options: AgentTaskProjectionOptions = {},
): AgentTaskProjectionV1 | undefined {
	const maxItems = Math.max(1, options.maxItems ?? DEFAULT_MAX_ITEMS);
	const maxTextLength = Math.max(32, options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH);
	const state = record(snapshot.state);
	const tasks = record(state?.["tasks"]);
	if (!state || !tasks) {
		return undefined;
	}
	const activeTaskId = typeof state["activeTaskId"] === "string"
		? state["activeTaskId"]
		: Object.keys(tasks)[0];
	const task = activeTaskId ? record(tasks[activeTaskId]) : null;
	if (!activeTaskId || !task) {
		return undefined;
	}

	let truncated = snapshot.truncation !== undefined;
	const boundedText = (value: unknown): string => {
		const result = text(value, maxTextLength);
		truncated ||= result.truncated;
		return result.value;
	};
	const boundedRecords = (value: unknown): Record<string, unknown>[] => {
		const source = Array.isArray(value) ? value : [];
		if (source.length > maxItems) {
			truncated = true;
		}
		return source.slice(0, maxItems).map(record).filter((item): item is Record<string, unknown> => item !== null);
	};

	const steps = boundedRecords(task["planSteps"]).map((step): AgentTaskStepProjectionV1 => ({
		id: boundedText(step["id"]),
		text: boundedText(step["text"]),
		expectedOutput: boundedText(step["expectedOutput"]),
		status: normalizeStepStatus(step["status"]),
		evidenceRequired: step["evidenceRequired"] !== false,
		evidenceCount: strings(step["evidenceIds"]).length,
	}));
	const criteria = boundedRecords(task["acceptanceCriteria"]).map((criterion): AgentTaskCriterionProjectionV1 => {
		const note = boundedText(criterion["note"]);
		return {
			id: boundedText(criterion["id"]),
			text: boundedText(criterion["text"]),
			status: normalizeCriterionStatus(criterion["status"]),
			evidenceCount: strings(criterion["evidenceIds"]).length,
			...(note ? { note } : {}),
		};
	});
	const blockers = boundedRecords(task["blockers"]).map((blocker): AgentTaskBlockerProjectionV1 => ({
		id: boundedText(blocker["id"]),
		reason: boundedText(blocker["reason"]),
		blockedBy: normalizeBlockedBy(blocker["blockedBy"]),
		neededToUnblock: boundedText(blocker["neededToUnblock"]),
		resolved: typeof blocker["resolvedAt"] === "string" && blocker["resolvedAt"].length > 0,
	}));
	const warningsSource = strings(task["warnings"]);
	if (warningsSource.length > maxItems) {
		truncated = true;
	}
	const warnings = warningsSource.slice(0, maxItems).map(boundedText);
	const scope = record(snapshot.scope);
	const status = normalizeStatus(task["status"]);
	const currentStep = boundedText(task["currentStep"]);
	const nextAction = boundedText(task["nextAction"]);

	return {
		version: 1,
		taskId: activeTaskId,
		title: boundedText(task["title"]),
		objective: boundedText(task["objective"]),
		status,
		progress: Math.max(0, Math.min(100, number(task["progress"]))),
		...(currentStep ? { currentStep } : {}),
		...(nextAction ? { nextAction } : {}),
		steps,
		criteria,
		blockers,
		warnings,
		evidenceCount: boundedRecords(task["evidence"]).length,
		actions: taskActions(status),
		revision: number(scope?.["revision"]),
		cursor: typeof scope?.["cursor"] === "string" ? scope["cursor"] : null,
		stateHash: typeof snapshot.stateHash === "string" ? snapshot.stateHash : "",
		truncated,
	};
}

export function createAgentTaskProgressFingerprint(
	projection: AgentTaskProjectionV1 | undefined,
): string {
	if (!projection) {
		return "no-task";
	}
	return [
		projection.taskId,
		projection.revision,
		projection.stateHash,
		projection.status,
		projection.progress,
		projection.steps.map((step) => `${step.id}:${step.status}:${step.evidenceCount}`).join("|"),
		projection.criteria.map((criterion) => `${criterion.id}:${criterion.status}:${criterion.evidenceCount}`).join("|"),
		projection.blockers.filter((blocker) => !blocker.resolved).map((blocker) => blocker.id).join("|"),
	].join("::");
}
