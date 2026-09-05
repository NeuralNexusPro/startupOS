import path from 'node:path';
import type { LaunchContext, LaunchResult } from '../../lib/features/services/launcher';
import { getDataRoot } from '../../lib/paths';
import type { AgentMessage, AgentSession } from '../../types/agent';
import type { ChannelSessionMessageStorePort, ChannelSessionResolverPort, ResolvedChannelSession, RuntimeSourceEvent } from './runtime-adapter';
import type { ChannelInvocation } from './types';
import type { ChannelSessionProvisionerPort } from './binding-ingress';

interface AgentRuntimeLike {
  prompt(message: string): Promise<void>;
  subscribe(listener: (event: unknown) => void): () => void;
  abort(): void;
}

export interface PiAgentChannelGatewayDependencies {
  launch(context: LaunchContext): Promise<LaunchResult>;
  getSession(sessionId: string, projectId?: string): Promise<AgentSession | null>;
  addMessage(
    sessionId: string,
    message: Omit<AgentMessage, 'id' | 'timestamp'>,
    projectId?: string,
  ): Promise<AgentSession | null>;
  getOrRestoreRuntime(session: AgentSession): Promise<AgentRuntimeLike>;
  executeMessage?(
    session: AgentSession,
    content: string,
    promptChat: () => Promise<void>,
  ): Promise<void>;
}

export class PiAgentChannelSessionGateway implements ChannelSessionProvisionerPort, ChannelSessionResolverPort, ChannelSessionMessageStorePort {
  private readonly sessionProjects = new Map<string, string>();

  constructor(private readonly dependencies: PiAgentChannelGatewayDependencies) {}

  async provision(input: ChannelInvocation): Promise<string> {
    const context = toAgentLaunchContext(input);
    const result = await this.dependencies.launch(context);
    if (!result.success || !result.sessionId) throw new Error('CHANNEL_SESSION_PROVISION_FAILED');
    this.sessionProjects.set(result.sessionId, projectIdFor(input));
    return result.sessionId;
  }

  async resolve(input: ChannelInvocation): Promise<ResolvedChannelSession> {
    if (input.target.kind === 'project-multi-agent') throw new Error('CHANNEL_AGENT_TARGET_INVALID');
    if (!input.sessionId) throw new Error('CHANNEL_SESSION_ID_REQUIRED');
    const projectId = input.sessionProjectId
      ?? this.sessionProjects.get(input.sessionId)
      ?? projectIdFor(input);
    const session = await this.dependencies.getSession(input.sessionId, projectId);
    if (!session) throw new Error('CHANNEL_SESSION_NOT_FOUND');
    this.sessionProjects.set(input.sessionId, session.projectContext.projectId);
    const runtime = await this.dependencies.getOrRestoreRuntime(session);
    return {
      sessionId: session.sessionId,
      resultRef: `session://${session.sessionId}`,
      runtime: {
        prompt: async (message) => {
          const promptChat = () => runtime.prompt(message);
          if (this.dependencies.executeMessage) {
            await this.dependencies.executeMessage(
              session,
              input.message.content.text ?? '',
              promptChat,
            );
          } else {
            await promptChat();
          }
        },
        subscribe: (listener) => runtime.subscribe((event) => { void listener(event as RuntimeSourceEvent); }),
        abort: () => runtime.abort(),
      },
    };
  }

  async appendUserMessage(sessionId: string, content: string, attachmentRefs: readonly string[]): Promise<void> {
    const projectId = this.requiredProjectId(sessionId);
    const saved = await this.dependencies.addMessage(sessionId, {
      role: 'user',
      content,
      ...(attachmentRefs.length > 0 ? { metadata: { attachmentRefs: [...attachmentRefs] } } : {}),
    }, projectId);
    if (!saved) throw new Error('CHANNEL_SESSION_MESSAGE_PERSIST_FAILED');
  }

  async appendAssistantMessage(sessionId: string, content: string): Promise<void> {
    const saved = await this.dependencies.addMessage(
      sessionId,
      { role: 'assistant', content },
      this.requiredProjectId(sessionId),
    );
    if (!saved) throw new Error('CHANNEL_SESSION_MESSAGE_PERSIST_FAILED');
  }

  private requiredProjectId(sessionId: string): string {
    const projectId = this.sessionProjects.get(sessionId);
    if (!projectId) throw new Error('CHANNEL_SESSION_NOT_RESOLVED');
    return projectId;
  }
}

export function toAgentLaunchContext(input: ChannelInvocation): LaunchContext {
  const target = input.target;
  if (target.kind === 'project-multi-agent') throw new Error('CHANNEL_AGENT_TARGET_INVALID');
  if (target.kind === 'project-agent') {
    return { entryType: 'project', entryId: target.projectId, projectId: target.projectId, restoreSessionId: input.sessionId };
  }
  if (target.kind === 'skill') {
    if (target.ownership.mode === 'ephemeral') {
      return { entryType: 'skill', entryId: target.id, restoreSessionId: input.sessionId };
    }
    const ownerBaseDir = target.ownership.ownerKind === 'project'
      ? path.join(getDataRoot(), 'projects', target.ownership.ownerId)
      : path.join(getDataRoot(), 'agents', target.ownership.ownerId);
    return {
      entryType: 'skill',
      entryId: target.id,
      projectId: target.ownership.ownerId,
      agentBaseDir: ownerBaseDir,
      restoreSessionId: input.sessionId,
    };
  }
  return { entryType: target.kind, entryId: target.id, restoreSessionId: input.sessionId };
}

function projectIdFor(input: ChannelInvocation): string {
  const target = input.target;
  if (target.kind === 'project-multi-agent') return target.projectId;
  if (target.kind === 'project-agent') return target.projectId;
  if (target.kind === 'skill') return target.ownership.mode === 'inherited' ? target.ownership.ownerId : `skill-${target.id}`;
  return target.id;
}
