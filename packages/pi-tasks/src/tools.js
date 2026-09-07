import { createEventId, SequentialIdGenerator } from "./ids.js";
import { buildTaskResume, formatTaskFocus, formatTaskList, formatTaskNext, formatTaskResume, } from "./render.js";
import { Type } from "./schema.js";
import { requireTaskSessionId } from "./state-events.js";
import { errorText, snapshotState } from "./store.js";
import { updateTaskUi } from "./widget.js";
const TASK_STATUSES = [
    "pending",
    "active",
    "blocked",
    "review",
    "done",
    "cancelled",
];
const STEP_STATUSES = ["active", "done", "skipped"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const EVIDENCE_TYPES = [
    "test",
    "command",
    "review",
    "file",
    "commit",
    "dogfood",
    "user_acceptance",
    "external",
    "note",
];
const VERIFICATION_LEVELS = [
    "not_verified",
    "static_read",
    "unit_test",
    "integration_test",
    "e2e_smoke",
    "release_grade_e2e",
    "pi_dogfood",
    "external_unverified",
];
const GRANULARITY_STATUSES = [
    "needs_breakdown",
    "breaking_down",
    "atomic",
    "deferred",
];
export function registerTaskTools(pi, store, idGenerator = new SequentialIdGenerator()) {
    pi.registerTool({
        name: "task_plan",
        label: "Task Plan",
        description: "Create a structured pi-tasks task with objective and acceptance criteria.",
        promptSnippet: "Create a pi-tasks execution contract before non-trivial implementation work",
        promptGuidelines: [
            "Use task_plan for multi-step work before implementation when no suitable active task exists.",
            "Prefer plan_steps with expectedOutput, criterionIds, evidenceRequired, and allowedActions for commercial-quality work.",
            "When creating a new task, omit plan_steps.criterionIds unless you already know the generated criterion IDs; omitted criterionIds link the step to all task criteria.",
            "Generated criterion IDs use the final task ID, such as T1-AC1. Do not guess IDs from criterion text or array indexes.",
            "Mark a plan step atomic only when its granularityCheck proves it has one action, one observable output, one verification method, and no hidden subtasks.",
            "Acceptance criteria must be concrete enough to verify with evidence before completion.",
            "Activate only one task unless the user explicitly asks for parallel work.",
        ],
        parameters: Type.Object({
            originos_command: Type.Optional(originosCommandSchema()),
            title: Type.String({ description: "Concise task title" }),
            objective: Type.String({
                description: "User-facing objective and scope",
            }),
            acceptance_criteria: Type.Array(Type.String({ description: "Concrete acceptance criterion" })),
            initial_steps: Type.Optional(Type.Array(Type.String())),
            plan_steps: Type.Optional(Type.Array(Type.Object({
                text: Type.String(),
                expectedOutput: Type.String(),
                criterionIds: Type.Optional(Type.Array(Type.String({
                    description: "Known generated criterion IDs, for example T1-AC1. Omit during new task creation to auto-link all criteria.",
                }))),
                evidenceRequired: Type.Optional(Type.Boolean()),
                allowedActions: Type.Optional(Type.Array(Type.String())),
                decompositionStatus: Type.Optional(Type.Enum(GRANULARITY_STATUSES)),
                granularityCheck: Type.Optional(granularityCheckSchema()),
            }))),
            priority: Type.Optional(Type.Enum(PRIORITIES)),
            tags: Type.Optional(Type.Array(Type.String())),
            activate: Type.Optional(Type.Boolean({ description: "Make this the active task" })),
        }),
        execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
            const taskId = nextTaskId(store.getState());
            const event = baseEvent("task.created", taskId, ctx, {
                title: params.title,
                objective: params.objective,
                acceptanceCriteria: params.acceptance_criteria,
                activate: params.activate ?? true,
                ...(params.plan_steps ? { planSteps: params.plan_steps } : {}),
                ...(params.initial_steps ? { initialSteps: params.initial_steps } : {}),
                ...(params.priority ? { priority: params.priority } : {}),
                ...(params.tags ? { tags: params.tags } : {}),
            });
            return appendAndReport(pi, store, ctx, event, `Created task ${taskId}: ${params.title}`, buildMutationRequest("task_plan", toolCallId, params, store, ctx));
        },
    });
    pi.registerTool({
        name: "task_next",
        label: "Task Next",
        description: "Return the single recommended next pi-tasks tool call for weak or small-context models.",
        promptSnippet: "Ask pi-tasks for the only next tool to call before continuing",
        promptGuidelines: [
            "Call task_next after rejection, compaction, branch navigation, or uncertainty.",
            "Follow Only next tool and Current step lock exactly.",
            "Do not call blocked tools listed by task_next.",
        ],
        parameters: Type.Object({}),
        execute: async () => textResult(formatTaskNext(store.getState()), buildTaskResume(store.getState())),
    });
    pi.registerTool({
        name: "task_focus",
        label: "Task Focus",
        description: "Show the active task's current allowed step, expected output, linked criteria, required evidence, and drift warnings.",
        promptSnippet: "Inspect the current pi-tasks focus before acting, then work only on the active step",
        promptGuidelines: [
            "Call task_focus before implementation, verification, or step completion work.",
            "If Granularity is not atomic, use task_decompose before doing implementation work.",
            "If intended work does not match the active step, record scope_change or off_plan with task_update first.",
            "Use task_evidence before marking an evidence-required step done.",
        ],
        parameters: Type.Object({}),
        execute: async () => textResult(formatTaskFocus(store.getState()), buildTaskResume(store.getState())),
    });
    pi.registerTool({
        name: "task_resume",
        label: "Task Resume",
        description: "Return the compact resume contract needed to continue work after context compaction or session resume.",
        promptSnippet: "Resume pi-tasks work from the current compact execution contract before acting",
        promptGuidelines: [
            "Call task_resume after context compaction, session resume, or when unsure what to do next.",
            "Follow next allowed actions; do not complete tasks while verification gaps remain.",
            "Use task_decompose when the resume instruction says the current step is not atomic.",
        ],
        parameters: Type.Object({}),
        execute: async () => textResult(formatTaskResume(store.getState()), buildTaskResume(store.getState())),
    });
    pi.registerTool({
        name: "task_checkpoint",
        label: "Task Checkpoint",
        description: "Persist a compact pi-tasks snapshot with resume fields for compaction-safe continuation.",
        promptSnippet: "Create a pi-tasks checkpoint before risky context transitions or long pauses",
        promptGuidelines: [
            "Use task_checkpoint before long-running work, major decomposition changes, or when the user asks for a restartable handoff.",
            "Checkpoint is not evidence and does not satisfy acceptance criteria.",
        ],
        parameters: Type.Object({
            originos_command: Type.Optional(originosCommandSchema()),
            reason: Type.Optional(Type.String()),
        }),
        execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
            const state = store.getState();
            if (Object.keys(state.tasks).length === 0) {
                return textResult("No pi-tasks state to checkpoint.", buildTaskResume(state));
            }
            const event = baseEvent("task.snapshot", state.activeTaskId ?? "snapshot", ctx, {
                state: snapshotState(state),
                resume: buildTaskResume(state),
                reason: "manual",
            });
            return appendAndReport(pi, store, ctx, event, `Checkpointed pi-tasks state${params.reason ? `: ${params.reason}` : ""}`, buildMutationRequest("task_checkpoint", toolCallId, params, store, ctx));
        },
    });
    pi.registerTool({
        name: "task_granularity_check",
        label: "Task Granularity Check",
        description: "Report whether a task step is atomic enough to execute or must be recursively decomposed.",
        promptSnippet: "Check whether the current pi-tasks step is atomic before implementation",
        promptGuidelines: [
            "Use this before implementation when task_focus shows a non-atomic step.",
            "Atomic means one agent action, one observable output, one verification method, and no hidden subtasks.",
            "If the step is not atomic, call task_decompose with smaller child steps.",
        ],
        parameters: Type.Object({
            task_id: Type.Optional(Type.String()),
            step_id: Type.Optional(Type.String()),
        }),
        execute: async (_toolCallId, params) => {
            const state = store.getState();
            const task = selectTask(state, params.task_id);
            if (!task) {
                return {
                    ...textResult("Error: no active task", buildTaskResume(state)),
                    isError: true,
                };
            }
            const step = selectStep(task, params.step_id);
            if (!step) {
                return {
                    ...textResult("Error: no matching open step", buildTaskResume(state)),
                    isError: true,
                };
            }
            const check = step.granularityCheck;
            return textResult([
                `Step: ${step.id} ${step.text}`,
                `Granularity: ${step.decompositionStatus}`,
                `Atomic: ${check.isAtomic}`,
                `One agent action: ${check.canBeDoneInOneAgentAction}`,
                `Single observable output: ${check.hasSingleObservableOutput}`,
                `Single verification method: ${check.hasSingleVerificationMethod}`,
                `No hidden subtasks: ${check.hasNoHiddenSubtasks}`,
                `Reason: ${check.reason}`,
                step.decompositionStatus === "atomic"
                    ? "Next allowed action: task_focus or execution work"
                    : `Next allowed action: task_decompose ${step.id}`,
            ].join("\n"), buildTaskResume(state));
        },
    });
    pi.registerTool({
        name: "task_decompose",
        label: "Task Decompose",
        description: "Replace a non-atomic plan step with smaller child steps until each executable step is atomic.",
        promptSnippet: "Recursively break down a non-atomic pi-tasks step into atomic child steps",
        promptGuidelines: [
            "Use task_decompose when task_focus or task_granularity_check says the current step needs breakdown.",
            "Each child step must include expectedOutput, evidenceRequired, allowedActions, and granularityCheck.",
            "Omit child step criterionIds unless you are carrying forward known generated IDs from task_focus or task_resume.",
            "Only mark a child atomic when it truly has one action, one output, one verification method, and no hidden subtasks.",
            "Do not use task_decompose for execution evidence; record execution evidence with task_evidence.",
        ],
        parameters: Type.Object({
            originos_command: Type.Optional(originosCommandSchema()),
            task_id: Type.String(),
            step_id: Type.String(),
            reason: Type.String(),
            child_steps: Type.Array(Type.Object({
                text: Type.String(),
                expectedOutput: Type.String(),
                criterionIds: Type.Optional(Type.Array(Type.String({
                    description: "Known generated criterion IDs from task_focus/task_resume. Omit to inherit all task criteria.",
                }))),
                evidenceRequired: Type.Optional(Type.Boolean()),
                allowedActions: Type.Optional(Type.Array(Type.String())),
                decompositionStatus: Type.Optional(Type.Enum(GRANULARITY_STATUSES)),
                granularityCheck: Type.Optional(granularityCheckSchema()),
            })),
        }),
        execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
            const event = baseEvent("task.steps_decomposed", params.task_id, ctx, {
                parentStepId: params.step_id,
                childSteps: params.child_steps,
                reason: params.reason,
            });
            return appendAndReport(pi, store, ctx, event, `Decomposed step ${params.step_id} for task ${params.task_id}`, buildMutationRequest("task_decompose", toolCallId, params, store, ctx));
        },
    });
    pi.registerTool({
        name: "task_list",
        label: "Task List",
        description: "List pi-tasks tasks on the current session branch.",
        promptSnippet: "Inspect current pi-tasks task status, blockers, and verification gaps",
        promptGuidelines: [
            "Use task_list before resuming work after session reload or branch navigation.",
            "Do not treat task_list as evidence; attach verification with task_evidence.",
        ],
        parameters: Type.Object({
            status: Type.Optional(Type.Enum(TASK_STATUSES)),
            include_done: Type.Optional(Type.Boolean()),
            include_evidence: Type.Optional(Type.Boolean()),
            limit: Type.Optional(Type.Number()),
        }),
        execute: async (_toolCallId, params) => {
            const rawState = store.getState();
            const filtered = params.status
                ? filterStateByStatus(rawState, params.status)
                : rawState;
            return textResult(formatTaskList(filtered, formatListOptions(params)), buildTaskResume(filtered));
        },
    });
    pi.registerTool({
        name: "task_update",
        label: "Task Update",
        description: "Update task progress, ordered plan step, status, next action, or blocker state.",
        promptSnippet: "Update pi-tasks progress, current ordered step, next action, status, or blocker details",
        promptGuidelines: [
            "Use step_id with step_status=done when the current planned step is finished.",
            "Only atomic steps can be marked done; use task_decompose first if a step still needs breakdown.",
            "Evidence-required steps need linked evidence before step_status=done.",
            "Do not skip ahead; ordered plan steps must be completed or skipped in the displayed order.",
            "Use activity with scope=within_step, scope_change, or off_plan to document meaningful work and drift.",
            "Use resolve_warnings to explicitly close scope drift warnings before task_complete.",
            "Moving to blocked requires blocker details; unblocking requires a reason.",
        ],
        parameters: Type.Object({
            originos_command: Type.Optional(originosCommandSchema()),
            task_id: Type.String(),
            status: Type.Optional(Type.Enum(TASK_STATUSES)),
            progress: Type.Optional(Type.Number()),
            current_step: Type.Optional(Type.String()),
            next_action: Type.Optional(Type.String()),
            step_id: Type.Optional(Type.String()),
            step_status: Type.Optional(Type.Enum(STEP_STATUSES)),
            step_evidence_ids: Type.Optional(Type.Array(Type.String())),
            activity: Type.Optional(Type.String()),
            scope: Type.Optional(Type.Enum(["within_step", "scope_change", "off_plan"])),
            scope_reason: Type.Optional(Type.String()),
            note: Type.Optional(Type.String()),
            resolve_warnings: Type.Optional(Type.Array(Type.String())),
            reason: Type.Optional(Type.String({ description: "Reason for unblock/rework transition" })),
            blocker: Type.Optional(Type.Object({
                reason: Type.String(),
                blockedBy: Type.Enum([
                    "user",
                    "external",
                    "environment",
                    "dependency",
                    "ambiguity",
                ]),
                neededToUnblock: Type.String(),
            })),
        }),
        execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
            const event = baseEvent("task.updated", params.task_id, ctx, {
                ...(params.status ? { status: params.status } : {}),
                ...(params.progress !== undefined ? { progress: params.progress } : {}),
                ...(params.current_step !== undefined
                    ? { currentStep: params.current_step }
                    : {}),
                ...(params.next_action !== undefined
                    ? { nextAction: params.next_action }
                    : {}),
                ...(params.step_id !== undefined ? { stepId: params.step_id } : {}),
                ...(params.step_status !== undefined
                    ? { stepStatus: params.step_status }
                    : {}),
                ...(params.step_evidence_ids !== undefined
                    ? { stepEvidenceIds: params.step_evidence_ids }
                    : {}),
                ...(params.activity !== undefined ? { activity: params.activity } : {}),
                ...(params.scope !== undefined ? { scope: params.scope } : {}),
                ...(params.scope_reason !== undefined
                    ? { scopeReason: params.scope_reason }
                    : {}),
                ...(params.note !== undefined ? { note: params.note } : {}),
                ...(params.reason !== undefined ? { reason: params.reason } : {}),
                ...(params.resolve_warnings !== undefined
                    ? { resolveWarnings: params.resolve_warnings }
                    : {}),
                ...(params.blocker ? { blocker: params.blocker } : {}),
            });
            return appendAndReport(pi, store, ctx, event, `Updated task ${params.task_id}`, buildMutationRequest("task_update", toolCallId, params, store, ctx));
        },
    });
    pi.registerTool({
        name: "task_evidence",
        label: "Task Evidence",
        description: "Attach verification evidence to a task and optionally satisfy acceptance criteria.",
        promptSnippet: "Record verification evidence before claiming a task is complete",
        promptGuidelines: [
            "Use task_evidence for tests, commands, reviews, files, dogfood, or explicit user acceptance.",
            "Passing non-note evidence must use a verification level stronger than not_verified.",
            "Attach criterion IDs when evidence proves specific acceptance criteria.",
            "Attach step_ids when evidence proves specific atomic steps, especially when multiple steps share the same criterion.",
            "Provide quality.source, quality.reproducible, quality.verifier, quality.artifactRefs, and observedOutput for test/command/dogfood evidence.",
        ],
        parameters: Type.Object({
            originos_command: Type.Optional(originosCommandSchema()),
            task_id: Type.String(),
            type: Type.Enum(EVIDENCE_TYPES),
            level: Type.Enum(VERIFICATION_LEVELS),
            summary: Type.String(),
            passed: Type.Enum(["true", "false", "unknown"]),
            references: Type.Optional(Type.Array(Type.String())),
            criterion_ids: Type.Optional(Type.Array(Type.String())),
            step_ids: Type.Optional(Type.Array(Type.String())),
            quality: Type.Optional(evidenceQualitySchema()),
            override_reason: Type.Optional(Type.String({
                description: "Required only when attaching evidence outside the current step lock.",
            })),
        }),
        execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
            const duplicate = findDuplicateEvidenceForParams(store.getState().tasks[params.task_id], params);
            if (duplicate &&
                criteriaAlreadyLinked(store.getState(), params, duplicate) &&
                !params.originos_command) {
                return textResult(`Evidence already recorded as ${duplicate.id} for task ${params.task_id}\n\n${formatTaskResume(store.getState())}`, buildTaskResume(store.getState()));
            }
            const evidenceId = idGenerator.next("E");
            const event = baseEvent("task.evidence_added", params.task_id, ctx, {
                evidence: {
                    id: evidenceId,
                    type: params.type,
                    level: params.level,
                    summary: params.summary,
                    passed: parsePassed(params.passed),
                    references: params.references ?? [],
                    ...(params.quality ? { quality: params.quality } : {}),
                },
                ...(params.criterion_ids ? { criterionIds: params.criterion_ids } : {}),
                ...(params.step_ids ? { stepIds: params.step_ids } : {}),
                ...(params.override_reason
                    ? { overrideReason: params.override_reason }
                    : {}),
            });
            const success = duplicate
                ? `Linked existing evidence ${duplicate.id} for task ${params.task_id}`
                : `Recorded evidence ${evidenceId} for task ${params.task_id}`;
            return appendAndReport(pi, store, ctx, event, success, buildMutationRequest("task_evidence", toolCallId, params, store, ctx));
        },
    });
    pi.registerTool({
        name: "task_decision",
        label: "Task Decision",
        description: "Record a user or agent decision that affects task scope or implementation.",
        promptSnippet: "Record explicit decisions that affect pi-tasks scope, tradeoffs, or acceptance",
        promptGuidelines: [
            "Use task_decision for user-facing scope choices and meaningful agent tradeoffs.",
            "Do not hide unresolved user choices in notes; record them as blockers or decisions.",
        ],
        parameters: Type.Object({
            originos_command: Type.Optional(originosCommandSchema()),
            task_id: Type.String(),
            question: Type.String(),
            decision: Type.String(),
            decided_by: Type.Enum(["user", "agent"]),
            rationale: Type.Optional(Type.String()),
            impact: Type.Optional(Type.String()),
        }),
        execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
            const decisionId = idGenerator.next("D");
            const decision = {
                id: decisionId,
                question: params.question,
                decision: params.decision,
                decidedBy: params.decided_by,
            };
            if (params.rationale !== undefined)
                decision.rationale = params.rationale;
            if (params.impact !== undefined)
                decision.impact = params.impact;
            const event = baseEvent("task.decision_recorded", params.task_id, ctx, {
                decision,
            });
            return appendAndReport(pi, store, ctx, event, `Recorded decision ${decisionId} for task ${params.task_id}`, buildMutationRequest("task_decision", toolCallId, params, store, ctx));
        },
    });
    pi.registerTool({
        name: "task_complete",
        label: "Task Complete",
        description: "Mark a task complete only after evidence and criteria support completion.",
        promptSnippet: "Complete a pi-tasks task only when acceptance criteria have evidence",
        promptGuidelines: [
            "Call task_complete only after task_evidence has recorded supporting evidence.",
            "Every completion evidence ID must reference passing, reproducible evidence.",
            "Completion is rejected while any step, criterion, blocker, or evidence gate remains unresolved.",
        ],
        parameters: Type.Object({
            originos_command: Type.Optional(originosCommandSchema()),
            task_id: Type.String(),
            summary: Type.String(),
            evidence_ids: Type.Array(Type.String()),
            criterion_results: Type.Optional(Type.Array(Type.Object({
                criterionId: Type.String(),
                status: Type.Enum(["pending", "satisfied", "failed", "skipped"]),
                evidenceIds: Type.Optional(Type.Array(Type.String())),
                note: Type.Optional(Type.String()),
            }))),
        }),
        execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
            if (Object.hasOwn(params, "force_with_reason") || Object.hasOwn(params, "forceWithReason")) {
                return forbiddenForcedCompletion(store.getState());
            }
            const event = baseEvent("task.completed", params.task_id, ctx, {
                summary: params.summary,
                evidenceIds: params.evidence_ids,
                ...(params.criterion_results
                    ? { criterionResults: params.criterion_results }
                    : {}),
            });
            return appendAndReport(pi, store, ctx, event, `Completed task ${params.task_id}`, buildMutationRequest("task_complete", toolCallId, params, store, ctx));
        },
    });
}
function granularityCheckSchema() {
    return Type.Object({
        isAtomic: Type.Boolean(),
        reason: Type.String(),
        canBeDoneInOneAgentAction: Type.Boolean(),
        hasSingleObservableOutput: Type.Boolean(),
        hasSingleVerificationMethod: Type.Boolean(),
        hasNoHiddenSubtasks: Type.Boolean(),
    });
}
function evidenceQualitySchema() {
    return Type.Object({
        source: Type.String(),
        reproducible: Type.Boolean(),
        verifier: Type.Enum(["agent", "tool", "user", "external"]),
        command: Type.Optional(Type.String()),
        artifactRefs: Type.Array(Type.String()),
        observedOutput: Type.Optional(Type.String()),
    });
}
function originosCommandSchema() {
    return Type.Object({
        version: { const: 1 },
        request_id: Type.String({ minLength: 1 }),
        expected_revision: { type: "integer", minimum: 0 },
        expected_cursor: { type: ["string", "null"], minLength: 1 },
    });
}
function buildMutationRequest(command, toolCallId, params, store, ctx) {
    const businessInput = { ...params };
    delete businessInput.originos_command;
    const current = store.getMetadata();
    const reserved = params.originos_command;
    return {
        version: reserved?.version ?? 1,
        requestId: reserved?.request_id ?? toolCallId,
        command,
        expectedRevision: reserved?.expected_revision ?? current.revision,
        expectedCursor: reserved ? reserved.expected_cursor : currentBranchLeaf(ctx),
        input: businessInput,
        runtimeToolCallId: toolCallId,
    };
}
function currentBranchLeaf(ctx) {
    const branch = ctx.sessionManager.getBranch();
    if (!Array.isArray(branch) || branch.length === 0) return null;
    const leaf = branch.at(-1)?.id;
    if (typeof leaf !== "string" || leaf.length === 0) {
        const error = new Error("Current Session branch leaf has no stable entry id");
        error.code = "INVALID_BRANCH_LEAF";
        throw error;
    }
    return leaf;
}
function appendAndReport(pi, store, ctx, event, success, request) {
    try {
        if (request.requestId !== request.runtimeToolCallId) {
            const error = new Error("originos_command.request_id must match the Runtime toolCallId");
            error.code = "INVALID_REQUEST_ID";
            throw error;
        }
        requireTaskSessionId(ctx);
        const { runtimeToolCallId: _runtimeToolCallId, ...mutationRequest } = request;
        const result = store.mutate(mutationRequest, event, {
            appendEntry(customType, data) {
                pi.appendEntry(customType, data);
            },
            getBranch() {
                return ctx.sessionManager.getBranch();
            },
        });
        updateTaskUi(
            pi,
            ctx,
            result.state,
            "task_mutation",
            result.metadata,
            result.receipt.replayed ? undefined : result.receipt,
        );
        const outcome = result.receipt.replayed
            ? `Idempotent replay: request ${result.receipt.requestId} already committed ${result.receipt.eventType} for task ${result.receipt.taskId}; no new task event was appended.`
            : success;
        return textResult(`${outcome}\n\n${formatTaskResume(result.state)}`, {
            ...buildTaskResume(result.state),
            mutationReceipt: result.receipt,
        });
    }
    catch (error) {
        const resume = formatTaskResume(store.getState());
        const recovery = buildRejectionRecovery(error, store.getState());
        return {
            ...textResult([
                `Error: ${errorText(error)}`,
                "",
                "Recovery:",
                `- retry_with: ${recovery.retry_with}`,
                `- do_not_retry_same_call: ${recovery.do_not_retry_same_call}`,
                `- reason: ${recovery.reason}`,
                "",
                "Recovery guidance:",
                resume,
            ].join("\n"), recovery),
            isError: true,
        };
    }
}

