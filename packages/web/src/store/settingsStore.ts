import { create } from 'zustand';
import { getUserConfig, setUserConfig } from '@originos/core/lib/integrations/electron/services/misc';
import type { AnthropicCredentialSource } from '@originos/core/lib/integrations/pi-agent/client';
import { normalizeRuntimeThinkingLevel, type RuntimeThinkingLevel } from '@originos/core/lib/integrations/pi-agent/llm-config';

export type LLMProviderType = 'anthropic' | 'openai';
export type UserLanguagePreference = 'zh-CN' | 'en-US' | 'ja-JP';

export interface ProviderConfig {
  enabled: boolean;
  baseUrl: string;
  authToken: string;
  apiKey: string;
  anthropicCredentialSource?: AnthropicCredentialSource;
  model: string;
  maxTokens: number;
  thinkingLevel: RuntimeThinkingLevel;
  mapping: Record<string, string>;
}

export interface LLMSettings {
  provider: LLMProviderType;
  anthropic: ProviderConfig;
  openai: ProviderConfig;
}

export interface UserPreferences {
  language: UserLanguagePreference;
}

export function hasUsableProviderConfig(config: ProviderConfig): boolean {
  const hasCredential = config.authToken.trim().length > 0 || config.apiKey.trim().length > 0;
  return config.enabled && hasCredential && config.model.trim().length > 0;
}

export function hasConfiguredLLM(settings: LLMSettings): boolean {
  return hasUsableProviderConfig(settings.anthropic) || hasUsableProviderConfig(settings.openai);
}

interface SettingsState {
  llm: LLMSettings;
  preferences: UserPreferences;
  setProvider: (provider: LLMProviderType) => void;
  updateConfig: (provider: LLMProviderType, config: Partial<ProviderConfig>) => void;
  setLanguage: (language: UserLanguagePreference) => void;
  saveLLMSettings: (settings: LLMSettings) => void;
  savePreferences: (preferences: UserPreferences) => void;
  getEffectiveConfig: () => ProviderConfig & { provider: LLMProviderType };
  loadFromServer: () => Promise<void>;
}

const STORAGE_KEY = 'originos-llm-settings';

function loadFromStorage(): LLMSettings {
  if (typeof window === 'undefined') {
    return getDefaultSettings();
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return normalizeSettings(JSON.parse(stored) as Partial<LLMSettings>);
    }
  } catch {}
  return getDefaultSettings();
}

function getDefaultSettings(): LLMSettings {
  return {
    provider: 'anthropic',
    anthropic: { enabled: false, baseUrl: '', authToken: '', apiKey: '', model: '', maxTokens: 16384, thinkingLevel: 'low', mapping: {} },
    openai: { enabled: false, baseUrl: '', authToken: '', apiKey: '', model: '', maxTokens: 16384, thinkingLevel: 'low', mapping: {} },
  };
}

function getDefaultPreferences(): UserPreferences {
  return {
    language: 'zh-CN',
  };
}

function normalizeSettings(settings?: Partial<LLMSettings>): LLMSettings {
  const defaults = getDefaultSettings();
  const provider = settings?.provider === 'openai' ? 'openai' : 'anthropic';
  const anthropic = normalizeProviderConfig({
    ...defaults.anthropic,
    ...settings?.anthropic,
  });
  const openai = normalizeProviderConfig({
    ...defaults.openai,
    ...settings?.openai,
  });

  return {
    provider,
    anthropic,
    openai,
  };
}

function normalizeProviderConfig(config: ProviderConfig): ProviderConfig {
  return {
    ...config,
    authToken: normalizeCredentialString(config.authToken) ?? '',
    apiKey: normalizeCredentialString(config.apiKey) ?? '',
    thinkingLevel: normalizeRuntimeThinkingLevel(config.thinkingLevel) ?? 'low',
    mapping: config.mapping && typeof config.mapping === 'object' ? config.mapping : {},
  };
}

