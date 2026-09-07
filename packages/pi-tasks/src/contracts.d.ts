export declare const ORIGINOS_PI_TASKS_VERSION = "0.2.0-originos.1";
export declare const UPSTREAM_PI_TASKS_VERSION = "0.2.0";
export declare const PI_TASK_EVENT_VERSION = 2;
export declare const PI_TASK_STATE_EVENT_VERSION = 2;
export declare const PI_TASK_PUBLIC_API_VERSION = 1;
export declare const PI_TASK_CHECKPOINT_MAX_BYTES: number;
export declare const PI_TASK_CHECKPOINT_RECEIPT_LIMIT = 128;
export declare const PI_TASK_DIAGNOSTIC_LIMIT = 64;
export declare const PI_TASK_LEGACY_FORCED_COMPLETION_CODE = "legacy_forced_completion";
export declare const PI_TASKS_UPSTREAM_ENTRY_SHA256: string;
export declare const PI_TASKS_UPSTREAM_REDUCER_SHA256: string;
export declare const PI_TASK_MUTATION_TOOLS: readonly PiTaskMutationTool[];
export declare const PI_TASK_SCHEMA_FINGERPRINT: string;
export declare const PI_TASK_EVENT_V2_SCHEMA: Readonly<Record<string, unknown>>;
export declare const PI_TASK_STATE_EVENT_V2_SCHEMA: Readonly<Record<string, unknown>>;

export type PiTaskMutationTool =
    | "task_plan"
    | "task_checkpoint"
    | "task_decompose"
    | "task_update"
    | "task_evidence"
    | "task_decision"
    | "task_complete";

export interface PiTaskMutationRequest {
    version: 1;
    requestId: string;
    command: PiTaskMutationTool;
    expectedRevision: number;
    expectedCursor: string | null;
    input: Record<string, unknown>;
}

export interface PiTaskMutationReceipt {
    version: 1;
    requestId: string;
    command: PiTaskMutationTool;
    revisionBefore: number;
    revisionAfter: number;
    cursorBefore: string | null;
    cursorAfter: string;
    ledgerCursorBefore: string | null;
    ledgerCursorAfter: string;
    taskId: string;
    eventId: string;
    eventType: string;
    stateHash: string;
    payloadHash: string;
    replayed: boolean;
}

export interface PiTaskRuntimeMetadata {
    revision: number;
    cursor: string | null;
    branchLeaf: string | null;
    stateHash: string;
    requestCount: number;
    integrity: PiTaskLedgerDiagnostic[];
    legacyForcedCompletions: readonly PiTaskLegacyForcedCompletion[];
    latestReceipt?: PiTaskMutationReceipt;
}

export interface PiTaskLedgerDiagnostic {
    key: string;
    code: string;
    eventHash: string;
    cursorHash?: string;
}

export interface PiTaskLegacyForcedCompletion {
    readonly code: "legacy_forced_completion";
    readonly trusted: false;
    readonly source: "v1_event" | "v1_snapshot";
    readonly cursor: string;
    readonly eventId: string;
    readonly taskId: string;
    readonly reason: string;
    readonly summary?: string;
    readonly evidenceIds: readonly string[];
}

export interface PiTaskMutationEventEnvelopeV2 {
    version: 2;
    kind: "mutation";
    revision: number;
    ledgerParentCursor: string | null;
    parentCursor: string | null;
    requestId: string;
    payloadHash: string;
    command: PiTaskMutationTool;
    event: Record<string, unknown>;
}

export interface PiTaskSnapshotEventEnvelopeV2 {
    version: 2;
    kind: "snapshot";
    revision: number;
    ledgerParentCursor: string | null;
    parentCursor: string | null;
    event: Record<string, unknown>;
    checkpoint: {
        version: 2;
        stateHash: string;
        receiptHash: string;
        checkpointHash: string;
        receiptWindow: {
            policy: "latest_revision_window";
            retainedCount: number;
            omittedCount: number;
            minRevision: number | null;
            maxRevision: number | null;
        };
        receipts: PiTaskMutationReceipt[];
        legacyForcedCompletions?: PiTaskLegacyForcedCompletion[];
    };
}

export type PiTaskEventEnvelopeV2 =
    | PiTaskMutationEventEnvelopeV2
    | PiTaskSnapshotEventEnvelopeV2;

export declare class PiTaskContractError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}

export declare function canonicalize(value: unknown): unknown;
export declare function stableJson(value: unknown): string;
export declare function sha256(value: unknown): string;
export declare function mutationPayloadHash(command: string, input: Record<string, unknown>): string;
export declare function stateHash(state: Record<string, unknown>): string;
export declare function assertMutationCommand(command: unknown): asserts command is PiTaskMutationTool;
export declare function assertMutationRequest(request: PiTaskMutationRequest): PiTaskMutationRequest & {
    payloadHash: string;
};
export declare function containsForcedCompletionField(value: unknown): boolean;
export declare function createMutationReceipt(input: {
    request: PiTaskMutationRequest & { payloadHash: string };
    revisionBefore: number;
    revisionAfter: number;
    cursorBefore: string | null;
    cursorAfter: string;
    ledgerCursorBefore: string | null;
    ledgerCursorAfter: string;
    event: { id: string; type: string; taskId: string };
    nextState: Record<string, unknown>;
    replayed?: boolean;
}): PiTaskMutationReceipt;
