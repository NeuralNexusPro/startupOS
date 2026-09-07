import {
    assertMutationRequest,
    containsForcedCompletionField,
    createMutationReceipt,
    PI_TASK_CHECKPOINT_MAX_BYTES,
    PI_TASK_CHECKPOINT_RECEIPT_LIMIT,
    PI_TASK_DIAGNOSTIC_LIMIT,
    PI_TASK_LEGACY_FORCED_COMPLETION_CODE,
    PI_TASK_MUTATION_TOOLS,
    PiTaskContractError,
    sha256,
    stableJson,
    stateHash,
} from "./contracts.js";
import { createEmptyState, TASK_EVENT_CUSTOM_TYPE, } from "./model.js";
import { reduceTaskState, TaskTransitionError } from "./reducer.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/;

export function createTaskRuntimeStore() {
    if (arguments.length > 0) {
        throw new PiTaskContractError(
            "INITIAL_STATE_FORBIDDEN",
            "Task Runtime state must be reconstructed from the canonical Session branch",
        );
    }
    let state = createEmptyState();
    let metadata = createEmptyMetadata(state);
    let requestIndex = new Map();
    let legacyForcedCompletions = [];
    let branchAnchor = createBranchAnchor([]);

    function adoptReplay(replayed, branch) {
        state = replayed.state;
        metadata = replayed.metadata;
        requestIndex = new Map(replayed.receipts.map((receipt) => [receipt.requestId, receipt]));
        legacyForcedCompletions = [...replayed.legacyForcedCompletions];
        branchAnchor = createBranchAnchor(branch);
    }

    function synchronizeBranch(branch) {
        const delta = inspectBranchDelta(branch, branchAnchor);
        if (delta.anchorMatches && !delta.containsTaskEntry) {
            branchAnchor = createBranchAnchor(branch);
            if (metadata.branchLeaf !== branchAnchor.leaf) {
                metadata = buildMetadata(
                    state,
                    metadata.revision,
                    metadata.cursor,
                    branchAnchor.leaf,
                    requestIndex,
                    metadata.integrity,
                    legacyForcedCompletions,
                    metadata.latestReceipt,
                );
            }
            return;
        }
        const replayed = replayBranchEntries(branch);
        assertSameTaskProjection(replayed, metadata, requestIndex, legacyForcedCompletions);
        adoptReplay(replayed, branch);
    }

    return {
        getState() {
            return state;
        },
        getMetadata() {
            return cloneMetadata(metadata);
        },
        replay(branchEntries) {
            const replayed = replayBranchEntries(branchEntries);
            adoptReplay(replayed, branchEntries);
            return replayed;
        },
        mutate(request, event, persistence) {
            const normalized = assertMutationRequest(request);
            assertCommandEventPair(normalized.command, event);
            const branchBefore = readBranchContext(persistence);
            synchronizeBranch(branchBefore.branch);
            const previous = requestIndex.get(normalized.requestId);
            if (previous) {
                if (previous.command !== normalized.command || previous.payloadHash !== normalized.payloadHash) {
                    throw new PiTaskContractError(
                        "DUPLICATE_REQUEST_CONFLICT",
                        `requestId ${normalized.requestId} was already used with different content`,
                        { requestId: normalized.requestId },
                    );
                }
                return {
                    state,
                    metadata: cloneMetadata(metadata),
                    receipt: Object.freeze({ ...previous, replayed: true }),
                };
            }
            assertCas(normalized, metadata, branchBefore.leaf);
            const nextState = reduceTaskState(state, event);
            const revisionBefore = metadata.revision;
            const ledgerCursorBefore = metadata.cursor;
            const envelope = Object.freeze({
                version: 2,
                kind: "mutation",
                revision: revisionBefore + 1,
                ledgerParentCursor: ledgerCursorBefore,
                parentCursor: branchBefore.leaf,
                requestId: normalized.requestId,
                payloadHash: normalized.payloadHash,
                command: normalized.command,
                event,
            });
            const cursorAfter = appendAndReadCursor(envelope, persistence, branchBefore.leaf);
            const receipt = createMutationReceipt({
                request: normalized,
                revisionBefore,
                revisionAfter: revisionBefore + 1,
                ledgerCursorBefore,
                ledgerCursorAfter: cursorAfter,
                cursorBefore: branchBefore.leaf,
                cursorAfter,
                event,
                nextState,
            });
            state = nextState;
            requestIndex.set(receipt.requestId, receipt);
            metadata = buildMetadata(
                state,
                receipt.revisionAfter,
                receipt.ledgerCursorAfter,
                receipt.cursorAfter,
                requestIndex,
                metadata.integrity,
                legacyForcedCompletions,
                receipt,
            );
            branchAnchor = createBranchAnchor(readBranchContext(persistence).branch);
            return { state, metadata: cloneMetadata(metadata), receipt };
        },
        checkpoint(event, persistence) {
            if (!isV1TaskEvent(event) || event.type !== "task.snapshot") {
                throw new PiTaskContractError(
                    "INVALID_SNAPSHOT_EVENT",
                    "Compaction checkpoint requires a v1 task.snapshot business event",
                );
            }
            const branchBefore = readBranchContext(persistence);
            synchronizeBranch(branchBefore.branch);
            if (containsForcedCompletionField(event)) {
                throw new PiTaskContractError(
                    "FORCE_COMPLETION_FORBIDDEN",
                    "Forced task completion is not supported",
                );
            }
            const nextState = reduceTaskState(state, event);
            const envelope = buildBoundedCheckpointEnvelope({
                revision: metadata.revision,
                ledgerParentCursor: metadata.cursor,
                parentCursor: branchBefore.leaf,
                event,
                nextState,
                receipts: [...requestIndex.values()],
                legacyForcedCompletions,
            });
            const cursorAfter = appendAndReadCursor(envelope, persistence, branchBefore.leaf);
            state = nextState;
            metadata = buildMetadata(
                state,
                metadata.revision,
                cursorAfter,
                cursorAfter,
                requestIndex,
                metadata.integrity,
                legacyForcedCompletions,
                metadata.latestReceipt,
            );
            branchAnchor = createBranchAnchor(readBranchContext(persistence).branch);
            return { state, metadata: cloneMetadata(metadata), envelope };
        },
    };
}

