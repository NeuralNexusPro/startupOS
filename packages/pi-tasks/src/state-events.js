import { stateHash } from "./contracts.js";
import { snapshotState } from "./store.js";

export const TASK_STATE_EVENT = "pi-tasks:state";
export const TASK_WIDGET_ID = "pi-tasks";

export function requireTaskSessionId(ctx) {
    const value = ctx.sessionManager.getSessionId?.();
    if (typeof value !== "string" || value.length === 0) {
        const error = new Error("pi-tasks requires a non-empty public Session id");
        error.code = "INVALID_SESSION_SCOPE";
        throw error;
    }
    return value;
}

export function emitTaskState(pi, ctx, state, reason, metadata, receipt) {
    if (receipt && metadata.stateHash !== receipt.stateHash) {
        const error = new Error("Mutation state event hash does not match its receipt");
        error.code = "STATE_RECEIPT_HASH_MISMATCH";
        throw error;
    }
    const event = {
        version: 2,
        reason,
        widgetId: TASK_WIDGET_ID,
        scope: {
            sessionId: requireTaskSessionId(ctx),
            cursor: metadata.cursor,
            revision: metadata.revision,
        },
        ...(receipt
            ? {
                mutation: {
                    requestId: receipt.requestId,
                    command: receipt.command,
                    eventId: receipt.eventId,
                    receipt,
                },
            }
            : {}),
        stateHash: metadata.stateHash ?? stateHash(state),
        state: structuredClone(snapshotState(state)),
    };
    try {
        pi.events.emit(TASK_STATE_EVENT, event);
    }
    catch {
        // UI observers must not break an already-persisted task transition.
    }
    return event;
}
