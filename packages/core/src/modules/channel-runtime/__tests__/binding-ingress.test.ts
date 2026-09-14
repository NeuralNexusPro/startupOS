import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BindingChannelMessageIngress,
  ChannelSessionBindingStore,
  type ChannelInvocation,
  type ChannelRuntimePort,
} from '..';

const roots: string[] = [];
afterEach(() => { for (const value of roots.splice(0)) fs.rmSync(value, { recursive: true, force: true }); });

function invocation(id: string): ChannelInvocation {
  return {
    message: { protocolVersion: '1.0', id, origin: 'wecom', connectorId: 'wecom-main', conversationId: 'chat-1', actorId: 'user-1', content: { text: 'hello' }, receivedAt: '2026-09-04T10:00:00.000Z' },
    target: { kind: 'role-agent', id: 'role-1' },
  };
}

describe('BindingChannelMessageIngress', () => {
  it('binds a channel conversation before invoking the runtime and reuses its session', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-channel-ingress-'));
    roots.push(dataRoot);
    const seenSessionIds: Array<string | undefined> = [];
    const runtime: ChannelRuntimePort = {
      invoke: async function* (input) {
        seenSessionIds.push(input.sessionId);
        yield { type: 'completed', resultRef: `session://${input.sessionId}` };
      },
    };
    const provision = vi.fn(async () => 'session-role-1');
    const ingress = new BindingChannelMessageIngress(
      new ChannelSessionBindingStore(dataRoot),
      { provision },
      runtime,
    );

    for await (const _event of ingress.send(invocation('message-1'))) { /* consume */ }
    for await (const _event of ingress.send(invocation('message-2'))) { /* consume */ }
    expect(provision).toHaveBeenCalledOnce();
    expect(seenSessionIds).toEqual(['session-role-1', 'session-role-1']);
  });

  it('preserves an explicitly restored session without provisioning a new one', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-channel-ingress-'));
    roots.push(dataRoot);
    const provision = vi.fn(async () => 'unused');
    const runtime: ChannelRuntimePort = { invoke: async function* (input) { yield { type: 'accepted', sessionId: input.sessionId ?? 'missing' }; } };
    const ingress = new BindingChannelMessageIngress(new ChannelSessionBindingStore(dataRoot), { provision }, runtime);
    const events = [];
    for await (const event of ingress.send({ ...invocation('message-1'), sessionId: 'session-restored' })) events.push(event);
    expect(events).toEqual([{ type: 'accepted', sessionId: 'session-restored' }]);
    expect(provision).not.toHaveBeenCalled();
  });
});
