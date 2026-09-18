import { describe, expect, it } from 'vitest';
import {
  RestoreAgentSessionError,
  assertSessionMessageOwnership,
  assertSessionOwnership,
  createRestoreAgentSessionResult,
  mapSessionDisplayMessages,
  restoreSessionAtBoundary,
} from '../session-restore';

function createStoredSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: 'session-skill-a',
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: '请继续分析',
        timestamp: 10,
      },
      {
        id: 'system-1',
        role: 'system',
        content: 'private system prompt',
        timestamp: 11,
      },
      {
        id: 'thinking-1',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'private reasoning' }],
        timestamp: 12,
      },
      {
        id: 'recovery-1',
        role: 'user',
        content: '[Internal Completion Recovery] continue',
        timestamp: 13,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', text: '分析完成' }],
        timestamp: 14,
      },
      {
        id: 'tool-1',
        role: 'toolResult',
        content: 'report.md',
        timestamp: 15,
      },
    ],
    projectContext: {
      projectId: 'skill-candidate-evaluator',
      projectName: '候选人评估',
      currentPath: 'C:\\OriginOS\\data\\skills\\candidate-evaluator',
      outputDir: 'C:\\OriginOS\\data\\skills\\candidate-evaluator\\output',
      entryType: 'skill',
      entryId: 'candidate-evaluator',
    },
    systemPrompt: 'private system prompt',
    agentType: 'skill',
    llmConfig: {
      provider: 'openai-compatible',
      baseUrl: 'https://example.test/v1',
      model: 'gpt-test',
    },
    ...overrides,
  };
}

const restoreRequest = {
  sessionId: 'session-skill-a',
  projectId: 'skill-candidate-evaluator',
  entryType: 'skill' as const,
  entryId: 'candidate-evaluator',
};

function expectRestoreError(
  action: () => unknown,
  code: RestoreAgentSessionError['code'],
): void {
  try {
    action();
    throw new Error('Expected restore error.');
  } catch (error) {
    expect(error).toBeInstanceOf(RestoreAgentSessionError);
    expect((error as RestoreAgentSessionError).code).toBe(code);
  }
}

