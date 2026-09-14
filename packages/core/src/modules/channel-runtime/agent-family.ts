import { StreamingSessionRuntimeAdapter, type ChannelSessionMessageStorePort, type ChannelSessionResolverPort, type ResolvedChannelSession } from './runtime-adapter';
import type { ChannelInvocation, ChannelRuntimeTarget } from './types';
import type { ChannelRuntimeKind, ChannelRuntimeRegistry } from './runtime-registry';

type AgentFamilyKind = Exclude<ChannelRuntimeTarget['kind'], 'project-multi-agent'>;

export class ChannelSessionResolverRegistry implements ChannelSessionResolverPort {
  private readonly resolvers = new Map<AgentFamilyKind, ChannelSessionResolverPort>();

  register(kind: AgentFamilyKind, resolver: ChannelSessionResolverPort): void {
    if (this.resolvers.has(kind)) throw new Error(`CHANNEL_SESSION_RESOLVER_ALREADY_REGISTERED:${kind}`);
    this.resolvers.set(kind, resolver);
  }

  async resolve(input: ChannelInvocation): Promise<ResolvedChannelSession> {
    if (input.target.kind === 'project-multi-agent') throw new Error('CHANNEL_SESSION_RESOLVER_NOT_SUPPORTED:project-multi-agent');
    const resolver = this.resolvers.get(input.target.kind);
    if (!resolver) throw new Error(`CHANNEL_SESSION_RESOLVER_NOT_REGISTERED:${input.target.kind}`);
    return resolver.resolve(input);
  }
}

export function registerAgentFamilyRuntimes(
  registry: ChannelRuntimeRegistry,
  resolver: ChannelSessionResolverPort,
  messages: ChannelSessionMessageStorePort,
): void {
  const kinds: readonly AgentFamilyKind[] = ['agent', 'role-agent', 'project-agent', 'skill'];
  for (const kind of kinds) registry.register(kind satisfies ChannelRuntimeKind, new StreamingSessionRuntimeAdapter(resolver, messages));
}
