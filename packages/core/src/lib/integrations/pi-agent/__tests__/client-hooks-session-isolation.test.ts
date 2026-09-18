import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectContext } from '../types';

const listeners = new Set<(payload: unknown) => void>();
const unsubscribeMock = vi.fn();
const createAgentSessionMock = vi.fn();
const getAgentSessionMock = vi.fn();
const sendAgentMessageStreamMock = vi.fn();
const abortAgentSessionMock = vi.fn();

vi.mock('../../electron/env', () => ({
  isElectron: () => true,
}));

vi.mock('../../electron/services/agent-session', () => ({
  createAgentSession: (...args: unknown[]) => createAgentSessionMock(...args),
  getAgentSession: (...args: unknown[]) => getAgentSessionMock(...args),
  sendAgentMessage: vi.fn(),
  sendAgentMessageStream: (...args: unknown[]) => sendAgentMessageStreamMock(...args),
  abortAgentSession: (...args: unknown[]) => abortAgentSessionMock(...args),
  subscribeAgentEvents: (listener: (event: { type: string; data: unknown }) => void, sessionId?: string) => {
    const wrapped = (payload: unknown) => {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) as { sessionId?: string } : payload as { sessionId?: string };
      if (sessionId) {
        if (typeof parsed?.sessionId !== 'string' || parsed.sessionId !== sessionId) {
          return;
        }
      }
      listener(parsed as { type: string; data: unknown });
    };
    listeners.add(wrapped);
    return () => {
      listeners.delete(wrapped);
      unsubscribeMock();
    };
  },
}));

import { usePiAgent } from '../client-hooks';

const projectContext: ProjectContext = {
  projectId: 'project-1',
  ontologyId: 'ontology-1',
  projectName: 'Isolation Test',
  currentPath: '/tmp/project-1',
};

function createStoredSession(
  sessionId: string,
  projectId: string,
  content: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sessionId,
    messages: [
      {
        id: `${sessionId}-user`,
        role: 'user',
        content,
        timestamp: 10,
      },
    ],
    projectContext: {
      projectId,
      projectName: projectId,
      currentPath: `/data/${projectId}`,
      outputDir: `/data/${projectId}/output`,
    },
    systemPrompt: `${projectId} system`,
    agentType: 'skill',
    llmConfig: {
      provider: 'openai-compatible',
      model: `${projectId}-model`,
    },
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value: T) => resolvePromise?.(value),
  };
}

function emitAgentEvent(payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload);
  listeners.forEach((listener) => listener(serialized));
}