export function replayBranchEntries(entries) {
    let state = createEmptyState();
    let revision = 0;
    let cursor = null;
    let latestReceipt;
    const malformedEvents = [];
    const integrity = [];
    const acceptedCursors = new Set();
    const requestIndex = new Map();
    const legacyForcedCompletions = [];
    let acceptedEntryCount = 0;
    const branchLeaf = getBranchLeaf(entries);

    for (const entry of entries) {
        if (entry.type !== "custom" || entry.customType !== TASK_EVENT_CUSTOM_TYPE)
            continue;
        const entryCursor = normalizeEntryCursor(entry.id);
        if (!entryCursor) {
            recordDiagnostic(malformedEvents, integrity, "MISSING_CURSOR", "Task ledger entry is missing a Session cursor", undefined, entry.data);
            continue;
        }
        if (acceptedCursors.has(entryCursor)) {
            recordDiagnostic(malformedEvents, integrity, "DUPLICATE_CURSOR", `Duplicate task ledger cursor ignored: ${entryCursor}`, entryCursor, entry.data);
            continue;
        }
        const data = entry.data;
        if (isV1TaskEvent(data)) {
            try {
                if (isLegacyForcedCompletionEvent(data)) {
                    const record = createLegacyForcedCompletionRecord({
                        source: "v1_event",
                        cursor: entryCursor,
                        eventId: data.id,
                        taskId: data.taskId,
                        reason: data.forceWithReason,
                        summary: data.summary,
                        evidenceIds: data.evidenceIds,
                    });
                    state = retainLegacyForcedCompletionEvent(state, data, record);
                    addLegacyForcedCompletion(legacyForcedCompletions, record);
                }
                else {
                    const nextState = reduceTaskState(state, data);
                    const migrated = data.type === "task.snapshot"
                        ? migrateLegacyForcedSnapshot(nextState, entryCursor, data.id)
                        : { state: nextState, records: [] };
                    state = migrated.state;
                    for (const record of migrated.records) {
                        addLegacyForcedCompletion(legacyForcedCompletions, record);
                    }
                }
                revision += 1;
                cursor = entryCursor;
                acceptedCursors.add(entryCursor);
                acceptedEntryCount += 1;
            }
            catch (error) {
                recordDiagnostic(malformedEvents, integrity, "V1_REPLAY_REJECTED", `Entry ${entryCursor}: ${errorText(error)}`, entryCursor, data);
            }
            continue;
        }
        if (!isV2Envelope(data)) {
            recordDiagnostic(malformedEvents, integrity, "INVALID_ENVELOPE", `Entry ${entryCursor} is not a pi-tasks event`, entryCursor, data);
            continue;
        }
        if (!entryParentMatches(entry, data.parentCursor)) {
            recordDiagnostic(
                malformedEvents,
                integrity,
                "BRANCH_PARENT_MISMATCH",
                `Entry ${entryCursor} parentId does not match envelope parentCursor`,
                entryCursor,
                data,
            );
            continue;
        }
        if (data.kind === "snapshot") {
            const replayed = replaySnapshotEnvelope({
                envelope: data,
                entryCursor,
                state,
                revision,
                cursor,
                requestIndex,
                legacyForcedCompletions,
                allowBootstrap: acceptedEntryCount === 0,
            });
            if (replayed.error) {
                recordDiagnostic(malformedEvents, integrity, replayed.code ?? "SNAPSHOT_REJECTED", replayed.error, entryCursor, data);
                continue;
            }
            state = replayed.state;
            revision = replayed.revision;
            cursor = entryCursor;
            latestReceipt = replayed.latestReceipt ?? latestReceipt;
            replaceLegacyForcedCompletions(
                legacyForcedCompletions,
                replayed.legacyForcedCompletions,
                replayed.replaceLegacyForcedCompletions,
            );
            acceptedCursors.add(entryCursor);
            acceptedEntryCount += 1;
            continue;
        }
        const existing = requestIndex.get(data.requestId);
        if (existing) {
            const conflict = existing.command !== data.command || existing.payloadHash !== data.payloadHash;
            recordDiagnostic(
                malformedEvents,
                integrity,
                conflict ? "DUPLICATE_REQUEST_CONFLICT" : "DUPLICATE_REQUEST",
                conflict
                    ? `Conflicting duplicate request ignored: ${data.requestId}`
                    : `Duplicate request entry ignored: ${data.requestId}`,
                entryCursor,
                data,
            );
            continue;
        }
        if (data.revision !== revision + 1 || data.ledgerParentCursor !== cursor) {
            recordDiagnostic(
                malformedEvents,
                integrity,
                "OUT_OF_ORDER_EVENT",
                `Out-of-order task event ignored at ${entryCursor}: expected revision ${revision + 1} and ledger parent ${String(cursor)}`,
                entryCursor,
                data,
            );
            continue;
        }
        try {
            const nextState = reduceTaskState(state, data.event);
            const receipt = createMutationReceipt({
                request: {
                    version: 1,
                    requestId: data.requestId,
                    command: data.command,
                    expectedRevision: revision,
                    expectedCursor: data.parentCursor,
                    input: {},
                    payloadHash: data.payloadHash,
                },
                revisionBefore: revision,
                revisionAfter: data.revision,
                ledgerCursorBefore: data.ledgerParentCursor,
                ledgerCursorAfter: entryCursor,
                cursorBefore: data.parentCursor,
                cursorAfter: entryCursor,
                event: data.event,
                nextState,
            });
            state = nextState;
            revision = data.revision;
            cursor = entryCursor;
            latestReceipt = receipt;
            requestIndex.set(receipt.requestId, receipt);
            acceptedCursors.add(entryCursor);
            acceptedEntryCount += 1;
        }
        catch (error) {
            recordDiagnostic(malformedEvents, integrity, "MUTATION_REPLAY_REJECTED", `Entry ${entryCursor}: ${errorText(error)}`, entryCursor, data);
        }
    }
    const metadata = buildMetadata(
        state,
        revision,
        cursor,
        branchLeaf,
        requestIndex,
        integrity,
        legacyForcedCompletions,
        latestReceipt,
    );
    return {
        state,
        metadata,
        receipts: [...requestIndex.values()],
        legacyForcedCompletions: cloneLegacyForcedCompletions(legacyForcedCompletions),
        malformedEvents,
    };
}

