/**
 * Ontology Data Tools — Agent 数据操作工具
 * 7 个工具 + 批量删除确认机制
 */

import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { ToolRegistration } from "../../../integrations/pi-agent/types";
import type { AgentToolResult, AgentToolUpdateCallback } from "@originos/pi-agent-adapter";

import * as store from '../../ontology-data-store';
import * as queryEngine from '../../ontology-data-store';
import * as schemaValidator from '../../ontology-data-store';
import {
	createInstanceRelation,
	listInstanceRelations,
} from '../../ontology-data-store';

// ============================================================================
// 工具执行辅助（复用 ontology-tools.ts 模式）
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

function successResult(data: Record<string, unknown>): AgentToolResult<unknown> {
	logToolEnd({ toolCallId: "n/a", toolName: "n/a" } as ToolExecutionContext, data);
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
// 工具: create_instance
// ============================================================================

const CreateInstanceParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	conceptId: Type.String({ minLength: 1, description: "所属概念的 ID。如不确定可用值，先调用 list_concepts 或 search_ontology 获取，不要自己生成。" }),
	fields: Type.Object({}, { additionalProperties: true, description: "实例的字段数据，结构由概念定义决定。如不确定字段结构，先调用 get_concept_schema 查询字段约束。" }),
	createdBy: Type.Union([Type.Literal("user"), Type.Literal("agent"), Type.Literal("skill")], { optional: true, description: "创建来源，默认 agent" }),
});

const CreateInstanceTool: ToolRegistration = {
	name: "create_instance",
	label: "创建实例（数据层）",
	description: "【本体实例层】在本体中创建一个概念的实例数据（三层结构中的第三层）。这是数据层工具，操作的是实际业务数据记录，而非结构定义。创建前建议先调用 get_concept_schema 确认字段结构。\n\n**关系字段**：如果概念 schema 中有 type=relation 的字段（由 get_concept_schema 返回），可在 fields 中直接填写关联实例 ID（1:1 / N:1 填字符串，1:N / N:M 填字符串数组），`create_instance` 会自动建立实例关系，无需再单独调用关系工具。\n\n返回 JSON：{ success, instance: { id, conceptId, domainId, fields, createdAt }, relations: InstanceRelation[] }；失败时 { success: false, error }。",
	parameters: CreateInstanceParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof CreateInstanceParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "create_instance", signal, onUpdate);
		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);
			sendProgress(ctx, `创建实例: ${params.conceptId}`, 0.3);

			// 分离 relation 字段与普通字段
			const schema = await schemaValidator.loadConceptSchema(params.ontologyId, params.conceptId).catch(() => null);
			const relationFields = new Map<string, { relatedConceptId: string; relationType: string; cardinality: string }>();
			const plainFields: Record<string, unknown> = {};

			for (const [key, value] of Object.entries(params.fields)) {
				const fieldDef = schema?.fields.find((f) => f.name === key && f.type === "relation");
				if (fieldDef && fieldDef.relatedConceptId && fieldDef.relationType) {
					relationFields.set(key, {
						relatedConceptId: fieldDef.relatedConceptId,
						relationType: fieldDef.relationType,
						cardinality: fieldDef.cardinality ?? "N:M",
					});
					// relation 值不写入实例 fields
					void value;
				} else {
					plainFields[key] = value;
				}
			}

			const instance = await store.createInstance(
				params.ontologyId,
				params.conceptId,
				plainFields,
				params.createdBy ?? "agent"
			);

			sendProgress(ctx, "实例创建完成，处理关系字段...", 0.7);

			// 自动建立实例关系
			const createdRelations: unknown[] = [];
			if (relationFields.size > 0) {
				for (const [fieldName, relDef] of relationFields) {
					const rawValue = (params.fields as Record<string, unknown>)[fieldName];
					const targetIds: string[] = Array.isArray(rawValue)
						? rawValue.map(String)
						: typeof rawValue === "string" && rawValue
						? [rawValue]
						: [];

					for (const targetInstanceId of targetIds) {
						try {
							const relation = await createInstanceRelation(params.ontologyId, {
								sourceInstanceId: instance.id,
								targetInstanceId,
								type: relDef.relationType,
								sourceConceptId: params.conceptId,
								targetConceptId: relDef.relatedConceptId,
							});
							createdRelations.push(relation);
						} catch (relErr) {
							createdRelations.push({ error: String(relErr), fieldName, targetInstanceId });
						}
					}
				}
			}

			sendProgress(ctx, "完成", 1);
			return successResult({ success: true, instance, relations: createdRelations });
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: get_instance
// ============================================================================

const GetInstanceParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	conceptId: Type.String({ minLength: 1, description: "所属概念的 ID。如不确定可用值，先调用 list_concepts 获取，不要自己生成。" }),
	instanceId: Type.String({ minLength: 1, description: "实例 ID。从 query_instances 或 create_instance 的返回中获取，不要自己生成。" }),
});

