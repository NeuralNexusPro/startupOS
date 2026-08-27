/**
 * Unit tests for OriginOSAgent
 *
 * Tests cover:
 * - OriginOSAgent creation and initialization
 * - Agent session lifecycle (create, start, stop, destroy)
 * - Event subscription mechanism (on, off, emit)
 * - Message sending and receiving
 * - Tool registration and invocation
 * - Configuration management
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as piAi from "@originos/pi-agent-adapter/ai";

// Import after mocking - the OriginOS adapter is aliased in vitest.config.ts.
import { OriginOSAgent, createOriginOSAgent } from "../agent";
import type { OriginOSAgentConfig, OriginOSAgentState } from "../../types";
import type { ProjectContext } from "../../system/config";
import { removeLoopDetector } from "../../tools/loop-detector";
import { createWorkingSummaryMessage } from "../../runtime-working-summary";

// ============================================================================
// Test Data
// ============================================================================

const mockSessionId = "test-session-123";
const mockProjectContext: ProjectContext = {
	projectId: "project-001",
	ontologyId: "ontology-001",
	projectName: "Test Project",
	currentPath: "/data/projects/test",
	userId: "user-001",
};

const basicConfig: OriginOSAgentConfig = {
	sessionId: mockSessionId,
	systemPrompt: "You are a helpful assistant",
	model: { provider: "anthropic" as const, id: "test-model" },
	projectContext: mockProjectContext,
	thinkingLevel: "low",
};

function emitAssistantStop(
	internalAgent: any,
	text: string,
): void {
	const message = {
		role: "assistant",
		content: [{ type: "text", text }],
		stopReason: "stop",
	};
	internalAgent.emit({ type: "message_start", message });
	internalAgent.emit({ type: "message_end", message });
	internalAgent.emit({ type: "turn_end", message, toolResults: [] });
	internalAgent.emit({ type: "agent_end", messages: [message] });
}

// ============================================================================
// Test Suite
// ============================================================================

describe("OriginOSAgent", () => {
	let agent: OriginOSAgent;

	beforeEach(() => {
		vi.clearAllMocks();
		piAi.__streamCalls.length = 0;
		removeLoopDetector(mockSessionId);
	});

	describe("Agent Creation and Initialization", () => {
		it("should create an agent instance with valid config", () => {
			agent = new OriginOSAgent(basicConfig);

			expect(agent).toBeDefined();
			expect(agent).toBeInstanceOf(OriginOSAgent);
		});

		it("should initialize agent state correctly", () => {
			agent = new OriginOSAgent(basicConfig);

			const state = agent.state as OriginOSAgentState;

			expect(state.isInitialized).toBe(true);
			expect(state.sessionId).toBe(mockSessionId);
			expect(state.projectContext).toEqual(mockProjectContext);
			expect(state.uiState.isThinking).toBe(false);
			expect(state.uiState.activeTools).toEqual([]);
		});

		it("should store sessionId in state", () => {
			agent = new OriginOSAgent({
				...basicConfig,
				sessionId: "custom-session-456",
			});

			expect(agent.state.sessionId).toBe("custom-session-456");
		});

		it("should store project context in state", () => {
			agent = new OriginOSAgent(basicConfig);

			expect(agent.state.projectContext).toEqual(mockProjectContext);
		});

		it("should set initial thinking state to false", () => {
			agent = new OriginOSAgent(basicConfig);

			expect(agent.state.uiState.isThinking).toBe(false);
		});

		it("should initialize with empty active tools list", () => {
			agent = new OriginOSAgent(basicConfig);

			expect(agent.state.uiState.activeTools).toEqual([]);
		});
	});

	describe("Agent Session Lifecycle", () => {
		beforeEach(() => {
			agent = new OriginOSAgent(basicConfig);
		});

		it("should be able to send messages (start a session)", async () => {
			await expect(
				agent.prompt("Hello, world!")
			).resolves.not.toThrow();
		});

		it("should accept string messages", async () => {
			await agent.prompt("Test message");

			expect(true).toBe(true); // If we get here, no error was thrown
		});

		it("should continue a previous session", async () => {
			await expect(
				agent.continue()
			).resolves.not.toThrow();
		});

		it("should handle abort operation", () => {
			expect(() => {
				agent.abort();
			}).not.toThrow();
		});

		it("should wait for idle state", async () => {
			await expect(
				agent.waitForIdle()
			).resolves.not.toThrow();
		});
	});

	describe("Runtime environment and completion guard", () => {
		it("does not run completion judging or recovery when the guard is disabled", async () => {
			agent = new OriginOSAgent({
				...basicConfig,
				completionGuardEnabled: false,
			});
			const internalAgent = (agent as any).agent;
			const judgeSpy = vi.spyOn(agent as any, "judgePendingCompletion");
			const receivedEvents: any[] = [];
			agent.subscribe((event) => receivedEvents.push(event));
			vi.spyOn(internalAgent, "prompt").mockImplementationOnce(async () => {
				emitAssistantStop(internalAgent, "你能描述一下日常工作流程吗？");
			});

			await agent.prompt("开始项目访谈");

			expect(judgeSpy).not.toHaveBeenCalled();
			expect(receivedEvents.some((event) =>
				event.type === "message_end" &&
				JSON.stringify(event.message?.content).includes("日常工作流程")
			)).toBe(true);
			expect(receivedEvents.some((event) => event.message?.completionFailure)).toBe(false);
		});

		it("injects OS, architecture, shell, path, and syntax constraints", () => {
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			const prompt = internalAgent.state.systemPrompt;

			expect(prompt).toContain("You are a helpful assistant");
			expect(prompt).toContain("## Runtime Environment");
			expect(prompt).toContain(`Architecture: ${process.arch}`);
			expect(prompt).toContain("Default command shell:");
			expect(prompt).toContain("Native path separator:");
		});

		it("automatically continues an incomplete stop without hiding assistant text", async () => {
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			const receivedEvents: any[] = [];
			agent.subscribe((event) => receivedEvents.push(event));
			const promptSpy = vi.spyOn(internalAgent, "prompt");
			const continueSpy = vi.spyOn(internalAgent, "continue");

			promptSpy.mockImplementationOnce(async () => {
				internalAgent.emit({
					type: "tool_execution_end",
					toolName: "execute_command",
					toolCallId: "call-pwsh",
					isError: false,
					result: {
						content: [{
							type: "text",
							text: JSON.stringify({
								success: false,
								exitCode: 1,
								stderr: "ParserError: Missing file specification after redirection operator.",
							}),
						}],
						details: {
							success: false,
							exitCode: 1,
							stderr: "ParserError: Missing file specification after redirection operator.",
						},
					},
				});
				emitAssistantStop(
					internalAgent,
					"好的，我会先读取岗位模型和候选人简历，提取关键信息，然后按 Job Model 评分标准生成完整评估报告。",
				);
			});
				promptSpy.mockImplementationOnce(async (message: any) => {
					internalAgent.emit({ type: "message_start", message });
					internalAgent.emit({ type: "message_end", message });
					internalAgent.emit({
						type: "tool_execution_end",
						toolName: "execute_command",
						toolCallId: "call-pwsh-retry",
						isError: false,
						result: {
							content: [{ type: "text", text: '{"success":true,"exitCode":0}' }],
							details: { success: true, exitCode: 0 },
						},
					});
					emitAssistantStop(internalAgent, "处理完成，已使用 PowerShell 命令读取文件。");
				});

			await agent.prompt("读取上传文件");

				expect(promptSpy).toHaveBeenCalledTimes(2);
				expect(continueSpy).not.toHaveBeenCalled();
				const visible = JSON.stringify(receivedEvents);
				expect(visible).toContain("好的，我会先读取");
				expect(visible).not.toContain("Internal Completion Recovery");
			expect(visible).toContain("处理完成");
			const accepted = receivedEvents.find((event) => event.type === "completion_accepted");
			expect(accepted?.content).toBe("处理完成，已使用 PowerShell 命令读取文件。");
			expect(receivedEvents.filter((event) => event.type === "agent_end")).toHaveLength(1);
			const recoveryMessage = promptSpy.mock.calls[1]?.[0];
			expect(recoveryMessage?.role).toBe("user");
			expect(recoveryMessage?.content?.[0]?.text).toContain("Runtime Environment");
			expect(recoveryMessage?.content?.[0]?.text).toContain("execute_command");
		});

		it("uses only Task Runtime policy for task turns", async () => {
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			const receivedEvents: any[] = [];
			agent.subscribe((event) => receivedEvents.push(event));
			const promptSpy = vi.spyOn(internalAgent, "prompt").mockImplementationOnce(async () => {
				emitAssistantStop(internalAgent, "我会先制定计划，然后继续执行。");
			});
			const judgeSpy = vi.mocked(piAi.completeSimple);

			await agent.prompt(
				"创建正式任务",
				undefined,
				{ completionPolicy: "task_runtime" },
			);

			expect(promptSpy).toHaveBeenCalledTimes(1);
			expect(judgeSpy).not.toHaveBeenCalled();
			expect(receivedEvents.filter((event) => event.type === "agent_end")).toHaveLength(1);
			expect(JSON.stringify(receivedEvents)).toContain("我会先制定计划");
		});

		it("retries an aborted completion judge with a fresh timeout signal", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
			const completeSimpleMock = vi.mocked(piAi.completeSimple);
			completeSimpleMock
				.mockResolvedValueOnce({
					role: "assistant",
					content: [],
					stopReason: "aborted",
					errorMessage: "The operation timed out",
				} as any)
				.mockResolvedValueOnce({
					role: "assistant",
					content: [{
						type: "text",
						text: '{"status":"incomplete","reason":"work is only promised"}',
					}],
					stopReason: "stop",
				} as any);
			agent = new OriginOSAgent(basicConfig);
			const message = { role: "assistant" };
			(agent as any).activeUserRequest = "生成报告";
			(agent as any).pendingCompletionCandidate = {
				message,
				text: "我会开始生成报告。",
				stopReason: "stop",
				toolCallCount: 0,
				repeatedResponse: false,
			};

			await (agent as any).judgePendingCompletion();

			expect(completeSimpleMock).toHaveBeenCalledTimes(2);
			const firstSignal = completeSimpleMock.mock.calls[0]?.[2]?.signal;
			const secondSignal = completeSimpleMock.mock.calls[1]?.[2]?.signal;
			expect(firstSignal).toBeInstanceOf(AbortSignal);
			expect(secondSignal).toBeInstanceOf(AbortSignal);
			expect(secondSignal).not.toBe(firstSignal);
			expect((agent as any).pendingPromiseStop).toBe(true);
			const warning = warnSpy.mock.calls.flat().join("\n");
			expect(warning).toContain("category=aborted");
			expect(warning).toContain("retry=true");
			expect(warning).not.toContain("no JSON object");
		});

		it("uses an observable incomplete fallback after two aborted judge attempts", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
			const completeSimpleMock = vi.mocked(piAi.completeSimple);
			completeSimpleMock.mockResolvedValue({
				role: "assistant",
				content: [],
				stopReason: "aborted",
				errorMessage: "The operation timed out",
			} as any);
			agent = new OriginOSAgent(basicConfig);
			(agent as any).activeUserRequest = "生成报告";
			(agent as any).pendingCompletionCandidate = {
				message: { role: "assistant" },
				text: "我会先读取资料，然后生成报告。",
				stopReason: "stop",
				toolCallCount: 0,
				repeatedResponse: false,
			};

			await (agent as any).judgePendingCompletion();

			expect(completeSimpleMock).toHaveBeenCalledTimes(2);
			expect((agent as any).pendingPromiseStop).toBe(true);
			const warning = warnSpy.mock.calls.flat().join("\n");
			expect(warning).toContain("decision=incomplete");
			expect(warning).toContain("attempts=2");
			expect(warning).toContain("lastFailure=aborted");
		});

		it("classifies model errors and invalid JSON before a redacted complete fallback", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
			const completeSimpleMock = vi.mocked(piAi.completeSimple);
			completeSimpleMock
				.mockResolvedValueOnce({
					role: "assistant",
					content: [],
					stopReason: "error",
					errorMessage: "provider rejected sk-sensitive-value",
				} as any)
				.mockResolvedValueOnce({
					role: "assistant",
					content: [{ type: "text", text: "not json" }],
					stopReason: "stop",
				} as any);
			agent = new OriginOSAgent(basicConfig);
			(agent as any).activeUserRequest = "生成报告";
			(agent as any).pendingCompletionCandidate = {
				message: { role: "assistant" },
				text: "报告已生成并保存。",
				stopReason: "stop",
				toolCallCount: 0,
				repeatedResponse: false,
			};

			await (agent as any).judgePendingCompletion();

			expect(completeSimpleMock).toHaveBeenCalledTimes(2);
			expect((agent as any).pendingPromiseStop).toBe(false);
			const warning = warnSpy.mock.calls.flat().join("\n");
			expect(warning).toContain("category=error");
			expect(warning).toContain("category=invalid_response");
			expect(warning).toContain("decision=complete");
			expect(warning).toContain("lastFailure=invalid_response");
			expect(warning).toContain("[REDACTED]");
			expect(warning).not.toContain("sk-sensitive-value");
		});

		it("returns a deterministic failure report after recovery is exhausted", async () => {
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			const receivedEvents: any[] = [];
			agent.subscribe((event) => receivedEvents.push(event));
			const promiseText = "接下来我会换一种方法继续处理。";
			const promptSpy = vi.spyOn(internalAgent, "prompt");
			const continueSpy = vi.spyOn(internalAgent, "continue");

			promptSpy.mockImplementationOnce(async () => {
				internalAgent.emit({
					type: "tool_execution_end",
					toolName: "execute_command",
					toolCallId: "call-failed",
					isError: false,
					result: {
						content: [{
							type: "text",
							text: JSON.stringify({
								success: false,
								exitCode: 1,
								stderr: "ParserError: heredoc is not supported",
							}),
						}],
						details: {
							success: false,
							exitCode: 1,
							stderr: "ParserError: heredoc is not supported",
						},
					},
				});
				emitAssistantStop(internalAgent, promiseText);
			});
			promptSpy.mockImplementation(async (message: any) => {
				internalAgent.emit({ type: "message_start", message });
				internalAgent.emit({ type: "message_end", message });
				emitAssistantStop(internalAgent, promiseText);
			});

			await agent.prompt("完成任务");

			expect(promptSpy).toHaveBeenCalledTimes(3);
			expect(continueSpy).not.toHaveBeenCalled();
			const visible = JSON.stringify(receivedEvents);
			expect(visible).toContain(promiseText);
			expect(visible).toContain("自动恢复次数已耗尽");
			expect(visible).toContain("最后失败工具：execute_command");
			expect(visible).toContain("退出码：1");
			expect(visible).toContain("heredoc is not supported");
			expect(visible).toContain("所需操作：");
			expect(receivedEvents.filter((event) => event.type === "agent_end")).toHaveLength(1);
		});

		it("surfaces an assistant stream error instead of reporting prompt completion", async () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			const receivedEvents: any[] = [];
			agent.subscribe((event) => receivedEvents.push(event));
			vi.spyOn(internalAgent, "prompt").mockImplementationOnce(async () => {
				const message = {
					role: "assistant",
					content: [],
					stopReason: "error",
					errorMessage: "HTTP 401: invalid API key sk-sensitive-value",
				};
				internalAgent.emit({ type: "message_start", message });
				internalAgent.emit({ type: "message_end", message });
				internalAgent.emit({ type: "turn_end", message, toolResults: [] });
				internalAgent.emit({ type: "agent_end", messages: [message] });
			});

			await expect(agent.prompt("测试模型错误")).rejects.toThrow(
				"HTTP 401: invalid API key sk-sensitive-value",
			);

			expect(receivedEvents.some((event) =>
				event.type === "agent_error" &&
				event.error?.message === "HTTP 401: invalid API key sk-sensitive-value"
			)).toBe(true);
			expect(errorSpy.mock.calls.some((call) =>
				String(call[0]).includes("stopReason=error") &&
				String(call[0]).includes("[REDACTED]") &&
				!String(call[0]).includes("sk-sensitive-value")
			)).toBe(true);
		});

			it("preserves failure details while recording a later tool success", () => {
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;

			internalAgent.emit({
				type: "tool_execution_end",
				toolName: "execute_command",
				toolCallId: "call-failed",
				isError: false,
				result: {
					content: [{ type: "text", text: '{"success":false,"exitCode":1}' }],
					details: { success: false, exitCode: 1 },
				},
			});
			expect((agent as any).lastToolFailure?.toolName).toBe("execute_command");

			internalAgent.emit({
				type: "tool_execution_end",
				toolName: "list_files",
				toolCallId: "call-success",
				isError: false,
				result: {
					content: [{ type: "text", text: '{"success":true}' }],
					details: { success: true },
				},
			});

				expect((agent as any).lastToolFailure?.toolName).toBe("execute_command");
				expect((agent as any).successfulToolAfterFailure).toBe(true);
			});

			it("streams ordinary assistant updates without waiting for message_end", () => {
				agent = new OriginOSAgent(basicConfig);
				const internalAgent = (agent as any).agent;
				const receivedEvents: any[] = [];
				agent.subscribe((event) => receivedEvents.push(event));
				const message = {
					role: "assistant",
					content: [{ type: "text", text: "正在输出" }],
					stopReason: "stop",
				};

				internalAgent.emit({ type: "message_start", message });
				internalAgent.emit({
					type: "message_update",
					message,
					assistantMessageEvent: {
						type: "text_delta",
						delta: "正在",
					},
				});

				expect(receivedEvents.map((event) => event.type)).toEqual([
					"message_start",
					"message_update",
				]);
			});

			it("filters internal recovery messages from session state", async () => {
				agent = new OriginOSAgent(basicConfig);
				const internalAgent = (agent as any).agent;
				const hidden = {
					role: "user",
					content: [{ type: "text", text: "[Internal Completion Recovery]" }],
				};
				const visible = {
					role: "assistant",
					content: [{ type: "text", text: "处理完成" }],
				};
				internalAgent.state.messages = [hidden, visible];
				(agent as any).hiddenMessages.add(hidden);

				const state = await agent.getSessionState();

				expect(state.messages).toEqual([visible]);
			});
	});

	describe("Logging semantics", () => {
		it("does not run the assistant loop guard on text deltas", () => {
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			const receivedDeltas: string[] = [];
			agent.subscribe((event: any) => {
				if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
					receivedDeltas.push(event.assistantMessageEvent.delta);
				}
			});

			internalAgent.emit({
				type: "message_start",
				message: { role: "assistant" },
			});
			for (let index = 0; index < 5_000; index += 1) {
				internalAgent.emit({
					type: "message_update",
					assistantMessageEvent: {
						type: "text_delta",
						delta: `chunk-${index};`,
					},
				});
			}

			expect((agent as any).assistantLoopGuardTriggered).toBe(false);
			expect(receivedDeltas).toHaveLength(5_000);
			expect(receivedDeltas[4_999]).toBe("chunk-4999;");
		});

		it("detects repeated completed responses only within the same user task", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			const completedMessage = {
				role: "assistant",
				stopReason: "stop",
				content: [{ type: "text", text: "完整的最终响应" }],
			};

			(agent as any).resetCompletionGuard("执行任务");
			internalAgent.emit({ type: "message_start", message: { role: "assistant" } });
			internalAgent.emit({ type: "message_end", message: completedMessage });
			expect((agent as any).pendingCompletionCandidate.repeatedResponse).toBe(false);

			internalAgent.emit({ type: "message_start", message: { role: "assistant" } });
			internalAgent.emit({
				type: "message_end",
				message: {
					...completedMessage,
					content: [{ type: "text", text: "完整的最终响应" }],
				},
			});
			expect((agent as any).pendingCompletionCandidate.repeatedResponse).toBe(true);

			await (agent as any).judgePendingCompletion();
			expect((agent as any).pendingPromiseStop).toBe(true);
			expect(warnSpy.mock.calls.flat().join("\n")).toContain(
				"repeated completed assistant response",
			);

			(agent as any).resetCompletionGuard("新的用户任务");
			internalAgent.emit({ type: "message_start", message: { role: "assistant" } });
			internalAgent.emit({
				type: "message_end",
				message: {
					...completedMessage,
					content: [{ type: "text", text: "完整的最终响应" }],
				},
			});
			expect((agent as any).pendingCompletionCandidate.repeatedResponse).toBe(false);
		});

		it("aggregates tool call deltas instead of logging every chunk", () => {
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			infoSpy.mockClear();

			internalAgent.emit({
				type: "message_start",
				message: { role: "assistant" },
			});
			internalAgent.emit({
				type: "message_update",
				assistantMessageEvent: { type: "toolcall_start" },
			});
			for (let index = 0; index < 10_000; index += 1) {
				internalAgent.emit({
					type: "message_update",
					assistantMessageEvent: {
						type: "toolcall_delta",
						delta: "x",
					},
				});
			}
			internalAgent.emit({
				type: "message_update",
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: {
						name: "execute_command",
						id: "call-1",
						arguments: { command: "echo ok" },
					},
				},
			});

			const output = infoSpy.mock.calls.flat().join("\n");
			expect(infoSpy.mock.calls.length).toBeLessThan(10);
			expect(output).toContain("toolcall_start");
			expect(output).toContain("toolcall_end, deltas=10000, deltaChars=10000");
			expect(output).toContain("execute_command");
		});

		it("marks completion failure reports for transport layers", () => {
			agent = new OriginOSAgent(basicConfig);
			const receivedEvents: any[] = [];
			agent.subscribe((event) => receivedEvents.push(event));
			(agent as any).lastToolFailure = {
				toolName: "execute_command",
				exitCode: 1,
				reason: "command missing",
			};

			(agent as any).emitCompletionFailureReport();

			const messageEnd = receivedEvents.find((event) => event.type === "message_end");
			expect(messageEnd?.message?.completionFailure).toBe(true);
			expect(messageEnd?.message?.content?.[0]?.text).toContain("任务未能自动完成");
		});

		it("logs normal lifecycle events as info without error logs", () => {
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			errorSpy.mockClear();

			internalAgent.emit({ type: "agent_start" });
			internalAgent.emit({ type: "turn_start" });
			internalAgent.emit({
				type: "message_start",
				message: { role: "assistant" },
			});
			internalAgent.emit({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "done" }],
					stopReason: "stop",
				},
			});
			internalAgent.emit({
				type: "turn_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "done" }],
					stopReason: "stop",
				},
				toolResults: [],
			});
			internalAgent.emit({ type: "agent_end", messages: [] });

			expect(infoSpy).toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();
		});

		it("logs structured command failures as errors with tool name and exit code", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			errorSpy.mockClear();

			internalAgent.emit({
				type: "tool_execution_end",
				toolName: "execute_command",
				toolCallId: "call-1",
				isError: false,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({
							success: false,
							exitCode: 1,
							stderr: "PowerShell parser error",
						}),
					}],
					details: {
						success: false,
						exitCode: 1,
						stderr: "PowerShell parser error",
					},
				},
			});

			const output = errorSpy.mock.calls.flat().join(" ");
			expect(output).toContain("tool_end — execute_command (ERROR)");
			expect(output).toContain("callId=call-1");
			expect(output).toContain("exitCode=1");
			expect(output).toContain("PowerShell parser error");
		});

		it("logs large tool results as a bounded summary", () => {
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
			agent = new OriginOSAgent(basicConfig);
			const internalAgent = (agent as any).agent;
			infoSpy.mockClear();
			const stdout = `start-${"x".repeat(20_000)}-end`;

			internalAgent.emit({
				type: "tool_execution_end",
				toolName: "execute_command",
				toolCallId: "call-large",
				isError: false,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({
							success: true,
							exitCode: 0,
							stdout,
						}),
					}],
				},
			});

			const output = infoSpy.mock.calls.flat().join(" ");
			expect(output).toContain("tool_end — execute_command");
			expect(output).toContain("length=");
			expect(output).toContain("hash=");
			expect(output).toContain("truncated=true");
			expect(output.length).toBeLessThan(2_000);
			expect(output).not.toContain("-end");
		});

		it("does not log credential values or prefixes", async () => {
			const credential = "sk-sensitive-credential-value";
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
			agent = new OriginOSAgent({
				...basicConfig,
				model: {
					...basicConfig.model,
					apiKey: credential,
				} as any,
			});

			await agent.prompt("test");

			const output = JSON.stringify(infoSpy.mock.calls);
			expect(output).not.toContain(credential);
			expect(output).not.toContain(credential.slice(0, 10));
			expect(output).toContain("hasFinalCredential=true");
		});

		it("keeps worker stdout free of lifecycle and stream logs", () => {
			const previousWorkerMode = process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"];
			process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"] = "1";
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

			try {
				agent = new OriginOSAgent(basicConfig);
				const internalAgent = (agent as any).agent;
				internalAgent.emit({ type: "agent_start" });
				internalAgent.emit({
					type: "message_update",
					assistantMessageEvent: {
						type: "text_delta",
						delta: "stream content",
					},
				});

				expect(stdoutSpy).not.toHaveBeenCalled();
				expect(infoSpy).not.toHaveBeenCalled();
			} finally {
				if (previousWorkerMode === undefined) {
					delete process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"];
				} else {
					process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"] = previousWorkerMode;
				}
			}
		});
	});

	describe("Message Sending and Receiving", () => {
		beforeEach(() => {
			agent = new OriginOSAgent(basicConfig);
		});

		it("should send a simple string message", async () => {
			await expect(
				agent.prompt("Hello, Agent!")
			).resolves.not.toThrow();
		});

		it("should send multiple messages", async () => {
			const messages = [
				{
					role: "user",
					content: [{ type: "text", text: "First message" }],
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "Response" }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "Second message" }],
				},
			];

			await expect(
				agent.prompt(messages)
			).resolves.not.toThrow();
		});

		it("should compress long histories while preserving recent execution trace before prompt", async () => {
			const internalAgent = (agent as any).agent;
			const longHistory = Array.from({ length: 17 }, (_, index) => ({
				role: "user",
				content: [{ type: "text", text: `user-${index}` }],
			}));
			longHistory.push({
				role: "assistant",
				content: [{ type: "text", text: "plan-before-tool" }],
			});
			longHistory.push({
				role: "assistant",
				content: [{ type: "toolCall", id: "call-1", name: "read_file", arguments: { path: "Memory.md" } }],
			});
			longHistory.push({
				role: "toolResult",
				content: [{ type: "text", text: "Memory contents" }],
				toolName: "read_file",
				toolCallId: "call-1",
			});
			longHistory.push({
				role: "assistant",
				content: [{ type: "text", text: "tool failed, do not repeat" }],
			});
			internalAgent.state.messages = longHistory;

			await agent.prompt("continue");

			const compressedMessages = internalAgent.state.messages;
			expect(compressedMessages.length).toBeLessThan(longHistory.length);
			expect(compressedMessages.some((message: any) => JSON.stringify(message.content).includes("user-16"))).toBe(true);
			expect(compressedMessages.some((message: any) => JSON.stringify(message.content).includes("plan-before-tool"))).toBe(true);
			expect(compressedMessages.some((message: any) => JSON.stringify(message.content).includes("read_file"))).toBe(true);
			expect(compressedMessages.some((message: any) => JSON.stringify(message.content).includes("Memory contents"))).toBe(true);
			expect(compressedMessages.some((message: any) => JSON.stringify(message.content).includes("do not repeat"))).toBe(true);
			const workingSummary = compressedMessages.find((message: any) =>
				JSON.stringify(message.content).includes("[Working Summary]")
			);
			expect(workingSummary).toBeDefined();
			expect(workingSummary?.role).toBe("system");
		});
	});

	describe("Tool Registration and Invocation", () => {
		beforeEach(() => {
			agent = new OriginOSAgent(basicConfig);
		});

		it("should set tools", () => {
			const tools = [
				{
					name: "test-tool",
					description: "Test tool",
					parameters: {},
					execute: vi.fn(),
				},
			];

			expect(() => {
				agent.setTools(tools);
			}).not.toThrow();
		});

		it("should register a single tool", () => {
			const tool = {
				name: "single-tool",
				description: "Single test tool",
				parameters: {},
				execute: vi.fn(),
			};

			expect(() => {
				agent.registerTool(tool);
			}).not.toThrow();
		});

		it("should unregister a tool", () => {
			const tool = {
				name: "removable-tool",
				description: "Tool to remove",
				parameters: {},
				execute: vi.fn(),
			};

			agent.registerTool(tool);

			expect(() => {
				agent.unregisterTool("removable-tool");
			}).not.toThrow();
		});

		it("should inject a loop warning into message history after repeated identical tool calls", () => {
			const internalAgent = (agent as any).agent;
			expect(internalAgent).toBeDefined();
			internalAgent.state.messages = [
				{
					role: "user",
					content: [{ type: "text", text: "请继续读取报价文件" }],
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "最近失败原因：Memory.md 不存在，不要重复 read_file，改为请求用户补充路径" }],
				},
			];

			for (let i = 0; i < 8; i++) {
				internalAgent.emit({
					type: "tool_execution_start",
					toolName: "read_file",
					args: { path: "Memory.md" },
				});
			}

			expect(internalAgent.state.messages).toHaveLength(3);
			const appendedMessage = internalAgent.state.messages[2];
			expect(appendedMessage?.role).toBe("system");
			expect(appendedMessage?.content?.[0]?.type).toBe("text");
			expect(appendedMessage?.content?.[0]?.text).toContain("可能陷入循环");
			expect(appendedMessage?.content?.[0]?.text).toContain("[Working Summary]");
			expect(appendedMessage?.content?.[0]?.text).toContain("最近失败原因");
			expect(appendedMessage?.content?.[0]?.text).toContain("禁止重复动作");
		});
	});

	describe("Working Summary", () => {
		it("should build a runtime working summary from recent task and failure context", () => {
			const summary = createWorkingSummaryMessage([
				{
					role: "user",
					content: [{ type: "text", text: "请继续处理旧计划，如果失败就换一种方式" }],
				} as any,
				{
					role: "assistant",
					content: [{ type: "text", text: "最近失败原因：old-plan.md 不存在，不要重复 read_file，改为请求用户补充路径" }],
				} as any,
			]);

			expect(summary).not.toBeNull();
			expect(summary?.content?.[0]).toMatchObject({ type: "text" });
			const text = (summary?.content?.[0] as any)?.text ?? "";
			expect(text).toContain("[Working Summary]");
			expect(text).toContain("当前任务");
			expect(text).toContain("最近失败原因");
			expect(text).toContain("禁止重复动作");
		});
	});

	describe("Configuration Management", () => {
		beforeEach(() => {
			agent = new OriginOSAgent(basicConfig);
		});

		it("should set system prompt", () => {
			const newPrompt = "You are now a technical assistant";

			expect(() => {
				agent.setSystemPrompt(newPrompt);
			}).not.toThrow();
		});

		it("should set model", () => {
			const newModel = { provider: "google" as const, id: "gemini-pro" };

			expect(() => {
				agent.setModel(newModel);
			}).not.toThrow();
		});

		it("should use the latest model credentials after setModel", async () => {
			const bearerConfig: OriginOSAgentConfig = {
				...basicConfig,
				model: {
					provider: "anthropic" as const,
					id: "test-model",
					authToken: "sk-bearer-token",
					apiKey: null,
					credentialAuthMode: "bearer",
				} as any,
			};
			agent = new OriginOSAgent(bearerConfig);

			await agent.prompt("first");
			expect(piAi.__streamCalls.length).toBeGreaterThan(0);
			const firstCall = piAi.__streamCalls[piAi.__streamCalls.length - 1];
			expect(firstCall.model).toMatchObject({
				provider: "github-copilot",
				apiKey: null,
				authToken: null,
			});
			expect(firstCall.options).toMatchObject({
				toolChoice: "auto",
				apiKey: "sk-bearer-token",
			});

			agent.setModel({
				provider: "anthropic" as const,
				id: "test-model",
				apiKey: "sk-api-key",
				authToken: null,
				credentialAuthMode: "api-key",
			} as any);

			await agent.prompt("second");
			expect(piAi.__streamCalls.length).toBeGreaterThan(1);
			const secondCall = piAi.__streamCalls[piAi.__streamCalls.length - 1];
			expect(secondCall.model).toMatchObject({
				provider: "anthropic",
				apiKey: "sk-api-key",
				authToken: null,
			});
			expect(secondCall.options).toMatchObject({
				toolChoice: "auto",
				apiKey: "sk-api-key",
			});
		});
	});
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createOriginOSAgent", () => {
	it("should create an agent with default model", async () => {
		const agent = await createOriginOSAgent({
			sessionId: "test-session",
			variables: {
				projectId: "project-001",
				projectName: "Test Project",
				projectPath: "/data/projects/test",
				userId: "user-001",
			},
		});

		expect(agent).toBeInstanceOf(OriginOSAgent);
	});

	it("should create an agent with custom model", async () => {
		const customModel = { provider: "google" as const, id: "gemini-pro" };

		// Note: We can't actually test this properly because getModel is mocked
		// But we can verify the function accepts the parameter
		const agent = await createOriginOSAgent({
			sessionId: "test-session",
			variables: {
				projectId: "test",
			},
			model: customModel,
		});

		expect(agent).toBeInstanceOf(OriginOSAgent);
	});

	it("should create an agent with custom thinking level", async () => {
		const agent = await createOriginOSAgent({
			sessionId: "test-session",
			variables: {
				projectId: "test",
			},
			thinkingLevel: "high",
		});

		expect(agent).toBeInstanceOf(OriginOSAgent);
	});
});