function normalizeCredentialString(value?: string | null): string | undefined {
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

function saveToStorage(settings: LLMSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

function toServerProvider(provider: LLMProviderType): string {
  return provider === 'openai' ? 'openai-compatible' : 'anthropic';
}

function fromServerProvider(provider?: string): LLMProviderType | undefined {
  if (provider === 'openai' || provider === 'openai-compatible') return 'openai';
  if (provider === 'anthropic') return 'anthropic';
  return undefined;
}

function fromServerCredentialSource(source?: string | null): ProviderConfig["anthropicCredentialSource"] {
  if (
    source === "anthropicAuthToken" ||
    source === "anthropicApiKey" ||
    source === "authToken" ||
    source === "apiKey"
  ) {
    return source;
  }
  return undefined;
}

function getAnthropicCredentialSource(config: ProviderConfig): ProviderConfig["anthropicCredentialSource"] {
  if (config.authToken.trim()) return "anthropicAuthToken";
  if (config.apiKey.trim()) return "anthropicApiKey";
  return undefined;
}

function getEffectiveProvider(settings: LLMSettings): LLMProviderType {
  if (settings[settings.provider].enabled) return settings.provider;
  if (settings.anthropic.enabled) return 'anthropic';
  if (settings.openai.enabled) return 'openai';
  return settings.provider;
}

function persistToServer(settings: LLMSettings): void {
  const provider = getEffectiveProvider(settings);
  const effective = settings[provider];
  setUserConfig({
    llm: {
      enabled: effective.enabled,
      provider: toServerProvider(provider),
      anthropicAuthToken: provider === 'anthropic' ? effective.authToken || null : null,
      anthropicApiKey: provider === 'anthropic' ? effective.apiKey || null : null,
      anthropicBaseUrl: provider === 'anthropic' ? effective.baseUrl || null : null,
      anthropicCredentialSource: provider === 'anthropic' ? getAnthropicCredentialSource(effective) ?? null : null,
      authToken: provider === 'anthropic' ? effective.authToken || null : null,
      apiKey: provider === 'openai' ? effective.apiKey || null : null,
      baseUrl: provider === 'openai' ? effective.baseUrl || null : null,
      model: effective.model || undefined,
      maxTokens: effective.maxTokens || undefined,
      thinkingLevel: normalizeRuntimeThinkingLevel(effective.thinkingLevel),
      mapping: Object.keys(effective.mapping).length > 0 ? effective.mapping : undefined,
    },
  }).catch(() => {});
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  llm: loadFromStorage(),
  preferences: getDefaultPreferences(),

  setProvider: (provider) => {
    set((state) => {
      const newLlm = { ...state.llm, provider };
      saveToStorage(newLlm);
      persistToServer(newLlm);
      return { llm: newLlm };
    });
  },

  saveLLMSettings: (settings) => {
    const newLlm = normalizeSettings(settings);
    saveToStorage(newLlm);
    persistToServer(newLlm);
    set({ llm: newLlm });
  },

  setLanguage: (language) => {
    set((state) => {
      const preferences = { ...state.preferences, language };
      setUserConfig({ preferences }).catch(() => {});
      return { preferences };
    });
  },

  savePreferences: (preferences) => {
    setUserConfig({ preferences }).catch(() => {});
    set({ preferences });
  },

  updateConfig: (provider, config) => {
    set((state) => {
      const providerConfig = { ...state.llm[provider], ...config };
      const newLlm = {
        ...state.llm,
        [provider]: providerConfig,
      };
      saveToStorage(newLlm);
      persistToServer(newLlm);
      return { llm: newLlm };
    });
  },

  getEffectiveConfig: () => {
    const { llm } = get();
    const provider = getEffectiveProvider(llm);
    return { ...llm[provider], provider };
  },

  loadFromServer: async () => {
    try {
      const res = await getUserConfig();
      if (!res.success || !res.data) return;
      const llm = res.data.llm;
      const preferences = res.data.preferences;
      set((state) => {
        if (!llm) {
          return {
            preferences: {
              ...state.preferences,
              ...(preferences?.language ? { language: preferences.language as UserLanguagePreference } : {}),
            },
          };
        }
        const provider = fromServerProvider(llm.provider) ?? state.llm.provider;
        const newLlm: LLMSettings = {
          ...state.llm,
          provider,
          [provider]: {
            ...state.llm[provider],
            ...(typeof llm.enabled === 'boolean' ? { enabled: llm.enabled } : {}),
            ...(provider === 'anthropic' && typeof llm.authToken === 'string' ? { authToken: normalizeCredentialString(llm.authToken) ?? '' } : {}),
            ...(provider === 'anthropic' && typeof llm.apiKey === 'string' ? { apiKey: normalizeCredentialString(llm.apiKey) ?? '' } : {}),
            ...(provider === 'anthropic' && typeof llm.anthropicAuthToken === 'string' ? { authToken: normalizeCredentialString(llm.anthropicAuthToken) ?? '' } : {}),
            ...(provider === 'anthropic' && typeof llm.anthropicApiKey === 'string' ? { apiKey: normalizeCredentialString(llm.anthropicApiKey) ?? '' } : {}),
            ...(provider === 'anthropic' && typeof llm.anthropicBaseUrl === 'string' ? { baseUrl: llm.anthropicBaseUrl } : {}),
            ...(provider === 'anthropic' && fromServerCredentialSource(llm.anthropicCredentialSource) ? { anthropicCredentialSource: fromServerCredentialSource(llm.anthropicCredentialSource) } : {}),
            ...(provider === 'openai' && typeof llm.apiKey === 'string' ? { apiKey: normalizeCredentialString(llm.apiKey) ?? '' } : {}),
            ...(provider === 'openai' && typeof llm.baseUrl === 'string' ? { baseUrl: llm.baseUrl } : {}),
            ...(llm.model ? { model: llm.model } : {}),
            ...(llm.maxTokens ? { maxTokens: llm.maxTokens } : {}),
            ...(llm.thinkingLevel ? { thinkingLevel: llm.thinkingLevel } : {}),
            ...(llm.mapping && typeof llm.mapping === 'object' ? { mapping: llm.mapping } : {}),
          },
        };
        const normalized = normalizeSettings(newLlm);
        saveToStorage(normalized);
        return {
          llm: normalized,
          preferences: {
            ...state.preferences,
            ...(preferences?.language ? { language: preferences.language as UserLanguagePreference } : {}),
          },
        };
      });
    } catch {}
  },
}));
