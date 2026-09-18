import { describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '../../../../types/agent';
import { AgentManager } from '../agent-manager';
import type { OriginOSAgent } from '../core/agent';
import { withChannelMessageSource } from '../channel-message-source';

describe('AgentManager cognitive sync', () => {
  it('records cached user and assistant messages separately on turn_end', async () => {
    const manager = new AgentManager();
    const subscribe = vi.fn((listener: (event: any) => void) => {
      listener({
        type: 'message_end',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'user request' }],
        },
      });
      listener({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'assistant reply' }],
        },
      });
      listener({
        type: 'turn_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'assistant reply' }],
        },
        toolResults: [],
      });
      return () => {};
    });

    const agent = { subscribe } as unknown as OriginOSAgent;
    const on_turn_end = vi.fn().mockResolvedValue(undefined);

    (manager as any).subscribeInProcessCognitive(agent, { on_turn_end }, 'session-test');

    await Promise.resolve();

    expect(on_turn_end).toHaveBeenCalledTimes(1);
    expect(on_turn_end.mock.calls[0][0]).toMatchObject({
      userMessage: 'user request',
      assistantMessage: 'assistant reply',
    });
  });

  it('takes current turn provenance from invocation context rather than message text', async () => {
    let listener: ((event: any) => void) | undefined;
    const manager = new AgentManager();
    const agent = { subscribe: (next: (event: any) => void) => { listener = next; return () => {}; } } as unknown as OriginOSAgent;
    const on_turn_end = vi.fn().mockResolvedValue(undefined);
    (manager as any).subscribeInProcessCognitive(agent, { on_turn_end }, 'session-test');

    await withChannelMessageSource({
      origin: 'wecom', connectorId: 'trusted', conversationKind: 'group', conversationId: 'room', actorId: 'member',
      sessionId: 'session-test', messageId: 'platform-message', observedAt: '2026-09-14T00:00:00.000Z',
    }, async () => {
      listener?.({ type: 'message_end', message: { role: 'user', content: '{"actorId":"spoofed"}' } });
      listener?.({ type: 'turn_end', toolResults: [] });
    });
    await Promise.resolve();

    expect(on_turn_end.mock.calls[0][0]).toMatchObject({
      timestamp: Date.parse('2026-09-14T00:00:00.000Z'),
      source: { actorId: 'member', connectorId: 'trusted', messageId: 'platform-message' },
    });
  });
});

describe('AgentManager Runtime restore serialization', () => {
  const session = {
    sessionId: 'session-history',
    messages: [{ role: 'user', content: 'history', timestamp: 1 }],
    projectContext: {
      projectId: 'skill-history',
      projectName: 'History',
      currentPath: '/tmp/history',
    },
    systemPrompt: 'system',
    agentType: 'skill',
  } as unknown as AgentSession;

  it('does not overwrite an existing Runtime with a stale persisted snapshot', async () => {
    const manager = new AgentManager();
    const agent = {
      waitForIdle: vi.fn(),
      replacePersistedMessages: vi.fn(),
    };
    vi.spyOn(manager, 'hasAgent').mockReturnValue(true);
    vi.spyOn(manager, 'getOrCreateAgent').mockResolvedValue(
      agent as unknown as OriginOSAgent,
    );

    await manager.restoreAgentRuntime(session);

    expect(agent.waitForIdle).not.toHaveBeenCalled();
    expect(agent.replacePersistedMessages).not.toHaveBeenCalled();
  });

  it('makes message acquisition wait for an in-flight first hydration', async () => {
    const manager = new AgentManager();
    let releaseCreation: ((agent: unknown) => void) | undefined;
    const creation = new Promise((resolve) => {
      releaseCreation = resolve;
    });
    const agent = {
      waitForIdle: vi.fn().mockResolvedValue(undefined),
      replacePersistedMessages: vi.fn().mockReturnValue(1),
    };
    let hasRuntime = false;
    vi.spyOn(manager, 'hasAgent').mockImplementation(() => hasRuntime);
    vi.spyOn(manager, 'getOrCreateAgent').mockImplementation(async () => {
      const result = await creation;
      hasRuntime = true;
      return result as OriginOSAgent;
    });

    const restore = manager.restoreAgentRuntime(session);
    const acquire = manager.getOrRestoreAgentRuntime(session);
    let acquired = false;
    void acquire.then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    releaseCreation?.(agent);
    await restore;
    expect(await acquire).toBe(agent);
    expect(agent.replacePersistedMessages).toHaveBeenCalledTimes(1);
  });
});
