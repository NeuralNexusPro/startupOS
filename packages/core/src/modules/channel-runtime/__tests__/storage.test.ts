import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelDeliveryStore, ChannelSessionBindingStore } from '..';

const roots: string[] = [];
function root(): string { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-channel-')); roots.push(value); return value; }
afterEach(() => { for (const value of roots.splice(0)) fs.rmSync(value, { recursive: true, force: true }); });

describe('ChannelSessionBindingStore', () => {
  it('reuses an active binding and isolates target changes', async () => {
    const createSessionId = vi.fn(async () => `session-${createSessionId.mock.calls.length}`);
    const store = new ChannelSessionBindingStore(root(), () => new Date('2026-09-04T10:00:00.000Z'));
    const input = { origin: 'wecom' as const, connectorId: 'wecom-main', conversationId: 'chat-1', target: { kind: 'role-agent' as const, id: 'role-1' }, createSessionId };
    const first = await store.resolve(input);
    const second = await store.resolve(input);
    const other = await store.resolve({ ...input, target: { kind: 'project-multi-agent', projectId: 'project-1', runtime: 'collaboration' } });
    expect(second.sessionId).toBe(first.sessionId);
    expect(other.sessionId).not.toBe(first.sessionId);
    expect(createSessionId).toHaveBeenCalledTimes(2);
  });

  it('creates a new session after reset or expiry', async () => {
    let now = new Date('2026-09-04T10:00:00.000Z');
    const store = new ChannelSessionBindingStore(root(), () => now);
    let sequence = 0;
    const input = { origin: 'wecom' as const, connectorId: 'wecom-main', conversationId: 'chat-1', target: { kind: 'agent' as const, id: 'agent-1' }, ttlMs: 1_000, createSessionId: async () => `session-${++sequence}` };
    const first = await store.resolve(input);
    now = new Date('2026-09-04T10:00:02.000Z');
    expect((await store.resolve(input)).sessionId).not.toBe(first.sessionId);
    expect(store.reset(input.origin, input.connectorId, input.conversationId, input.target)).toBe(true);
    expect((await store.resolve(input)).sessionId).toBe('session-3');
  });

  it('coalesces concurrent resolves so only one session is created', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const createSessionId = vi.fn(async () => { await gate; return 'session-shared'; });
    const store = new ChannelSessionBindingStore(root(), () => new Date('2026-09-04T10:00:00.000Z'));
    const input = { origin: 'wecom' as const, connectorId: 'wecom-main', conversationId: 'chat-1', target: { kind: 'agent' as const, id: 'agent-1' }, createSessionId };
    const first = store.resolve(input);
    const second = store.resolve(input);
    release?.();
    const [a, b] = await Promise.all([first, second]);
    expect(a.sessionId).toBe('session-shared');
    expect(b.sessionId).toBe('session-shared');
    expect(createSessionId).toHaveBeenCalledOnce();
  });

  it('rejects invalid TTL and retries after session creation fails', async () => {
    const store = new ChannelSessionBindingStore(root());
    const input = { origin: 'wecom' as const, connectorId: 'wecom-main', conversationId: 'chat-1', target: { kind: 'agent' as const, id: 'agent-1' } };
    await expect(store.resolve({ ...input, ttlMs: 0, createSessionId: async () => 'never' })).rejects.toThrow('CHANNEL_BINDING_TTL_INVALID');
    const createSessionId = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('session-retry');
    await expect(store.resolve({ ...input, createSessionId })).rejects.toThrow('temporary');
    await expect(store.resolve({ ...input, createSessionId })).resolves.toMatchObject({ sessionId: 'session-retry' });
    expect(createSessionId).toHaveBeenCalledTimes(2);
  });
});

describe('ChannelDeliveryStore', () => {
  it('persists versioned receipts without using message ids as paths', () => {
    const dataRoot = root();
    const store = new ChannelDeliveryStore(dataRoot);
    store.save({ messageId: 'external/message:1', connectorId: 'wecom-main', status: 'delivered', attempt: 1, deliveredAt: '2026-09-04T10:00:00.000Z' });
    expect(store.get('external/message:1')).toMatchObject({ status: 'delivered', attempt: 1 });
    expect(store.list()).toHaveLength(1);
    expect(fs.existsSync(path.join(dataRoot, 'channels', 'deliveries', 'external'))).toBe(false);
  });
});
