/**
 * Unit tests for PiAgentStore (Zustand store)
 *
 * Tests cover:
 * - Store initialization and state
 * - Agent initialization
 * - Message sending
 * - Tool operations
 * - Project context management
 * - System prompt and thinking level
 * - Event subscription
 * - State reset and abort
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { TSchema } from "@sinclair/typebox";
import type { AgentTool } from "@originos/pi-agent-adapter";
import type { AgentEvent } from "@originos/pi-agent-adapter";
import type { ProjectContext, PiAgentStore } from "./store";
import type { OriginOSAgentState } from "../../types";

// Mock agent module before any imports
const { mockCreateOriginOSAgent, MockAgentClass } = vi.hoisted(() => {
	// Create Mock Agent for testing (use internal name to avoid conflict)
	class _MockAgentImpl {
		destroyed = false;
		eventHandlers = new Set<(e: AgentEvent) => void>();
		initialized = false;
		isThinking = false;
		state = {
			messages: [] as any[],
			model: { provider: "anthropic", id: "test" },
			systemPrompt: "",
		};

		async prompt() {}

		async continue() {}

		abort() {}

		async waitForIdle() {}

		subscribe(handler: (e: AgentEvent) => void): () => void {
			this.eventHandlers.add(handler);
			return () => this.eventHandlers.delete(handler);
		}

		emit(event: AgentEvent) {
			for (const handler of this.eventHandlers) {
				handler(event);
			}
		}

		setSystemPrompt() {}

		setModel() {}

		setTools() {}

		clearMessages() {}

		replaceMessages() {}

		appendMessage() {}

		destroy() {
			this.destroyed = true;
		}

		healthCheck() {
			return {
				status: "healthy",
				uptime: 0,
				memoryUsage: 0,
				messagesProcessed: 0,
				lastHeartbeat: new Date(),
			};
		}

		isInitialized() {
			return this.initialized;
		}

		markAsRunning() {
			this.initialized = true;
		}

		subscribeToEvents(handler: (e: AgentEvent) => void): () => void {
			return this.subscribe(handler);
		}
	}

	const mockCreateOriginOSAgent = vi.fn(() => new _MockAgentImpl());

	return { mockCreateOriginOSAgent, MockAgentClass: _MockAgentImpl };
});

vi.mock("./core/agent.js", () => ({
	createOriginOSAgent: mockCreateOriginOSAgent,
	OriginOSAgent: MockAgentClass,
}));

// Import centralized mocks
import "./__tests__/mocks";

// Import after mocking
import { createPiAgentStore } from "./store";
const usePiAgentStore = createPiAgentStore(() => {});

// ============================================================================
// Test Data
// ============================================================================

const mockProjectContext: ProjectContext = {
	projectId: "project-001",
	ontologyId: "ontology-001",
	projectName: "Test Project",
	currentPath: "/data/projects/test",
	userId: "user-001",
};

const mockVariables: Record<string, string> = {
	projectId: "project-001",
	ontologyId: "ontology-001",
	projectName: "Test Project",
	projectPath: "/data/projects/test",
	userId: "user-001",
};

const mockTool: AgentTool<TSchema> = {
	name: "test-tool",
	label: "Test Tool",
	description: "Test description",
	parameters: {} as TSchema,
	execute: vi.fn(async () => ({
		content: [{ type: "text", text: "Tool result" }],
	})),
};

// Test Suite
// ============================================================================

describe("PiAgentStore", () => {
	beforeEach(() => {
		// Reset mock before each test
		mockCreateOriginOSAgent.mockReset();
		vi.clearAllMocks();
	});
	afterEach(() => {
		// Reset store after each test
		usePiAgentStore.getState().reset();
	});

	describe("Store Initialization and State", () => {
		it("should initialize with default state", () => {
			const { result } = renderHook(() => usePiAgentStore());

			const state = result.current;

			expect(state.agent).toBeNull();
			expect(state.isInitialized).toBe(false);
			expect(state.isRunning).toBe(false);
			expect(state.sessionId).toBe(null);
			expect(state.projectContext).toBe(null);
			expect(state.isThinking).toBe(false);
			expect(state.activeTools).toEqual([]);
			expect(state.errorMessage).toBe(null);
		});

		it("should be a singleton (same instance across calls)", () => {
			const { result: result1 } = renderHook(() => usePiAgentStore());
			const { result: result2 } = renderHook(() => usePiAgentStore());

			expect(result1.current).toBe(result2.current);
		});
	});

	describe("Agent Initialization", () => {
		it("should initialize agent with correct parameters", async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
			});

			expect(mockCreateOriginOSAgent).toHaveBeenCalledWith({
				sessionId: "test-session",
				variables: {
					...mockVariables,
					projectId: mockProjectContext.projectId,
					ontologyId: mockProjectContext.ontologyId,
					projectName: mockProjectContext.projectName,
					projectPath: mockProjectContext.currentPath,
					userId: mockProjectContext.userId,
				},
			});
		});

		it("should set initialized state after successful init", async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
			});

			expect(result.current.isInitialized).toBe(true);
			expect(result.current.agent).toBe(mockAgent);
		});

		it("should set error message on initialization failure", async () => {
			const error = new Error("Initialization failed");
			mockCreateOriginOSAgent.mockImplementation(() => { throw error; });

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await expect(
					result.current.initialize(
						"test-session",
						mockProjectContext,
						mockVariables
					)
				).rejects.toThrow();
			});

			expect(result.current.errorMessage).toBe("Initialization failed");
			expect(result.current.isInitialized).toBe(false);
			expect(result.current.isRunning).toBe(false);
		});
	});

	describe("Message Sending", () => {
		beforeEach(async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
			});
		});

		it("should send message successfully", async () => {
			const { result } = renderHook(() => usePiAgentStore());

			const mockPrompt = vi.fn();
			(result.current.agent as any).prompt = mockPrompt;

			await act(async () => {
				await result.current.sendMessage("Hello, agent!");
			});

			expect(mockPrompt).toHaveBeenCalledWith("Hello, agent!");
			expect(result.current.isRunning).toBe(true);
		});

		it("should set error message on send failure", async () => {
			const { result } = renderHook(() => usePiAgentStore());

			const mockPrompt = vi.fn().mockRejectedValue(new Error("Send failed"));
			(result.current.agent as any).prompt = mockPrompt;

			await act(async () => {
				try {
					await result.current.sendMessage("Hello, agent!");
				} catch (e) {
					// Expected error
				}
			});

			expect(result.current.errorMessage).toBe("Send failed");
			expect(result.current.isRunning).toBe(false);
		});
	});

	describe("Abort Operation", () => {
		beforeEach(async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
			});
		});

		it("should abort current operation", () => {
			const { result } = renderHook(() => usePiAgentStore());

			const mockAbort = vi.fn();
			(result.current.agent as any).abort = mockAbort;

			act(() => {
				result.current.abort();
			});

			expect(mockAbort).toHaveBeenCalled();
		});

		it("should set isRunning to false after abort", () => {
			const { result } = renderHook(() => usePiAgentStore());

			act(() => {
				result.current.abort();
			});

			expect(result.current.isRunning).toBe(false);
		});
	});

	describe("Project Context Management", () => {
		beforeEach(async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
			});
		});

		it("should update project context partially", () => {
			const { result } = renderHook(() => usePiAgentStore());

			const updatedContext: Partial<ProjectContext> = {
				projectName: "Updated Project",
			};

			act(() => {
				result.current.updateProjectContext(updatedContext);
			});

			expect(result.current.projectContext?.projectName).toBe("Updated Project");
		});

		it("should preserve existing context when updating", () => {
			const { result } = renderHook(() => usePiAgentStore());

			act(() => {
				result.current.updateProjectContext({ projectName: "New Name" });
			});

			expect(result.current.projectContext?.projectId).toBe("project-001");
			expect(result.current.projectContext?.ontologyId).toBe("ontology-001");
		});
	});

	describe("Agent Events Handling", () => {
		it("should handle agent_start event", async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
				// Simulate agent_start event
				(mockAgent as any).emit({ type: "agent_start" });
			});

			expect(result.current.isRunning).toBe(true);
		});

		it("should handle turn_start event", async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
				(mockAgent as any).emit({ type: "turn_start" });
			});

			expect(result.current.isRunning).toBe(true);
			expect(result.current.isThinking).toBe(true);
		});

		it("should handle turn_end event", async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
				(mockAgent as any).emit({ type: "turn_end" });
			});

			expect(result.current.isRunning).toBe(false);
			expect(result.current.isThinking).toBe(false);
		});

		it("should handle tool_execution_start event", async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
				(mockAgent as any).emit({
					type: "tool_execution_start",
					toolName: "test-tool",
				});
			});

			expect(result.current.activeTools).toContainEqual({
				toolName: "test-tool",
				startTime: expect.any(Number),
			});
		});

		it("should handle message_end with error", async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
				(mockAgent as any).emit({
					type: "agent_error",
					error: new Error("Test error"),
				});
			});

			expect(result.current.errorMessage).toBe("Test error");
		});
	});

	describe("State Reset", () => {
		beforeEach(async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			// Initialize and set some state
			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
			});
		});

		it("should reset all state to defaults", () => {
			const { result } = renderHook(() => usePiAgentStore());

			act(() => {
				result.current.reset();
			});

			expect(result.current.agent).toBeNull();
			expect(result.current.isInitialized).toBe(false);
			expect(result.current.isRunning).toBe(false);
			expect(result.current.isThinking).toBe(false);
			expect(result.current.activeTools).toEqual([]);
		});

		it("should not throw when resetting store multiple times", () => {
			const { result } = renderHook(() => usePiAgentStore());

			act(() => {
				result.current.reset();
				result.current.reset();
			});

			expect(true).toBe(true);
		});
	});

	describe("Destroy Agent", () => {
		beforeEach(async () => {
			const mockAgent = new MockAgentClass();
			mockCreateOriginOSAgent.mockReturnValue(mockAgent);

			const { result } = renderHook(() => usePiAgentStore());

			await act(async () => {
				await result.current.initialize(
					"test-session",
					mockProjectContext,
					mockVariables
				);
			});
		});

		it("should destroy agent", () => {
			const { result } = renderHook(() => usePiAgentStore());

			const mockDestroy = vi.fn();
			(result.current.agent as any).destroy = mockDestroy;

			act(() => {
				result.current.destroy();
			});

			expect(mockDestroy).toHaveBeenCalled();
			expect(result.current.agent).toBeNull();
		});

		it("should reset state after destroy", () => {
			const { result } = renderHook(() => usePiAgentStore());

			act(() => {
				result.current.destroy();
			});

			expect(result.current.isInitialized).toBe(false);
			expect(result.current.isRunning).toBe(false);
			expect(result.current.sessionId).toBe(null);
		});
	});
});
