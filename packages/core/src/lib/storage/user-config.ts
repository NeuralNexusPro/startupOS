import path from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { getDataRoot } from '../paths';

export interface UserLLMConfig {
  enabled?: boolean;
  provider?: string;
  anthropicAuthToken?: string | null;
  anthropicApiKey?: string | null;
  anthropicBaseUrl?: string | null;
  anthropicCredentialSource?: string | null;
  authToken?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  model?: string;
  maxTokens?: number;
  mapping?: Record<string, string>;
}

export interface UserPreferencesConfig {
  language?: string;
  showOnboarding?: boolean;
}

export interface UserConfig {
  llm?: UserLLMConfig;
  preferences?: UserPreferencesConfig;
}

function getConfigFilePath(): string {
  return path.join(getDataRoot(), 'user-config.json');
}

export function readUserConfig(): UserConfig {
  try {
    const filePath = getConfigFilePath();
    if (!existsSync(filePath)) return {};
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as UserConfig;
  } catch {
    return {};
  }
}

export function writeUserConfig(config: UserConfig): void {
  const filePath = getConfigFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

