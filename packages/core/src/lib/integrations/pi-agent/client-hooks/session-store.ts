/**
 * Pi Agent 客户端全局会话状态存储（跨 hook 实例共享 + 订阅通知）。
 *
 * 这个模块不依赖任何 Node.js 特定包，可以在客户端安全使用
 */

import type { ProjectContext } from "../types";
import type { AgentContextTokenEstimate, AgentTokenUsage } from "../../../types/agent";

/**
 * 全局会话状态存储
 * 使用 sessionId 作为键，存储每个会话的状态
 */
export interface SessionState {
	isInitialized: boolean;
	isRunning: boolean;
	isThinking: boolean;
	sessionId: string | null;
	projectContext: ProjectContext | null;
	messages: Array<{
		id?: string;
		role: "user" | "assistant" | "system" | "tool" | "toolResult";
		content: string;
		timestamp?: number;
		usage?: AgentTokenUsage;
		contextTokenEstimate?: AgentContextTokenEstimate;
	}>;
	activeTools: Array<{ toolName: string; startTime: number }>;
	progressMessage: string | null;
	errorMessage: string | null;
}

const globalSessionStore = new Map<string, SessionState>();
const sessionListeners = new Map<string, Set<() => void>>();

function getSessionState(sessionId: string): SessionState {
	if (!globalSessionStore.has(sessionId)) {
		globalSessionStore.set(sessionId, {
			isInitialized: false,
			isRunning: false,
			isThinking: false,
			sessionId: null,
			projectContext: null,
			messages: [],
			activeTools: [],
			progressMessage: null,
			errorMessage: null,
		});
	}
	return globalSessionStore.get(sessionId)!;
}

export function _updateSessionState(sessionId: string, updates: Partial<SessionState>): void {
	const state = getSessionState(sessionId);
	Object.assign(state, updates);
	// 通知所有监听器
	const listeners = sessionListeners.get(sessionId);
	if (listeners) {
		listeners.forEach(listener => listener());
	}
}

export function _subscribeToSession(sessionId: string, listener: () => void): () => void {
	if (!sessionListeners.has(sessionId)) {
		sessionListeners.set(sessionId, new Set());
	}
	sessionListeners.get(sessionId)!.add(listener);
	return () => {
		sessionListeners.get(sessionId)?.delete(listener);
	};
}