describe('usePiAgent stream isolation', () => {
  beforeEach(() => {
    listeners.clear();
    unsubscribeMock.mockReset();
    createAgentSessionMock.mockReset();
    getAgentSessionMock.mockReset();
    sendAgentMessageStreamMock.mockReset();
    abortAgentSessionMock.mockReset();

    createAgentSessionMock.mockImplementation(async (request: { sessionId: string }) => ({
      success: true,
      data: { sessionId: request.sessionId },
      timestamp: new Date().toISOString(),
    }));
    getAgentSessionMock.mockImplementation(async (request: {
      sessionId: string;
      projectId: string;
      entryType: string;
      entryId: string;
    }) => ({
      success: true,
      data: createStoredSession(
        request.sessionId,
        request.projectId,
        `${request.sessionId} history`,
      ),
      timestamp: new Date().toISOString(),
    }));

    sendAgentMessageStreamMock.mockResolvedValue({
      success: true,
      data: { started: true },
      timestamp: new Date().toISOString(),
    });
    abortAgentSessionMock.mockResolvedValue({
      success: true,
      data: { aborted: true },
      timestamp: new Date().toISOString(),
    });
  });

  afterEach(() => {
    listeners.clear();
  });

  it('persists and sends the normalized entry ownership scope', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.initialize(
        'skill-session-scope',
        {
          projectId: 'skill-scope',
          projectName: 'Scope',
        },
        { agentType: 'skill' },
      );
      void result.current.sendMessageStream('scoped message');
    });

    await waitFor(() => {
      expect(sendAgentMessageStreamMock).toHaveBeenCalledTimes(1);
    });
    expect(createAgentSessionMock).toHaveBeenCalledWith(expect.objectContaining({
      projectContext: expect.objectContaining({
        entryType: 'skill',
        entryId: 'scope',
      }),
    }));
    expect(sendAgentMessageStreamMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'skill-scope',
      entryType: 'skill',
      entryId: 'scope',
    }));
  });

  it('does not deliver project-level AGENT_EVENT payloads into another session stream', async () => {
    const { result: skillHook } = renderHook(() => usePiAgent());
    const { result: projectHook } = renderHook(() => usePiAgent());

    await act(async () => {
      await skillHook.current.initialize('skill-session-1', projectContext, {});
      await projectHook.current.initialize('project-session-1', projectContext, {});
    });

    await act(async () => {
      void projectHook.current.sendMessageStream('project message');
      void skillHook.current.sendMessageStream('skill message');
    });

    await waitFor(() => {
      expect(sendAgentMessageStreamMock).toHaveBeenCalledTimes(2);
      expect(listeners.size).toBe(2);
    });

    const projectStreamId = (sendAgentMessageStreamMock.mock.calls[0]?.[0] as { streamId?: string }).streamId;
    const skillStreamId = (sendAgentMessageStreamMock.mock.calls[1]?.[0] as { streamId?: string }).streamId;
    expect(projectStreamId).toBeTruthy();
    expect(skillStreamId).toBeTruthy();

    await act(async () => {
      emitAgentEvent({
        projectId: 'project-1',
        type: 'text_delta',
        data: { delta: 'project-only-delta' },
      });

      emitAgentEvent({
        sessionId: 'project-session-1',
        streamId: projectStreamId,
        type: 'text_delta',
        data: { delta: 'project-session-delta' },
      });

      emitAgentEvent({
        sessionId: 'project-session-1',
        streamId: projectStreamId,
        type: 'assistant_message',
        data: { content: 'project assistant message' },
      });

      emitAgentEvent({
        sessionId: 'project-session-1',
        streamId: projectStreamId,
        type: 'done',
        data: {},
      });

      emitAgentEvent({
        sessionId: 'skill-session-1',
        streamId: skillStreamId,
        type: 'text_delta',
        data: { delta: 'skill-session-delta' },
      });

      emitAgentEvent({
        sessionId: 'skill-session-1',
        streamId: skillStreamId,
        type: 'assistant_message',
        data: { content: 'skill assistant message' },
      });

      emitAgentEvent({
        sessionId: 'skill-session-1',
        streamId: skillStreamId,
        type: 'done',
        data: {},
      });
    });

    await waitFor(() => {
      const skillMessages = skillHook.current.messages ?? [];
      const projectMessages = projectHook.current.messages ?? [];

      expect(skillMessages.some((message) => message.content.includes('project-only-delta'))).toBe(false);
      expect(skillMessages.some((message) => message.content.includes('project-session-delta'))).toBe(false);
      expect(skillMessages.some((message) => message.content.includes('project assistant message'))).toBe(false);
      expect(skillMessages.some((message) => message.content.includes('skill assistant message'))).toBe(true);

      expect(projectMessages.some((message) => message.content.includes('project assistant message'))).toBe(true);
      expect(projectMessages.some((message) => message.content.includes('skill assistant message'))).toBe(false);
    });
  });

  it('ignores late events from an aborted stream after a new stream starts on the same session', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.initialize('session-1', projectContext, {});
    });

    await act(async () => {
      void result.current.sendMessageStream('first message');
    });

    await waitFor(() => {
      expect(sendAgentMessageStreamMock).toHaveBeenCalledTimes(1);
    });

    const firstStreamId = (sendAgentMessageStreamMock.mock.calls[0]?.[0] as { streamId?: string }).streamId;
    expect(firstStreamId).toBeTruthy();

    await act(async () => {
      emitAgentEvent({
        sessionId: 'session-1',
        streamId: firstStreamId,
        type: 'text_delta',
        data: { delta: 'first partial' },
      });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.content.includes('first partial'))).toBe(true);
    });

    await act(async () => {
      result.current.abort();
    });

    await act(async () => {
      void result.current.sendMessageStream('second message');
    });

    await waitFor(() => {
      expect(sendAgentMessageStreamMock).toHaveBeenCalledTimes(2);
    });

    const secondStreamId = (sendAgentMessageStreamMock.mock.calls[1]?.[0] as { streamId?: string }).streamId;
    expect(secondStreamId).toBeTruthy();
    expect(secondStreamId).not.toBe(firstStreamId);

    await act(async () => {
      emitAgentEvent({
        sessionId: 'session-1',
        streamId: firstStreamId,
        type: 'text_delta',
        data: { delta: ' stale old delta' },
      });
      emitAgentEvent({
        sessionId: 'session-1',
        streamId: firstStreamId,
        type: 'assistant_message',
        data: { content: 'stale old final' },
      });
      emitAgentEvent({
        sessionId: 'session-1',
        streamId: secondStreamId,
        type: 'text_delta',
        data: { delta: 'second partial' },
      });
      emitAgentEvent({
        sessionId: 'session-1',
        streamId: secondStreamId,
        type: 'assistant_message',
        data: { content: 'second final' },
      });
      emitAgentEvent({
        sessionId: 'session-1',
        streamId: secondStreamId,
        type: 'done',
        data: {},
      });
    });

    await waitFor(() => {
      const contents = result.current.messages.map((message) => message.content).join('\n');
      expect(contents).toContain('first partial');
      expect(contents).toContain('second final');
      expect(contents).not.toContain('stale old delta');
      expect(contents).not.toContain('stale old final');
    });
  });

  it('attaches provider usage only when the active stream completes', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.initialize('session-usage', projectContext, {});
      void result.current.sendMessageStream('anonymous request');
    });
    await waitFor(() => expect(sendAgentMessageStreamMock).toHaveBeenCalledOnce());
    const streamId = (sendAgentMessageStreamMock.mock.calls[0]?.[0] as { streamId?: string }).streamId;

    await act(async () => {
      emitAgentEvent({
        sessionId: 'session-usage', streamId, type: 'text_delta', data: { delta: 'partial' },
      });
    });
    expect(result.current.messages.find((message) => message.role === 'assistant')?.usage).toBeUndefined();

    await act(async () => {
      emitAgentEvent({
        sessionId: 'session-usage', streamId, type: 'done',
        data: {
          content: 'complete',
          usage: { input: 12, output: 3, cacheRead: 4, cacheWrite: 1, totalTokens: 15 },
          contextTokenEstimate: {
            stableSystem: 2, sessionContext: 1, turnRecall: 1, history: 2, total: 6, estimated: true,
          },
        },
      });
    });

    await waitFor(() => expect(result.current.messages.find((message) => message.role === 'assistant')).toMatchObject({
      usage: { input: 12, output: 3, cacheRead: 4, cacheWrite: 1, totalTokens: 15 },
      contextTokenEstimate: { total: 6, estimated: true },
    }));
    expect(result.current.messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
  });

  it('TC-U3 commits only the newest restore when responses complete out of order', async () => {
    const restoreA = deferred<{
      success: boolean;
      data: Record<string, unknown>;
      timestamp: string;
    }>();
    const restoreB = deferred<{
      success: boolean;
      data: Record<string, unknown>;
      timestamp: string;
    }>();
    getAgentSessionMock
      .mockImplementationOnce(() => restoreA.promise)
      .mockImplementationOnce(() => restoreB.promise);

    const { result } = renderHook(() => usePiAgent());
    let promiseA: Promise<unknown>;
    let promiseB: Promise<unknown>;

    await act(async () => {
      promiseA = result.current.restoreSession({
        sessionId: 'session-a',
        projectId: 'skill-a',
        entryType: 'skill',
        entryId: 'a',
      });
      promiseB = result.current.restoreSession({
        sessionId: 'session-b',
        projectId: 'skill-b',
        entryType: 'skill',
        entryId: 'b',
      });
    });

    await act(async () => {
      restoreB.resolve({
        success: true,
        data: createStoredSession('session-b', 'skill-b', 'B history'),
        timestamp: new Date().toISOString(),
      });
      await promiseB!;
    });

    expect(result.current.sessionId).toBe('session-b');
    expect(result.current.projectContext).toMatchObject({
      projectId: 'skill-b',
      currentPath: '/data/skill-b',
      outputDir: '/data/skill-b/output',
    });
    expect(result.current.messages).toEqual([
      expect.objectContaining({ content: 'B history' }),
    ]);

    await act(async () => {
      restoreA.resolve({
        success: true,
        data: createStoredSession('session-a', 'skill-a', 'late A history'),
        timestamp: new Date().toISOString(),
      });
      await promiseA!;
    });

    expect(result.current.sessionId).toBe('session-b');
    expect(result.current.messages).toEqual([
      expect.objectContaining({ content: 'B history' }),
    ]);
    expect(result.current.isRestoring).toBe(false);
  });

  it('forwards project and entry ownership scope before receiving session content', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.restoreSession({
        sessionId: 'session-scope',
        projectId: 'skill-scope',
        entryType: 'skill',
        entryId: 'scope',
      });
    });

    expect(getAgentSessionMock).toHaveBeenCalledWith({
      sessionId: 'session-scope',
      projectId: 'skill-scope',
      entryType: 'skill',
      entryId: 'scope',
    });
  });

  it('TC-U3 shares one operation epoch so a late initialize cannot overwrite restore B', async () => {
    const initializeA = deferred<{
      success: boolean;
      data: { sessionId: string };
      timestamp: string;
    }>();
    createAgentSessionMock.mockImplementationOnce(() => initializeA.promise);
    const { result } = renderHook(() => usePiAgent());
    let initializePromise: Promise<void>;

    await act(async () => {
      initializePromise = result.current.initialize('session-a', {
        ...projectContext,
        projectId: 'skill-a',
      }, {});
    });

    await act(async () => {
      await result.current.restoreSession({
        sessionId: 'session-b',
        projectId: 'skill-b',
        entryType: 'skill',
        entryId: 'b',
      });
    });
    expect(result.current.sessionId).toBe('session-b');
    expect(result.current.messages).toEqual([
      expect.objectContaining({ content: 'session-b history' }),
    ]);

    await act(async () => {
      initializeA.resolve({
        success: true,
        data: { sessionId: 'session-a' },
        timestamp: new Date().toISOString(),
      });
      await initializePromise!;
    });

    expect(result.current.sessionId).toBe('session-b');
    expect(result.current.projectContext?.projectId).toBe('skill-b');
    expect(result.current.messages).toEqual([
      expect.objectContaining({ content: 'session-b history' }),
    ]);
  });

  it('TC-U3 treats the active Session as an idempotent restore target', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.initialize('session-current', projectContext, {});
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.restoreSession({
        sessionId: 'session-current',
        projectId: 'project-1',
        entryType: 'agent',
        entryId: 'project-1',
      });
    });

    expect(outcome).toBeNull();
    expect(getAgentSessionMock).not.toHaveBeenCalled();
    expect(result.current.sessionId).toBe('session-current');
  });

  it('TC-U3 drops an aborted restore without committing partial state', async () => {
    const pendingRestore = deferred<{
      success: boolean;
      data: Record<string, unknown>;
      timestamp: string;
    }>();
    getAgentSessionMock.mockImplementationOnce(() => pendingRestore.promise);
    const { result } = renderHook(() => usePiAgent());
    let restorePromise: Promise<unknown>;

    await act(async () => {
      await result.current.initialize('session-current', projectContext, {});
      restorePromise = result.current.restoreSession({
        sessionId: 'session-pending',
        projectId: 'skill-pending',
        entryType: 'skill',
        entryId: 'pending',
      });
      result.current.destroy();
    });

    await act(async () => {
      pendingRestore.resolve({
        success: true,
        data: createStoredSession(
          'session-pending',
          'skill-pending',
          'must not commit',
        ),
        timestamp: new Date().toISOString(),
      });
      await restorePromise!;
    });

    expect(result.current.sessionId).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.isInitialized).toBe(false);
    expect(result.current.isRestoring).toBe(false);
  });

  it('keeps the current Session and messages unchanged when restore fails', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.restoreSession({
        sessionId: 'session-current',
        projectId: 'skill-current',
        entryType: 'skill',
        entryId: 'current',
      });
    });
    const previousMessages = result.current.messages;
    const previousContext = result.current.projectContext;

    getAgentSessionMock.mockResolvedValueOnce({
      success: false,
      error: {
        code: 'OWNERSHIP_MISMATCH',
        message: 'sensitive backend details',
      },
      timestamp: new Date().toISOString(),
    });

    await act(async () => {
      await expect(result.current.restoreSession({
        sessionId: 'session-other',
        projectId: 'skill-other',
        entryType: 'skill',
        entryId: 'other',
      })).rejects.toMatchObject({
        code: 'OWNERSHIP_MISMATCH',
      });
    });

    expect(result.current.sessionId).toBe('session-current');
    expect(result.current.projectContext).toEqual(previousContext);
    expect(result.current.messages).toBe(previousMessages);
    expect(result.current.uiState.errorMessage).toContain('OWNERSHIP_MISMATCH');
    expect(result.current.uiState.errorMessage).not.toContain('sensitive backend details');
    expect(result.current.isRestoring).toBe(false);
  });

  it('TC-U4/TC-I1 restores B, removes A subscription, and sends the next turn only to B', async () => {
    const { result } = renderHook(() => usePiAgent());

    await act(async () => {
      await result.current.initialize('session-a', {
        ...projectContext,
        projectId: 'skill-a',
      }, {});
      void result.current.sendMessageStream('A request');
    });

    await waitFor(() => {
      expect(sendAgentMessageStreamMock).toHaveBeenCalledTimes(1);
      expect(listeners.size).toBe(1);
    });
    const streamA = (sendAgentMessageStreamMock.mock.calls[0]?.[0] as {
      streamId: string;
    }).streamId;

    await act(async () => {
      await result.current.restoreSession({
        sessionId: 'session-b',
        projectId: 'skill-b',
        entryType: 'skill',
        entryId: 'b',
      });
    });

    expect(unsubscribeMock).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    expect(result.current.restoredSession).toMatchObject({
      sessionId: 'session-b',
      agentType: 'skill',
      workingDirectory: '/data/skill-b',
      outputDir: '/data/skill-b/output',
      llmConfig: {
        model: 'skill-b-model',
      },
    });

    await act(async () => {
      emitAgentEvent({
        sessionId: 'session-a',
        streamId: streamA,
        type: 'text_delta',
        data: { delta: 'late A delta' },
      });
      emitAgentEvent({
        sessionId: 'session-a',
        streamId: streamA,
        type: 'done',
        data: { content: 'late A final' },
      });
    });
    expect(result.current.messages?.map((message) => message.content)).toEqual([
      'session-b history',
    ]);

    await act(async () => {
      void result.current.sendMessageStream('B request');
    });
    await waitFor(() => {
      expect(sendAgentMessageStreamMock).toHaveBeenCalledTimes(2);
    });

    const requestB = sendAgentMessageStreamMock.mock.calls[1]?.[0] as {
      sessionId: string;
      projectId: string;
      streamId: string;
    };
    expect(requestB).toMatchObject({
      sessionId: 'session-b',
      projectId: 'skill-b',
    });

    await act(async () => {
      emitAgentEvent({
        sessionId: 'session-b',
        streamId: requestB.streamId,
        type: 'text_delta',
        data: { delta: 'B answer' },
      });
      emitAgentEvent({
        sessionId: 'session-b',
        streamId: requestB.streamId,
        type: 'assistant_message',
        data: { content: 'B answer complete' },
      });
      emitAgentEvent({
        sessionId: 'session-b',
        streamId: requestB.streamId,
        type: 'done',
        data: {},
      });
    });

    await waitFor(() => {
      const content = result.current.messages?.map((message) => message.content).join('\n');
      expect(content).toContain('B request');
      expect(content).toContain('B answer complete');
      expect(content).not.toContain('late A');
    });
  });
});
