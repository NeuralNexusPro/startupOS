const STATUS_ORDER = [
    "active",
    "blocked",
    "review",
    "pending",
    "done",
    "cancelled",
];
const DETAIL_TEXT_MAX = 220;
const DETAIL_REF_MAX = 120;
export function truncateText(text, maxWidth) {
    if (maxWidth <= 0)
        return "";
    if (text.length <= maxWidth)
        return text;
    if (maxWidth === 1)
        return "…";
    return `${text.slice(0, maxWidth - 1)}…`;
}
export function formatStatusText(state, maxWidth = 80) {
    const active = state.activeTaskId
        ? state.tasks[state.activeTaskId]
        : undefined;
    if (!active)
        return undefined;
    const marker = active.status === "blocked"
        ? "blocked"
        : `${active.status} ${active.progress}%`;
    return truncateText(`Task ${active.id} ${marker} - ${active.nextAction ?? active.title}`, maxWidth);
}
export function formatWidgetLines(state, maxWidth = 80) {
    const active = state.activeTaskId
        ? state.tasks[state.activeTaskId]
        : undefined;
    if (!active)
        return undefined;
    const gaps = getVerificationGaps(active);
    const lines = [
        `Active task: ${active.id} ${active.title}`,
        `Progress: ${active.progress}% | ${active.status} | Next: ${active.nextAction ?? "unset"}`,
        `Criteria: ${countCriteria(active, "satisfied")}/${active.acceptanceCriteria.length} satisfied | Evidence: ${active.evidence.length}`,
    ];
    if (active.blockers.some((blocker) => !blocker.resolvedAt)) {
        lines.push(`Blocked: ${active.blockers.find((blocker) => !blocker.resolvedAt)?.reason ?? "unresolved blocker"}`);
    }
    if (gaps.length > 0)
        lines.push(`Gaps: ${gaps.join("; ")}`);
    return lines.slice(0, 5).map((line) => truncateText(line, maxWidth));
}
export function formatTaskList(state, options = {}) {
    const tasks = sortTasks(Object.values(state.tasks), state.activeTaskId).filter((task) => options.includeDone || task.status !== "done");
    const limited = tasks.slice(0, options.limit ?? 20);
    if (limited.length === 0)
        return "No tasks on this branch.";
    const lines = limited.flatMap((task) => {
        const unresolvedBlockerCount = task.blockers.filter((blocker) => !blocker.resolvedAt).length;
        const criteria = `${countCriteria(task, "satisfied")}/${task.acceptanceCriteria.length}`;
        const evidence = options.includeEvidence
            ? ` evidence:${task.evidence.length}`
            : "";
        const blockerText = unresolvedBlockerCount > 0 ? ` blockers:${unresolvedBlockerCount}` : "";
        const summary = `${task.id} [${task.status}] ${task.progress}% criteria:${criteria}${evidence}${blockerText} - ${task.title}`;
        if (!options.includeEvidence)
            return [summary];
        const blockerLines = task.blockers.map((blocker) => `  - blocker ${blocker.id} [${blocker.resolvedAt ? "resolved" : blocker.blockedBy}] ${compactDetail(blocker.reason)}; unblock: ${compactDetail(blocker.neededToUnblock)}`);
        const planSteps = (task.planSteps ?? []).map((step) => `  - ${step.id} step [${step.status}/${step.decompositionStatus}] ${compactDetail(step.text)}; output: ${compactDetail(step.expectedOutput)}${step.parentStepId ? `; parent:${step.parentStepId}` : ""}; atomic:${step.granularityCheck.isAtomic}; planQuality:${step.planQuality.score}${step.planQuality.issues.length ? ` (${compactDetail(step.planQuality.issues.join("; "))})` : ""}${step.evidenceRequired ? "; evidence required" : ""}${step.criterionIds.length ? `; criteria:${step.criterionIds.join(",")}` : ""}${step.evidenceIds.length ? `; evidence:${step.evidenceIds.join(",")}` : ""}`);
        const decisions = task.decisions.map((decision) => `  - ${decision.id} decision [${decision.decidedBy}] ${compactDetail(decision.question)}: ${compactDetail(decision.decision)}${decision.rationale ? `; rationale: ${compactDetail(decision.rationale)}` : ""}`);
        return [
            summary,
            ...task.warnings.map((warning) => `  - warning ${warning}`),
            ...blockerLines,
            ...decisions,
            ...planSteps,
            ...task.acceptanceCriteria.map((criterion) => `  - ${criterion.id} [${criterion.status}] ${compactDetail(criterion.text)}${criterion.evidenceIds.length ? ` evidence:${criterion.evidenceIds.join(",")}` : ""}`),
            ...task.evidence.map((item) => `  - ${item.id} evidence ${item.level} ${item.passed}: ${compactDetail(item.summary)}; source:${compactRef(item.quality.source)}; reproducible:${item.quality.reproducible}${item.references.length ? ` (${item.references.map(compactRef).join(", ")})` : ""}`),
        ];
    });
    const warnings = state.warnings.length > 0
        ? ["", "Warnings:", ...state.warnings.map((warning) => `- ${warning}`)]
        : [];
    return [...lines, ...warnings].join("\n");
}
function compactDetail(text) {
    return truncateText(text.replace(/\s+/g, " ").trim(), DETAIL_TEXT_MAX);
}
function compactRef(text) {
    return truncateText(text.replace(/\s+/g, " ").trim(), DETAIL_REF_MAX);
}
export function formatTaskFocus(state) {
    const task = state.activeTaskId ? state.tasks[state.activeTaskId] : undefined;
    if (!task)
        return "No active pi-tasks task. Create one with task_plan.";
    const step = (task.planSteps ?? []).find((item) => item.status !== "done" && item.status !== "skipped");
    const lines = [
        `Active task: ${task.id} ${compactDetail(task.title)}`,
        `Status: ${task.status} ${task.progress}%`,
    ];
    if (!step) {
        lines.push("Current step: none open");
    }
    else {
        lines.push(`Current step: ${step.id} [${step.status}] ${compactDetail(step.text)}`);
        lines.push(`Granularity: ${step.decompositionStatus}`);
        lines.push(`Atomicity reason: ${compactDetail(step.granularityCheck.reason)}`);
        lines.push(`Plan quality: ${step.planQuality.score}${step.planQuality.issues.length ? ` (${compactDetail(step.planQuality.issues.join("; "))})` : ""}`);
        if (step.parentStepId)
            lines.push(`Parent step: ${step.parentStepId}`);
        lines.push(`Expected output: ${compactDetail(step.expectedOutput)}`);
        lines.push(`Evidence: ${step.evidenceIds.length ? step.evidenceIds.join(",") : "none"}${step.evidenceRequired ? " (required)" : ""}`);
        if (step.criterionIds.length > 0) {
            lines.push(`Linked criteria: ${step.criterionIds.join(",")}`);
        }
        if (step.allowedActions.length > 0) {
            lines.push(`Allowed actions: ${step.allowedActions.map(compactRef).join(", ")}`);
        }
        if (step.decompositionStatus !== "atomic") {
            lines.push(`Next allowed action: task_decompose ${step.id}`);
        }
    }
    const gaps = getVerificationGaps(task);
    if (gaps.length > 0)
        lines.push(`Gaps: ${gaps.join("; ")}`);
    if (task.warnings.length > 0) {
        lines.push("Warnings:");
        lines.push(...task.warnings.map((warning) => `- ${compactDetail(warning)}`));
    }
    return lines.join("\n");
}
export function buildTaskResume(state) {
    const task = state.activeTaskId ? state.tasks[state.activeTaskId] : undefined;
    if (!task) {
        return {
            mode: "planning",
            recommendedTool: "task_plan",
            blockedTools: ["task_update", "task_evidence", "task_complete"],
            minimumParams: {
                title: "<short task title>",
                objective: "<bounded objective>",
                acceptance_criteria: ["<verifiable criterion>"],
                plan_steps: ["<atomic step contract>"],
            },
            currentStepLineage: [],
            evidenceIds: [],
            criterionIds: [],
            allowedActions: [],
            nextAllowedActions: ["task_plan"],
            verificationGaps: [],
            blockers: [],
            decisions: [],
            warnings: [...state.warnings],
            resumeInstruction: "No active pi-tasks task. Create one with task_plan before implementation work.",
        };
    }
    const step = getCurrentOpenStep(task);
    const gaps = getVerificationGaps(task);
    const blockers = task.blockers
        .filter((blocker) => !blocker.resolvedAt)
        .map((blocker) => `${blocker.id}: ${compactDetail(blocker.reason)}`);
    const decisions = task.decisions
        .slice(-3)
        .map((decision) => `${decision.id}: ${compactDetail(decision.question)} -> ${compactDetail(decision.decision)}`);
    const nextAllowedActions = step
        ? getNextAllowedActions(step, blockers.length > 0)
        : ["task_complete"];
    const mode = getExecutionMode(task, step, blockers.length > 0, gaps);
    const recommendedTool = getRecommendedTool(mode, step);
    return {
        ...(state.activeTaskId ? { activeTaskId: state.activeTaskId } : {}),
        taskId: task.id,
        title: compactDetail(task.title),
        status: task.status,
        progress: task.progress,
        mode,
        recommendedTool,
        blockedTools: getBlockedTools(mode),
        minimumParams: getMinimumParams(task, step, recommendedTool),
        ...(step
            ? {
                currentStepId: step.id,
                currentStepText: compactDetail(step.text),
                currentStepLineage: getStepLineage(task, step),
                expectedOutput: compactDetail(step.expectedOutput),
                evidenceRequired: step.evidenceRequired,
                evidenceIds: [...step.evidenceIds],
                criterionIds: [...step.criterionIds],
                allowedActions: step.allowedActions.map(compactRef),
            }
            : {
                currentStepLineage: [],
                evidenceIds: [],
                criterionIds: [],
                allowedActions: [],
            }),
        nextAllowedActions,
        verificationGaps: gaps,
        blockers,
        decisions,
        warnings: [...state.warnings, ...task.warnings].map(compactDetail),
        resumeInstruction: buildResumeInstruction(task, step, gaps, nextAllowedActions),
    };
}
export function formatTaskResume(state) {
    const resume = buildTaskResume(state);
    const lines = ["pi-tasks resume"];
    if (!resume.taskId) {
        lines.push(`Instruction: ${resume.resumeInstruction}`);
        return lines.join("\n");
    }
    lines.push(`Task: ${resume.taskId} [${resume.status}] ${resume.progress}% - ${resume.title}`);
    if (resume.mode)
        lines.push(`Mode: ${resume.mode}`);
    if (resume.recommendedTool) {
        lines.push(`Do now: ${resume.recommendedTool}`);
    }
    if (resume.blockedTools && resume.blockedTools.length > 0) {
        lines.push(`Do not call: ${resume.blockedTools.join(", ")}`);
    }
    if (resume.currentStepId) {
        lines.push(`Current step: ${resume.currentStepId} ${resume.currentStepText ?? ""}`);
        if (resume.currentStepLineage.length > 0) {
            lines.push(`Lineage: ${resume.currentStepLineage.map((step) => `${step.id}:${step.decompositionStatus}`).join(" > ")}`);
        }
        if (resume.expectedOutput) {
            lines.push(`Expected output: ${resume.expectedOutput}`);
        }
        lines.push(`Evidence: ${resume.evidenceIds.length ? resume.evidenceIds.join(",") : "none"}${resume.evidenceRequired ? " (required)" : ""}`);
        if (resume.criterionIds.length > 0) {
            lines.push(`Linked criteria: ${resume.criterionIds.join(",")}`);
        }
        if (resume.allowedActions.length > 0) {
            lines.push(`Allowed actions: ${resume.allowedActions.join(", ")}`);
        }
    }
    else {
        lines.push("Current step: none open");
    }
    if (resume.minimumParams) {
        lines.push(`Minimum params: ${formatMinimumParams(resume.minimumParams)}`);
    }
    lines.push(`Next allowed actions: ${resume.nextAllowedActions.join(", ")}`);
    if (resume.verificationGaps.length > 0) {
        lines.push(`Cannot complete yet: ${resume.verificationGaps.join("; ")}`);
    }
    if (resume.blockers.length > 0) {
        lines.push(`Blockers: ${resume.blockers.join("; ")}`);
    }
    if (resume.decisions.length > 0) {
        lines.push(`Recent decisions: ${resume.decisions.join("; ")}`);
    }
    if (resume.warnings.length > 0) {
        lines.push(`Warnings: ${resume.warnings.join("; ")}`);
    }
    lines.push(`Instruction: ${resume.resumeInstruction}`);
    return lines.join("\n");
}
export function formatTaskNext(state) {
    const resume = buildTaskResume(state);
    const lines = ["pi-tasks next"];
    if (!resume.taskId) {
        lines.push("Mode: planning");
        lines.push("Do now: task_plan");
        lines.push("Do not call: task_update, task_evidence, task_complete");
        lines.push(`Minimum params: ${formatMinimumParams(resume.minimumParams ?? {})}`);
        lines.push(`Stop condition: ${resume.resumeInstruction}`);
        return lines.join("\n");
    }
    lines.push(`Task: ${resume.taskId} - ${resume.title}`);
    lines.push(`Mode: ${resume.mode ?? "executing"}`);
    lines.push(`Only next tool: ${resume.recommendedTool ?? resume.nextAllowedActions[0] ?? "task_resume"}`);
    if (resume.currentStepId) {
        lines.push(`Current step lock: ${resume.currentStepId}`);
    }
    if (resume.minimumParams) {
        lines.push(`Minimum params: ${formatMinimumParams(resume.minimumParams)}`);
    }
    if (resume.blockedTools && resume.blockedTools.length > 0) {
        lines.push(`Do not call: ${resume.blockedTools.join(", ")}`);
    }
    lines.push(`Stop condition: ${resume.resumeInstruction}`);
    if (resume.verificationGaps.length > 0) {
        lines.push(`Gaps: ${resume.verificationGaps.join("; ")}`);
    }
    return lines.join("\n");
}
export function getVerificationGaps(task) {
    const gaps = [];
    const incompleteStep = (task.planSteps ?? []).find((step) => step.status !== "done" && step.status !== "skipped");
    if (incompleteStep)
        gaps.push(`${incompleteStep.id} step pending`);
    for (const step of task.planSteps ?? []) {
        if (step.status !== "done" &&
            step.status !== "skipped" &&
            step.decompositionStatus !== "atomic") {
            gaps.push(`${step.id} needs breakdown`);
        }
    }
    for (const step of task.planSteps ?? []) {
        if (step.evidenceRequired &&
            (step.status === "done" || step.status === "skipped") &&
            step.evidenceIds.length === 0) {
            gaps.push(`${step.id} lacks evidence`);
        }
    }
    for (const criterion of task.acceptanceCriteria) {
        if (criterion.status !== "satisfied" && criterion.status !== "skipped")
            gaps.push(`${criterion.id} pending`);
        if (criterion.status === "satisfied" && criterion.evidenceIds.length === 0)
            gaps.push(`${criterion.id} lacks evidence`);
    }
    if (task.evidence.length === 0)
        gaps.push("no evidence");
    if (task.evidence.length > 0 &&
        task.evidence.every((evidence) => evidence.level === "not_verified")) {
        gaps.push("only not_verified evidence");
    }
    return gaps;
}
function getCurrentOpenStep(task) {
    return task.planSteps.find((step) => step.status !== "done" && step.status !== "skipped");
}
function getNextAllowedActions(step, hasBlockers) {
    if (hasBlockers)
        return ["task_update"];
    if (step.decompositionStatus !== "atomic") {
        return ["task_decompose", "task_decision", "task_update"];
    }
    if (step.evidenceRequired && step.evidenceIds.length === 0) {
        return [...step.allowedActions, "task_evidence"].filter(Boolean);
    }
    return ["task_update", "task_evidence", ...step.allowedActions].filter(Boolean);
}
function getExecutionMode(task, step, hasBlockers, gaps) {
    if (hasBlockers || task.status === "blocked")
        return "blocked";
    if (!step)
        return gaps.length > 0 ? "verifying" : "completing";
    if (step.decompositionStatus !== "atomic")
        return "decomposing";
    if (step.evidenceRequired && step.evidenceIds.length === 0)
        return "verifying";
    return "executing";
}
function getRecommendedTool(mode, step) {
    if (mode === "planning")
        return "task_plan";
    if (mode === "blocked")
        return "task_update";
    if (mode === "decomposing")
        return "task_decompose";
    if (mode === "verifying")
        return "task_evidence";
    if (mode === "completing")
        return "task_complete";
    return step?.allowedActions[0] ?? "task_update";
}
function getBlockedTools(mode) {
    if (mode === "planning")
        return ["task_update", "task_evidence", "task_complete"];
    if (mode === "blocked")
        return ["task_complete", "task_decompose"];
    if (mode === "decomposing")
        return ["task_update done", "task_complete"];
    if (mode === "verifying")
        return ["task_update done", "task_complete"];
    if (mode === "completing")
        return ["task_plan", "task_decompose"];
    return ["task_complete"];
}
function getMinimumParams(task, step, recommendedTool) {
    if (recommendedTool === "task_decompose" && step) {
        return {
            task_id: task.id,
            step_id: step.id,
            child_steps: ["<2+ atomic child steps>"],
        };
    }
    if (recommendedTool === "task_evidence") {
        return {
            task_id: task.id,
            step_ids: step ? [step.id] : ["<current step id>"],
            criterion_ids: step?.criterionIds ?? [],
            references: ["<artifact path or command>"],
        };
    }
    if (recommendedTool === "task_update" && step) {
        return {
            task_id: task.id,
            step_id: step.id,
            step_status: "done",
            step_evidence_ids: ["<evidence id>"],
        };
    }
    if (recommendedTool === "task_complete") {
        return {
            task_id: task.id,
            evidence_ids: task.evidence.map((evidence) => evidence.id),
        };
    }
    return { task_id: task.id };
}
function formatMinimumParams(params) {
    return JSON.stringify(params);
}
function getStepLineage(task, step) {
    const lineage = [];
    let current = step;
    while (current) {
        lineage.unshift({
            id: current.id,
            text: compactDetail(current.text),
            status: current.status,
            decompositionStatus: current.decompositionStatus,
        });
        if (!current.parentStepId)
            break;
        const parent = task.planSteps.find((candidate) => candidate.id === current?.parentStepId);
        if (!parent) {
            lineage.unshift({
                id: current.parentStepId,
                text: "decomposed parent step",
                status: "done",
                decompositionStatus: "breaking_down",
            });
            break;
        }
        current = parent;
    }
    return lineage;
}
function buildResumeInstruction(task, step, gaps, nextAllowedActions) {
    if (task.status === "blocked") {
        return "Resolve the blocker with task_update before continuing execution.";
    }
    if (!step) {
        return gaps.length > 0
            ? "No open step remains, but verification gaps remain. Resolve gaps before task_complete."
            : "No open step remains. Use task_complete with supporting evidence.";
    }
    if (step.decompositionStatus !== "atomic") {
        return `Resume by decomposing ${step.id}; do not execute or mark it done until it is atomic.`;
    }
    if (step.evidenceRequired && step.evidenceIds.length === 0) {
        return `Resume ${step.id} by performing one allowed action, then record step-scoped evidence with task_evidence.step_ids before task_update done.`;
    }
    return `Resume ${step.id} with ${nextAllowedActions.join(" or ")}; keep ordered step progression.`;
}
function countCriteria(task, status) {
    return task.acceptanceCriteria.filter((criterion) => criterion.status === status).length;
}
function sortTasks(tasks, activeTaskId) {
    return [...tasks].sort((a, b) => {
        if (a.id === activeTaskId)
            return -1;
        if (b.id === activeTaskId)
            return 1;
        const statusDelta = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        if (statusDelta !== 0)
            return statusDelta;
        return a.createdAt.localeCompare(b.createdAt);
    });
}
