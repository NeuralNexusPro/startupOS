import { describe, expect, it, vi } from 'vitest';
import { OriginOSAgent } from '../../../lib/integrations/pi-agent/core/agent';
import { StreamingSessionRuntimeAdapter } from '../runtime-adapter';
import type { ChannelInvocation } from '../types';

const invocation: ChannelInvocation = {
  message: {
    protocolVersion: '1.0', id: 'message-1', origin: 'originos-ui',
    connectorId: 'desktop', conversationId: 'history-1', actorId: 'user-1',
    content: { text: 'continue' }, receivedAt: '2026-09-12T00:00:00.000Z',
  },
  target: { kind: 'agent', id: 'agent-1' }, sessionId: 'history-1',
};

describe.each([false, true])('model error reporting with recovery %s', (emptyStopRecoveryEnabled) => {
  it.each([false, true])('reports the actual model outcome (failure=%s)', async (failure) => {
    const agent = new OriginOSAgent({
      sessionId: 'history-1', systemPrompt: 'test',
      model: { provider: 'anthropic', id: 'test-model' }, emptyStopRecoveryEnabled,
    });
    const internal = (agent as unknown as { agent: {
      prompt(message: string): Promise<void>; emit(event: unknown): void;
    } }).agent;
    vi.spyOn(internal, 'prompt').mockImplementationOnce(async () => {
      internal.emit({ type: 'message_end', message: {
        role: 'assistant', content: failure ? [] : [{ type: 'text', text: 'reply' }],
        stopReason: failure ? 'error' : 'stop',
        ...(failure ? { errorMessage: 'HTTP 402: sk-private-fixture' } : {}),
      } });
    });
    const appendAssistantMessage = vi.fn(async () => undefined);
    const adapter = new StreamingSessionRuntimeAdapter({ resolve: async () => ({
      sessionId: 'history-1', resultRef: 'history-1', runtime: {
        prompt: (message) => agent.prompt(message),
        subscribe: (listener) => agent.subscribe((event) => { void listener(event); }),
      },
    }) }, { appendUserMessage: async () => undefined, appendAssistantMessage });
    try {
      const events = [];
      for await (const event of adapter.invoke(invocation)) events.push(event);
      expect(events.at(-1)).toMatchObject(failure
        ? { type: 'failed', safeCode: 'CHANNEL_RUNTIME_FAILED' }
        : { type: 'completed' });
      expect(JSON.stringify(events)).not.toContain('sk-private-fixture');
      if (failure) {
        expect(events.some((event) => event.type === 'completed')).toBe(false);
        expect(appendAssistantMessage).not.toHaveBeenCalled();
      } else {
        expect(appendAssistantMessage).toHaveBeenCalledWith('history-1', 'reply');
      }
    } finally { agent.destroy(); }
  });
});