export function snapshotState(state) {
    const { events: _events, ...snapshot } = state;
    return snapshot;
}

function replaySnapshotEnvelope({
    envelope,
    entryCursor,
    state,
    revision,
    cursor,
    requestIndex,
    legacyForcedCompletions,
    allowBootstrap,
}) {
    if (!isV1TaskEvent(envelope.event) || envelope.event.type !== "task.snapshot") {
        return { code: "INVALID_SNAPSHOT_EVENT", error: `Snapshot entry ${entryCursor} has an invalid business event` };
    }
    if (!allowBootstrap && (envelope.revision !== revision || envelope.ledgerParentCursor !== cursor)) {
        return {
            code: "OUT_OF_ORDER_SNAPSHOT",
            error: `Out-of-order task snapshot ignored at ${entryCursor}: expected revision ${revision} and ledger parent ${String(cursor)}`,
        };
    }
    try {
        validateCheckpointEnvelope(envelope, entryCursor, requestIndex);
        const replayedState = reduceTaskState(state, envelope.event);
        if (stateHash(replayedState) !== envelope.checkpoint.stateHash) {
            return { code: "SNAPSHOT_STATE_HASH_MISMATCH", error: `Snapshot entry ${entryCursor} failed state hash validation` };
        }
        const migrated = migrateLegacyForcedSnapshot(replayedState, entryCursor, envelope.event.id);
        const checkpointLegacy = normalizeCheckpointLegacyCompletions(
            envelope.checkpoint.legacyForcedCompletions,
            entryCursor,
        );
        const restoredLegacy = mergeLegacyForcedCompletions(
            allowBootstrap ? [] : legacyForcedCompletions,
            checkpointLegacy,
            migrated.records,
        );
        if (allowBootstrap) requestIndex.clear();
        let latestReceipt;
        for (const receipt of envelope.checkpoint.receipts) {
            const normalized = Object.freeze({ ...receipt, replayed: false });
            requestIndex.set(receipt.requestId, normalized);
            if (!latestReceipt || normalized.revisionAfter > latestReceipt.revisionAfter) {
                latestReceipt = normalized;
            }
        }
        return {
            state: migrated.state,
            revision: allowBootstrap ? envelope.revision : revision,
            latestReceipt,
            legacyForcedCompletions: restoredLegacy,
            replaceLegacyForcedCompletions: allowBootstrap,
        };
    }
    catch (error) {
        return {
            code: error instanceof PiTaskContractError ? error.code : "SNAPSHOT_REPLAY_REJECTED",
            error: `Snapshot entry ${entryCursor}: ${errorText(error)}`,
        };
    }
}

