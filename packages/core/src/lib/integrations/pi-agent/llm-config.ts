export type RuntimeLLMFieldMapping = Record<string, string>;

/**
 * 思考强度配置。与 adapter 的 ThinkingLevel 对齐（此处收窄到 5 档，
 * xhigh/max 为极端档位，不对用户开放）。"off" 表示关闭思考模式。
 */
export type RuntimeThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

const RUNTIME_THINKING_LEVELS: readonly RuntimeThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];

export function normalizeRuntimeThinkingLevel(value?: unknown): RuntimeThinkingLevel | undefined {
  return typeof value === "string" && (RUNTIME_THINKING_LEVELS as readonly string[]).includes(value)
    ? (value as RuntimeThinkingLevel)
    : undefined;
}

export interface RuntimeLLMConfig {
  enabled?: boolean;
  provider?: string;
  anthropicAuthToken?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  anthropicCredentialSource?: "anthropicAuthToken" | "anthropicApiKey" | "authToken" | "apiKey";
  authToken?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  thinkingLevel?: RuntimeThinkingLevel;
  mapping?: RuntimeLLMFieldMapping;
}

export type AnthropicCredentialSource = "anthropicAuthToken" | "anthropicApiKey" | "authToken" | "apiKey";

export function normalizeRuntimeLLMConfig(
  config?: RuntimeLLMConfig | null,
): RuntimeLLMConfig | undefined {
  if (!config) return undefined;
  if (config.enabled === false) return undefined;

  const provider =
    config.provider === 'openai'
      ? 'openai-compatible'
      : config.provider?.trim() || undefined;
  const baseUrl = (provider === 'anthropic'
    ? config.anthropicBaseUrl || config.baseUrl
    : config.baseUrl
  )?.trim() || undefined;
  const anthropicAuthToken = normalizeCredentialString(config.anthropicAuthToken);
  const anthropicApiKey = normalizeCredentialString(config.anthropicApiKey);
  const legacyAuthToken = normalizeCredentialString(config.authToken);
  const legacyApiKey = normalizeCredentialString(config.apiKey);
  const explicitSource = provider === 'anthropic'
    ? config.anthropicCredentialSource
    : undefined;
  const authToken = provider === 'anthropic'
    ? explicitSource === 'anthropicApiKey' || explicitSource === 'apiKey'
      ? legacyAuthToken
      : anthropicAuthToken || legacyAuthToken
    : legacyAuthToken;
  const apiKey = provider === 'anthropic'
    ? explicitSource === 'anthropicAuthToken' || explicitSource === 'authToken'
      ? legacyApiKey
      : anthropicApiKey || legacyApiKey
    : legacyApiKey;
  const model = config.model?.trim() || undefined;
  const maxTokens = config.maxTokens && Number.isFinite(config.maxTokens)
    ? config.maxTokens
    : undefined;
  const thinkingLevel = normalizeRuntimeThinkingLevel(config.thinkingLevel);
  const mapping = normalizeRuntimeLLMFieldMapping(config.mapping);

  if (!provider && !baseUrl && !authToken && !apiKey && !model && !maxTokens && !thinkingLevel && !mapping) {
    return undefined;
  }

  return {
    ...(provider ? { provider } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(provider === 'anthropic' && baseUrl ? { anthropicBaseUrl: baseUrl } : {}),
    ...(authToken ? { authToken } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(provider === 'anthropic' && typeof config.anthropicAuthToken === 'string'
      ? { anthropicAuthToken }
      : {}),
    ...(provider === 'anthropic' && typeof config.anthropicApiKey === 'string'
      ? { anthropicApiKey }
      : {}),
    ...(provider === 'anthropic'
      ? {
          anthropicCredentialSource:
            explicitSource
            || (typeof config.anthropicAuthToken === 'string'
              ? 'anthropicAuthToken'
              : typeof config.anthropicApiKey === 'string'
                ? 'anthropicApiKey'
                : authToken
                  ? 'authToken'
                  : apiKey
                    ? 'apiKey'
                    : undefined),
        }
      : {}),
    ...(model ? { model } : {}),
    ...(maxTokens ? { maxTokens } : {}),
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(mapping ? { mapping } : {}),
  };
}

export function normalizeRuntimeLLMFieldMapping(
  mapping?: RuntimeLLMFieldMapping | null,
): RuntimeLLMFieldMapping | undefined {
  if (!mapping || typeof mapping !== 'object') return undefined;
  const entries = Object.entries(mapping)
    .map(([source, target]) => [source.trim(), target.trim()] as const)
    .filter(([source, target]) => source.length > 0 && target.length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

export function normalizeCredentialString(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return stripBearerPrefix(trimmed);

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const candidate = extractCredentialValue(parsed);
    return candidate ? stripBearerPrefix(candidate) : stripBearerPrefix(trimmed);
  } catch {
    return stripBearerPrefix(trimmed);
  }
}

function extractCredentialValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const enabledEntry = value.find((item) => {
      return Boolean(item)
        && typeof item === 'object'
        && 'enabled' in item
        && (item as { enabled?: unknown }).enabled !== false;
    });
    return extractCredentialValue(enabledEntry ?? value[0]);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['value'] === 'string') return record['value'];
    if (typeof record['apiKey'] === 'string') return record['apiKey'];
    if (typeof record['authToken'] === 'string') return record['authToken'];
    if (typeof record['key'] === 'string') return record['key'];
  }
  return undefined;
}

function stripBearerPrefix(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, '').trim();
}

export function runtimeLLMConfigToWorkerModel(
  config?: RuntimeLLMConfig | null,
): (RuntimeLLMConfig & { id?: string }) | undefined {
  const normalized = normalizeRuntimeLLMConfig(config);
  if (!normalized) return undefined;

  return {
    ...normalized,
    ...(normalized.model ? { id: normalized.model } : {}),
  };
}
