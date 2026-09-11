import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { persistRuntimeLLMConfig, readUserConfig, readUserConfigWithProductDefaults, writeUserConfig } from '..';

let previousDataRoot: string | undefined;
let previousAnthropicAuthToken: string | undefined;
let previousAnthropicBaseUrl: string | undefined;
let previousAnthropicModel: string | undefined;
let previousLLMProvider: string | undefined;
let dataRoot: string;

beforeEach(() => {
  previousDataRoot = process.env['DATA_ROOT'];
  previousAnthropicAuthToken = process.env['ANTHROPIC_AUTH_TOKEN'];
  previousAnthropicBaseUrl = process.env['ANTHROPIC_BASE_URL'];
  previousAnthropicModel = process.env['ANTHROPIC_MODEL'];
  previousLLMProvider = process.env['LLM_PROVIDER'];
  dataRoot = mkdtempSync(path.join(os.tmpdir(), 'originos-user-config-'));
  process.env['DATA_ROOT'] = dataRoot;
  delete process.env['ANTHROPIC_AUTH_TOKEN'];
  delete process.env['ANTHROPIC_BASE_URL'];
  delete process.env['ANTHROPIC_MODEL'];
  delete process.env['LLM_PROVIDER'];
});

afterEach(() => {
  if (previousDataRoot === undefined) {
    delete process.env['DATA_ROOT'];
  } else {
    process.env['DATA_ROOT'] = previousDataRoot;
  }
  restoreEnv('ANTHROPIC_AUTH_TOKEN', previousAnthropicAuthToken);
  restoreEnv('ANTHROPIC_BASE_URL', previousAnthropicBaseUrl);
  restoreEnv('ANTHROPIC_MODEL', previousAnthropicModel);
  restoreEnv('LLM_PROVIDER', previousLLMProvider);
  rmSync(dataRoot, { recursive: true, force: true });
});

describe('user-config LLM backfill', () => {
  it('backfills missing user-config.json from product Anthropic environment config', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = ' tp-product-token ';
    process.env['ANTHROPIC_BASE_URL'] = ' https://token-plan-cn.xiaomimimo.com/anthropic ';
    process.env['ANTHROPIC_MODEL'] = ' mimo-v2.5 ';
    process.env['LLM_PROVIDER'] = 'anthropic';

    expect(readUserConfigWithProductDefaults().llm).toEqual({
      enabled: true,
      provider: 'anthropic',
      anthropicAuthToken: 'tp-product-token',
      anthropicBaseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      anthropicCredentialSource: 'anthropicAuthToken',
      authToken: 'tp-product-token',
      model: 'mimo-v2.5',
    });
    expect(readFileSync(path.join(dataRoot, 'user-config.json'), 'utf-8')).toContain('tp-product-token');
  });

  it('does not overwrite an existing user LLM config with product defaults', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'tp-product-token';
    process.env['ANTHROPIC_MODEL'] = 'mimo-v2.5';

    persistRuntimeLLMConfig({
      provider: 'anthropic',
      anthropicApiKey: 'sk-user',
      model: 'claude-user',
      anthropicCredentialSource: 'anthropicApiKey',
    });

    expect(readUserConfigWithProductDefaults().llm).toEqual({
      enabled: true,
      provider: 'anthropic',
      anthropicApiKey: 'sk-user',
      anthropicCredentialSource: 'anthropicApiKey',
      model: 'claude-user',
    });
  });

  it('persists product Anthropic runtime config to user-config.json', () => {
    persistRuntimeLLMConfig({
      provider: 'anthropic',
      anthropicAuthToken: ' tp-test-token ',
      anthropicBaseUrl: ' https://token-plan-cn.xiaomimimo.com/anthropic ',
      model: 'mimo-v2.5-pro',
      maxTokens: 16384,
      anthropicCredentialSource: 'anthropicAuthToken',
    });

    expect(readUserConfig().llm).toEqual({
      enabled: true,
      provider: 'anthropic',
      anthropicAuthToken: 'tp-test-token',
      anthropicBaseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      anthropicCredentialSource: 'anthropicAuthToken',
      authToken: 'tp-test-token',
      model: 'mimo-v2.5-pro',
      maxTokens: 16384,
    });
    expect(readFileSync(path.join(dataRoot, 'user-config.json'), 'utf-8')).toContain('mimo-v2.5-pro');
  });

  it('replaces stale Anthropic fields when OpenAI-compatible config is persisted', () => {
    persistRuntimeLLMConfig({
      provider: 'anthropic',
      anthropicApiKey: 'sk-ant',
      anthropicBaseUrl: 'https://anthropic.example',
      model: 'claude-test',
      anthropicCredentialSource: 'anthropicApiKey',
    });

    persistRuntimeLLMConfig({
      provider: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://openai-compatible.example/v1',
      model: 'gpt-test',
    });

    expect(readUserConfig().llm).toEqual({
      enabled: true,
      provider: 'openai-compatible',
      apiKey: 'sk-openai',
      baseUrl: 'https://openai-compatible.example/v1',
      model: 'gpt-test',
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}


describe('shared user config storage', () => {
  it('preserves missing, malformed and stored configuration behavior', () => {
    expect(readUserConfig()).toEqual({});
    writeFileSync(path.join(dataRoot, 'user-config.json'), '{broken');
    expect(readUserConfig()).toEqual({});
    const config = { preferences: { language: 'zh-CN', showOnboarding: false } };
    writeUserConfig(config);
    expect(readUserConfig()).toEqual(config);
    expect(JSON.parse(readFileSync(path.join(dataRoot, 'user-config.json'), 'utf-8'))).toEqual(config);
  });
});
