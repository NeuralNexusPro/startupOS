import { describe, expect, it, vi } from 'vitest';

const mockGetModel = vi.fn().mockReturnValue({
  id: 'glm-4.7-no-think',
  name: 'glm-4.7-no-think',
  api: 'anthropic-messages',
  provider: 'anthropic',
  baseUrl: 'https://api.example.com',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
});

vi.mock('@originos/pi-agent-adapter/ai', () => ({
  getModel: mockGetModel,
}));

vi.mock('../config', () => ({
  getAnthropicApiKey: vi.fn(),
  getAnthropicApiKeySource: vi.fn(() => 'env.ANTHROPIC_AUTH_TOKEN'),
  getAnthropicBaseUrl: vi.fn(),
  getGoogleApiKey: vi.fn(),
  getAnthropicModelId: vi.fn(),
  shouldUseOpenAICompatible: vi.fn(),
  getConfigStatus: vi.fn(),
  DEFAULT_MODEL_CONFIG: {
    anthropic: { defaultModel: 'claude-sonnet-4-6' },
  },
  getLLMMaxTokens: vi.fn(),
  getAzureApiKey: vi.fn(),
  getAzureResourceName: vi.fn(),
  getAzureBaseUrl: vi.fn(),
  getAzureDeploymentName: vi.fn(),
  getAzureApiVersion: vi.fn(),
  getAzureApiFormat: vi.fn(),
}));

describe('createRuntimeModel', () => {
  it('maps anthropic auth token to bearer authToken field', async () => {
    mockGetModel.mockClear();
    const { createRuntimeModel } = await import('../server-config.js');

    const model = createRuntimeModel({
      provider: 'anthropic',
      model: 'glm-4.7-no-think',
      anthropicBaseUrl: 'https://api.example.com',
      anthropicAuthToken: 'sk-test-token',
      anthropicCredentialSource: 'anthropicAuthToken',
    }) as {
      credentialSource?: string;
      credentialAuthMode?: string;
      apiKey?: string | null;
      authToken?: string | null;
    };

    expect(model.credentialSource).toBe('anthropicAuthToken');
    expect(model.credentialAuthMode).toBe('bearer');
    expect(model.authToken).toBe('sk-test-token');
    expect(model.apiKey).toBeNull();
    expect(mockGetModel).toHaveBeenCalledWith('anthropic', 'glm-4.7-no-think');
  });

  it('maps user anthropic auth token source to bearer authToken field', async () => {
    mockGetModel.mockClear();
    const { createRuntimeModel } = await import('../server-config.js');

    const model = createRuntimeModel({
      provider: 'anthropic',
      model: 'glm-4.7-no-think',
      anthropicBaseUrl: 'https://api.example.com',
      anthropicAuthToken: 'sk-user-token',
      anthropicCredentialSource: 'user.anthropicAuthToken',
    }) as {
      credentialSource?: string;
      credentialAuthMode?: string;
      apiKey?: string | null;
      authToken?: string | null;
    };

    expect(model.credentialSource).toBe('anthropicAuthToken');
    expect(model.credentialAuthMode).toBe('bearer');
    expect(model.authToken).toBe('sk-user-token');
    expect(model.apiKey).toBeNull();
    expect(mockGetModel).toHaveBeenCalledWith('anthropic', 'glm-4.7-no-think');
  });

  it('keeps anthropic api key on apiKey field', async () => {
    mockGetModel.mockClear();
    const { createRuntimeModel } = await import('../server-config.js');

    const model = createRuntimeModel({
      provider: 'anthropic',
      model: 'glm-4.7-no-think',
      anthropicBaseUrl: 'https://api.example.com',
      anthropicApiKey: 'sk-test-key',
      anthropicCredentialSource: 'anthropicApiKey',
    }) as {
      credentialSource?: string;
      credentialAuthMode?: string;
      apiKey?: string | null;
      authToken?: string | null;
    };

    expect(model.credentialSource).toBe('anthropicApiKey');
    expect(model.credentialAuthMode).toBe('api-key');
    expect(model.apiKey).toBe('sk-test-key');
    expect(model.authToken).toBeNull();
  });

  it('maps OpenAI-compatible max token field through runtime mapping', async () => {
    const { createRuntimeModel } = await import('../server-config.js');

    const model = createRuntimeModel({
      provider: 'openai-compatible',
      model: 'gpt-5-mini',
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk-test-key',
      mapping: {
        max_tokens: 'max_completion_tokens',
      },
    }) as {
      compat?: {
        maxTokensField?: string;
      };
    };

    expect(model.compat?.maxTokensField).toBe('max_completion_tokens');
  });

  it('maps an enterprise GLM alias to minimal OpenAI-compatible reasoning', async () => {
    const { createRuntimeModel } = await import('../server-config.js');

    const model = createRuntimeModel({
      provider: 'openai-compatible',
      model: 'ep-cl-glm',
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk-test-key',
      thinkingLevel: 'off',
    }) as {
      reasoning?: boolean;
      compat?: { thinkingFormat?: string; supportsReasoningEffort?: boolean };
      thinkingLevelMap?: { off?: string };
    };

    expect(model.reasoning).toBe(true);
    expect(model.compat?.thinkingFormat).toBe('openai');
    expect(model.compat?.supportsReasoningEffort).toBe(true);
    expect(model.thinkingLevelMap?.off).toBe('minimal');
  });

  it('keeps native GLM model IDs on the Z.AI thinking dialect', async () => {
    const { createRuntimeModel } = await import('../server-config.js');
    const model = createRuntimeModel({
      provider: 'openai-compatible',
      model: 'glm-4.5',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'sk-test-key',
      thinkingLevel: 'off',
    }) as { reasoning?: boolean; compat?: { thinkingFormat?: string } };

    expect(model.reasoning).toBe(true);
    expect(model.compat?.thinkingFormat).toBe('zai');
  });

  it('does not send vendor thinking controls for an unknown compatible model', async () => {
    const { createRuntimeModel } = await import('../server-config.js');

    const model = createRuntimeModel({
      provider: 'openai-compatible',
      model: 'custom-chat-model',
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk-test-key',
      thinkingLevel: 'off',
    }) as {
      reasoning?: boolean;
      compat?: { thinkingFormat?: string };
    };

    expect(model.reasoning).toBe(false);
    expect(model.compat?.thinkingFormat).toBe('openai');
  });

  it('extracts credential value from structured key payload before creating runtime model', async () => {
    const { createRuntimeModel } = await import('../server-config.js');

    const model = createRuntimeModel({
      provider: 'openai-compatible',
      model: 'gpt-5-mini',
      baseUrl: 'https://example.com/v1',
      apiKey: JSON.stringify([
        {
          key: 'OPENAI_API_KEY',
          value: 'sk-real-token',
          enabled: true,
        },
      ]),
      mapping: {
        max_tokens: 'max_completion_tokens',
      },
    }) as {
      apiKey?: string;
    };

    expect(model.apiKey).toBe('sk-real-token');
  });

  it('strips bearer prefix from OpenAI-compatible credential', async () => {
    const { createRuntimeModel } = await import('../server-config.js');

    const model = createRuntimeModel({
      provider: 'openai-compatible',
      model: 'gpt-5-mini',
      baseUrl: 'https://example.com/v1',
      apiKey: 'Bearer sk-real-token',
    }) as {
      apiKey?: string;
    };

    expect(model.apiKey).toBe('sk-real-token');
  });
});
