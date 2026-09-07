import { type TaskEvent, type TaskState } from "./model.ts";
export declare class TaskTransitionError extends Error {
    constructor(message: string);
}
export declare function reduceTaskState(state: TaskState, event: TaskEvent): TaskState;
export declare function replayTaskEvents(events: TaskEvent[]): TaskState;