function buildBoundedCheckpointEnvelope({
    revision,
    ledgerParentCursor,
    parentCursor,
    event,
    nextState,
    receipts,
    legacyForcedCompletions,
}) {
    const ordered = receipts
        .map((receipt) => ({ ...receipt, replayed: false }))
        .sort((left, right) => left.revisionAfter - right.revisionAfter);
    let retained = ordered.slice(-PI_TASK_CHECKPOINT_RECEIPT_LIMIT);
    while (true) {
        const receiptWindow = buildReceiptWindow(ordered.length, retained);
        const receiptHash = sha256(retained);
        const unsignedCheckpoint = {
            version: 2,
            stateHash: stateHash(nextState),
            receiptHash,
            receiptWindow,
            receipts: retained,
            legacyForcedCompletions: cloneLegacyForcedCompletions(legacyForcedCompletions),
        };
        const checkpoint = Object.freeze({
            ...unsignedCheckpoint,
            checkpointHash: checkpointEnvelopeHash({
                revision,
                ledgerParentCursor,
                parentCursor,
                event,
                checkpoint: unsignedCheckpoint,
            }),
        });
        const envelope = Object.freeze({
            version: 2,
            kind: "snapshot",
            revision,
            ledgerParentCursor,
            parentCursor,
            event,
            checkpoint,
        });
        if (byteLength(envelope) <= PI_TASK_CHECKPOINT_MAX_BYTES) return envelope;
        if (retained.length === 0) {
            throw new PiTaskContractError(
                "CHECKPOINT_TOO_LARGE",
                `Task checkpoint exceeds ${PI_TASK_CHECKPOINT_MAX_BYTES} bytes without receipts`,
            );
        }
        retained = retained.slice(1);
    }
}

function validateCheckpointEnvelope(envelope, entryCursor, requestIndex) {
    if (!isCheckpoint(envelope.checkpoint)) {
        throw new PiTaskContractError("INVALID_CHECKPOINT", `Snapshot entry ${entryCursor} has invalid checkpoint metadata`);
    }
    if (byteLength(envelope) > PI_TASK_CHECKPOINT_MAX_BYTES) {
        throw new PiTaskContractError("CHECKPOINT_TOO_LARGE", `Snapshot entry ${entryCursor} exceeds ${PI_TASK_CHECKPOINT_MAX_BYTES} bytes`);
    }
    const checkpoint = envelope.checkpoint;
    const { checkpointHash, ...unsignedCheckpoint } = checkpoint;
    if (checkpointEnvelopeHash({
        revision: envelope.revision,
        ledgerParentCursor: envelope.ledgerParentCursor,
        parentCursor: envelope.parentCursor,
        event: envelope.event,
        checkpoint: unsignedCheckpoint,
    }) !== checkpointHash) {
        throw new PiTaskContractError("CHECKPOINT_HASH_MISMATCH", `Snapshot entry ${entryCursor} failed checkpoint hash validation`);
    }
    if (sha256(checkpoint.receipts) !== checkpoint.receiptHash) {
        throw new PiTaskContractError("RECEIPT_HASH_MISMATCH", `Snapshot entry ${entryCursor} failed receipt hash validation`);
    }
    validateReceiptWindow(checkpoint.receiptWindow, checkpoint.receipts);
    const requestIds = new Set();
    const cursorIds = new Set();
    const eventIds = new Set();
    let highestRevision = -1;
    let latestReceipt;
    let previousReceipt;
    for (const receipt of checkpoint.receipts) {
        assertCheckpointReceipt(receipt, envelope.revision);
        if (requestIds.has(receipt.requestId)) {
            throw new PiTaskContractError("DUPLICATE_CHECKPOINT_REQUEST", `Snapshot contains duplicate requestId ${receipt.requestId}`);
        }
        requestIds.add(receipt.requestId);
        if (cursorIds.has(receipt.cursorAfter)) {
            throw new PiTaskContractError("DUPLICATE_RECEIPT_CURSOR", `Snapshot contains duplicate receipt cursor ${receipt.cursorAfter}`);
        }
        if (eventIds.has(receipt.eventId)) {
            throw new PiTaskContractError("DUPLICATE_RECEIPT_EVENT", `Snapshot contains duplicate eventId ${receipt.eventId}`);
        }
        cursorIds.add(receipt.cursorAfter);
        eventIds.add(receipt.eventId);
        if (!envelope.event.state?.tasks?.[receipt.taskId]) {
            throw new PiTaskContractError("RECEIPT_TASK_MISMATCH", `Receipt ${receipt.requestId} references a task absent from the snapshot`);
        }
        if (previousReceipt) {
            if (receipt.revisionAfter <= previousReceipt.revisionAfter) {
                throw new PiTaskContractError("INVALID_RECEIPT_ORDER", "Checkpoint receipts must be ordered by ascending revision");
            }
        }
        previousReceipt = receipt;
        const existing = requestIndex.get(receipt.requestId);
        if (existing && stableJson(normalizeReceipt(existing)) !== stableJson(normalizeReceipt(receipt))) {
            throw new PiTaskContractError("CHECKPOINT_REQUEST_CONFLICT", `Snapshot request ${receipt.requestId} conflicts with replayed history`);
        }
        if (receipt.revisionAfter > highestRevision) {
            highestRevision = receipt.revisionAfter;
            latestReceipt = receipt;
        }
    }
    if (latestReceipt && latestReceipt.revisionAfter === envelope.revision && latestReceipt.stateHash !== checkpoint.stateHash) {
        throw new PiTaskContractError("CHECKPOINT_RECEIPT_STATE_MISMATCH", "Latest checkpoint receipt does not match snapshot state hash");
    }
    if (latestReceipt && latestReceipt.revisionAfter !== envelope.revision) {
        throw new PiTaskContractError(
            "CHECKPOINT_RECEIPT_REVISION_MISMATCH",
            "Latest checkpoint receipt must match the snapshot revision",
        );
    }
}