describe('Session restore contract', () => {
  it('preserves real token usage and context estimates without inventing legacy values', () => {
    const [message] = mapSessionDisplayMessages([{
      id: 'assistant-usage',
      role: 'assistant',
      content: 'done',
      timestamp: 20,
      usage: { input: 10, output: 4, cacheRead: 3, cacheWrite: 2, totalTokens: 19 },
      contextTokenEstimate: {
        stableSystem: 5,
        sessionContext: 4,
        turnRecall: 3,
        history: 2,
        total: 14,
        estimated: true,
      },
    }]);

    expect(message).toMatchObject({
      usage: { input: 10, output: 4, cacheRead: 3, cacheWrite: 2, totalTokens: 19 },
      contextTokenEstimate: { total: 14, estimated: true },
    });
    expect(mapSessionDisplayMessages([{ role: 'assistant', content: 'legacy' }])[0]).not.toHaveProperty('usage');
  });

  it('TC-U1 maps canonical history and context into a bounded display snapshot', () => {
    const result = createRestoreAgentSessionResult(createStoredSession(), restoreRequest);

    expect(result).toMatchObject({
      contractVersion: 1,
      sessionId: 'session-skill-a',
      projectContext: {
        projectId: 'skill-candidate-evaluator',
        projectName: '候选人评估',
        currentPath: 'C:\\OriginOS\\data\\skills\\candidate-evaluator',
        outputDir: 'C:\\OriginOS\\data\\skills\\candidate-evaluator\\output',
      },
      agentType: 'skill',
      workingDirectory: 'C:\\OriginOS\\data\\skills\\candidate-evaluator',
      outputDir: 'C:\\OriginOS\\data\\skills\\candidate-evaluator\\output',
      llmConfig: {
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'gpt-test',
      },
      runtime: {
        restored: true,
        resumable: true,
      },
    });
    expect(result.messages).toEqual([
      {
        id: 'user-1',
        role: 'user',
        content: '请继续分析',
        timestamp: 10,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '分析完成',
        timestamp: 14,
      },
      {
        id: 'tool-1',
        role: 'toolResult',
        content: 'report.md',
        timestamp: 15,
      },
    ]);
  });

  it('TC-U1 accepts a valid empty Session without synthesizing a welcome message', () => {
    const result = createRestoreAgentSessionResult(
      createStoredSession({ messages: [] }),
      restoreRequest,
    );

    expect(result.messages).toEqual([]);
  });

  it('TC-U1 rejects unknown schemas and malformed messages with CORRUPT_SESSION', () => {
    expectRestoreError(
      () => createRestoreAgentSessionResult(
        createStoredSession({ schemaVersion: 999 }),
        restoreRequest,
      ),
      'CORRUPT_SESSION',
    );
    expectRestoreError(
      () => mapSessionDisplayMessages([{ role: 'assistant', content: { text: 'invalid' } }]),
      'CORRUPT_SESSION',
    );
  });

  it('TC-U2 accepts matching ownership before projecting message bodies', () => {
    expect(() => assertSessionOwnership(createStoredSession(), restoreRequest)).not.toThrow();
  });

  it('TC-U2 requires matching entry scope when persisted identity exists', () => {
    expect(() => assertSessionMessageOwnership(createStoredSession(), restoreRequest)).not.toThrow();
    expectRestoreError(
      () => assertSessionMessageOwnership(createStoredSession(), {
        sessionId: restoreRequest.sessionId,
        projectId: restoreRequest.projectId,
      }),
      'OWNERSHIP_MISMATCH',
    );
  });

  it('TC-U2 keeps a project-only compatibility path for legacy sessions', () => {
    const legacySession = createStoredSession({
      projectContext: {
        projectId: restoreRequest.projectId,
        projectName: '候选人评估',
      },
    });

    expect(() => assertSessionMessageOwnership(legacySession, {
      sessionId: restoreRequest.sessionId,
      projectId: restoreRequest.projectId,
    })).not.toThrow();
    expectRestoreError(
      () => assertSessionMessageOwnership(legacySession, {
        sessionId: restoreRequest.sessionId,
        projectId: 'skill-other',
      }),
      'OWNERSHIP_MISMATCH',
    );
  });

  it.each([
    {
      name: 'another Skill',
      request: {
        ...restoreRequest,
        projectId: 'skill-other',
        entryId: 'other',
      },
    },
    {
      name: 'another project',
      request: {
        ...restoreRequest,
        projectId: 'project-other',
        entryType: 'agent' as const,
        entryId: 'project-other',
      },
    },
    {
      name: 'an Agent entry with the same id',
      request: {
        ...restoreRequest,
        projectId: 'candidate-evaluator',
        entryType: 'agent' as const,
      },
    },
    {
      name: 'a RoleAgent entry',
      request: {
        ...restoreRequest,
        projectId: 'candidate-evaluator',
        entryType: 'role-agent' as const,
      },
    },
  ])('TC-U2 rejects ownership from $name without returning display messages', ({ request }) => {
    expectRestoreError(
      () => createRestoreAgentSessionResult(createStoredSession(), request),
      'OWNERSHIP_MISMATCH',
    );
  });

  it('TC-I2 rejects ownership before Runtime hydration or body return', async () => {
    const hydrateRuntime = vi.fn().mockResolvedValue(undefined);

    await expect(restoreSessionAtBoundary(
      {
        ...restoreRequest,
        projectId: 'skill-other',
        entryId: 'other',
      },
      {
        getSession: vi.fn().mockResolvedValue(createStoredSession()),
        hydrateRuntime,
      },
    )).rejects.toMatchObject({ code: 'OWNERSHIP_MISMATCH' });

    expect(hydrateRuntime).not.toHaveBeenCalled();
  });

  it('TC-I4 rejects corrupt history before Runtime hydration', async () => {
    const hydrateRuntime = vi.fn().mockResolvedValue(undefined);

    await expect(restoreSessionAtBoundary(
      restoreRequest,
      {
        getSession: vi.fn().mockResolvedValue(
          createStoredSession({
            messages: [{ role: 'assistant', content: { text: 'invalid' } }],
          }),
        ),
        hydrateRuntime,
      },
    )).rejects.toMatchObject({ code: 'CORRUPT_SESSION' });

    expect(hydrateRuntime).not.toHaveBeenCalled();
  });

  it('TC-I1 waits for Runtime hydration before returning stored message content', async () => {
    let releaseHydration: (() => void) | undefined;
    const hydration = new Promise<void>((resolve) => {
      releaseHydration = resolve;
    });
    const restore = restoreSessionAtBoundary(restoreRequest, {
      getSession: vi.fn().mockResolvedValue(createStoredSession()),
      hydrateRuntime: vi.fn(() => hydration),
    });
    let settled = false;
    void restore.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    releaseHydration?.();
    const session = await restore;
    expect(settled).toBe(true);
    expect(session).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: '请继续分析' }),
      ]),
    });
  });

  it('TC-I2 maps Runtime hydration failures to RESTORE_FAILED', async () => {
    await expect(restoreSessionAtBoundary(restoreRequest, {
      getSession: vi.fn().mockResolvedValue(createStoredSession()),
      hydrateRuntime: vi.fn().mockRejectedValue(new Error('private runtime failure')),
    })).rejects.toMatchObject({
      code: 'RESTORE_FAILED',
      message: 'Session restore failed.',
    });
  });

  it('TC-E3 projects 1,000 visible history messages within the restore budget', () => {
    const messages = Array.from({ length: 1_000 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 3 === 0 ? 'toolResult' : index % 2 === 0 ? 'assistant' : 'user',
      content: index % 3 === 0
        ? `tool result summary ${index}`
        : `visible message ${index}`,
      timestamp: index,
    }));

    const startedAt = performance.now();
    const result = createRestoreAgentSessionResult(
      createStoredSession({ messages }),
      restoreRequest,
    );
    const elapsedMs = performance.now() - startedAt;

    expect(result.messages).toHaveLength(1_000);
    expect(result.messages[0]).toMatchObject({
      id: 'message-0',
      role: 'toolResult',
    });
    expect(result.messages[999]).toMatchObject({
      id: 'message-999',
      content: 'tool result summary 999',
    });
    expect(elapsedMs).toBeLessThan(500);
  });
});


