import { createHash } from "node:crypto";

export const ORIGINOS_PI_TASKS_VERSION = "0.2.0-originos.1";
export const UPSTREAM_PI_TASKS_VERSION = "0.2.0";
export const PI_TASK_EVENT_VERSION = 2;
export const PI_TASK_STATE_EVENT_VERSION = 2;
export const PI_TASK_PUBLIC_API_VERSION = 1;
export const PI_TASK_CHECKPOINT_MAX_BYTES = 64 * 1024;
export const PI_TASK_CHECKPOINT_RECEIPT_LIMIT = 128;
export const PI_TASK_DIAGNOSTIC_LIMIT = 64;
export const PI_TASK_LEGACY_FORCED_COMPLETION_CODE = "legacy_forced_completion";
export const PI_TASKS_UPSTREAM_ENTRY_SHA256 =
    "3a99294bcc034cd63bc245132e7b3c429acf31fd0b2bd6058e4be85eb0b94136";
export const PI_TASKS_UPSTREAM_REDUCER_SHA256 =
    "53dc26325e818fec1841cb40a5736f67404adafd021171b7e0976ff7a1e5ea64";

export const PI_TASK_MUTATION_TOOLS = Object.freeze([
    "task_plan",
    "task_checkpoint",
    "task_decompose",
    "task_update",
    "task_evidence",
    "task_decision",
    "task_complete",
]);

export const PI_TASK_SCHEMA_FINGERPRINT =
    "originos-pi-tasks/v1:event-v2:cas:receipt:evidence-gate-no-force";

export const PI_TASK_EVENT_V2_SCHEMA = Object.freeze({
    $id: "originos.pi-tasks.event-envelope.v2",
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: [
                "version",
                "kind",
                "revision",
                "ledgerParentCursor",
                "parentCursor",
                "requestId",
                "payloadHash",
                "command",
                "event",
            ],
            properties: {
                version: { const: 2 },
                kind: { const: "mutation" },
                revision: { type: "integer", minimum: 1 },
                ledgerParentCursor: { type: ["string", "null"] },
                parentCursor: { type: ["string", "null"] },
                requestId: { type: "string", minLength: 1 },
                payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                command: { enum: [...PI_TASK_MUTATION_TOOLS] },
                event: {
                    type: "object",
                    not: {
                        anyOf: [
                            { required: ["forceWithReason"] },
                            { required: ["force_with_reason"] },
                        ],
                    },
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: [
                "version",
                "kind",
                "revision",
                "ledgerParentCursor",
                "parentCursor",
                "event",
                "checkpoint",
            ],
            properties: {
                version: { const: 2 },
                kind: { const: "snapshot" },
                revision: { type: "integer", minimum: 0 },
                ledgerParentCursor: { type: ["string", "null"] },
                parentCursor: { type: ["string", "null"] },
                event: { type: "object" },
                checkpoint: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                        "version",
                        "stateHash",
                        "receiptHash",
                        "checkpointHash",
                        "receiptWindow",
                        "receipts",
                    ],
                    properties: {
                        version: { const: 2 },
                        stateHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                        receiptHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                        checkpointHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                        receiptWindow: {
                            type: "object",
                            additionalProperties: false,
                            required: [
                                "policy",
                                "retainedCount",
                                "omittedCount",
                                "minRevision",
                                "maxRevision",
                            ],
                            properties: {
                                policy: { const: "latest_revision_window" },
                                retainedCount: { type: "integer", minimum: 0 },
                                omittedCount: { type: "integer", minimum: 0 },
                                minRevision: { type: ["integer", "null"], minimum: 1 },
                                maxRevision: { type: ["integer", "null"], minimum: 1 },
                            },
                        },
                        receipts: { type: "array", items: { type: "object" } },
                        legacyForcedCompletions: { type: "array", items: { type: "object" } },
                    },
                },
            },
        },
    ],
});

