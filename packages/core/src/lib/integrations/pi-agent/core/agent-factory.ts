/**
 * OriginOS Agent 工厂——`createOriginOSAgent` 模型选择/凭证装配与参数、会话数据类型。
 */

import type {
	AgentMessage,
	ThinkingLevel,
} from "@originos/pi-agent-adapter";
import type { Model } from "@originos/pi-agent-adapter/ai";
import type {
	OriginOSAgentConfig,
} from "../types";
import type { ProjectContext } from "../system/config";
import type { SystemPromptVariables } from "../system/prompt";
import type { HealthMonitor } from "../health";
import {
	createAnthropicModel,
	createGoogleModel,
	createAutoModel,
	createRuntimeModel,
	getConfigStatus,
	sanitizeBaseUrlForLogging,
} from "../server-config";
import type { RuntimeLLMConfig } from "../llm-config";
import { resolveEmptyStopRecoveryEnabled } from "./skill-empty-stop-recovery";
import { logInfo } from "./agent-internals";

/**
 * Agent 类构造器由调用方（agent.ts）以参数注入（D4 传参注入预案），
 * factory 不持有任何对 agent.ts 的 import（含 type-only），保证单向依赖与零 madge 环。
 */

/**
 * 会话数据
 */
export interface SessionData {
	sessionId: string;
	messages: AgentMessage[];
	systemPrompt: string;
	model: {
		provider: string;
		id: string;
	};
	createdAt: number;
	updatedAt: number;
	projectContext?: ProjectContext;
}

/**
 * 创建 OriginOS Agent 的工厂函数
 */
export interface CreateOriginOSAgentParams {
	/**
	 * 会话ID
	 */
	sessionId: string;

	/**
	 * 系统提示词
	 */
	systemPrompt?: string;

	/** Frozen context injected only for model requests, never persisted as transcript. */
	sessionContext?: string;

	/**
	 * 系统提示词变量
	 */
	variables?: SystemPromptVariables;

	/**
	 * 模型（可选）
	 */
	model?: Model<any>;

	/**
	 * 思考级别（可选）
	 */
	thinkingLevel?: ThinkingLevel;

	/**
	 * 是否使用基础模型（降级选项）
	 */
	useBaseModel?: boolean;

	/**
	 * 代理自带的健康监控器（可选）
	 */
	healthMonitor?: HealthMonitor;

	/**
	 * 运行时 LLM 配置（可选，覆盖环境变量）
	 */
	llmConfig?: RuntimeLLMConfig;

	/**
	 * Agent session type. Only skill sessions receive deterministic empty-stop
	 * recovery by default.
	 */
	agentType?: string;

	/** Explicit override for skill empty-stop recovery. */
	emptyStopRecoveryEnabled?: boolean;
}

/**
 * 创建未初始化的 OriginOS Agent 实例（internal）。
 * 构造器由调用方（agent.ts 包装函数）传参注入（D4 传参注入预案），
 * factory 不持有任何对 agent.ts 的 import（含 type-only），保证单向依赖与零 madge 环。
 */
export function createOriginOSAgent<T>(
	params: CreateOriginOSAgentParams,
	ctor: new (config: OriginOSAgentConfig, healthMonitor?: HealthMonitor) => T,
): T {
	const { sessionId, variables, model, thinkingLevel, useBaseModel, healthMonitor, llmConfig, emptyStopRecoveryEnabled, agentType } =
		params;

	// 获取配置状态
	const configStatus = getConfigStatus();

	// 调试日志
	logInfo('[createOriginOSAgent] Config status:', configStatus);
	logInfo('[createOriginOSAgent] Environment:', {
		hasAnthropicAuthToken: !!process.env['ANTHROPIC_AUTH_TOKEN'],
			anthropicBaseUrl: sanitizeBaseUrlForLogging(process.env['ANTHROPIC_BASE_URL']),
		anthropicModel: process.env['ANTHROPIC_MODEL'],
	});

	// 根据 provider 和配置选择模型
	let agentModel: Model<any>;
	const modelOptions = llmConfig?.maxTokens ? { maxTokens: llmConfig.maxTokens } : undefined;

	if (model) {
		// 用户明确指定了模型
		agentModel = model;
	} else if (llmConfig) {
		// 用户运行时配置优先级最高，不通过 process.env 间接传递
		agentModel = createRuntimeModel(llmConfig);
	} else if (useBaseModel || configStatus.defaultProvider === "google") {
		// 使用 Google 模型作为基础模型或备选
		agentModel = createGoogleModel("gemini-2.5-flash-preview-05-20");
	} else if (configStatus.llmProvider === "azure-openai" || configStatus.defaultProvider === "azure") {
		// Azure OpenAI 直连（显式设置或检测到配置）
		agentModel = createAutoModel(undefined, modelOptions);
	} else if (configStatus.useOpenAICompatible) {
		// 使用 OpenAI 兼容 API（自动检测或显式配置）
		agentModel = createAutoModel(undefined, modelOptions);
	} else if (configStatus.hasAnthropicKey) {
		// 使用 Anthropic 模型，支持自定义 baseUrl 和模型 ID
		agentModel = createAnthropicModel(); // 不传 modelId，让函数从环境变量获取
	} else {
		// 默认使用自动选择
		agentModel = createAutoModel(undefined, modelOptions);
	}

	// 确保 maxTokens 被应用（兜底）
	if (llmConfig?.maxTokens && agentModel) {
		agentModel.maxTokens = llmConfig.maxTokens;
	}

	// 调试：查看创建的模型配置
	const debugCredential = (agentModel as any).apiKey || (agentModel as any).authToken;
	logInfo('[createOriginOSAgent] Created model:', {
		id: agentModel.id,
		api: agentModel.api,
		provider: agentModel.provider,
			baseUrl: sanitizeBaseUrlForLogging((agentModel as any).baseUrl),
		hasCredential: !!debugCredential,
		credentialSource: (agentModel as any).credentialSource || (llmConfig?.anthropicAuthToken || llmConfig?.authToken
			? 'user.anthropicAuthToken'
			: llmConfig?.anthropicApiKey || llmConfig?.apiKey
				? 'user.anthropicApiKey'
				: 'env/default'),
			credentialAuthMode: (agentModel as any).credentialAuthMode || (debugCredential?.includes?.('sk-ant-oat') ? 'oauth' : 'api-key'),
		});

	const projectContext = variables
		? {
				projectId: variables.projectId || "default",
				ontologyId: variables.ontologyId,
				projectName: variables.projectName,
				currentPath: variables.projectPath,
				userId: variables.userId,
			}
		: { projectId: "default" };

	const systemPrompt =
		params.systemPrompt ||
		(variables
			? `You are OriginOS AI assistant. You are working on project: ${variables.projectName || "unnamed"}`
			: "You are OriginOS AI assistant.");

	const config: OriginOSAgentConfig = {
		sessionId,
		systemPrompt,
		sessionContext: params.sessionContext,
		model: agentModel,
		projectContext,
		thinkingLevel: (thinkingLevel || "low") as OriginOSAgentConfig['thinkingLevel'],
		tools: [],
		emptyStopRecoveryEnabled: resolveEmptyStopRecoveryEnabled(agentType, emptyStopRecoveryEnabled),
	};

	// 返回未初始化的 Agent 实例，用户需要调用 start() 方法（构造器经参数注入）
	return new ctor(config, healthMonitor);
}