describe('P21-T2 project-scoped Skill ownership', () => {
  const request = { ...restoreRequest, projectId: 'proj-solution', entryId: 'solution-design' };
  const projectContext = { projectId: request.projectId, entryType: 'skill', entryId: request.entryId };
  const session = () => createStoredSession({ projectContext });

  it('TC1 accepts explicit matching project Skill identity for send and restore', async () => {
    expect(() => assertSessionMessageOwnership(session(), request)).not.toThrow();
    const hydrateRuntime = vi.fn().mockResolvedValue(undefined);
    await restoreSessionAtBoundary(request, {
      getSession: vi.fn().mockResolvedValue(session()), hydrateRuntime,
    });
    expect(hydrateRuntime).toHaveBeenCalledOnce();
  });

  it.each([
    { projectId: 'proj-other' }, { entryId: 'other-skill' },
    { entryType: 'role-agent' as const }, { sessionId: 'other-session' },
  ])('TC2 rejects a mismatched message scope %j', (override) => {
    expectRestoreError(() => assertSessionMessageOwnership(session(), { ...request, ...override }), 'OWNERSHIP_MISMATCH');
  });

  it.each([
    {}, { entryType: 'skill' }, { entryId: 'solution-design' },
  ])('TC3 does not infer project Skill authority from incomplete persisted identity %j', (identity) => {
    const stored = createStoredSession({ projectContext: { projectId: request.projectId, ...identity } });
    expectRestoreError(() => assertSessionMessageOwnership(stored, request), 'OWNERSHIP_MISMATCH');
  });

  it('TC3 retains standalone legacy Skill identity and rejects moving it to a project', () => {
    const stored = createStoredSession({ projectContext: { projectId: restoreRequest.projectId } });
    expect(() => assertSessionMessageOwnership(stored, restoreRequest)).not.toThrow();
    expectRestoreError(() => assertSessionMessageOwnership(stored, request), 'OWNERSHIP_MISMATCH');
  });
});
