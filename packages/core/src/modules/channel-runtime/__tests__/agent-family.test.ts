import { describe, expect, it, vi } from 'vitest';
import {
  ChannelRuntimeRegistry,
  ChannelSessionResolverRegistry,
  registerAgentFamilyRuntimes,
  type AgentOutputEvent,
  type ChannelInvocation,
  type ChannelRuntimeKind,
  type ChannelSessionResolverPort,
} from '..';

function invocation(kind: Exclude<ChannelRuntimeKind, 'project-multi-agent'>): ChannelInvocation {
  const target = kind === 'project-agent'
    ? { kind, id: 'project-agent-1', projectId: 'project-1' }
    : kind === 'skill'
      ? { kind, id: 'skill-1', ownership: { mode: 'ephemeral' as const } }
      : { kind, id: `${kind}-1` };
  return {
    message: { protocolVersion: '1.0', id: `message-${kind}`, origin: 'originos-ui', connectorId: 'desktop', conversationId: 'window-1', actorId: 'user', content: { text: 'hello' }, receivedAt: '2026-09-04T10:00:00.000Z' },
    target,
  };
}

describe('agent-family channel adapters', () => {
  it('resolves every single-agent target through an explicit target resolver', async () => {
    const resolvers = new ChannelSessionResolverRegistry();
    const kinds = ['agent', 'role-agent', 'project-agent', 'skill'] as const;
    const resolved: string[] = [];
    for (const kind of kinds) {
      resolvers.register(kind, {
        resolve: async () => {
          resolved.push(kind);
          return {
            sessionId: `session-${kind}`,
            resultRef: `session://session-${kind}`,
            runtime: { subscribe: () => vi.fn(), prompt: async () => undefined },
          };
        },
      });
    }
    const runtimes = new ChannelRuntimeRegistry();
    registerAgentFamilyRuntimes(runtimes, resolvers, {
      appendUserMessage: async () => undefined,
      appendAssistantMessage: async () => undefined,
    });

    for (const kind of kinds) {
      const events: AgentOutputEvent[] = [];
      for await (const event of runtimes.invoke(invocation(kind))) events.push(event);
      expect(events).toEqual([
        { type: 'accepted', sessionId: `session-${kind}` },
        { type: 'completed', resultRef: `session://session-${kind}` },
      ]);
    }
    expect(resolved).toEqual(kinds);
  });

  it('fails closed when a target resolver is missing or duplicated', async () => {
    const resolvers = new ChannelSessionResolverRegistry();
    const resolver: ChannelSessionResolverPort = { resolve: async () => { throw new Error('unused'); } };
    resolvers.register('agent', resolver);
    expect(() => resolvers.register('agent', resolver)).toThrow('CHANNEL_SESSION_RESOLVER_ALREADY_REGISTERED');
    await expect(resolvers.resolve(invocation('skill'))).rejects.toThrow('CHANNEL_SESSION_RESOLVER_NOT_REGISTERED:skill');
  });
});