function assertCheckpointReceipt(receipt, checkpointRevision) {
    if (!isMutationReceipt(receipt)) {
        throw new PiTaskContractError("INVALID_CHECKPOINT_RECEIPT", "Snapshot contains an invalid mutation receipt");
    }
    if (receipt.revisionAfter !== receipt.revisionBefore + 1 || receipt.revisionAfter > checkpointRevision) {
        throw new PiTaskContractError("INVALID_RECEIPT_REVISION", `Receipt ${receipt.requestId} has an invalid revision range`);
    }
    if (receipt.eventType !== expectedEventType(receipt.command)) {
        throw new PiTaskContractError("RECEIPT_COMMAND_EVENT_MISMATCH", `Receipt ${receipt.requestId} command does not match event type`);
    }
    if (receipt.cursorAfter !== receipt.ledgerCursorAfter) {
        throw new PiTaskContractError("RECEIPT_CURSOR_MISMATCH", `Receipt ${receipt.requestId} cursorAfter must equal ledgerCursorAfter`);
    }
    if (receipt.revisionBefore === 0 && receipt.ledgerCursorBefore !== null) {
        throw new PiTaskContractError("INVALID_RECEIPT_LEDGER_CURSOR", `Receipt ${receipt.requestId} revision zero must have a null ledger cursor`);
    }
    if (receipt.revisionBefore > 0 &&
        (typeof receipt.ledgerCursorBefore !== "string" || receipt.ledgerCursorBefore.length === 0)) {
        throw new PiTaskContractError("INVALID_RECEIPT_LEDGER_CURSOR", `Receipt ${receipt.requestId} must reference the previous Task ledger cursor`);
    }
}

function buildReceiptWindow(totalCount, retained) {
    return Object.freeze({
        policy: "latest_revision_window",
        retainedCount: retained.length,
        omittedCount: Math.max(0, totalCount - retained.length),
        minRevision: retained.length > 0 ? retained[0].revisionAfter : null,
        maxRevision: retained.length > 0 ? retained.at(-1).revisionAfter : null,
    });
}

function validateReceiptWindow(window, receipts) {
    if (!window ||
        window.policy !== "latest_revision_window" ||
        !Number.isSafeInteger(window.retainedCount) ||
        !Number.isSafeInteger(window.omittedCount) ||
        window.retainedCount !== receipts.length ||
        window.omittedCount < 0) {
        throw new PiTaskContractError("INVALID_RECEIPT_WINDOW", "Checkpoint receipt window is invalid");
    }
    const minRevision = receipts.length > 0 ? receipts[0].revisionAfter : null;
    const maxRevision = receipts.length > 0 ? receipts.at(-1).revisionAfter : null;
    if (window.minRevision !== minRevision || window.maxRevision !== maxRevision) {
        throw new PiTaskContractError("INVALID_RECEIPT_WINDOW", "Checkpoint receipt window revision range is invalid");
    }
}

function appendAndReadCursor(envelope, persistence, expectedParentCursor) {
    if (!persistence || typeof persistence.appendEntry !== "function" || typeof persistence.getBranch !== "function") {
        throw new PiTaskContractError("INVALID_PERSISTENCE", "Task mutation persistence requires appendEntry() and getBranch()");
    }
    persistence.appendEntry(TASK_EVENT_CUSTOM_TYPE, envelope);
    const branch = persistence.getBranch();
    const tail = Array.isArray(branch) ? branch.at(-1) : undefined;
    if (!tail ||
        tail.type !== "custom" ||
        tail.customType !== TASK_EVENT_CUSTOM_TYPE ||
        !sameEnvelope(tail.data, envelope)) {
        throw new PiTaskContractError("CURSOR_CONFIRMATION_FAILED", "Appended task event is not the current Session branch tail");
    }
    if (!entryParentMatches(tail, expectedParentCursor) || envelope.parentCursor !== expectedParentCursor) {
        throw new PiTaskContractError("BRANCH_PARENT_MISMATCH", "Appended task entry parentId does not match the invocation branch leaf");
    }
    const cursor = normalizeEntryCursor(tail.id);
    if (!cursor) {
        throw new PiTaskContractError("CURSOR_CONFIRMATION_FAILED", "Appended task event has no stable Session entry cursor");
    }
    return cursor;
}

function readBranchContext(persistence) {
    if (!persistence || typeof persistence.getBranch !== "function") {
        throw new PiTaskContractError("INVALID_PERSISTENCE", "Task mutation persistence requires getBranch()");
    }
    const branch = persistence.getBranch();
    if (!Array.isArray(branch)) {
        throw new PiTaskContractError("INVALID_PERSISTENCE", "Task mutation getBranch() must return an array");
    }
    return { branch, leaf: getBranchLeaf(branch) };
}

