import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AtomicDataFileStore,
  InboxStore,
  PayloadTooLargeError,
  PerceptionAuditStore,
  PerceptionEventStore,
  jsonByteLength,
  redactSensitiveContent,
  resolvePerceptionPath,
  validatePerceptionEvent,
  type JsonValue,
  type PerceptionEventV1,
} from '../index';

const roots: string[] = [];

function dataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-perception-'));
  roots.push(root);
  return root;
}

function event(overrides: Partial<PerceptionEventV1> = {}): PerceptionEventV1 {
  return {
    schemaVersion: '1.0',
    id: randomUUID(),
    source: 'feishu',
    sourceEventId: 'source-event-1',
    connectorId: 'feishu-main',
    type: 'message.received',
    occurredAt: '2026-08-28T00:00:00.000Z',
    receivedAt: '2026-08-28T00:00:01.000Z',
    actor: { externalId: 'user-1' },
    content: { text: 'hello' },
    provenance: { rawPayloadRef: 'perception://inbox/feishu-main/inbox-1' },
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Perception foundation', () => {
  it('validates a canonical event and rejects unsafe ids', () => {
    expect(() => validatePerceptionEvent(event())).not.toThrow();
    expect(() => validatePerceptionEvent(event({ connectorId: '../../outside' }))).toThrow('Invalid connector id');
    expect(() => resolvePerceptionPath(dataRoot(), 'events', '../../outside')).toThrow('Invalid perception path id');
  });

  it('accepts a payload at the byte limit and rejects one over it', () => {
    const root = dataRoot();
    const payload: JsonValue = { text: '你好' };
    const bytes = jsonByteLength(payload);
    const inbox = new InboxStore(root, bytes);
    expect(inbox.accept('email-main', payload).payload).toEqual(payload);
    expect(() => new InboxStore(root, bytes - 1).accept('email-main', payload)).toThrow(PayloadTooLargeError);
  });

  it('redacts nested secrets without changing ordinary values', () => {
    expect(redactSensitiveContent({
      name: 'demo',
      token: 'token-value',
      nested: { password: 'password-value', cookie: 'cookie-value', safe: true },
    })).toEqual({
      name: 'demo',
      token: '[REDACTED]',
      nested: { password: '[REDACTED]', cookie: '[REDACTED]', safe: true },
    });
  });

  it('keeps raw payload out of the canonical event and deduplicates retries', () => {
    const root = dataRoot();
    const inbox = new InboxStore(root);
    const record = inbox.accept('feishu-main', { text: 'hello', access_token: 'do-not-store' });
    expect(JSON.stringify(record)).not.toContain('do-not-store');

    const store = new PerceptionEventStore(root);
    const canonical = event({ provenance: { rawPayloadRef: inbox.reference(record) } });
    expect(store.save(canonical).duplicate).toBe(false);
    const duplicate = store.save(event({ id: randomUUID(), sourceEventId: canonical.sourceEventId }));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.event.id).toBe(canonical.id);
    expect(JSON.stringify(duplicate.event)).not.toContain('access_token');
  });

  it('recovers a DataFile from the previous valid copy', () => {
    const root = dataRoot();
    const filePath = path.join(root, 'perception', 'events', 'sample.json');
    const store = new AtomicDataFileStore<{ count: number }>(filePath);
    store.write({ count: 1 });
    store.write({ count: 2 });
    fs.writeFileSync(filePath, '{broken', 'utf8');
    expect(store.read().data).toEqual({ count: 1 });
    fs.writeFileSync(store.recoveryPath, '{also-broken', 'utf8');
    expect(() => store.read()).toThrow('DataFile and recovery are unreadable');
  });

  it('never writes secret values to audit', () => {
    const root = dataRoot();
    new PerceptionAuditStore(root).append({
      id: 'audit-1',
      action: 'inbox.rejected',
      occurredAt: '2026-08-28T00:00:00.000Z',
      connectorId: 'wecom-main',
      detail: { password: 'do-not-store', reason: 'invalid signature' },
    });
    const audit = fs.readFileSync(path.join(root, 'perception', 'audit', 'events.jsonl'), 'utf8');
    expect(audit).not.toContain('do-not-store');
    expect(audit).toContain('[REDACTED]');
  });
});