const GetInstanceTool: ToolRegistration = {
	name: "get_instance",
	label: "获取实例（数据层）",
	description: "【本体实例层】获取指定实例的完整数据（实际业务记录，非结构定义）。返回 JSON：{ success, instance: { id, conceptId, domainId, fields, createdAt, updatedAt } }；失败时 { success: false, error }。",
	parameters: GetInstanceParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof GetInstanceParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "get_instance", signal, onUpdate);
		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);

			const instance = await store.getInstance(params.ontologyId, params.conceptId, params.instanceId);
			return successResult({ success: true, instance });
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: update_instance
// ============================================================================

const UpdateInstanceParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	conceptId: Type.String({ minLength: 1, description: "所属概念的 ID。如不确定可用值，先调用 list_concepts 获取，不要自己生成。" }),
	instanceId: Type.String({ minLength: 1, description: "要更新的实例 ID。从 query_instances 或 create_instance 的返回中获取，不要自己生成。" }),
	fields: Type.Object({}, { additionalProperties: true, description: "需要更新的字段，只需传入有变动的字段（partial update），不传的字段保持不变。" }),
});

const UpdateInstanceTool: ToolRegistration = {
	name: "update_instance",
	label: "更新实例（数据层）",
	description: "【本体实例层】更新指定实例的字段数据（partial update，只更新传入的字段）。这是数据层工具，修改的是实际业务记录。支持关系字段：传入 type=relation 的字段名和目标实例 ID，工具会自动更新实例关系。返回 JSON：{ success, instance: { id, fields, updatedAt }, relations: [] }；失败时 { success: false, error }。",
	parameters: UpdateInstanceParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof UpdateInstanceParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "update_instance", signal, onUpdate);
		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);
			sendProgress(ctx, `更新实例: ${params.instanceId}`, 0.3);

			// 分离 relation 字段与普通字段（与 create_instance 逻辑对齐）
			const schema = await schemaValidator.loadConceptSchema(params.ontologyId, params.conceptId).catch(() => null);
			const relationFields = new Map<string, { relatedConceptId: string; relationType: string; cardinality: string }>();
			const plainFields: Record<string, unknown> = {};

			for (const [key, value] of Object.entries(params.fields)) {
				const fieldDef = schema?.fields.find((f) => f.name === key && f.type === "relation");
				if (fieldDef && fieldDef.relatedConceptId && fieldDef.relationType) {
					relationFields.set(key, {
						relatedConceptId: fieldDef.relatedConceptId,
						relationType: fieldDef.relationType,
						cardinality: fieldDef.cardinality ?? "N:M",
					});
					void value;
				} else {
					plainFields[key] = value;
				}
			}

			const updated = await store.updateInstance(
				params.ontologyId,
				params.conceptId,
				params.instanceId,
				plainFields
			);

			sendProgress(ctx, "字段更新完成，处理关系字段...", 0.7);

			const updatedRelations: unknown[] = [];
			if (relationFields.size > 0) {
				for (const [fieldName, relDef] of relationFields) {
					const rawValue = (params.fields as Record<string, unknown>)[fieldName];
					const targetIds: string[] = Array.isArray(rawValue)
						? rawValue.map(String)
						: typeof rawValue === "string" && rawValue
						? [rawValue]
						: [];
					for (const targetInstanceId of targetIds) {
						try {
							const relation = await createInstanceRelation(params.ontologyId, {
								sourceInstanceId: params.instanceId,
								targetInstanceId,
								type: relDef.relationType,
								sourceConceptId: params.conceptId,
								targetConceptId: relDef.relatedConceptId,
							});
							updatedRelations.push(relation);
						} catch (relErr) {
							updatedRelations.push({ error: String(relErr), fieldName, targetInstanceId });
						}
					}
				}
			}

			sendProgress(ctx, "完成", 1);
			return successResult({ success: true, instance: updated, relations: updatedRelations });
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: delete_instance
// ============================================================================

const DeleteInstanceParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	conceptId: Type.String({ minLength: 1, description: "所属概念的 ID。如不确定可用值，先调用 list_concepts 获取，不要自己生成。" }),
	instanceId: Type.String({ minLength: 1, description: "要删除的实例 ID。操作不可逆，确认无误再执行。" }),
});

const DeleteInstanceTool: ToolRegistration = {
	name: "delete_instance",
	label: "删除实例（数据层）",
	description: "【本体实例层】永久删除指定实例数据记录，操作不可逆。返回 JSON：{ success, message }；失败时 { success: false, error }。",
	parameters: DeleteInstanceParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof DeleteInstanceParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "delete_instance", signal, onUpdate);
		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);
			await store.deleteInstance(params.ontologyId, params.conceptId, params.instanceId);
			return successResult({ success: true, message: `实例 ${params.instanceId} 已删除` });
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: query_instances
// ============================================================================

const QueryInstancesParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	conceptId: Type.String({ minLength: 1, description: "要查询的概念 ID。如不确定可用值，先调用 list_concepts 获取，不要自己生成。" }),
	filters: Type.Object({}, { additionalProperties: true, optional: true, description: "按字段过滤，例如 { status: 'active' }。字段名对应实例的 fields 对象的键。" }),
	page: Type.Number({ optional: true, description: "分页页码，1-based，默认 1" }),
	limit: Type.Number({ optional: true, description: "每页数量，默认 20，最大 100" }),
	sortBy: Type.String({ optional: true, description: "排序字段名，对应 fields 中的键" }),
	sortOrder: Type.Union([Type.Literal("asc"), Type.Literal("desc")], { optional: true, description: "排序方向：asc 升序 / desc 降序，默认 asc" }),
});