export const PI_TASK_STATE_EVENT_V2_SCHEMA = Object.freeze({
    $id: "originos.pi-tasks.state-event.v2",
    type: "object",
    additionalProperties: false,
    required: ["version", "reason", "widgetId", "scope", "stateHash", "state"],
    properties: {
        version: { const: 2 },
        reason: {
            enum: ["session_start", "session_tree", "task_mutation", "compaction"],
        },
        widgetId: { const: "pi-tasks" },
        scope: {
            type: "object",
            additionalProperties: false,
            required: ["sessionId", "cursor", "revision"],
            properties: {
                sessionId: { type: "string", minLength: 1 },
                cursor: { type: ["string", "null"] },
                revision: { type: "integer", minimum: 0 },
            },
        },
        mutation: { type: "object" },
        stateHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        state: { type: "object" },
    },
});

export class PiTaskContractError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "PiTaskContractError";
        this.code = code;
        this.details = details;
    }
}

export function canonicalize(value) {
    if (value === null || typeof value !== "object") {
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new PiTaskContractError(
                "INVALID_CANONICAL_VALUE",
                "Task mutation payload cannot contain non-finite numbers",
            );
        }
        return value;
    }
    if (Array.isArray(value)) return value.map(canonicalize);
    const result = {};
    for (const key of Object.keys(value).sort()) {
        const child = value[key];
        if (child !== undefined) result[key] = canonicalize(child);
    }
    return result;
}

export function stableJson(value) {
    return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
    return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function mutationPayloadHash(command, input) {
    return sha256({ toolName: command, input });
}

export function stateHash(state) {
    const { events: _events, lastUpdatedAt: _lastUpdatedAt, ...stableState } = state;
    return sha256(stableState);
}

export function assertMutationCommand(command) {
    if (!PI_TASK_MUTATION_TOOLS.includes(command)) {
        throw new PiTaskContractError(
            "UNSUPPORTED_TASK_COMMAND",
            `Unsupported task mutation command: ${String(command)}`,
        );
    }
}

export function assertMutationRequest(request) {
    if (!request || typeof request !== "object") {
        throw new PiTaskContractError("INVALID_REQUEST", "Task mutation request is required");
    }
    if (request.version !== 1) {
        throw new PiTaskContractError(
            "UNSUPPORTED_REQUEST_VERSION",
            `Unsupported task mutation request version: ${String(request.version)}`,
        );
    }
    if (typeof request.requestId !== "string" || !request.requestId.trim()) {
        throw new PiTaskContractError("INVALID_REQUEST_ID", "requestId is required");
    }
    assertMutationCommand(request.command);
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
        throw new PiTaskContractError(
            "INVALID_EXPECTED_REVISION",
            "expectedRevision must be a non-negative integer",
        );
    }
    if (request.expectedCursor !== null &&
        (typeof request.expectedCursor !== "string" || request.expectedCursor.length === 0)) {
        throw new PiTaskContractError(
            "INVALID_EXPECTED_CURSOR",
            "expectedCursor must be a string or null",
        );
    }
    if (!request.input || typeof request.input !== "object" || Array.isArray(request.input)) {
        throw new PiTaskContractError("INVALID_INPUT", "input must be an object");
    }
    if (containsForcedCompletionField(request.input)) {
        throw new PiTaskContractError(
            "FORCE_COMPLETION_FORBIDDEN",
            "Forced task completion is not supported",
        );
    }
    return {
        ...request,
        requestId: request.requestId.trim(),
        payloadHash: mutationPayloadHash(request.command, request.input),
    };
}

export function containsForcedCompletionField(value) {
    if (!value || typeof value !== "object") return false;
    if (Object.hasOwn(value, "forceWithReason") || Object.hasOwn(value, "force_with_reason")) {
        return true;
    }
    return Object.values(value).some(containsForcedCompletionField);
}

export function createMutationReceipt({
    request,
    revisionBefore,
    revisionAfter,
    ledgerCursorBefore,
    ledgerCursorAfter,
    cursorBefore,
    cursorAfter,
    event,
    nextState,
    replayed = false,
}) {
    return Object.freeze({
        version: 1,
        requestId: request.requestId,
        command: request.command,
        revisionBefore,
        revisionAfter,
        ledgerCursorBefore,
        ledgerCursorAfter,
        cursorBefore,
        cursorAfter,
        taskId: event.taskId,
        eventId: event.id,
        eventType: event.type,
        stateHash: stateHash(nextState),
        payloadHash: request.payloadHash,
        replayed,
    });
}
