import { describe, expect, it } from "vitest";
import {
	assessCompletion,
	buildCompletionFailureReport,
	buildCompletionRecoveryMessage,
} from "../completion-guard";
import {
	buildEmptyStopRecoveryMessage,
	resolveEmptyStopRecoveryEnabled,
} from "../skill-empty-stop-recovery";

describe("completion guard", () => {
	it("enables empty-stop recovery only for skills by default", () => {
		expect(resolveEmptyStopRecoveryEnabled("skill")).toBe(true);
		expect(resolveEmptyStopRecoveryEnabled("role-agent")).toBe(false);
		expect(resolveEmptyStopRecoveryEnabled("assistant")).toBe(false);
		expect(resolveEmptyStopRecoveryEnabled()).toBe(false);
		expect(buildEmptyStopRecoveryMessage(1)).toContain("empty response");
	});

	it("honors explicit empty-stop recovery settings", () => {
		expect(resolveEmptyStopRecoveryEnabled("role-agent", true)).toBe(true);
		expect(resolveEmptyStopRecoveryEnabled("skill", false)).toBe(false);
	});

	it("detects a promise-only stop", () => {
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "我现在继续处理：先把上传的文件读出来，然后沉淀成技能。",
			toolCallCount: 0,
		})).toEqual({
			shouldRecover: true,
			reason: "promise-only-stop",
		});
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "我会先读取岗位模型与候选人简历，提取评估标准和候选人经历，然后按 JD/Job Model 的维度生成结构化评估结论、面试建议和笔试建议。",
			toolCallCount: 0,
		})).toEqual({
			shouldRecover: true,
			reason: "promise-only-stop",
		});
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "好的，我会先读取岗位模型和候选人简历，提取关键信息，然后按 Job Model 评分标准生成完整评估报告。",
			toolCallCount: 0,
		})).toEqual({
			shouldRecover: true,
			reason: "promise-only-stop",
		});
	});

	it("does not recover a completed answer, tool turn, or explicit block", () => {
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "处理完成，结果如下。",
		})).toEqual({
			shouldRecover: false,
			reason: "completion-marker",
		});
		expect(assessCompletion({
			role: "assistant",
			stopReason: "toolUse",
			text: "",
			toolCallCount: 1,
		})).toEqual({
			shouldRecover: false,
			reason: "non-terminal-turn",
		});
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "无法继续，需要你提供文件路径。",
		})).toEqual({
			shouldRecover: false,
			reason: "explicit-blocker",
		});
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "接下来说明完整方案。\n1. 读取文件\n2. 生成技能\n3. 验证输出",
		})).toEqual({
			shouldRecover: false,
			reason: "accepted-stop",
		});
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "我会建议你优先核对岗位硬性要求，再结合面试表现做最终判断。",
		})).toEqual({
			shouldRecover: false,
			reason: "accepted-stop",
		});
	});

	it("recovers a stop while a tool failure remains unresolved", () => {
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "命令执行失败了。",
			hasUnresolvedToolFailure: true,
		})).toEqual({
			shouldRecover: true,
			reason: "unresolved-tool-failure",
		});
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "无法继续，需要你提供正确的文件路径。",
			hasUnresolvedToolFailure: true,
		})).toEqual({
			shouldRecover: false,
			reason: "explicit-blocker",
		});
		expect(assessCompletion({
			role: "assistant",
			stopReason: "stop",
			text: "处理完成。",
			hasUnresolvedToolFailure: true,
		})).toEqual({
			shouldRecover: false,
			reason: "completion-marker",
		});
	});

	it("builds a recovery instruction with failure and runtime context", () => {
		const message = buildCompletionRecoveryMessage(
			"Windows / PowerShell / no Bash heredoc",
			{
				toolName: "execute_command",
				exitCode: 1,
				reason: "ParserError: Missing file specification after redirection operator.",
			},
			1,
		);

		expect(message).toContain("Recovery attempt 1 of 2");
		expect(message).toContain("execute_command");
		expect(message).toContain("Exit code: 1");
		expect(message).toContain("PowerShell");
		expect(message).toContain("Do not repeat");
	});

	it("builds a deterministic user-visible report after exhaustion", () => {
		const report = buildCompletionFailureReport({
			toolName: "execute_command",
			exitCode: 1,
			reason: "ParserError: Missing file specification after redirection operator.",
		});

		expect(report).toContain("自动恢复次数已耗尽");
		expect(report).toContain("最后失败工具：execute_command");
		expect(report).toContain("退出码：1");
		expect(report).toContain("PowerShell");
		expect(report).toContain("所需操作：");
	});
});
