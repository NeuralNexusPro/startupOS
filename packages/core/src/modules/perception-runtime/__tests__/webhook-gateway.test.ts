import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectorRegistry,
  WebhookGateway,
  WebhookGatewayError,
  type ConnectorNormalizeContext,
  type ConnectorVerificationContext,
  type JsonValue,
  type PerceptionConnector,
  type PerceptionEventV1,
} from '../index';

const roots: string[] = [];

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-webhook-'));
  roots.push(value);
  return value;
}

function connector(options?: {
  authenticated?: boolean;
  replayKey?: (payload: JsonValue) => string;
  signedAt?: string;
}): PerceptionConnector {
  return {
    source: 'feishu',
    capabilities: {
      inboundEvents: ['message.received'],
      outboundReply: true,
      callbackHandshake: true,
      encryptedPayload: false,
      polling: false,
      attachments: false,
    },
    verify: vi.fn(async (payload: JsonValue, _context: ConnectorVerificationContext) => ({
      authenticated: options?.authenticated ?? true,
      replayKey: options?.replayKey?.(payload),
      signedAt: options?.signedAt,
    })),
    normalize: vi.fn(async (payload: JsonValue, context: ConnectorNormalizeContext) => {
      const object = payload as { sourceEventId?: JsonValue };
      const sourceEventId = typeof object.sourceEventId === 'string' ? object.sourceEventId : 'event-1';
      const event: PerceptionEventV1 = {
        schemaVersion: '1.0',
        id: randomUUID(),
        source: 'feishu',
        sourceEventId,
        connectorId: context.connectorId,
        type: 'message.received',
        occurredAt: context.receivedAt,
        receivedAt: context.receivedAt,
        actor: { externalId: 'user-1' },
        content: { text: 'hello' },
        provenance: { rawPayloadRef: context.inboxRef },
      };
      return [event];
    }),
    acknowledge: vi.fn(async () => ({ status: 200, body: { ok: true } })),
  };
}

afterEach(() => {
  for (const directory of roots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('WebhookGateway', () => {
  it('rejects missing and disabled connectors before persistence', async () => {
    const dataRoot = root();
    const registry = new ConnectorRegistry();
    const gateway = new WebhookGateway(registry, dataRoot);
    await expect(gateway.handle({ connectorId: 'missing', payload: {} })).rejects.toMatchObject({ code: 'CONNECTOR_NOT_FOUND' });
    registry.register('disabled', connector(), false);
    await expect(gateway.handle({ connectorId: 'disabled', payload: {} })).rejects.toMatchObject({ code: 'CONNECTOR_DISABLED' });
    expect(fs.existsSync(path.join(dataRoot, 'perception', 'inbox', 'missing'))).toBe(false);
  });

  it('rejects unauthenticated input without creating Inbox', async () => {
    const dataRoot = root();
    const registry = new ConnectorRegistry();
    registry.register('feishu-main', connector({ authenticated: false }));
    await expect(new WebhookGateway(registry, dataRoot).handle({ connectorId: 'feishu-main', payload: { token: 'secret' } }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    expect(fs.existsSync(path.join(dataRoot, 'perception', 'inbox', 'feishu-main'))).toBe(false);
    expect(fs.readFileSync(path.join(dataRoot, 'perception', 'audit', 'events.jsonl'), 'utf8')).not.toContain('secret');
  });

  it('rejects expired and repeated replay keys', async () => {
    const dataRoot = root();
    const registry = new ConnectorRegistry();
    registry.register('expired', connector({ replayKey: () => 'nonce-1', signedAt: '2026-08-28T00:00:00.000Z' }));
    const gateway = new WebhookGateway(registry, dataRoot, { replayWindowMs: 300_000 });
    await expect(gateway.handle({ connectorId: 'expired', payload: {}, receivedAt: '2026-08-28T00:10:00.000Z' }))
      .rejects.toMatchObject({ code: 'REPLAY_WINDOW_EXPIRED' });

    const replayRegistry = new ConnectorRegistry();
    replayRegistry.register('feishu-main', connector({ replayKey: () => 'nonce-2', signedAt: '2026-08-28T00:00:00.000Z' }));
    const replayGateway = new WebhookGateway(replayRegistry, dataRoot);
    const input = { connectorId: 'feishu-main', payload: {}, receivedAt: '2026-08-28T00:01:00.000Z' };
    await replayGateway.handle(input);
    await expect(replayGateway.handle(input)).rejects.toMatchObject({ code: 'REPLAY_DETECTED' });
  });

  it('persists before ACK and deduplicates source retries with a fresh signature', async () => {
    const dataRoot = root();
    let nonce = 0;
    const adapter = connector({ replayKey: () => `nonce-${++nonce}`, signedAt: '2026-08-28T00:00:00.000Z' });
    const registry = new ConnectorRegistry();
    registry.register('feishu-main', adapter);
    const gateway = new WebhookGateway(registry, dataRoot);
    const input = {
      connectorId: 'feishu-main',
      payload: { sourceEventId: 'same-event' },
      receivedAt: '2026-08-28T00:01:00.000Z',
    };
    const first = await gateway.handle(input);
    const second = await gateway.handle(input);
    expect(first.ack.status).toBe(200);
    expect(second.duplicateEventIds).toEqual([first.events[0]?.id]);
    expect(fs.readdirSync(path.join(dataRoot, 'perception', 'events')).filter((name) => name.endsWith('.json') && !name.startsWith('dedupe-'))).toHaveLength(1);
    expect(adapter.acknowledge).toHaveBeenCalledTimes(2);
  });

  it('maps unexpected normalization failures to a safe error', async () => {
    const dataRoot = root();
    const adapter = connector();
    adapter.normalize = vi.fn(async () => { throw new Error('secret raw failure'); });
    const registry = new ConnectorRegistry();
    registry.register('feishu-main', adapter);
    const error = await new WebhookGateway(registry, dataRoot).handle({ connectorId: 'feishu-main', payload: {} }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(WebhookGatewayError);
    expect(error).toMatchObject({ code: 'NORMALIZATION_FAILED', status: 500 });
    expect(String(error)).not.toContain('secret raw failure');
  });
});

