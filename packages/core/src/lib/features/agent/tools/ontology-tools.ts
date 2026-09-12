/**
 * 本体操作工具 — 统一通过 ontology-data-store 服务层调用
 * 不再直接读写文件系统，确保数据一致性。
 */

import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { ToolRegistration } from "../../../integrations/pi-agent/types";
import type { AgentToolResult, AgentToolUpdateCallback } from "@originos/pi-agent-adapter";

import * as ontologyOps from '../../ontology-data-store';

// ============================================================================
// 工具执行辅助
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

function sendProgress(ctx: ToolExecutionContext, message: string, progress?: number, data?: unknown): void {
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

function logToolStart(ctx: ToolExecutionContext, params: Record<string, unknown>): void {
	console.error(`[Tool:${ctx.toolName}] START_CALL_ID=${ctx.toolCallId}`, JSON.stringify(params, null, 2));
}

function logToolEnd(ctx: ToolExecutionContext, result: Record<string, unknown>): void {
	console.error(`[Tool:${ctx.toolName}] END_CALL_ID=${ctx.toolCallId}`, JSON.stringify(result, null, 2));
}

function logToolError(ctx: ToolExecutionContext, error: unknown): void {
	console.error(`[Tool:${ctx.toolName}] ERROR_CALL_ID=${ctx.toolCallId}`, error);
}

function checkAbort(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException("Tool execution was aborted", "AbortError");
	}
}

function successResult(ctx: ToolExecutionContext, data: Record<string, unknown>): AgentToolResult<unknown> {
	logToolEnd(ctx, data);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data) }],
		details: undefined,
	};
}

function errorResult(ctx: ToolExecutionContext, error: unknown): AgentToolResult<unknown> {
	logToolError(ctx, error);
	return {
		content: [{ type: "text" as const, text: JSON.stringify({
			success: false,
			error: error instanceof Error ? error.message : String(error),
		}) }],
		details: undefined,
	};
}

// ============================================================================
// 工具: 查询本体
// ============================================================================

const QueryOntologyParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 system prompt 的 projectContext 或【协作上下文】获取，不要自己生成。一个项目对应唯一一个 ontologyId。" }),
});

const QueryOntologyTool: ToolRegistration = {
	name: "query_ontology",
	label: "查询本体结构",
	description: "【本体结构层】查询指定项目的完整本体结构定义，包含所有领域（domains）、概念（concepts）和关系（relations）。这是结构层工具，返回的是 schema 定义而非实际数据实例。如需查询实例数据请使用 query_instances。返回 JSON：{ success, ontologyId, ontology: { domains[], concepts[], relations[] } }；失败时 { success: false, error }。",
	parameters: QueryOntologyParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof QueryOntologyParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "query_ontology", signal, onUpdate);

		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);

			sendProgress(ctx, `读取本体: ${params.ontologyId}`, 0.5);

			const ontology = await ontologyOps.loadOntology(params.ontologyId);

			sendProgress(ctx, "本体查询完成", 1);

			const result = { success: true, ontologyId: params.ontologyId, ontology };
			return successResult(ctx, result);
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: 创建领域
// ============================================================================

const CreateDomainParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	domainName: Type.String({ minLength: 1, description: "新领域的名称，例如 '订单管理'、'用户体系'。同一本体内不能重名。" }),
	description: Type.String({ optional: true, description: "领域的业务说明（可选）" }),
});

const CreateDomainTool: ToolRegistration = {
	name: "create_domain",
	label: "创建领域（结构层）",
	description: "【本体结构层】在本体中创建一个新的领域层（三层结构中的第一层）。领域是概念的分组容器，属于结构定义而非数据实例。返回 JSON：{ success, domain: { id, name, description }, ontologyId, message }；失败时 { success: false, error }。",
	parameters: CreateDomainParamsSchema,
	category: "ontology",
	enabled: true,
	scopes: ['assistant', 'role-agent', 'project', 'solution', 'persistent', 'originos', 'supervisor'],
	async execute(
		toolCallId: string,
		params: Static<typeof CreateDomainParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "create_domain", signal, onUpdate);

		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);

			sendProgress(ctx, "创建领域...", 0.5);

			const newDomain = await ontologyOps.createDomain(
				params.ontologyId,
				params.domainName,
				params.description
			);

			sendProgress(ctx, "领域创建完成", 1);

			const result = {
				success: true,
				domain: newDomain,
				ontologyId: params.ontologyId,
				message: `领域 "${params.domainName}" 已创建`,
			};
			return successResult(ctx, result);
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: 创建概念
// ============================================================================

const CreateConceptParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	domainId: Type.String({ minLength: 1, description: "所属领域的 ID。如不确定可用值，先调用 query_ontology 查看 domains 列表，不要凭名字猜测。" }),
	conceptName: Type.String({ minLength: 1, description: "概念名称，例如 '订单'、'用户'、'审批流程'。同一领域内不能重名。" }),
	conceptType: Type.Union([
		Type.Literal("entity"),
		Type.Literal("process"),
		Type.Literal("attribute"),
		Type.Literal("relation"),
	], { description: "概念类型：entity（实体，如订单、用户）/ process（流程，如审批、发货）/ attribute（属性，如颜色、状态）/ relation（关系，如隶属于、触发）" }),
	description: Type.String({ optional: true, description: "概念的业务说明（可选）" }),
});

const CreateConceptTool: ToolRegistration = {
	name: "create_concept",
	label: "创建概念（结构层）",
	description: "【本体结构层】在指定领域下创建一个概念对象（三层结构中的第二层）。概念是结构定义（schema），描述数据的类型和字段约束，而非实际数据。创建前需先通过 query_ontology 确认 domainId。如需创建具体的数据记录请使用 create_instance。返回 JSON：{ success, concept: { id, name, type, domainId }, ontologyId, message }；失败时 { success: false, error }。",
	parameters: CreateConceptParamsSchema,
	category: "ontology",
	enabled: true,
	scopes: ['assistant', 'role-agent', 'project', 'solution', 'persistent', 'originos', 'supervisor'],
	async execute(
		toolCallId: string,
		params: Static<typeof CreateConceptParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "create_concept", signal, onUpdate);

		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);

			sendProgress(ctx, `创建概念: ${params.conceptName}`, 0.5);

			const newConcept = await ontologyOps.createConcept(
				params.ontologyId,
				params.domainId,
				params.conceptName,
				params.conceptType,
				params.description
			);

			sendProgress(ctx, "概念创建完成", 1);

			const result = {
				success: true,
				concept: newConcept,
				ontologyId: params.ontologyId,
				message: `概念 "${params.conceptName}" 已创建`,
			};
			return successResult(ctx, result);
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: 搜索本体
// ============================================================================

const SearchOntologyParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	query: Type.String({ minLength: 1, description: "搜索关键词，例如 '订单'、'审批'。会在概念名称、描述、关系中做模糊匹配。" }),
});

const SearchOntologyTool: ToolRegistration = {
	name: "search_ontology",
	label: "搜索本体结构",
	description: "【本体结构层】在本体结构定义中搜索与关键词匹配的概念或关系。这是结构层搜索，返回的是 schema 定义匹配结果，不包含实例数据。适合在不知道具体 domainId/conceptId 时做探索。如需搜索实例数据请使用 query_instances。返回 JSON：{ success, query, ontologyId, results: Array<{ type, id, name, ... }> }；失败时 { success: false, error }。",
	parameters: SearchOntologyParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof SearchOntologyParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "search_ontology", signal, onUpdate);

		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);

			sendProgress(ctx, `正在搜索: ${params.query}`, 0.5);

			const results = await ontologyOps.searchOntology(params.ontologyId, params.query);

			sendProgress(ctx, "搜索完成", 1);

			const result = {
				success: true,
				query: params.query,
				ontologyId: params.ontologyId,
				results,
			};
			return successResult(ctx, result);
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 导出所有本体工具
// ============================================================================

export const ontologyTools: ToolRegistration[] = [
	QueryOntologyTool,
	CreateDomainTool,
	CreateConceptTool,
	SearchOntologyTool,
];
