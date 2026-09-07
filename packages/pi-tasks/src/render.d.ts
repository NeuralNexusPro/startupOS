import type { Task, TaskResumeContext, TaskState } from "./model.ts";
export declare function truncateText(text: string, maxWidth: number): string;
export declare function formatStatusText(state: TaskState, maxWidth?: number): string | undefined;
export declare function formatWidgetLines(state: TaskState, maxWidth?: number): string[] | undefined;
export declare function formatTaskList(state: TaskState, options?: {
    includeDone?: boolean;
    includeEvidence?: boolean;
    limit?: number;
}): string;
export declare function formatTaskFocus(state: TaskState): string;
export declare function buildTaskResume(state: TaskState): TaskResumeContext;
export declare function formatTaskResume(state: TaskState): string;
export declare function formatTaskNext(state: TaskState): string;
export declare function getVerificationGaps(task: Task): string[];
