export const DEFAULT_COMPLETION_RECOVERY_LIMIT = 2;

export interface ToolFailureSummary {
	toolName: string;
	toolCallId?: string;
	exitCode?: number | null;
	reason: string;
}

export interface CompletionAssessmentInput {
	role?: string;
	stopReason?: string;
	text?: string;
	toolCallCount?: number;
	hasUnresolvedToolFailure?: boolean;
	hasSuccessfulToolAfterFailure?: boolean;
}

export interface CompletionAssessment {
	shouldRecover: boolean;
	reason:
		| "non-terminal-turn"
		| "explicit-blocker"
		| "promise-only-stop"
		| "unresolved-tool-failure"
		| "completion-marker"
		| "accepted-stop";
}

const PROMISE_PHRASES = [
	/^(?:抱歉[，,\s]*)?(?:我)?(?:现在|马上|接下来|随后)(?:会|将|继续|开始|先|去|改用|换一种)/u,
	/(?:我现在|我接下来|下面我会|让我)(?:继续|开始|先|去|重新|改用|换一种)/u,
	/^(?:(?:抱歉|好的|好|可以|明白|收到|没问题)[，,。.!！\s]*)*我(?:会|将|准备)(?:先|立即|马上)?(?:读取|检查|分析|提取|创建|生成|处理|执行|调用|打开|查找|评估|整理|修改|写入|测试|验证|继续|开始)/u,
	/(?:I(?:'ll| will)|let me|next[, ]+I(?:'ll| will))\s+(?:continue|start|first|retry|read|check|use|try)/iu,
];

const BLOCKER_MARKERS = [
	/(?:无法继续|不能继续|需要你|请提供|请上传|请确认|请允许|被阻塞|权限不足)/u,
	/(?:cannot continue|unable to continue|blocked|need you to|please provide|please upload|permission denied)/iu,
];

const COMPLETION_MARKERS = [
	/(?:已完成|完成了|处理完成|创建成功|修复完成|结果如下|结论是)/u,
	/(?:completed|finished|done|final result|results? (?:are|follow))/iu,
];

export function assessCompletion(
	input: CompletionAssessmentInput,
): CompletionAssessment {
	if (
		input.role !== "assistant" ||
		input.stopReason !== "stop" ||
		(input.toolCallCount ?? 0) > 0
	) {
		return { shouldRecover: false, reason: "non-terminal-turn" };
	}

	const text = (input.text ?? "").trim();
	if (BLOCKER_MARKERS.some((pattern) => pattern.test(text))) {
		return { shouldRecover: false, reason: "explicit-blocker" };
	}

	const sentenceCount = text.split(/[。！？.!?]+/u).filter(Boolean).length;
	const promiseOnly =
		text.length <= 160 &&
		sentenceCount <= 2 &&
		!text.includes("```") &&
		!/\n\s*(?:[-*]|\d+[.)])\s/u.test(text) &&
		PROMISE_PHRASES.some((pattern) => pattern.test(text));
	if (promiseOnly) {
		return { shouldRecover: true, reason: "promise-only-stop" };
	}
	if (COMPLETION_MARKERS.some((pattern) => pattern.test(text))) {
		return { shouldRecover: false, reason: "completion-marker" };
	}
	if (
		input.hasUnresolvedToolFailure &&
		!input.hasSuccessfulToolAfterFailure
	) {
		return { shouldRecover: true, reason: "unresolved-tool-failure" };
	}

	return { shouldRecover: false, reason: "accepted-stop" };
}

export function buildCompletionRecoveryMessage(
	environmentPrompt: string,
	failure: ToolFailureSummary | null,
	attempt: number,
	limit: number = DEFAULT_COMPLETION_RECOVERY_LIMIT,
): string {
	const failureContext = failure
		? [
				`Last failed tool: ${failure.toolName}`,
				...(failure.exitCode === undefined
					? []
					: [`Exit code: ${failure.exitCode}`]),
				`Failure reason: ${failure.reason}`,
			].join("\n")
		: "No failed tool was recorded. Semantic review found that the previous response did not complete the user's request.";

	return [
		"[Internal Completion Recovery]",
		`Recovery attempt ${attempt} of ${limit}.`,
		"The previous assistant response ended before the user's task was completed.",
		"Continue the task now. Perform the next concrete tool call or provide a specific blocking report.",
		"Do not repeat a progress promise and do not claim that you will act later.",
		"If a tool failed, use a different method compatible with the runtime environment. Do not repeat the same incompatible command.",
		"",
		failureContext,
		"",
		environmentPrompt,
	].join("\n");
}

function requiredActionFor(
	failure: ToolFailureSummary | null,
): string {
	if (!failure) {
		return "请重试该任务；如果仍然中断，请提供本轮完整日志以定位模型或服务端提前停止的原因。";
	}

	const reason = failure.reason.toLowerCase();
	if (
		failure.toolName === "execute_command" &&
		(reason.includes("parsererror") ||
			reason.includes("redirection operator") ||
			reason.includes("heredoc"))
	) {
		return "需要改用与当前默认 Shell 兼容的命令；Windows 下应使用 PowerShell here-string 或 PowerShell 原生命令，不能使用 Bash heredoc。";
	}
	if (reason.includes("access denied") || reason.includes("permission")) {
		return "请确认目标文件或目录的访问权限，并关闭可能占用该文件的程序后重试。";
	}
	if (reason.includes("not found") || reason.includes("cannot find")) {
		return "请确认所需文件、命令或依赖已存在，并提供正确路径后重试。";
	}
	return "请根据上述错误修正输入、运行环境或权限后重试。";
}

export function buildCompletionFailureReport(
	failure: ToolFailureSummary | null,
): string {
	const lines = [
		"任务未能自动完成，自动恢复次数已耗尽。",
		"",
		`最后失败工具：${failure?.toolName ?? "未记录"}`,
		`退出码：${failure?.exitCode ?? "未提供"}`,
		`失败原因：${failure?.reason ?? "语义完成度检查连续判定任务尚未完成。"}`,
		`所需操作：${requiredActionFor(failure)}`,
	];
	return lines.join("\n");
}
