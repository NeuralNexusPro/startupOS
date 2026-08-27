/**
 * 系统工具
 * 提供系统级别的操作功能
 */

import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { AgentToolResult } from "@originos/pi-agent-adapter";
import type { AgentToolUpdateCallback } from "@originos/pi-agent-adapter";
import type { ToolRegistration } from "../types";
import { access } from "node:fs/promises";
import { resolveToolPath } from "./path-utils";

// ============================================================================
// 工具执行辅助函数
// ============================================================================

interface ToolExecutionContext {
	toolCallId: string;
	toolName: string;
	signal?: AbortSignal;
	onUpdate?: AgentToolUpdateCallback<unknown>;
}

function createToolContext(
	toolCallId: string,
	toolName: string,
	signal?: AbortSignal,
	onUpdate?: AgentToolUpdateCallback<unknown>
): ToolExecutionContext {
	return { toolCallId, toolName, signal, onUpdate };
}

function checkAbort(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException("Tool execution was aborted", "AbortError");
	}
}

function logToolStart(ctx: ToolExecutionContext, params: Record<string, unknown>): void {
	console.error(`[Tool:${ctx.toolName}] START_CALL_ID=${ctx.toolCallId}`, JSON.stringify(params, null, 2));
}

function logToolEnd(ctx: ToolExecutionContext, result: Record<string, unknown>): void {
	console.error(`[Tool:${ctx.toolName}] END_CALL_ID=${ctx.toolCallId}`, JSON.stringify(result, null, 2));
}

function logToolError(ctx: ToolExecutionContext, error: unknown): void {
	console.error(`[Tool:${ctx.toolName}] ERROR_CALL_ID=${ctx.toolCallId}`, error);
}

/**
 * 发送进度更新
 */
function sendProgress(
	ctx: ToolExecutionContext,
	message: string,
	progress?: number,
	data?: unknown
): void {
	if (!ctx.onUpdate || ctx.signal?.aborted) return;

	ctx.onUpdate({
		content: [],
		details: {
			type: "progress",
			toolCallId: ctx.toolCallId,
			toolName: ctx.toolName,
			status: "in_progress",
			message,
			progress,
			data,
			timestamp: Date.now(),
		},
	});
}

// ============================================================================
// 工具: 获取当前时间
// ============================================================================

const GetTimeParamsSchema = Type.Object({});

const GetTimeTool: ToolRegistration = {
	name: "get_current_time",
	label: "获取当前时间",
	description: "获取当前的日期和时间",
	parameters: GetTimeParamsSchema,
	category: "system",
	enabled: true,
	schedulable: true,
	async execute(
		toolCallId: string,
		_params: Static<typeof GetTimeParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "get_current_time", signal, onUpdate);

		try {
			logToolStart(ctx, {});
			checkAbort(ctx.signal);

			sendProgress(ctx, "正在获取当前时间...", 0.5);

			const now = new Date();

			const result = {
				success: true,
				timestamp: now.getTime(),
				isoString: now.toISOString(),
				localTime: now.toLocaleString("zh-CN"),
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				milliseconds: now.getMilliseconds(),
			};

			sendProgress(ctx, "时间获取完成", 1);
			logToolEnd(ctx, result);

			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(result),
					},
				],
				details: undefined,
			};
		} catch (error) {
			logToolError(ctx, error);
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							success: false,
							error: error instanceof Error ? error.message : String(error),
						}),
					},
				],
				details: undefined,
			};
		}
	},
};

const OpenFileParamsSchema = Type.Object({
	filePath: Type.String({ description: "要使用系统默认应用打开的本地文件路径" }),
});

const OpenFileTool: ToolRegistration = {
	name: "open_file",
	label: "打开文件",
	description: "在桌面端使用操作系统默认应用直接打开本地文件。仅支持 Electron 桌面环境。",
	parameters: OpenFileParamsSchema,
	category: "system",
	enabled: true,
	async execute(toolCallId, params: Static<typeof OpenFileParamsSchema>, signal, onUpdate): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "open_file", signal, onUpdate);
		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);
			const resolved = resolveToolPath(params.filePath);
			await access(resolved.fullPath);
			if (typeof process === "undefined" || !process.versions?.electron) {
				throw new Error("open_file 仅支持 Electron 桌面环境");
			}
			const electron = await import("electron");
			const error = await electron.shell.openPath(resolved.fullPath);
			if (error) throw new Error(error);
			const result = { success: true, filePath: resolved.displayPath, openedWithSystem: true };
			logToolEnd(ctx, result);
			return { content: [{ type: "text", text: `已使用系统默认应用打开：${resolved.displayPath}` }], details: result };
		} catch (error) {
			logToolError(ctx, error);
			return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }) }], details: undefined };
		}
	},
};

// ============================================================================
// 导出所有系统工具
// ============================================================================

export const systemTools: ToolRegistration[] = [
	GetTimeTool,
	OpenFileTool,
];
