import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeUserConfig } from '../../user-config';
import { agentSessionService } from '../server';

let dataRoot: string;

beforeEach(() => {
  dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-session-llm-'));
  vi.stubEnv('DATA_ROOT', dataRoot);
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataRoot, { recursive: true, force: true });
});

describe('AgentSessionService LLM fallback', () => {
  it('applies the current user model to a legacy session without a model config', async () => {
    writeUserConfig({ llm: { provider: 'openai-compatible', apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'test-model' } });
    await agentSessionService.createSession({ sessionId: 'legacy-session', projectId: 'project-1', projectName: 'Project', agentType: 'role-agent', projectContext: { projectId: 'project-1' } });
    await expect(agentSessionService.getSession('legacy-session', 'project-1')).resolves.toMatchObject({
      llmConfig: { provider: 'openai-compatible', apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'test-model' },
    });
  });
});