function forbiddenForcedCompletion(state) {
    return {
        ...textResult([
            "Error: forced task completion is not supported",
            "",
            formatTaskResume(state),
        ].join("\n"), {
            ...buildTaskResume(state),
            code: "FORCE_COMPLETION_FORBIDDEN",
        }),
        isError: true,
    };
}
function buildRejectionRecovery(error, state) {
    const resume = buildTaskResume(state);
    return {
        rejected: true,
        code: typeof error?.code === "string" ? error.code : "TASK_TRANSITION_REJECTED",
        reason: errorText(error),
        retry_with: resume.recommendedTool ?? resume.nextAllowedActions[0] ?? "task_resume",
        minimum_params: resume.minimumParams ?? {},
        do_not_retry_same_call: true,
        resume,
    };
}
function selectTask(state, taskId) {
    if (taskId)
        return state.tasks[taskId];
    return state.activeTaskId ? state.tasks[state.activeTaskId] : undefined;
}
function nextTaskId(state) {
    const maxId = Object.keys(state.tasks).reduce((max, id) => {
        const match = /^T(\d+)$/.exec(id);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `T${maxId + 1}`;
}
function selectStep(task, stepId) {
    if (stepId)
        return task.planSteps.find((step) => step.id === stepId);
    return task.planSteps.find((step) => step.status !== "done" && step.status !== "skipped");
}
function baseEvent(type, taskId, ctx, payload) {
    const createdAt = new Date().toISOString();
    return {
        version: 1,
        id: createEventId(taskId, createdAt, type),
        type,
        taskId,
        createdAt,
        source: ctx.mode === "tui" ? "tool" : "tool",
        ...payload,
    };
}
function textResult(text, details) {
    return { content: [{ type: "text", text }], details };
}
function parsePassed(value) {
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    return "unknown";
}
function findDuplicateEvidenceForParams(task, params) {
    if (!task)
        return undefined;
    const passed = parsePassed(params.passed);
    const references = params.references ?? [];
    return task.evidence.find((evidence) => evidence.type === params.type &&
        evidence.level === params.level &&
        evidence.passed === passed &&
        evidence.summary.trim() === params.summary.trim() &&
        normalizedReferences(evidence.references) ===
            normalizedReferences(references));
}
function criteriaAlreadyLinked(state, params, evidence) {
    const task = state.tasks[params.task_id];
    if (!task)
        return false;
    const criteriaLinked = (params.criterion_ids ?? []).every((criterionId) => task.acceptanceCriteria
        .find((criterion) => criterion.id === criterionId)
        ?.evidenceIds.includes(evidence.id));
    const stepsLinked = (params.step_ids ?? []).every((stepId) => task.planSteps
        .find((step) => step.id === stepId)
        ?.evidenceIds.includes(evidence.id));
    return criteriaLinked && stepsLinked;
}
function normalizedReferences(references) {
    return [
        ...new Set(references.map((reference) => reference.trim()).filter(Boolean)),
    ]
        .sort()
        .join("\n");
}
function filterStateByStatus(state, status) {
    const tasks = Object.fromEntries(Object.entries(state.tasks).filter(([, task]) => task.status === status));
    const filtered = {
        ...state,
        tasks,
    };
    if (state.activeTaskId && tasks[state.activeTaskId]) {
        filtered.activeTaskId = state.activeTaskId;
    }
    else {
        delete filtered.activeTaskId;
    }
    return filtered;
}
function formatListOptions(params) {
    return {
        ...(params.include_done !== undefined
            ? { includeDone: params.include_done }
            : {}),
        ...(params.include_evidence !== undefined
            ? { includeEvidence: params.include_evidence }
            : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
    };
}
