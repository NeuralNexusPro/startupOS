/**
 * Pi Agent 服务端配置
 * 仅在服务端使用，包含 @originos/pi-agent-adapter/ai 的模型创建功能
 *
 * 注意：此模块只能在服务端使用（API Routes, Server Components 等）
 */

import type { Model } from "@originos/pi-agent-adapter/ai";
import { getModel } from "@originos/pi-agent-adapter/ai";
import {
	getAnthropicApiKey,
	getAnthropicApiKeySource,
	getAnthropicBaseUrl,
	getGoogleApiKey,
	getAnthropicModelId,
	shouldUseOpenAICompatible,
	getConfigStatus,
	DEFAULT_MODEL_CONFIG,
	getLLMMaxTokens,
	// Azure
	getAzureApiKey,
	getAzureResourceName,
	getAzureBaseUrl,
	getAzureDeploymentName,
	getAzureApiVersion,
	getAzureApiFormat,
} from "./config";
import type { RuntimeLLMConfig, RuntimeLLMFieldMapping } from "./llm-config";
import { normalizeRuntimeLLMConfig, normalizeRuntimeLLMFieldMapping } from "./llm-config";

export function sanitizeBaseUrlForLogging(value: unknown): string | undefined {
	if (typeof value !== "string" || !value.trim()) {
		return undefined;
	}
	try {
		return new URL(value).origin;
	} catch {
		return "configured";
	}
}

// ============================================================================
// 模型创建（服务端专用）
// ============================================================================

/**
 * 创建 Anthropic 模型配置
 * 仅在服务端使用
 */
export function createAnthropicModel(
	modelId?: string,
	options?: { baseUrl?: string; apiKey?: string; credentialSource?: string; credentialAuthMode?: "oauth" | "bearer" | "api-key" }
): Model<"anthropic-messages"> {
	const actualModelId = modelId || getAnthropicModelId() || DEFAULT_MODEL_CONFIG.anthropic.defaultModel;
	const baseUrl = options?.baseUrl || getAnthropicBaseUrl();
	const apiKey = options?.apiKey || getAnthropicApiKey();
	const credentialSource = options?.credentialSource || (options?.apiKey ? "runtime.options.apiKey" : getAnthropicApiKeySource());
	let baseModel: Model<"anthropic-messages"> | undefined;
	try {
		baseModel = getModel("anthropic", actualModelId as any) as Model<"anthropic-messages">;
	} catch {
		// Upstream 0.80 throws for registry misses. OriginOS supports custom model IDs,
		// so a miss must continue through the existing custom-model fallback.
		baseModel = undefined;
	}

	// 如果模型不在注册表中（自定义模型名如 GLM），创建自定义模型配置
	if (!baseModel) {
		const customModel = {
			id: actualModelId,
			name: actualModelId,
			api: "anthropic-messages",
			provider: "anthropic",
			...(baseUrl && { baseUrl }),
			...(apiKey && { apiKey }),
			// API key 认证时显式禁用 authToken，防止 SDK 从环境变量读取 ANTHROPIC_AUTH_TOKEN
			authToken: null,
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16384,
		} as Model<"anthropic-messages">;
		return applyAnthropicCredentialMetadata(customModel, apiKey, credentialSource);
	}

	if (baseUrl || apiKey) {
		const model = { ...baseModel, ...(baseUrl && { baseUrl }), ...(apiKey && { apiKey }), authToken: null } as Model<"anthropic-messages">;
		return applyAnthropicCredentialMetadata(model, apiKey, credentialSource);
	}

	return baseModel;
}

function applyAnthropicCredentialMetadata<TApi extends "anthropic-messages">(
	model: Model<TApi>,
	credential?: string,
	source?: string
): Model<TApi> {
	if (!credential) return model;
	// 优先用 token 值判断：sk-ant-oat 开头才是真正的 OAuth token
	// source 字符串不可靠（env.ANTHROPIC_AUTH_TOKEN 可能是普通 bearer token）
	const isOAuth = credential.startsWith("sk-ant-oat");
	const credentialAuthMode = isAnthropicAuthTokenSource(source)
		? "bearer"
		: isOAuth
			? "oauth"
			: "api-key";
	const shouldUseAuthToken = credentialAuthMode === "bearer" || credentialAuthMode === "oauth";
	return {
		...model,
		apiKey: shouldUseAuthToken ? null : credential,
		authToken: shouldUseAuthToken ? credential : null,
		credentialSource: source || "unknown",
		credentialAuthMode,
	} as Model<TApi> & {
		apiKey: string | null;
		authToken: string | null;
		credentialSource: string;
		credentialAuthMode: "oauth" | "bearer" | "api-key";
	};
}

