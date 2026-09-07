import { describe, expect, it, vi } from 'vitest';
import { StreamingSessionRuntimeAdapter, type AgentOutputEvent, type ChannelInvocation, type RuntimeSourceEvent } from '..';

const invocation: ChannelInvocation = {
  message: { protocolVersion: '1.0', id: 'message-1', origin: 'originos-ui', connectorId: 'desktop', conversationId: 'window-1', actorId: 'user', content: { text: 'hello' }, receivedAt: '2026-09-04T10:00:00.000Z' },
  target: { kind: 'role-agent', id: 'role-1' },
};

describe('StreamingSessionRuntimeAdapter', () => {
  it('exposes runtime output as ordered FBP packets with one terminal packet', async () => {
    let listener: ((event: RuntimeSourceEvent) => Promise<void>) | undefined;
    const prompt = vi.fn(async () => {
      await listener?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hi' } });
    });
    const adapter = new StreamingSessionRuntimeAdapter({ resolve: async () => ({
      sessionId: 'session-flow', resultRef: 'session://session-flow',
      runtime: {
        subscribe: (next) => { listener = next; return vi.fn(); },
        prompt,
      },
    }) }, { appendUserMessage: async () => undefined, appendAssistantMessage: async () => undefined });

    const packets = [];
    for await (const packet of adapter.invokePackets(invocation)) packets.push(packet);
    expect(packets.map(({ kind, sequence, payload }) => ({ kind, sequence, type: payload?.type }))).toEqual([
      { kind: 'data', sequence: 0, type: 'accepted' },
      { kind: 'data', sequence: 1, type: 'text_delta' },
      { kind: 'complete', sequence: 2, type: 'completed' },
    ]);
    expect(prompt).toHaveBeenCalledWith('hello');
  });

  it('persists messages and maps ordered runtime events without exposing thinking', async () => {
    let listener: ((event: RuntimeSourceEvent) => void) | undefined;
    const appendUserMessage = vi.fn(async () => undefined);
    const appendAssistantMessage = vi.fn(async () => undefined);
    const adapter = new StreamingSessionRuntimeAdapter({ resolve: async () => ({
      sessionId: 'session-1', resultRef: 'session://session-1',
      runtime: {
        subscribe: (next) => { listener = next; return vi.fn(); },
        prompt: async () => {
          listener?.({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'private' } });
          listener?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hel' } });
          listener?.({ type: 'tool_execution_start', toolName: 'search' });
          listener?.({ type: 'tool_execution_end', toolName: 'write_file', result: { details: { filePath: '/data/solutions/demo/manifest.json' } } });
          listener?.({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }, { type: 'thinking', thinking: 'private' }] } });
        },
      },
    }) }, { appendUserMessage, appendAssistantMessage });
    const events: AgentOutputEvent[] = [];
    for await (const event of adapter.invoke(invocation)) events.push(event);
    expect(events).toEqual([
      { type: 'accepted', sessionId: 'session-1' },
      { type: 'text_delta', delta: 'hel' },
      { type: 'tool_status', label: 'search', state: 'running' },
      { type: 'tool_status', label: 'write_file', state: 'completed' },
      { type: 'artifact_changed', filename: 'manifest.json', filePath: '/data/solutions/demo/manifest.json', artifactType: 'solution' },
      { type: 'assistant_message', content: 'hello' },
      { type: 'completed', resultRef: 'session://session-1' },
    ]);
    expect(appendUserMessage).toHaveBeenCalledWith('session-1', 'hello', []);
    expect(appendAssistantMessage).toHaveBeenCalledWith('session-1', 'hello');
    expect(JSON.stringify(events)).not.toContain('private');
  });

  it('emits a safe failure and does not complete when the runtime rejects', async () => {
    const adapter = new StreamingSessionRuntimeAdapter({ resolve: async () => ({
      sessionId: 'session-1', resultRef: 'session://session-1',
      runtime: { subscribe: () => vi.fn(), prompt: async () => { throw new Error('provider secret'); } },
    }) }, { appendUserMessage: async () => undefined, appendAssistantMessage: async () => undefined });
    const events: AgentOutputEvent[] = [];
    for await (const event of adapter.invoke(invocation)) events.push(event);
    expect(events.at(-1)).toEqual({ type: 'failed', safeCode: 'CHANNEL_RUNTIME_FAILED' });
    expect(events.some((event) => event.type === 'completed')).toBe(false);
    expect(JSON.stringify(events)).not.toContain('provider secret');
  });

  it('propagates cancellation to the active runtime and emits one cancelled terminal packet', async () => {
    let releasePrompt: (() => void) | undefined;
    const abort = vi.fn();
    const adapter = new StreamingSessionRuntimeAdapter({ resolve: async () => ({
      sessionId: 'session-1', resultRef: 'session://session-1',
      runtime: {
        subscribe: () => vi.fn(),
        prompt: () => new Promise<void>((resolve) => { releasePrompt = resolve; }),
        abort,
      },
    }) }, { appendUserMessage: async () => undefined, appendAssistantMessage: async () => undefined });
    const iterator = adapter.invokePackets({ ...invocation, sessionId: 'session-1' })[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { payload: { type: 'accepted' } } });
    await adapter.cancel('session-1');
    await expect(iterator.next()).resolves.toMatchObject({ value: { kind: 'control', payload: { type: 'cancelled' } } });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
    expect(abort).toHaveBeenCalledOnce();
    releasePrompt?.();
  });
});
