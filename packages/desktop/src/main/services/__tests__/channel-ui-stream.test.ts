import { describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '../../../../../core/src/types/agent';
import type { ChannelFlowMessageIngress } from '../../../../../core/src/modules/channel-runtime';
import { runUiChannelStream, toUiChannelTarget } from '../channel-ui-stream';

const session: AgentSession = {
  sessionId: 'session-1', createdAt: 1, updatedAt: 1, status: 'active', messages: [], systemPrompt: '', agentType: 'role-agent',
  config: { sessionId: 'session-1' },
  projectContext: { projectId: 'role-1', projectName: 'Role 1', entryType: 'role-agent', entryId: 'role-1' },
};

describe('UI Channel stream adapter', () => {
  it('maps restored Session metadata to a Channel target', () => {
    expect(toUiChannelTarget(session)).toEqual({ kind: 'role-agent', id: 'role-1' });
    expect(toUiChannelTarget({ ...session, agentType: 'skill', projectContext: { ...session.projectContext, projectId: 'project-1', entryType: 'skill', entryId: 'skill-1' } }))
      .toEqual({ kind: 'skill', id: 'skill-1', ownership: { mode: 'ephemeral' } });
    expect(toUiChannelTarget({ ...session, agentType: 'project', projectContext: { ...session.projectContext, projectId: 'project-1', entryType: undefined, entryId: undefined } }))
      .toEqual({ kind: 'project-agent', id: 'project-1', projectId: 'project-1' });
  });

  it('maps FBP packets to the existing renderer stream protocol', async () => {
    const ingress: ChannelFlowMessageIngress = {
      send: async function* () { /* compatibility */ },
      sendPackets: async function* () {
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p0', sequence: 0, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-05T10:00:00.000Z', payload: { type: 'accepted', sessionId: 'session-1' } };
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p1', sequence: 1, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-05T10:00:00.000Z', payload: { type: 'text_delta', delta: 'hello' } };
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p2', sequence: 2, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-05T10:00:00.000Z', payload: { type: 'tool_status', label: 'search', state: 'running' } };
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p2b', sequence: 3, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-05T10:00:00.000Z', payload: { type: 'artifact_changed', filename: 'manifest.json', filePath: '/data/solutions/demo/manifest.json', artifactType: 'solution' } };
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p3', sequence: 3, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-05T10:00:00.000Z', payload: { type: 'assistant_message', content: 'hello' } };
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p4', sequence: 4, port: 'runtime.output', kind: 'complete', emittedAt: '2026-09-05T10:00:00.000Z', payload: { type: 'completed', resultRef: 'session://session-1' } };
      },
    };
    const send = vi.fn();
    await runUiChannelStream({ ingress, session, content: 'hi', streamId: 'stream-1', send });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'batch_events', sessionId: 'session-1', streamId: 'stream-1' }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_start', data: { toolName: 'search' } }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'artifact_changed', data: { filename: 'manifest.json', filePath: '/data/solutions/demo/manifest.json', artifactType: 'solution' } }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'assistant_message', data: { content: 'hello', isStreaming: false } }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'done', data: { content: 'hello', failed: false } }));
  });

  it('maps safe failure and cancellation to terminal renderer events', async () => {
    const ingress: ChannelFlowMessageIngress = {
      send: async function* () { /* compatibility */ },
      sendPackets: async function* () {
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p0', sequence: 0, port: 'runtime.output', kind: 'error', emittedAt: '2026-09-05T10:00:00.000Z', payload: { type: 'failed', safeCode: 'CHANNEL_RUNTIME_FAILED' } };
      },
    };
    const send = vi.fn();
    await runUiChannelStream({ ingress, session, content: 'hi', send });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', data: { message: 'CHANNEL_RUNTIME_FAILED' } }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'done', data: { content: '', failed: true } }));
  });
});
