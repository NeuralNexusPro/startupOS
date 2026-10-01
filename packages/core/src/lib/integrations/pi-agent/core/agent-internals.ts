/**
 * pi-agent core agent 的模块级内部工具——事件发射器、文本/模型/日志纯函数（internal，不经 index.ts 对外包出）。
 */

import type { AgentMessage } from "@originos/pi-agent-adapter";
import type {
	AssistantMessage,
	AssistantMessageEvent,
	AssistantMessageEventStream,
} from "@originos/pi-agent-adapter/ai";

// ============================================================================
// Event Emitter
// ============================================================================

/**
 * 简单的事件发射器
 */
export class EventEmitter<T> {
	private listeners = new Set<(event: T) => void>();

	subscribe(listener: (event: T) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(event: T): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}

export function normalizeStreamProvider(
	stream: AssistantMessageEventStream,
	provider: string
): AssistantMessageEventStream {
	const rewriteMessage = (message: AssistantMessage): AssistantMessage => {
		message.provider = provider;
		return message;
	};
	const rewriteEvent = (event: AssistantMessageEvent): AssistantMessageEvent => {
		if ("partial" in event) {
			rewriteMessage(event.partial);
		}
		if ("message" in event) {
			rewriteMessage(event.message);
		}
		return event;
	};

	return ({
		[Symbol.asyncIterator]: async function* () {
			for await (const event of stream) {
				yield rewriteEvent(event);
			}
		},
		result: async () => rewriteMessage(await stream.result()),
	} as unknown) as AssistantMessageEventStream;
}

export function hashText(text: string): string {
	if (!text) {
		return "empty";
	}
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function previewText(text: string, max = 80): string {
	return text.replace(/\s+/g, " ").slice(0, max);
}

export function previewToolResult(text: string, max = 1_000): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	const preview = normalized.slice(0, max);
	return `length=${text.length}, hash=${hashText(text)}, preview=${JSON.stringify(preview)}${normalized.length > max ? ", truncated=true" : ""}`;
}

export function getMessageText(message: unknown): string {
	if (typeof message === "string") {
		return message;
	}
	if (!message || typeof message !== "object") {
		return "";
	}
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.filter((block): block is { type: "text"; text: string } =>
			typeof block === "object" &&
			block !== null &&
			(block as { type?: unknown }).type === "text" &&
			typeof (block as { text?: unknown }).text === "string"
		)
		.map((block) => block.text)
		.join("");
}

export function getPromptText(message: string | AgentMessage | AgentMessage[]): string {
	if (typeof message === "string") {
		return message;
	}
	if (Array.isArray(message)) {
		for (let index = message.length - 1; index >= 0; index -= 1) {
			const candidate = message[index];
			if (candidate?.role === "user") {
				return getMessageText(candidate);
			}
		}
		return "";
	}
	return getMessageText(message);
}

export function redactErrorForLogging(message: string): string {
	return message
		.replace(/\bBearer\s+\S+/giu, "Bearer [REDACTED]")
		.replace(/\b(?:sk|tp)-[A-Za-z0-9._-]{8,}\b/gu, "[REDACTED]");
}

export function logInfo(...args: unknown[]): void {
	if (process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"] === "1") {
		return;
	}
	console.info(...args);
}
