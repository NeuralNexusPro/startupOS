import { describe, expect, it, vi } from 'vitest';
import { ChannelRuntimeRegistry, type AgentOutputEvent, type ChannelInvocation, type ChannelRuntimeKind } from '..';

function invocation(kind: ChannelRuntimeKind): ChannelInvocation {
  const target = kind === 'project-multi-agent'
    ? { kind, projectId: 'project-1', runtime: 'collaboration' as const }
    : kind === 'project-agent'
      ? { kind, id: 'project-agent-1', projectId: 'project-1' }
      : kind === 'skill'
        ? { kind, id: 'skill-1', ownership: { mode: 'ephemeral' as const } }
        : { kind, id: `${kind}-1` };
  return {
    message: { protocolVersion: '1.0', id: 'message-1', origin: 'originos-ui', connectorId: 'desktop', conversationId: 'window-1', actorId: 'user', content: { text: 'hello' }, receivedAt: '2026-09-04T10:00:00.000Z' },
    target,
  };
}

describe('ChannelRuntimeRegistry', () => {
  it('routes every supported target kind through its registered public adapter', async () => {
    const registry = new ChannelRuntimeRegistry();
    const kinds: ChannelRuntimeKind[] = ['agent', 'role-agent', 'project-agent', 'skill', 'project-multi-agent'];
    const invoked: ChannelRuntimeKind[] = [];
    for (const kind of kinds) registry.register(kind, { invoke: async function* (input) { invoked.push(input.target.kind); yield { type: 'completed', resultRef: `result://${kind}` }; } });
    for (const kind of kinds) {
      const events: AgentOutputEvent[] = [];
      for await (const event of registry.invoke(invocation(kind))) events.push(event);
      expect(events.at(-1)).toEqual({ type: 'completed', resultRef: `result://${kind}` });
    }
    expect(invoked).toEqual(kinds);
  });

  it('isolates missing and duplicate registrations with safe errors', async () => {
    const registry = new ChannelRuntimeRegistry();
    const runtime = { invoke: async function* () { yield { type: 'completed' as const, resultRef: 'ok' }; } };
    registry.register('agent', runtime);
    expect(() => registry.register('agent', runtime)).toThrow('CHANNEL_RUNTIME_ALREADY_REGISTERED');
    const events: AgentOutputEvent[] = [];
    for await (const event of registry.invoke(invocation('role-agent'))) events.push(event);
    expect(events).toEqual([{ type: 'failed', safeCode: 'CHANNEL_RUNTIME_NOT_REGISTERED' }]);
  });

  it('fans cancellation out without requiring channel knowledge of runtime internals', async () => {
    const cancel = vi.fn(async () => undefined);
    const registry = new ChannelRuntimeRegistry();
    registry.register('project-multi-agent', { invoke: async function* () { yield { type: 'cancelled' as const }; }, cancel });
    await registry.cancel('session-1');
    expect(cancel).toHaveBeenCalledWith('session-1');
  });
});
