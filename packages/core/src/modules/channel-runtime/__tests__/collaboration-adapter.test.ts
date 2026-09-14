import { describe, expect, it, vi } from 'vitest';
import { CollaborationChannelRuntimeAdapter, type CollaborationChannelEvent } from '../../collaboration-runtime/integrations/channel-runtime-adapter';
import { createFacadeCollaborationChannelBackend } from '../../collaboration-runtime/integrations/facade-channel-backend';
import type { AgentOutputEvent, ChannelInvocation } from '..';

const invocation: ChannelInvocation = {
  message: { protocolVersion: '1.0', id: 'message-1', origin: 'wecom', connectorId: 'wecom-main', conversationId: 'room-1', actorId: 'user-1', content: { text: 'ship it' }, receivedAt: '2026-09-04T10:00:00.000Z' },
  target: { kind: 'project-multi-agent', projectId: 'project-1', runtime: 'collaboration' },
};

describe('CollaborationChannelRuntimeAdapter', () => {
  it('returns only aggregated user-visible project output', async () => {
    let listener: ((event: CollaborationChannelEvent) => Promise<void>) | undefined;
    const send = vi.fn(async () => {
      await listener?.({ type: 'AGENT_THINKING', payload: { content: 'private' }, source: 'worker-1' });
      await listener?.({ type: 'TASK_STARTED', payload: { taskId: 'task-1', description: 'Research' }, source: 'worker-1' });
      await listener?.({ type: 'ASSISTANT_MESSAGE', payload: { content: 'Project result' }, source: 'supervisor' });
      await listener?.({ type: 'DAG_COMPLETE', payload: { resultRef: 'collaboration://session-1' }, source: 'supervisor' });
      return { success: true };
    });
    const adapter = new CollaborationChannelRuntimeAdapter({
      resolveSession: async () => 'session-1',
      subscribe: (_sessionId, next) => { listener = next; return vi.fn(); },
      send,
      abort: async () => undefined,
    });

    const events: AgentOutputEvent[] = [];
    for await (const event of adapter.invoke(invocation)) events.push(event);
    expect(events).toEqual([
      { type: 'accepted', sessionId: 'session-1' },
      { type: 'tool_status', label: 'Research', state: 'running' },
      { type: 'assistant_message', content: 'Project result' },
      { type: 'completed', resultRef: 'collaboration://session-1' },
    ]);
    expect(JSON.stringify(events)).not.toContain('private');
    expect(send).toHaveBeenCalledWith('session-1', 'ship it', []);
  });

  it('maps project HITL and safe failures without leaking internal errors', async () => {
    let listener: ((event: CollaborationChannelEvent) => Promise<void>) | undefined;
    const adapter = new CollaborationChannelRuntimeAdapter({
      resolveSession: async () => 'session-2',
      subscribe: (_sessionId, next) => { listener = next; return vi.fn(); },
      send: async () => {
        await listener?.({ type: 'HUMAN_REVIEW_REQUEST', payload: { requestId: 'review-1', summary: 'Approve release?' }, source: 'supervisor' });
        await listener?.({ type: 'DAG_FAIL', payload: { error: 'provider-secret' }, source: 'system' });
        return { success: true };
      },
      abort: async () => undefined,
    });
    const events: AgentOutputEvent[] = [];
    for await (const event of adapter.invoke(invocation)) events.push(event);
    expect(events.at(-2)).toEqual({ type: 'hitl_request', requestId: 'review-1', summary: 'Approve release?' });
    expect(events.at(-1)).toEqual({ type: 'failed', safeCode: 'CHANNEL_COLLABORATION_FAILED' });
    expect(JSON.stringify(events)).not.toContain('provider-secret');
  });

  it('creates or restores collaboration sessions only through the public facade', async () => {
    const createSession = vi.fn(async () => ({ id: 'session-new', projectId: 'proj-project-1', status: 'created' }));
    const executeSession = vi.fn(async () => ({ status: 'greeting', result: null }));
    const send = vi.fn(async () => ({ success: true }));
    const backend = createFacadeCollaborationChannelBackend({
      getSession: async () => null,
      createSession,
      executeSession,
      subscribe: () => vi.fn(),
      send,
      abort: async () => undefined,
    });
    await expect(backend.resolveSession(invocation)).resolves.toBe('session-new');
    await backend.send('session-new', 'ship it', ['attachment://one']);
    expect(createSession).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(executeSession).toHaveBeenCalledWith('session-new');
    expect(send).toHaveBeenCalledWith('session-new', 'ship it\n\nAttachments:\n- attachment://one');
  });

  it('rejects a bound collaboration session from another project', async () => {
    const backend = createFacadeCollaborationChannelBackend({
      getSession: async () => ({ id: 'session-wrong', projectId: 'proj-other', status: 'running' }),
      createSession: async () => ({ id: 'unused', projectId: 'proj-project-1', status: 'created' }),
      executeSession: async () => ({ status: 'running', result: null }),
      subscribe: () => vi.fn(),
      send: async () => ({ success: true }),
      abort: async () => undefined,
    });
    await expect(backend.resolveSession({ ...invocation, sessionId: 'session-wrong' }))
      .rejects.toThrow('CHANNEL_COLLABORATION_SESSION_MISMATCH');
  });
});