function assertSameTaskProjection(replayed, metadata, requestIndex, legacyForcedCompletions) {
    const localReceipts = [...requestIndex.values()]
        .map(normalizeReceipt)
        .sort(compareReceipts);
    const branchReceipts = replayed.receipts
        .map(normalizeReceipt)
        .sort(compareReceipts);
    const aligned = replayed.metadata.revision === metadata.revision &&
        replayed.metadata.cursor === metadata.cursor &&
        replayed.metadata.stateHash === metadata.stateHash &&
        sha256(branchReceipts) === sha256(localReceipts) &&
        sha256(replayed.legacyForcedCompletions) === sha256(legacyForcedCompletions);
    if (!aligned) {
        throw new PiTaskContractError(
            "BRANCH_STATE_STALE",
            "Task Runtime store is not aligned with the current Session branch",
            {
                expectedRevision: metadata.revision,
                actualRevision: replayed.metadata.revision,
                expectedCursor: metadata.cursor,
                actualCursor: replayed.metadata.cursor,
                expectedStateHash: metadata.stateHash,
                actualStateHash: replayed.metadata.stateHash,
            },
        );
    }
}

function createBranchAnchor(branch) {
    if (!Array.isArray(branch) || branch.length === 0) {
        return Object.freeze({ length: 0, leaf: null, leafHash: null });
    }
    const leafEntry = branch.at(-1);
    return Object.freeze({
        length: branch.length,
        leaf: normalizeEntryCursor(leafEntry?.id),
        leafHash: sha256(leafEntry),
    });
}

function inspectBranchDelta(branch, anchor) {
    if (!Array.isArray(branch)) {
        throw new PiTaskContractError("INVALID_BRANCH", "Task persistence getBranch() must return an array");
    }
    if (branch.length < anchor.length) {
        return { anchorMatches: false, containsTaskEntry: true };
    }
    // SessionManager branches are immutable, append-only paths. Initialization,
    // reload and branch switches perform a full replay; the hot path validates
    // the previously observed tail and scans only newly appended entries.
    if (anchor.length > 0) {
        const anchoredEntry = branch[anchor.length - 1];
        if (normalizeEntryCursor(anchoredEntry?.id) !== anchor.leaf || sha256(anchoredEntry) !== anchor.leafHash) {
            return { anchorMatches: false, containsTaskEntry: true };
        }
    }
    for (let index = anchor.length; index < branch.length; index += 1) {
        const entry = branch[index];
        if (entry?.type === "custom" && entry.customType === TASK_EVENT_CUSTOM_TYPE) {
            return { anchorMatches: true, containsTaskEntry: true };
        }
    }
    return { anchorMatches: true, containsTaskEntry: false };
}

function getBranchLeaf(branch) {
    if (!Array.isArray(branch) || branch.length === 0) return null;
    const leaf = normalizeEntryCursor(branch.at(-1)?.id);
    if (!leaf) {
        throw new PiTaskContractError("INVALID_BRANCH_LEAF", "Current Session branch leaf has no stable entry id");
    }
    return leaf;
}

function entryParentMatches(entry, expectedParentCursor) {
    const actual = entry.parentId ?? null;
    return actual === expectedParentCursor;
}

function sameEnvelope(actual, expected) {
    if (!actual || typeof actual !== "object") return false;
    if (actual.version !== 2 ||
        actual.kind !== expected.kind ||
        actual.revision !== expected.revision ||
        actual.ledgerParentCursor !== expected.ledgerParentCursor ||
        actual.parentCursor !== expected.parentCursor) {
        return false;
    }
    if (expected.kind === "mutation") {
        return actual.requestId === expected.requestId && actual.payloadHash === expected.payloadHash;
    }
    return actual.event?.id === expected.event.id && actual.checkpoint?.checkpointHash === expected.checkpoint.checkpointHash;
}

function assertCas(request, metadata, branchLeaf) {
    if (request.expectedRevision !== metadata.revision) {
        throw new PiTaskContractError(
            "REVISION_CONFLICT",
            `Expected revision ${request.expectedRevision}, current revision is ${metadata.revision}`,
            { expectedRevision: request.expectedRevision, actualRevision: metadata.revision },
        );
    }
    if (request.expectedCursor !== branchLeaf) {
        throw new PiTaskContractError(
            "BRANCH_CONFLICT",
            `Expected Session leaf ${String(request.expectedCursor)}, current leaf is ${String(branchLeaf)}`,
            { expectedCursor: request.expectedCursor, actualCursor: branchLeaf },
        );
    }
}

function createEmptyMetadata(state) {
    return buildMetadata(state, 0, null, null, new Map(), [], [], undefined);
}

function buildMetadata(
    state,
    revision,
    cursor,
    branchLeaf,
    requestIndex,
    integrity,
    legacyForcedCompletions,
    latestReceipt,
) {
    return Object.freeze({
        revision,
        cursor,
        branchLeaf,
        stateHash: stateHash(state),
        requestCount: requestIndex.size,
        integrity: Object.freeze(integrity.map((item) => Object.freeze({ ...item }))),
        legacyForcedCompletions: Object.freeze(cloneLegacyForcedCompletions(legacyForcedCompletions)),
        ...(latestReceipt ? { latestReceipt } : {}),
    });
}

function cloneMetadata(metadata) {
    return {
        ...metadata,
        integrity: metadata.integrity.map((item) => ({ ...item })),
        legacyForcedCompletions: cloneLegacyForcedCompletions(metadata.legacyForcedCompletions),
        ...(metadata.latestReceipt ? { latestReceipt: { ...metadata.latestReceipt } } : {}),
    };
}