function isAnthropicAuthTokenSource(source?: string): boolean {
	if (!source) return false;
	const normalized = source.toLowerCase().replace(/_/g, "");
	return normalized.endsWith("anthropicauthtoken")
		|| normalized.endsWith("authtoken")
		|| normalized.endsWith("anthropicoauthtoken");
}

function isAnthropicApiKeySource(source?: string): boolean {
	if (!source) return false;
	const normalized = source.toLowerCase().replace(/_/g, "");
	return normalized.endsWith("anthropicapikey")
		|| normalized.endsWith("apikey");
}

/**
 * 创建 OpenAI 兼容模型配置
 * 用于支持 OpenAI API 兼容的路由服务（如 GLM、Qwen 等）
 */
export function createOpenAICompatibleModel(
	modelId?: string,
	options?: { baseUrl?: string; apiKey?: string; mapping?: RuntimeLLMFieldMapping }
): Model<"openai-completions"> {
	const actualModelId = modelId || getAnthropicModelId() || "glm-4.7-no-think";
	let baseUrl = options?.baseUrl || getAnthropicBaseUrl() || "";
	// Ensure base URL includes /v1 prefix so the OpenAI SDK's /chat/completions
	// append results in /v1/chat/completions
	if (baseUrl && !baseUrl.includes("/v1")) {
		baseUrl = `${baseUrl.replace(/\/$/, "")}/v1`;
	}
	const apiKey = options?.apiKey || getAnthropicApiKey();
	const isGatewayGlmAlias = detectGatewayGlmAlias(actualModelId);
	const thinkingFormat = isGatewayGlmAlias
		? "openai"
		: detectOpenAICompatibleThinkingFormat(actualModelId);
	const supportsReasoningEffort = isGatewayGlmAlias;
	const supportsThinkingControl = thinkingFormat !== "openai" || supportsReasoningEffort;

	const openAIModel: Model<"openai-completions"> = {
		id: actualModelId,
		name: actualModelId,
		api: "openai-completions",
		provider: "openai",
		baseUrl: baseUrl,
		// `reasoning` controls whether pi-ai emits the provider-specific thinking
		// switch. Marking every custom model as false made the UI say "off" while
		// omitting the actual disable field from GLM/Qwen/DeepSeek requests.
		reasoning: supportsThinkingControl,
		input: ["text"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 128000,
		maxTokens: 16384,
		...(apiKey && { apiKey }),
		compat: {
			supportsUsageInStreaming: true,
			maxTokensField: "max_tokens",
			supportsReasoningEffort,
			supportsStore: false,
			supportsDeveloperRole: false,
			requiresToolResultName: false,
			requiresAssistantAfterToolResult: false,
			requiresThinkingAsText: false,
			thinkingFormat,
		},
		...(isGatewayGlmAlias && {
			// The enterprise OpenAI-compatible GLM route resolves to GLM 5.3 and
			// ignores Z.AI's `thinking.type=disabled`. Its supported control is
			// `reasoning_effort`; map the UI's off state to the smallest direct-answer
			// effort so hidden reasoning cannot consume the whole output budget.
			thinkingLevelMap: {
				off: "minimal",
				minimal: "minimal",
				low: "low",
				medium: "medium",
				high: "high",
			},
		}),
	};

	return applyRuntimeFieldMapping(openAIModel, options?.mapping);
}

/**
 * Select the request dialect used to explicitly enable/disable hidden thinking.
 * Keep unknown OpenAI-compatible models on the neutral dialect: sending a
 * vendor-only field to an unknown gateway can make otherwise valid calls fail.
 */
export function detectOpenAICompatibleThinkingFormat(
	modelId: string,
): "openai" | "zai" | "qwen" | "deepseek" {
	const normalized = modelId.trim().toLowerCase();
	if (normalized.includes("glm")) return "zai";
	if (normalized.includes("qwen")) return "qwen";
	if (normalized.includes("deepseek")) return "deepseek";
	return "openai";
}

export function detectGatewayGlmAlias(modelId: string): boolean {
	const normalized = modelId.trim().toLowerCase();
	return normalized.startsWith("ep-") && normalized.includes("glm");
}

function applyRuntimeFieldMapping<TApi extends "anthropic-messages" | "openai-completions" | "google" | "azure-openai-responses">(
	model: Model<TApi>,
	mapping?: RuntimeLLMFieldMapping | null,
): Model<TApi> {
	const normalized = normalizeRuntimeLLMFieldMapping(mapping);
	if (!normalized) return model;
	const modelWithCompat = model as unknown as { compat?: { maxTokensField?: string } };
	const maxTokensField = modelWithCompat.compat?.maxTokensField;
	if (!maxTokensField) return model;
	const mappedMaxTokensField = normalized[maxTokensField];
	if (!mappedMaxTokensField) return model;
	if (!modelWithCompat.compat) return model;
	modelWithCompat.compat.maxTokensField = mappedMaxTokensField;
	return model;
}

/**
 * 创建 Google 模型配置
 * 仅在服务端使用
 */
export function createGoogleModel(
	modelId: string = DEFAULT_MODEL_CONFIG.google.defaultModel,
	options?: { apiKey?: string }
): Model<"google"> {
	const apiKey = options?.apiKey || getGoogleApiKey();
	const baseModel = getModel("google", modelId as any) as Model<"google">;

	if (apiKey) {
		return { ...baseModel, apiKey } as unknown as Model<"google">;
	}

	return baseModel;
}

/**
 * 创建 Azure OpenAI 模型配置
 * 直连 Azure OpenAI Service，无需代理
 *
 * @param deploymentName Azure 部署名（如 gpt-4o、gpt-35-turbo 等）
 * @param options 可选覆盖配置
 */
export function createAzureModel(
	deploymentName?: string,
	options?: { apiKey?: string; resourceName?: string; baseUrl?: string; apiVersion?: string; apiFormat?: "responses" | "chat" }
): Model<"azure-openai-responses"> | Model<"openai-completions"> {
	const format = options?.apiFormat ?? getAzureApiFormat();
	if (format === "chat") {
		return createAzureChatModel(deploymentName, options);
	}

	const actualDeploymentName = deploymentName || getAzureDeploymentName();
	const apiKey = options?.apiKey || getAzureApiKey();
	const baseUrl = options?.baseUrl || getAzureBaseUrl();
	const apiVersion = options?.apiVersion || getAzureApiVersion();

	const baseModel = getModel("azure-openai-responses", actualDeploymentName as any);

	// 如果基础模型不存在，创建自定义
	if (!baseModel) {
		const customModel = {
			id: actualDeploymentName || "gpt-4o",
			name: actualDeploymentName || "gpt-4o",
			api: "azure-openai-responses",
			provider: "azure-openai-responses",
			...(baseUrl && { baseUrl }),
			...(apiKey && { apiKey }),
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16384,
			compat: {
				azureDeploymentName: actualDeploymentName,
				azureApiVersion: apiVersion,
			},
		} as unknown as Model<"azure-openai-responses">;
		return customModel;
	}

	// 否则覆盖配置
	const model = { ...baseModel } as Model<"azure-openai-responses">;
	if (apiKey) (model as any).apiKey = apiKey;
	if (baseUrl) model.baseUrl = baseUrl;

	return model;
}

/**
 * 创建 Azure OpenAI Chat Completions 模型配置
 * 使用 /chat/completions 端点，兼容 gpt-35-turbo、gpt-4 等传统部署
 *
 * 适用场景：Azure 部署不支持 Responses API 时（如 gpt-chat 类型部署）
 *
 * @param deploymentName Azure 部署名
 * @param options 可选覆盖配置
 */
export function createAzureChatModel(
	deploymentName?: string,
	options?: { apiKey?: string; resourceName?: string; baseUrl?: string; apiVersion?: string }
): Model<"openai-completions"> {
	const actualDeploymentName = deploymentName || getAzureDeploymentName() || "gpt-4o";
	const apiKey = options?.apiKey || getAzureApiKey() || "";
	const apiVersion = options?.apiVersion || getAzureApiVersion() || "2024-02-01";

	// 构建 Azure Chat Completions baseUrl
	// 格式：https://{resource}.openai.azure.com/openai/deployments/{deployment}
	// OpenAI client 会自动追加 /chat/completions
	let baseUrl = options?.baseUrl || getAzureBaseUrl() || "";
	if (!baseUrl) {
		const resourceName = options?.resourceName || getAzureResourceName();
		if (resourceName) {
			baseUrl = `https://${resourceName}.openai.azure.com/openai/deployments/${actualDeploymentName}`;
		}
	} else {
		// 如果 baseUrl 不包含 /deployments/，追加部署名路径
		if (!baseUrl.includes("/deployments/")) {
			baseUrl = `${baseUrl.replace(/\/$/, "")}/openai/deployments/${actualDeploymentName}`;
		}
	}

	const chatModel = {
		id: actualDeploymentName,
		name: actualDeploymentName,
		api: "openai-completions",
		provider: "azure-openai",
		baseUrl: `${baseUrl}?api-version=${apiVersion}`,
		apiKey,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
		// Azure Chat Completions 用 api-key header 而非 Authorization: Bearer
		headers: { "api-key": apiKey },
		compat: {
			supportsUsageInStreaming: true,
			maxTokensField: "max_tokens",
			supportsReasoningEffort: false,
			supportsStore: false,
			supportsDeveloperRole: false,
			requiresToolResultName: false,
			requiresAssistantAfterToolResult: false,
			requiresThinkingAsText: false,
			requiresMistralToolIds: false,
			thinkingFormat: "openai",
		},
	};

	return chatModel as Model<"openai-completions">;
}

/**
 * 根据配置自动选择合适的模型
 * 优先使用 OpenAI 兼容 API 如果检测到需要
 */
export function createAutoModel(
	modelId?: string,
	options?: { baseUrl?: string; apiKey?: string; maxTokens?: number; mapping?: RuntimeLLMFieldMapping }
): Model<"anthropic-messages" | "openai-completions" | "google" | "azure-openai-responses"> {
	const configStatus = getConfigStatus();
	const maxTokens = options?.maxTokens ?? getLLMMaxTokens();

	let model: Model<"anthropic-messages" | "openai-completions" | "google" | "azure-openai-responses">;

	// 如果检测到需要 OpenAI 兼容 API
	if (configStatus.useOpenAICompatible || shouldUseOpenAICompatible()) {
		model = createOpenAICompatibleModel(modelId, options);
	}

	// Azure OpenAI 直连
	else if (configStatus.hasAzureConfig) {
		model = createAzureModel(modelId);
	}

	// 默认使用 Anthropic
	else if (configStatus.hasAnthropicKey) {
		model = createAnthropicModel(modelId, options);
	}

	// 回退到 Google
	else if (configStatus.hasGoogleKey) {
		model = createGoogleModel(modelId, options);
	}

	// 默认返回 Anthropic 配置
	else {
		model = createAnthropicModel(modelId, options);
	}

	// 应用 maxTokens 覆盖（环境变量或调用方指定）
	if (maxTokens) {
		model.maxTokens = maxTokens;
	}

	return model;
}

/**
 * 根据用户运行时配置显式创建模型。
 *
 * 这里不写入也不读取调用方传入字段对应的环境变量；用户配置字段优先级最高，
 * 只有未提供的字段才允许各 provider 创建函数回退到环境变量。
 */
export function createRuntimeModel(
	llmConfig: RuntimeLLMConfig
): Model<"anthropic-messages" | "openai-completions" | "google" | "azure-openai-responses"> {
	llmConfig = normalizeRuntimeLLMConfig(llmConfig) ?? llmConfig;
	const modelId = llmConfig.model?.trim() || undefined;
	const provider = llmConfig.provider;
	const anthropicCredentialSource = llmConfig.anthropicCredentialSource;
	const anthropicAuthToken = llmConfig.anthropicAuthToken?.trim() || llmConfig.authToken?.trim() || undefined;
	const anthropicApiKey = llmConfig.anthropicApiKey?.trim() || llmConfig.apiKey?.trim() || undefined;
	const hasAnthropicAuthToken = isAnthropicAuthTokenSource(anthropicCredentialSource);
	const hasAnthropicApiKey = isAnthropicApiKeySource(anthropicCredentialSource);
	const baseUrl = provider === "anthropic" || !provider
		? llmConfig.anthropicBaseUrl || llmConfig.baseUrl
		: llmConfig.baseUrl;
	// 始终传递凭证到 options.apiKey，确保 createAnthropicModel 在子进程环境变量
	// 被 strip 的情况下也能拿到有效 key（applyAnthropicCredentialMetadata 会后续
	// 按 credentialSource 重新分配 apiKey / authToken）。
	const anthropicOptionCredential = anthropicApiKey || anthropicAuthToken;
	const options = {
		...(baseUrl ? { baseUrl } : {}),
		...(provider === "anthropic" || !provider
			? {
					...(anthropicOptionCredential ? { apiKey: anthropicOptionCredential } : {}),
				}
			: {
					...(llmConfig.authToken?.trim() ? { apiKey: llmConfig.authToken.trim() } : {}),
					...(llmConfig.apiKey?.trim() ? { apiKey: llmConfig.apiKey.trim() } : {}),
				}),
		...(llmConfig.maxTokens ? { maxTokens: llmConfig.maxTokens } : {}),
		...(llmConfig.mapping ? { mapping: llmConfig.mapping } : {}),
	};
	const credential = provider === "anthropic" || !provider
		? anthropicAuthToken || anthropicApiKey
		: llmConfig.authToken?.trim() || llmConfig.apiKey?.trim() || undefined;

	let model: Model<"anthropic-messages" | "openai-completions" | "google" | "azure-openai-responses">;

	if (llmConfig.provider === "openai-compatible" || llmConfig.provider === "openai") {
		model = createOpenAICompatibleModel(modelId, options);
	} else if (llmConfig.provider === "azure-openai" || llmConfig.provider === "azure") {
		model = createAzureModel(modelId, {
			apiKey: credential,
			baseUrl,
		});
	} else if (llmConfig.provider === "google" || llmConfig.provider === "gemini") {
		model = createGoogleModel(modelId ?? DEFAULT_MODEL_CONFIG.google.defaultModel, {
			apiKey: credential,
		});
	} else if (llmConfig.provider === "anthropic" || !llmConfig.provider) {
		const anthropicModel = createAnthropicModel(modelId, options);
		const normalizedCredentialSource = hasAnthropicAuthToken
			? "anthropicAuthToken"
			: hasAnthropicApiKey
				? "anthropicApiKey"
				: getAnthropicApiKeySource();
		model = applyAnthropicCredentialMetadata(
			anthropicModel,
			anthropicAuthToken || anthropicApiKey,
			normalizedCredentialSource
		);
	} else {
		model = createAutoModel(modelId, options);
	}

	if (llmConfig.maxTokens) {
		model.maxTokens = llmConfig.maxTokens;
	}

	const debugModel = model as unknown as {
		id?: string;
		apiKey?: string;
		authToken?: string;
		baseUrl?: string;
	};

	const debugCredential = debugModel.apiKey || debugModel.authToken;
	if (process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"] !== "1") {
		console.info(`[createRuntimeModel] created model:`, {
			id: debugModel.id,
			hasCredential: !!debugCredential,
			authMode: debugModel.authToken ? "bearer" : "api-key",
			baseUrl: sanitizeBaseUrlForLogging(debugModel.baseUrl) ?? "default",
			provider: llmConfig.provider ?? "anthropic(default)",
		});
	}

	return model;
}

// Re-export types and utilities from config
export {
	getAnthropicApiKey,
	getAnthropicApiKeySource,
	getAnthropicBaseUrl,
	getGoogleApiKey,
	getAnthropicModelId,
	// Azure
	getAzureApiKey,
	getAzureResourceName,
	getAzureBaseUrl,
	getAzureDeploymentName,
	getAzureApiVersion,
	getAzureApiFormat,
	// Other
	getConfigStatus,
	validateConfig,
	injectBrowserConfig,
	shouldUseOpenAICompatible,
	getLLMMaxTokens,
	DEFAULT_MODEL_CONFIG,
	type PiAgentConfigStatus,
	type LLMProvider,
} from "./config";
