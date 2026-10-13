/**
 * 本体操作工具 — 本体结构查询与写入
 *
 * 结构层写工具（create_domain / create_concept）经 CanonicalOntologyAuthoringService
 * 提交 canonical authoring 命令（permissions → expectedRevision CAS → operationId 幂等
 * → validator 全量校验 → 原子写 + JSONL 审计），不再写 legacy 本体文件；
 * 项目尚无 canonical 快照时返回 MIGRATION_REQUIRED（提示走 Desktop 显式迁移）。
 * 只读工具继续经 ontology-data-store 读取（读路径统一属 ONT.8）。
 */

import { randomUUID } from "crypto";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { ToolRegistration } from "../../../integrations/pi-agent/types";
import type { AgentToolResult, AgentToolUpdateCallback } from "@originos/pi-agent-adapter";

import * as ontologyOps from '../../ontology-data-store';
import { projectIdFromOntologyId } from '../../ontology-data-store/config';
import {
	CANONICAL_ONTOLOGY_AUTHOR_PERMISSION,
	CanonicalOntologyAuthoringService,
	CanonicalOntologyStore,
	getCanonicalOntologyAuthoringRevision,
	type CanonicalOntology,
	type CanonicalOntologyAuthoringCommand,
	type CanonicalOntologyAuthoringReceipt,
	type CanonicalValidationIssue,
} from '../../ontology';

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
// Canonical authoring 辅助（结构层写工具专用）
// ============================================================================

export interface StructuredToolError {
	code: string;
	message: string;
	details?: unknown;
}

export class AuthoringToolError extends Error {
	constructor(readonly structured: StructuredToolError) {
		super(structured.message);
		this.name = 'AuthoringToolError';
	}
}

export function structuredErrorResult(ctx: ToolExecutionContext, error: StructuredToolError): AgentToolResult<unknown> {
	logToolError(ctx, error);
	return {
		content: [{ type: "text" as const, text: JSON.stringify({
			success: false,
			error,
		}) }],
		details: undefined,
	};
}

export interface AuthoringContext {
	projectId: string;
	ontologyId: string;
	ontologyVersion: string;
	expectedRevision: number;
	ontology: CanonicalOntology;
}

/**
 * 解析 canonical authoring 上下文：projectId 由 ontologyId 剥前缀得到，
 * revision 在提交前即时读取（读-算-提交窗口内的冲突由 CAS 兜底，工具层重试一次）。
 * 项目尚无 canonical 快照时抛结构化 MIGRATION_REQUIRED（不触发自动迁移、不写 legacy）。
 */
export async function resolveAuthoringContext(ontologyId: string): Promise<AuthoringContext> {
	const projectId = projectIdFromOntologyId(ontologyId);
	const store = new CanonicalOntologyStore();
	const stored = await store.readOntology(projectId);
	if (!stored) {
		throw new AuthoringToolError({
			code: 'MIGRATION_REQUIRED',
			message: `项目 ${projectId} 尚无 canonical 本体快照，无法直接写入。请先在 Desktop 中通过「本体迁移」显式迁移生成 canonical 本体后再试；本工具不会写入旧版本体文件。`,
		});
	}
	return {
		projectId,
		ontologyId: stored.data.id,
		ontologyVersion: stored.data.version,
		expectedRevision: getCanonicalOntologyAuthoringRevision(stored.data),
		ontology: stored.data,
	};
}

function authoringIssueMessage(issues: readonly CanonicalValidationIssue[]): string {
	return issues
		.map((issueItem) => issueItem.path ? `${issueItem.code}（${issueItem.path}）：${issueItem.message}` : `${issueItem.code}：${issueItem.message}`)
		.join('；');
}

function authoringFailure(error: {
	code: string;
	message: string;
	details?: unknown;
}): AuthoringToolError {
	return new AuthoringToolError(error);
}

interface AuthoringSubmitOptions {
	/** 工具入参携带的 ontologyId（`ontology-{projectId}`），用于定位 canonical 快照。 */
	ontologyId: string;
	command: (
		context: AuthoringContext,
		operationId: string
	) => CanonicalOntologyAuthoringCommand;
}

/**
 * 提交 canonical authoring 命令：operationId 派生自真实工具调用（`tool-{toolCallId}`），
 * permissions 固定携带 `ontology:author`，audit.source 标注 `agent-tool`；
 * REVISION_CONFLICT 自动重试一次（重新 resolveAuthoringContext），仍冲突则结构化返回。
 */
