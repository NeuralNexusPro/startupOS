import { describe, expect, it, vi, beforeEach } from 'vitest';

const onMock = vi.fn();
const invokeMock = vi.fn();
const isElectronMock = vi.fn(() => true);
const getIpcRendererMock = vi.fn(() => ({
  on: onMock,
  invoke: invokeMock,
}));

vi.mock('../../env', () => ({
  isElectron: () => isElectronMock(),
  getIpcRenderer: () => getIpcRendererMock(),
}));

describe('subscribeAgentEvents', () => {
  beforeEach(() => {
    onMock.mockReset();
    invokeMock.mockReset();
    isElectronMock.mockReturnValue(true);
  });

  it('ignores AGENT_EVENT payloads without matching sessionId when a session filter is provided', async () => {
    const { subscribeAgentEvents } = await import('../agent-session');
    const listener = vi.fn();

    subscribeAgentEvents(listener, 'skill-session-1');

    expect(onMock).toHaveBeenCalledTimes(1);
    const handler = onMock.mock.calls[0]?.[1] as (payload: unknown) => void;

    handler(JSON.stringify({ projectId: 'project-1', type: 'text_delta', data: { delta: 'hello' } }));
    handler(JSON.stringify({ sessionId: 'other-session', type: 'text_delta', data: { delta: 'wrong' } }));
    handler(JSON.stringify({ sessionId: 'skill-session-1', type: 'text_delta', data: { delta: 'right' } }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      sessionId: 'skill-session-1',
      type: 'text_delta',
      data: { delta: 'right' },
    });
  });
});

describe('Agent Task Runtime transport', () => {
  beforeEach(() => {
    onMock.mockReset();
    invokeMock.mockReset();
    isElectronMock.mockReturnValue(true);
  });

  it('uses versioned create IPC and preserves the request payload', async () => {
    invokeMock.mockResolvedValue({ success: true, timestamp: 'now' });
    const { createAgentTask } = await import('../agent-session');
    const request = {
      version: 1 as const,
      requestId: 'request-1',
      sessionId: 'session-1',
      objective: '交付可验证结果',
    };

    await createAgentTask(request);

    expect(invokeMock).toHaveBeenCalledWith('agent:task:create', request);
  });

  it('filters Task Runtime events by protocol and session', async () => {
    const { subscribeAgentTaskRuntime } = await import('../agent-session');
    const listener = vi.fn();
    subscribeAgentTaskRuntime('session-1', listener);
    const handler = onMock.mock.calls[0]?.[1] as (payload: unknown) => void;

    handler({ version: 2, type: 'agent_task_runtime_state', sessionId: 'session-1', snapshot: {} });
    handler({ version: 1, type: 'agent_task_runtime_state', sessionId: 'other', snapshot: {} });
    handler({
      version: 1,
      type: 'agent_task_runtime_state',
      sessionId: 'session-1',
      snapshot: { version: 1, sessionId: 'session-1', execution: {} },
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
