/**
 * Pi Agent 客户端 API 客户端（SSE 解析与会话初始化/消息发送 HTTP 封装）。
 *
 * 这个模块不依赖任何 Node.js 特定包，可以在客户端安全使用
 */

import {
	createAgentSession,
	sendAgentMessage,
} from "../../electron/services/agent-session";
import type { ProjectContext } from "../types";
import type { RuntimeLLMConfig } from "../llm-config";
import type { AgentContextTokenEstimate, AgentTokenUsage } from "../../../types/agent";

const API_BASE = "/api/agent/sessions";

// ============================================================================
// SSE 解析器
// ============================================================================

function parseSSE(text: string): Array<{ type: string; data: unknown }> {
	const lines = text.split('\n');
	const events: Array<{ type: string; data: unknown }> = [];
	let currentData = '';

	for (const line of lines) {
		if (line.startsWith('data: ')) {
			if (currentData) {
				currentData += '\n';
			}
			currentData += line.slice(6);
		} else if (line === '') {
			if (currentData.trim()) {
				try {
					const parsed = JSON.parse(currentData);
					events.push(parsed);
				} catch (e) {
					console.error('[SSE] Failed to parse:', currentData, e);
				}
				currentData = '';
			}
		}
	}

	return events;
}

export { parseSSE, API_BASE };

/**
 * 初始化 Agent 会话
 * @returns 服务器生成的 sessionId
 */
export async function initializeSession(
	sessionId: string,
	projectContext: ProjectContext,
	variables?: Record<string, string>,
	llmConfig?: RuntimeLLMConfig
): Promise<{ sessionId: string; projectContext: ProjectContext }> {
	const agentType = variables?.['agentType'];
	const entryType = projectContext.entryType
		?? (agentType === 'skill'
			? 'skill'
			: agentType === 'role-agent'
				? 'role-agent'
				: 'agent');
	const entryId = projectContext.entryId
		?? (entryType === 'skill' && projectContext.projectId.startsWith('skill-')
			? projectContext.projectId.slice('skill-'.length)
			: projectContext.projectId);
	const scopedProjectContext: ProjectContext = {
		...projectContext,
		entryType,
		entryId,
	};
	const response = await createAgentSession({
		sessionId,
		projectId: scopedProjectContext.projectId,
		projectName: scopedProjectContext.projectName || "Agent Session",
		agentType,
		systemPrompt: variables?.['systemPrompt'],
		projectContext: scopedProjectContext as unknown as Record<string, unknown>,
		llmConfig,
		agentBaseDir: variables?.['agentBaseDir'],
		outputDir: variables?.['outputDir'],
	});

	if (!response.success) {
		throw new Error(response.error?.message || 'Failed to initialize session');
	}

	return {
		sessionId: (response.data as { sessionId: string }).sessionId,
		projectContext: scopedProjectContext,
	};
}

/**
 * 发送消息到 Agent (非流式)
 * 返回包含用户消息和助手消息的响应
 */
export async function sendMessageToAgent(
	sessionId: string,
	message: string,
	projectContext?: ProjectContext,
): Promise<{ userMessage: { id: string; role: string; content: string; timestamp?: number }; assistantMessage?: { id: string; role: string; content: string; timestamp?: number; usage?: AgentTokenUsage; contextTokenEstimate?: AgentContextTokenEstimate } }> {
	const response = await sendAgentMessage({
		sessionId,
		content: message,
		role: "user",
		projectId: projectContext?.projectId,
		entryType: projectContext?.entryType,
		entryId: projectContext?.entryId,
	});

	if (!response.success) {
		throw new Error(response.error?.message || 'Failed to send message');
	}

	return response.data as { userMessage: { id: string; role: string; content: string; timestamp?: number }; assistantMessage?: { id: string; role: string; content: string; timestamp?: number; usage?: AgentTokenUsage; contextTokenEstimate?: AgentContextTokenEstimate } };
}
