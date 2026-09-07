import type { PiTaskMutationReceipt, PiTaskRuntimeMetadata } from "./contracts.ts";
import type { TaskState } from "./model.ts";
import type { ExtensionAPI, ExtensionContext } from "./pi-types.ts";

export declare const TASK_STATE_EVENT = "pi-tasks:state";
export declare const TASK_WIDGET_ID = "pi-tasks";
export type TaskStateEventReason = "session_start" | "session_tree" | "task_mutation" | "compaction";
export interface TaskStateEventV2 {
    version: 2;
    reason: TaskStateEventReason;
    widgetId: typeof TASK_WIDGET_ID;
    scope: {
        sessionId: string;
        cursor: string | null;
        revision: number;
    };
    mutation?: {
        requestId: string;
        command: string;
        eventId: string;
        receipt: PiTaskMutationReceipt;
    };
    stateHash: string;
    state: Omit<TaskState, "events">;
}
export declare function emitTaskState(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    state: TaskState,
    reason: TaskStateEventReason,
    metadata: PiTaskRuntimeMetadata,
    receipt?: PiTaskMutationReceipt,
): TaskStateEventV2;
export declare function requireTaskSessionId(ctx: ExtensionContext): string;
