import { describe, expect, it, vi } from 'vitest';
import {
  PiAgentChannelSessionGateway,
  toAgentLaunchContext,
  type ChannelInvocation,
} from '..';

function invocation(target: ChannelInvocation['target'], sessionId?: string): ChannelInvocation {
  return {
    message: { protocolVersion: '1.0', id: 'message-1', origin: 'wecom', connectorId: 'wecom-main', conversationId: 'chat-1', actorId: 'user-1', content: { text: 'hello' }, receivedAt: '2026-09-04T10:00:00.000Z' },
    target,
    sessionId,
  };
}

describe('PiAgentChannelSessionGateway', () => {
  it('maps every single-agent target to the established launcher contract', () => {
    expect(toAgentLaunchContext(invocation({ kind: 'agent', id: 'agent-1' }))).toMatchObject({ entryType: 'agent', entryId: 'agent-1' });
    expect(toAgentLaunchContext(invocation({ kind: 'role-agent', id: 'role-1' }))).toMatchObject({ entryType: 'role-agent', entryId: 'role-1' });
    expect(toAgentLaunchContext(invocation({ kind: 'project-agent', id: 'manager-1', projectId: 'project-1' }))).toMatchObject({ entryType: 'project', entryId: 'project-1', projectId: 'project-1' });
    expect(toAgentLaunchContext(invocation({ kind: 'skill', id: 'skill-1', ownership: { mode: 'ephemeral' } }))).toMatchObject({ entryType: 'skill', entryId: 'skill-1' });
    expect(toAgentLaunchContext(invocation({ kind: 'skill', id: 'skill-1', ownership: { mode: 'inherited', ownerKind: 'project', ownerId: 'project-1' } }))).toMatchObject({ entryType: 'skill', entryId: 'skill-1', projectId: 'project-1' });
  });

  it('launches, restores, persists attachment metadata and exposes the runtime handle', async () => {
    const launch = vi.fn(async () => ({ success: true, sessionId: 'session-1', systemPrompt: '', agentType: 'role-agent', baseDir: '/agents/role-1' }));
    const addMessage = vi.fn(async () => ({ sessionId: 'session-1' }));
    const runtime = { prompt: vi.fn(async () => undefined), subscribe: vi.fn(() => vi.fn()), abort: vi.fn() };
    const session = { sessionId: 'session-1', projectContext: { projectId: 'role-1', projectName: 'role-1' } };
    const gateway = new PiAgentChannelSessionGateway({
      launch,
      getSession: async () => session,
      addMessage,
      getOrRestoreRuntime: async () => runtime,
    });
    const input = invocation({ kind: 'role-agent', id: 'role-1' });
    await expect(gateway.provision(input)).resolves.toBe('session-1');
    const resolved = await gateway.resolve({ ...input, sessionId: 'session-1' });
    await resolved.runtime.prompt('prompt');
    resolved.runtime.subscribe(async () => undefined)();
    await resolved.runtime.abort?.();
    expect(runtime.prompt).toHaveBeenCalledWith('prompt');
    expect(runtime.subscribe).toHaveBeenCalledOnce();
    expect(runtime.abort).toHaveBeenCalledOnce();
    await gateway.appendUserMessage('session-1', 'hello', ['attachment://one']);
    await gateway.appendAssistantMessage('session-1', 'done');
    expect(addMessage).toHaveBeenNthCalledWith(1, 'session-1', {
      role: 'user', content: 'hello', metadata: { attachmentRefs: ['attachment://one'] },
    }, 'role-1');
    expect(addMessage).toHaveBeenNthCalledWith(2, 'session-1', { role: 'assistant', content: 'done' }, 'role-1');
  });

  it('fails closed for missing sessions and launcher failures', async () => {
    const gateway = new PiAgentChannelSessionGateway({
      launch: async () => ({ success: false, sessionId: '', systemPrompt: '', agentType: '', baseDir: '', error: 'asset missing' }),
      getSession: async () => null,
      addMessage: async () => null,
      getOrRestoreRuntime: async () => { throw new Error('unused'); },
    });
    await expect(gateway.provision(invocation({ kind: 'agent', id: 'missing' }))).rejects.toThrow('CHANNEL_SESSION_PROVISION_FAILED');
    await expect(gateway.resolve(invocation({ kind: 'agent', id: 'missing' }, 'session-missing'))).rejects.toThrow('CHANNEL_SESSION_NOT_FOUND');
  });

  it('uses an injected Task-aware execution port instead of bypassing it', async () => {
    const prompt = vi.fn(async () => undefined);
    const executeMessage = vi.fn(async (_session, _content, _promptChat: () => Promise<void>) => undefined);
    const session = { sessionId: 'session-1', projectContext: { projectId: 'agent-1', projectName: 'agent-1' } };
    const gateway = new PiAgentChannelSessionGateway({
      launch: async () => ({ success: true, sessionId: 'session-1', systemPrompt: '', agentType: 'agent', baseDir: '/agents/agent-1' }),
      getSession: async () => session,
      addMessage: async () => session,
      getOrRestoreRuntime: async () => ({ prompt, subscribe: () => vi.fn(), abort: vi.fn() }),
      executeMessage,
    });
    await gateway.provision(invocation({ kind: 'agent', id: 'agent-1' }));
    const resolved = await gateway.resolve(invocation({ kind: 'agent', id: 'agent-1' }, 'session-1'));
    await resolved.runtime.prompt('task reply');
    expect(executeMessage).toHaveBeenCalledWith(session, 'hello', expect.any(Function));
    expect(prompt).not.toHaveBeenCalled();
  });

  it('uses the persisted session project when a UI session target has a different id', async () => {
    const getSession = vi.fn(async () => ({
      sessionId: 'session-1',
      projectContext: { projectId: 'stored-project', projectName: 'Stored project' },
    }));
    const gateway = new PiAgentChannelSessionGateway({
      launch: async () => ({ success: true, sessionId: 'unused', systemPrompt: '', agentType: 'agent', baseDir: '' }),
      getSession,
      addMessage: async () => null,
      getOrRestoreRuntime: async () => ({ prompt: async () => undefined, subscribe: () => vi.fn(), abort: vi.fn() }),
    });
    await gateway.resolve({
      ...invocation({ kind: 'skill', id: 'skill-1', ownership: { mode: 'ephemeral' } }, 'session-1'),
      sessionProjectId: 'stored-project',
    });
    expect(getSession).toHaveBeenCalledWith('session-1', 'stored-project');
  });
});
