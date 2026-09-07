import type {
    PiTaskMutationReceipt,
    PiTaskMutationRequest,
    PiTaskRuntimeMetadata,
    PiTaskLegacyForcedCompletion,
} from "./contracts.ts";
import type { ReplayResult, TaskEvent, TaskState } from "./model.ts";

export interface BranchEntry {
    type: string;
    customType?: string;
    data?: unknown;
    id?: string;
    parentId?: string | null;
    timestamp?: string;
}

export interface TaskPersistence {
    appendEntry(customType: string, data: unknown): void;
    getBranch(): BranchEntry[];
}

export interface TaskMutationResult {
    state: TaskState;
    metadata: PiTaskRuntimeMetadata;
    receipt: PiTaskMutationReceipt;
}

export interface TaskRuntimeStore {
    getState(): TaskState;
    getMetadata(): PiTaskRuntimeMetadata;
    replay(branchEntries: BranchEntry[]): ReplayResult & {
        metadata: PiTaskRuntimeMetadata;
        receipts: PiTaskMutationReceipt[];
        legacyForcedCompletions: PiTaskLegacyForcedCompletion[];
    };
    mutate(request: PiTaskMutationRequest, event: TaskEvent, persistence: TaskPersistence): TaskMutationResult;
    checkpoint(event: TaskEvent, persistence: TaskPersistence): {
        state: TaskState;
        metadata: PiTaskRuntimeMetadata;
        envelope: unknown;
    };
}

export declare function createTaskRuntimeStore(): TaskRuntimeStore;
export declare function replayBranchEntries(entries: BranchEntry[]): ReplayResult & {
    metadata: PiTaskRuntimeMetadata;
    receipts: PiTaskMutationReceipt[];
    legacyForcedCompletions: PiTaskLegacyForcedCompletion[];
};
export declare function snapshotState(state: TaskState): Omit<TaskState, "events">;
export declare function errorText(error: unknown): string;
