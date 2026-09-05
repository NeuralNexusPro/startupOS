import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelInvocation } from '../../../../../core/src/modules/channel-runtime';
import { composeDesktopChannelRuntime } from '../channel-runtime-service';

const roots: string[] = [];
afterEach(() => { for (const value of roots.splice(0)) fs.rmSync(value, { recursive: true, force: true }); });

describe('composeDesktopChannelRuntime', () => {
  it('composes all single-agent and collaboration adapters behind one ingress', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-desktop-channel-'));
    roots.push(dataRoot);
    const runtime = { subscribe: () => vi.fn(), prompt: async () => undefined };
    const agentGateway = {
      provision: async () => 'session-agent',
      resolve: async () => ({ sessionId: 'session-agent', resultRef: 'session://session-agent', runtime }),
      appendUserMessage: async () => undefined,
      appendAssistantMessage: async () => undefined,
    };
    const collaborationBackend = {
      resolveSession: async () => 'session-collaboration',
      subscribe: () => vi.fn(),
      send: async () => ({ success: false }),
      abort: async () => undefined,
    };
    const service = composeDesktopChannelRuntime({ dataRoot, agentGateway, collaborationBackend });
    const input: ChannelInvocation = {
      message: { protocolVersion: '1.0', id: 'message-1', origin: 'originos-ui', connectorId: 'desktop', conversationId: 'window-1', actorId: 'user', content: { text: 'hello' }, receivedAt: '2026-09-04T10:00:00.000Z' },
      target: { kind: 'role-agent', id: 'role-1' },
    };
    const events = [];
    for await (const event of service.ingress.send(input)) events.push(event);
    expect(events).toEqual([
      { type: 'accepted', sessionId: 'session-agent' },
      { type: 'completed', resultRef: 'session://session-agent' },
    ]);
  });
});
