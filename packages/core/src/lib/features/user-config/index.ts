/**
 * 用户配置持久化
 *
 * 统一读写 data/user-config.json，desktop 端和 web 端共享同一份文件。
 * config.ts 的环境变量之上叠加此文件（文件优先级更高）。
 */

import { readUserConfig, writeUserConfig, type UserConfig, type UserLLMConfig } from '../../storage/user-config';
export { readUserConfig, writeUserConfig, type UserConfig, type UserLLMConfig, type UserPreferencesConfig } from '../../storage/user-config';
import { normalizeRuntimeLLMConfig, type RuntimeLLMConfig } from '../../integrations/pi-agent/llm-config';

export function readUserConfigWithProductDefaults(): UserConfig {
  const current = readUserConfig();
  if (current.llm) {
    return current;
  }

  const llm = readProductLLMConfigFromEnv();
  if (!llm) {
    return current;
  }

  return updateUserConfig({ llm });
}

function pruneNullish<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== null && fieldValue !== undefined)
  ) as T;
}

export function updateUserConfig(patch: Partial<UserConfig>): UserConfig {
  const current = readUserConfig();
  const llm = patch.llm ? pruneNullish({ ...current.llm, ...patch.llm }) : current.llm;
  const preferences = patch.preferences
    ? pruneNullish({ ...current.preferences, ...patch.preferences })
    : current.preferences;
  const updated: UserConfig = {
    ...current,
    ...patch,
    llm,
    preferences,
  };
  writeUserConfig(updated);
  return updated;
}

export function runtimeLLMConfigToUserLLMConfig(config?: RuntimeLLMConfig | null): UserLLMConfig | undefined {
  const normalized = normalizeRuntimeLLMConfig(config);
  if (!normalized) return undefined;

  const provider = normalized.provider;
  const isAnthropic = provider === 'anthropic' || !provider;
  const isOpenAICompatible = provider === 'openai-compatible' || provider === 'openai';

  return {
    enabled: normalized.enabled ?? true,
    ...(provider ? { provider } : {}),
    anthropicAuthToken: isAnthropic ? normalized.anthropicAuthToken ?? normalized.authToken ?? null : null,
    anthropicApiKey: isAnthropic ? normalized.anthropicApiKey ?? normalized.apiKey ?? null : null,
    anthropicBaseUrl: isAnthropic ? normalized.anthropicBaseUrl ?? normalized.baseUrl ?? null : null,
    anthropicCredentialSource: isAnthropic ? normalized.anthropicCredentialSource ?? null : null,
    authToken: isAnthropic ? normalized.authToken ?? normalized.anthropicAuthToken ?? null : null,
    apiKey: isOpenAICompatible ? normalized.apiKey ?? null : null,
    baseUrl: isOpenAICompatible ? normalized.baseUrl ?? null : null,
    ...(normalized.model ? { model: normalized.model } : {}),
    ...(normalized.maxTokens ? { maxTokens: normalized.maxTokens } : {}),
    ...(normalized.mapping ? { mapping: normalized.mapping } : {}),
  };
}

export function userLLMConfigToRuntimeLLMConfig(config?: UserLLMConfig | null): RuntimeLLMConfig | undefined {
  if (!config) return undefined;

  return normalizeRuntimeLLMConfig({
    enabled: config.enabled,
    provider: config.provider,
    anthropicAuthToken: config.anthropicAuthToken ?? undefined,
    anthropicApiKey: config.anthropicApiKey ?? undefined,
    anthropicBaseUrl: config.anthropicBaseUrl ?? undefined,
    anthropicCredentialSource: isAnthropicCredentialSource(config.anthropicCredentialSource)
      ? config.anthropicCredentialSource
      : undefined,
    authToken: config.authToken ?? undefined,
    apiKey: config.apiKey ?? undefined,
    baseUrl: config.baseUrl ?? undefined,
    model: config.model,
    maxTokens: config.maxTokens,
    mapping: config.mapping,
  });
}

export function persistRuntimeLLMConfig(config?: RuntimeLLMConfig | null): UserConfig | undefined {
  const llm = runtimeLLMConfigToUserLLMConfig(config);
  if (!llm) return undefined;
  return updateUserConfig({ llm });
}

function readProductLLMConfigFromEnv(): UserLLMConfig | undefined {
  const provider = normalizeProvider(process.env['LLM_PROVIDER']);
  const maxTokens = process.env['LLM_MAX_TOKENS'] ? parseInt(process.env['LLM_MAX_TOKENS'], 10) || undefined : undefined;

  if (provider === 'openai-compatible' || provider === 'openai') {
    const apiKey = readOptionalString(process.env['OPENAI_API_KEY']);
    const baseUrl = readOptionalString(process.env['OPENAI_BASE_URL']);
    const model = readOptionalString(process.env['OPENAI_MODEL']);
    if (!apiKey && !baseUrl && !model) {
      return undefined;
    }
    return pruneNullish({
      enabled: true,
      provider: 'openai-compatible',
      apiKey: apiKey ?? null,
      baseUrl: baseUrl ?? null,
      model: model ?? undefined,
      maxTokens,
    });
  }

  const anthropicAuthToken = readOptionalString(process.env['ANTHROPIC_AUTH_TOKEN'])
    ?? readOptionalString(process.env['ANTHROPIC_OAUTH_TOKEN']);
  const anthropicApiKey = readOptionalString(process.env['ANTHROPIC_API_KEY']);
  const anthropicBaseUrl = readOptionalString(process.env['ANTHROPIC_BASE_URL']);
  const model = readOptionalString(process.env['ANTHROPIC_MODEL']);

  if (!anthropicAuthToken && !anthropicApiKey && !anthropicBaseUrl && !model) {
    return undefined;
  }

  return pruneNullish({
    enabled: true,
    provider: 'anthropic',
    anthropicAuthToken: anthropicAuthToken ?? null,
    anthropicApiKey: anthropicAuthToken ? null : anthropicApiKey ?? null,
    anthropicBaseUrl: anthropicBaseUrl ?? null,
    anthropicCredentialSource: anthropicAuthToken
      ? 'anthropicAuthToken'
      : anthropicApiKey
        ? 'anthropicApiKey'
        : null,
    authToken: anthropicAuthToken ?? null,
    model: model ?? undefined,
    maxTokens,
  });
}

function normalizeProvider(provider?: string): string | undefined {
  if (provider === 'openai') return 'openai-compatible';
  if (provider === 'openai-compatible' || provider === 'anthropic') return provider;
  return undefined;
}

function readOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isAnthropicCredentialSource(value?: string | null): value is NonNullable<RuntimeLLMConfig['anthropicCredentialSource']> {
  return value === 'anthropicAuthToken'
    || value === 'anthropicApiKey'
    || value === 'authToken'
    || value === 'apiKey';
}