function recordDiagnostic(malformedEvents, integrity, code, message, cursor, event) {
    const eventHash = sha256(event ?? { code, cursor: cursor ?? null });
    const cursorHash = cursor ? sha256(cursor) : undefined;
    const key = `${code}:${cursorHash ?? ""}:${eventHash}`;
    if (integrity.some((item) => item.key === key)) return;
    if (integrity.length >= PI_TASK_DIAGNOSTIC_LIMIT) return;
    integrity.push(Object.freeze({ key, code, eventHash, ...(cursorHash ? { cursorHash } : {}) }));
    malformedEvents.push(sanitizeDiagnosticMessage(message));
}

function sanitizeDiagnosticMessage(message) {
    return String(message)
        .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "")
        .replace(/\bauthorization\s*:\s*[^\r\n,;]+/gi, "authorization: [REDACTED]")
        .replace(/\b(api[_-]?key|token|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, "$1=[REDACTED]")
        .replace(/[A-Za-z]:\\Users\\[^\r\n:]*/g, "[REDACTED_PATH]")
        .replace(/\/home\/[^/\s]+/g, "/home/[REDACTED]")
        .slice(0, 240);
}

function normalizeEntryCursor(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function isV1TaskEvent(value) {
    if (!value || typeof value !== "object") return false;
    return value.version === 1 && typeof value.id === "string" && typeof value.type === "string";
}

function isV2Envelope(value) {
    if (!value || typeof value !== "object" || value.version !== 2) return false;
    const common = Number.isSafeInteger(value.revision) &&
        value.revision >= 0 &&
        (value.ledgerParentCursor === null || typeof value.ledgerParentCursor === "string") &&
        (value.parentCursor === null || typeof value.parentCursor === "string") &&
        isV1TaskEvent(value.event);
    if (!common) return false;
    if (value.kind === "mutation") {
        return value.revision > 0 &&
            typeof value.requestId === "string" &&
            value.requestId.length > 0 &&
            typeof value.payloadHash === "string" &&
            HASH_PATTERN.test(value.payloadHash) &&
            PI_TASK_MUTATION_TOOLS.includes(value.command) &&
            !containsForcedCompletionField(value.event) &&
            expectedEventType(value.command) === value.event.type;
    }
    return value.kind === "snapshot" && isCheckpoint(value.checkpoint);
}

function assertCommandEventPair(command, event) {
    if (!isV1TaskEvent(event) ||
        expectedEventType(command) !== event.type ||
        containsForcedCompletionField(event)) {
        throw new PiTaskContractError(
            "COMMAND_EVENT_MISMATCH",
            containsForcedCompletionField(event)
                ? "Forced task completion is not supported"
                : `Task command ${command} cannot persist event ${String(event?.type)}`,
        );
    }
}

function expectedEventType(command) {
    switch (command) {
        case "task_plan": return "task.created";
        case "task_checkpoint": return "task.snapshot";
        case "task_decompose": return "task.steps_decomposed";
        case "task_update": return "task.updated";
        case "task_evidence": return "task.evidence_added";
        case "task_decision": return "task.decision_recorded";
        case "task_complete": return "task.completed";
        default: return undefined;
    }
}

function isCheckpoint(value) {
    return Boolean(value &&
        typeof value === "object" &&
        value.version === 2 &&
        typeof value.stateHash === "string" && HASH_PATTERN.test(value.stateHash) &&
        typeof value.receiptHash === "string" && HASH_PATTERN.test(value.receiptHash) &&
        typeof value.checkpointHash === "string" && HASH_PATTERN.test(value.checkpointHash) &&
        value.receiptWindow && typeof value.receiptWindow === "object" &&
        Array.isArray(value.receipts) &&
        (value.legacyForcedCompletions === undefined || Array.isArray(value.legacyForcedCompletions)));
}

function isLegacyForcedCompletionEvent(event) {
    return event.type === "task.completed" &&
        typeof event.forceWithReason === "string" &&
        event.forceWithReason.trim().length > 0;
}

function retainLegacyForcedCompletionEvent(state, event, record) {
    const nextState = structuredClone(state);
    nextState.events = [...state.events, structuredClone(event)];
    nextState.lastUpdatedAt = event.createdAt;
    const task = nextState.tasks[event.taskId];
    if (task) {
        task.warnings = uniqueStrings([
            ...(task.warnings ?? []),
            `${PI_TASK_LEGACY_FORCED_COMPLETION_CODE}:${record.eventId}`,
        ]);
        task.updatedAt = event.createdAt;
    }
    nextState.warnings = uniqueStrings([
        ...nextState.warnings,
        `${PI_TASK_LEGACY_FORCED_COMPLETION_CODE}:${record.eventId}`,
    ]);
    return nextState;
}

function migrateLegacyForcedSnapshot(state, cursor, eventId) {
    const nextState = structuredClone(state);
    const records = [];
    for (const task of Object.values(nextState.tasks)) {
        const warning = task.warnings?.find((value) => /^Forced completion:\s*/.test(value));
        if (task.status !== "done" || !warning) continue;
        const reason = warning.replace(/^Forced completion:\s*/, "").trim() || "Legacy forced completion";
        const record = createLegacyForcedCompletionRecord({
            source: "v1_snapshot",
            cursor,
            eventId,
            taskId: task.id,
            reason,
            summary: task.completionSummary,
            evidenceIds: task.evidence?.map((item) => item.id) ?? [],
        });
        records.push(record);
        task.status = "review";
        task.progress = Math.min(task.progress ?? 0, 99);
        task.confidence = Math.min(task.confidence ?? 0, 79);
        delete task.completedAt;
        delete task.completionSummary;
        task.warnings = uniqueStrings([
            ...task.warnings.filter((value) => value !== warning),
            `${PI_TASK_LEGACY_FORCED_COMPLETION_CODE}:${eventId}`,
        ]);
        if (!nextState.activeTaskId) nextState.activeTaskId = task.id;
    }
    if (records.length > 0) {
        nextState.warnings = uniqueStrings([
            ...nextState.warnings,
            ...records.map((record) => `${PI_TASK_LEGACY_FORCED_COMPLETION_CODE}:${record.eventId}`),
        ]);
    }
    return { state: nextState, records };
}

function createLegacyForcedCompletionRecord({ source, cursor, eventId, taskId, reason, summary, evidenceIds }) {
    return Object.freeze({
        code: PI_TASK_LEGACY_FORCED_COMPLETION_CODE,
        trusted: false,
        source,
        cursor,
        eventId,
        taskId,
        reason: String(reason).trim(),
        ...(typeof summary === "string" && summary.length > 0 ? { summary } : {}),
        evidenceIds: Object.freeze(Array.isArray(evidenceIds) ? [...evidenceIds] : []),
    });
}

function normalizeCheckpointLegacyCompletions(records, cursor) {
    if (records === undefined) return [];
    return records.map((record) => {
        if (!isLegacyForcedCompletionRecord(record)) {
            throw new PiTaskContractError(
                "INVALID_LEGACY_INTEGRITY_RECORD",
                `Snapshot entry ${cursor} contains an invalid legacy completion audit record`,
            );
        }
        return createLegacyForcedCompletionRecord(record);
    });
}

function isLegacyForcedCompletionRecord(record) {
    return Boolean(record &&
        typeof record === "object" &&
        record.code === PI_TASK_LEGACY_FORCED_COMPLETION_CODE &&
        record.trusted === false &&
        (record.source === "v1_event" || record.source === "v1_snapshot") &&
        typeof record.cursor === "string" &&
        typeof record.eventId === "string" &&
        typeof record.taskId === "string" &&
        typeof record.reason === "string" &&
        Array.isArray(record.evidenceIds));
}

function addLegacyForcedCompletion(records, record) {
    if (records.some((candidate) => legacyRecordKey(candidate) === legacyRecordKey(record))) return;
    records.push(record);
}

function replaceLegacyForcedCompletions(target, incoming, replace) {
    if (replace) target.splice(0, target.length);
    for (const record of incoming ?? []) {
        if (!target.some((candidate) => legacyRecordKey(candidate) === legacyRecordKey(record))) {
            target.push(record);
        }
    }
}

function mergeLegacyForcedCompletions(...groups) {
    const result = [];
    for (const group of groups) replaceLegacyForcedCompletions(result, group, false);
    return result;
}

function cloneLegacyForcedCompletions(records) {
    return records.map((record) => ({ ...record, evidenceIds: [...record.evidenceIds] }));
}

function legacyRecordKey(record) {
    return `${record.source}:${record.cursor}:${record.eventId}:${record.taskId}`;
}

function uniqueStrings(values) {
    return [...new Set(values)];
}

function isMutationReceipt(value) {
    return Boolean(value &&
        typeof value === "object" &&
        value.version === 1 &&
        typeof value.requestId === "string" && value.requestId.length > 0 &&
        PI_TASK_MUTATION_TOOLS.includes(value.command) &&
        Number.isInteger(value.revisionBefore) && value.revisionBefore >= 0 &&
        Number.isInteger(value.revisionAfter) && value.revisionAfter > 0 &&
        (value.ledgerCursorBefore === null || typeof value.ledgerCursorBefore === "string") &&
        typeof value.ledgerCursorAfter === "string" && value.ledgerCursorAfter.length > 0 &&
        (value.cursorBefore === null || typeof value.cursorBefore === "string") &&
        typeof value.cursorAfter === "string" && value.cursorAfter.length > 0 &&
        typeof value.taskId === "string" && value.taskId.length > 0 &&
        typeof value.eventId === "string" && value.eventId.length > 0 &&
        typeof value.eventType === "string" && value.eventType.length > 0 &&
        typeof value.stateHash === "string" && HASH_PATTERN.test(value.stateHash) &&
        typeof value.payloadHash === "string" && HASH_PATTERN.test(value.payloadHash));
}

function normalizeReceipt(receipt) {
    const { replayed: _replayed, ...stable } = receipt;
    return { ...stable, replayed: false };
}

function compareReceipts(left, right) {
    return left.revisionAfter - right.revisionAfter || left.requestId.localeCompare(right.requestId);
}

function checkpointEnvelopeHash({ revision, ledgerParentCursor, parentCursor, event, checkpoint }) {
    return sha256({
        version: 2,
        kind: "snapshot",
        revision,
        ledgerParentCursor,
        parentCursor,
        event,
        checkpoint,
    });
}

function byteLength(value) {
    return Buffer.byteLength(stableJson(value), "utf8");
}

export function errorText(error) {
    if (error instanceof TaskTransitionError || error instanceof PiTaskContractError)
        return error.message;
    if (error instanceof Error) return error.message;
    return String(error);
}
