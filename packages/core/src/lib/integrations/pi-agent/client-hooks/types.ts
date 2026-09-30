/**
 * Pi Agent 客户端 hooks 的公共类型定义（事件与 hook 返回值）。
 *
 * 这个模块不依赖任何 Node.js 特定包，可以在客户端安全使用
 */

import type { ProjectContext } from "../types";
import type { RuntimeLLMConfig } from "../llm-config";
import type { AgentContextTokenEstimate, AgentTokenUsage } from "../../../types/agent";
import type {
	RestoreAgentSessionRequest,
	RestoreAgentSessionResult,
} from "../session-restore";

/**
 * Agent 事件类型（客户端版本）
 */
export type ClientAgentEvent =
	| { type: "agent_start" }
	| { type: "agent_end" }
	| { type: "turn_start" }
	| { type: "turn_end" }
	| { type: "message_start"; message?: { role: string; content?: string } }
	| { type: "message_delta"; delta?: { text?: string } }
	| { type: "message_end"; message?: { role: string; content?: string; usage?: AgentTokenUsage; contextTokenEstimate?: AgentContextTokenEstimate } }
	| { type: "tool_execution_start"; toolName: string; toolCallId?: string; args?: unknown }
	| { type: "tool_execution_end"; toolName: string; toolCallId?: string; result?: unknown; isError?: boolean }
	| { type: "agent_error"; error?: { message: string } };

/**
 * Hook 返回值类型
 */
export interface UseClientPiAgentState {
	// === State ===
	isInitialized: boolean;
	isRunning: boolean;
	isThinking: boolean;
	isRestoring: boolean;
	sessionId: string | null;
	projectContext: ProjectContext | null;
	restoredSession: RestoreAgentSessionResult | null;
	uiState: {
		isThinking: boolean;
		isRunning: boolean;
		isRestoring: boolean;
		activeTools: Array<{
			toolName: string;
			startTime: number;
		}>;
		progressMessage: string | null;
		errorMessage: string | null;
	};
	messages?: Array<{
		id?: string;
		role: "user" | "assistant" | "system" | "tool" | "toolResult";
		content: string;
		timestamp?: number;
		isStreaming?: boolean;
		usage?: AgentTokenUsage;
		contextTokenEstimate?: AgentContextTokenEstimate;
	}>;
	artifactVersion: number;

	// === Actions ===
	initialize: (
		sessionId: string,
		projectContext: ProjectContext,
		variables?: Record<string, string>,
		llmConfig?: RuntimeLLMConfig
	) => Promise<void>;
	restoreSession: (
		request: RestoreAgentSessionRequest
	) => Promise<RestoreAgentSessionResult | null>;
	destroy: () => void;
	sendMessage: (message: string) => Promise<void>;
	sendMessageStream: (message: string) => Promise<void>;
	abort: () => void;
	updateProjectContext: (context: Partial<ProjectContext>) => void;
	setSystemPrompt: (prompt: string) => void;
	setThinkingLevel: (level: "off" | "minimal" | "low" | "medium" | "high") => void;
	subscribe: (listener: (event: ClientAgentEvent) => void) => (() => void) | void;
	reset: () => void;
}

/**
 * Hook 内 messages state 的内联消息类型（与 UseClientPiAgentState.messages 一致）
 */
export type ClientHookMessage = {
	id?: string;
	role: "user" | "assistant" | "system" | "tool" | "toolResult";
	content: string;
	timestamp?: number;
	isStreaming?: boolean;
	usage?: AgentTokenUsage;
	contextTokenEstimate?: AgentContextTokenEstimate;
};