export async function submitAuthoringCommand(
	options: AuthoringSubmitOptions & { toolCallId: string }
): Promise<{ receipt: CanonicalOntologyAuthoringReceipt; ontology: CanonicalOntology }> {
	const service = new CanonicalOntologyAuthoringService();
	const operationId = `tool-${options.toolCallId || `uncallable-${Date.now()}-${randomUUID().slice(0, 8)}`}`;

	const attempt = async (): Promise<
		{ receipt: CanonicalOntologyAuthoringReceipt; ontology: CanonicalOntology } | { conflict: true }
	> => {
		const context = await resolveAuthoringContext(options.ontologyId);
		const result = await service.execute(options.command(context, operationId));
		if (result.ok === true) return { receipt: result.receipt, ontology: result.ontology };
		if (result.issues.some((issueItem) => issueItem.code === 'REVISION_CONFLICT')) {
			return { conflict: true };
		}
		const issues: readonly CanonicalValidationIssue[] = result.issues;
		const codes = issues.map((issueItem) => issueItem.code);
		const code = codes.includes('OPERATION_CONFLICT')
			? 'OPERATION_CONFLICT'
			: codes[0] ?? 'AUTHORING_FAILED';
		throw authoringFailure({
			code,
			message:
				code === 'OPERATION_CONFLICT'
					? `本工具调用（operationId=${operationId}）与既有 authoring 记录冲突：同一 operationId 已被其他命令使用。请重试以获取新的工具调用。`
					: `canonical authoring 校验未通过：${authoringIssueMessage(issues)}`,
			details: issues,
		});
	};

	const first = await attempt();
	if (!('conflict' in first)) return first;

	// CAS 冲突自动重试一次：重新解析 revision 后再提交；仍冲突则结构化返回。
	const retried = await attempt();
	if ('conflict' in retried) {
		throw authoringFailure({
			code: 'REVISION_CONFLICT',
			message: `本体正在被其他会话并发修改，重试一次后仍存在版本冲突，请稍后重试。`,
		});
	}
	return retried;
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

			const { receipt, ontology: nextOntology } = await submitAuthoringCommand({
				toolCallId,
				ontologyId: params.ontologyId,
				command: (context, operationId) => {
					const now = new Date();
					const value = {
						id: `domain-${randomUUID()}`,
						name: params.domainName,
						description: params.description ?? "",
						createdAt: now,
						updatedAt: now,
					};
					return {
						type: 'domain.create' as const,
						projectId: context.projectId,
						ontologyId: context.ontologyId,
						ontologyVersion: context.ontologyVersion,
						expectedRevision: context.expectedRevision,
						operationId,
						permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION],
						audit: { source: 'agent-tool' as const, toolCallId: toolCallId || null, tool: 'create_domain' },
						value,
					} satisfies CanonicalOntologyAuthoringCommand;
				},
			});

			sendProgress(ctx, "领域创建完成", 1);

			const createdDomain = [...nextOntology.domains]
				.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
				.find((item) => item.name === params.domainName);
			const result = {
				success: true,
				domain: createdDomain
					? { id: createdDomain.id, name: createdDomain.name, description: createdDomain.description }
					: { name: params.domainName },
				ontologyId: params.ontologyId,
				revision: receipt.summary.revision,
				message: `领域 "${params.domainName}" 已创建`,
			};
			return successResult(ctx, result);
		} catch (error) {
			return toToolResultError(ctx, error);
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

			const { receipt, ontology: nextOntology } = await submitAuthoringCommand({
				toolCallId,
				ontologyId: params.ontologyId,
				command: (context, operationId) => {
					const now = new Date();
					const value = {
						id: `concept-${randomUUID()}`,
						domainId: params.domainId,
						name: params.conceptName,
						type: params.conceptType,
						attributes: {},
						...(params.description ? { description: params.description } : {}),
						createdAt: now,
						updatedAt: now,
					};
					return {
						type: 'concept.create' as const,
						projectId: context.projectId,
						ontologyId: context.ontologyId,
						ontologyVersion: context.ontologyVersion,
						expectedRevision: context.expectedRevision,
						operationId,
						permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION],
						audit: { source: 'agent-tool' as const, toolCallId: toolCallId || null, tool: 'create_concept' },
						value,
					} satisfies CanonicalOntologyAuthoringCommand;
				},
			});

			sendProgress(ctx, "概念创建完成", 1);

			const createdConcept = [...nextOntology.concepts]
				.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
				.find((item) => item.name === params.conceptName && item.domainId === params.domainId);
			const result = {
				success: true,
				concept: createdConcept
					? { id: createdConcept.id, name: createdConcept.name, type: createdConcept.type, domainId: createdConcept.domainId }
					: { name: params.conceptName, type: params.conceptType, domainId: params.domainId },
				ontologyId: params.ontologyId,
				revision: receipt.summary.revision,
				message: `概念 "${params.conceptName}" 已创建`,
			};
			return successResult(ctx, result);
		} catch (error) {
			return toToolResultError(ctx, error);
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
// 错误出口映射
// ============================================================================

/**
 * 统一错误出口：AuthoringToolError（结构化 code/message/details）映射为
 * `{ success:false, error:{ code, message, details? } }`；其他异常保持既有
 * `{ success:false, error: string }` 形状不变。
 */
export function toToolResultError(ctx: ToolExecutionContext, error: unknown): AgentToolResult<unknown> {
	if (error instanceof AuthoringToolError) {
		return structuredErrorResult(ctx, error.structured);
	}
	return errorResult(ctx, error);
}

// ============================================================================
// 导出所有本体工具
// ============================================================================

export const ontologyTools: ToolRegistration[] = [
	QueryOntologyTool,
	CreateDomainTool,
	CreateConceptTool,
	SearchOntologyTool,
];