const QueryInstancesTool: ToolRegistration = {
	name: "query_instances",
	label: "查询实例列表（数据层）",
	description: "【本体实例层】查询指定概念下的实例数据列表（实际业务记录），支持字段过滤、排序、分页。每个实例会附带 `relations` 字段，列出该实例参与的所有实例关系（source 和 target 两侧），无需单独查询关系。如需查看概念的结构定义请使用 query_ontology 或 get_concept_schema。返回 JSON：{ success, result: { items[{ ...instance, relations[] }], total, page, limit } }；失败时 { success: false, error }。",
	parameters: QueryInstancesParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof QueryInstancesParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "query_instances", signal, onUpdate);
		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);
			sendProgress(ctx, `查询实例: ${params.conceptId}`, 0.4);

			const result = await queryEngine.queryInstances(
				params.ontologyId,
				params.conceptId,
				{
					filters: params.filters,
					page: params.page,
					limit: params.limit,
					sortBy: params.sortBy,
					sortOrder: params.sortOrder,
				}
			);

			sendProgress(ctx, "加载关系数据...", 0.8);

			// 附带实例关系（批量一次性加载，避免 N+1）
			let allRelations: Array<{ id: string; sourceInstanceId: string; targetInstanceId: string; type: string; sourceConceptId: string; targetConceptId: string }> = [];
			try {
				const relationData = await listInstanceRelations(params.ontologyId);
				allRelations = relationData.relations;
			} catch {
				// 关系加载失败不影响主查询结果
			}

			const instanceIds = new Set(result.items.map((i) => i.id));
			const itemsWithRelations = result.items.map((item) => ({
				...item,
				relations: allRelations.filter(
					(r) => instanceIds.has(r.sourceInstanceId) && r.sourceInstanceId === item.id
						|| instanceIds.has(r.targetInstanceId) && r.targetInstanceId === item.id
				),
			}));

			sendProgress(ctx, `查询完成: ${result.total} 条结果`, 1);
			return successResult({ success: true, result: { ...result, items: itemsWithRelations } });
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: get_concept_schema
// ============================================================================

const GetConceptSchemaParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
	conceptId: Type.String({ minLength: 1, description: "概念的 ID。如不确定可用值，先调用 list_concepts 获取，不要自己生成。" }),
});

const GetConceptSchemaTool: ToolRegistration = {
	name: "get_concept_schema",
	label: "获取概念 Schema（结构层）",
	description: "【本体结构层】获取指定概念的字段定义和类型约束（schema），用于在 create_instance / update_instance 前确认 fields 结构。返回 JSON：{ success, schema: { fields: [{ name, type, required, ... }] } }；失败时 { success: false, error }。",
	parameters: GetConceptSchemaParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof GetConceptSchemaParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "get_concept_schema", signal, onUpdate);
		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);

			const schema = await schemaValidator.loadConceptSchema(params.ontologyId, params.conceptId);
			return successResult({ success: true, schema });
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 工具: list_concepts
// ============================================================================

const ListConceptsParamsSchema = Type.Object({
	ontologyId: Type.String({ minLength: 1, description: "项目的本体 ID，形如 `ontology-{projectId}`。从 projectContext 或【协作上下文】获取，不要自己生成。" }),
});

const ListConceptsTool: ToolRegistration = {
	name: "list_concepts",
	label: "列出概念（结构层）",
	description: "【本体结构层】列出本体中的概念定义列表（schema），可按领域过滤。适合在不知道 conceptId 时先探索可用概念。如需查询概念下的实例数据请使用 query_instances。返回 JSON：{ success, concepts: [{ id, name, type, domainId, ... }], count }；失败时 { success: false, error }。",
	parameters: ListConceptsParamsSchema,
	category: "ontology",
	enabled: true,
	async execute(
		toolCallId: string,
		params: Static<typeof ListConceptsParamsSchema>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<unknown>
	): Promise<AgentToolResult<unknown>> {
		const ctx = createToolContext(toolCallId, "list_concepts", signal, onUpdate);
		try {
			logToolStart(ctx, params);
			checkAbort(ctx.signal);

			const concepts = await import('../../ontology-data-store').then(
				(m) => m.listConcepts(params.ontologyId)
			);

			return successResult({ success: true, concepts, count: concepts.length });
		} catch (error) {
			return errorResult(ctx, error);
		}
	},
};

// ============================================================================
// 导出所有数据工具
// ============================================================================

export const ontologyDataTools: ToolRegistration[] = [
	CreateInstanceTool,
	GetInstanceTool,
	UpdateInstanceTool,
	DeleteInstanceTool,
	QueryInstancesTool,
	GetConceptSchemaTool,
	ListConceptsTool,
];
