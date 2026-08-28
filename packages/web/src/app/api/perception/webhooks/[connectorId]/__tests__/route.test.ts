import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlePerceptionWebhook = vi.fn();
const handlePerceptionHandshake = vi.fn();

vi.mock('@/services/perceptionWebhookService', () => ({ handlePerceptionWebhook, handlePerceptionHandshake }));

const { GET, POST } = await import('../route');

describe('POST /api/perception/webhooks/[connectorId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlePerceptionWebhook.mockResolvedValue({
      ack: { status: 200, body: { ok: true } },
      events: [],
      duplicateEventIds: [],
    });
    handlePerceptionHandshake.mockResolvedValue({ status: 200, body: 'plain-echo' });
  });

  it('returns a plain-text callback handshake without business logic in the route', async () => {
    const request = new NextRequest('http://localhost/api/perception/webhooks/wecom-main?echostr=encrypted&nonce=n1');
    const response = await GET(request, { params: { connectorId: 'wecom-main' } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('plain-echo');
    expect(handlePerceptionHandshake).toHaveBeenCalledWith({
      connectorId: 'wecom-main',
      query: { echostr: 'encrypted', nonce: 'n1' },
    });
  });

  it('delegates parsed HTTP input to the Web service adapter', async () => {
    const request = new NextRequest('http://localhost/api/perception/webhooks/feishu-main?challenge=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': 'sig' },
      body: JSON.stringify({ event_id: 'event-1' }),
    });
    const response = await POST(request, { params: { connectorId: 'feishu-main' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handlePerceptionWebhook).toHaveBeenCalledWith(expect.objectContaining({
      connectorId: 'feishu-main',
      payload: { event_id: 'event-1' },
      query: { challenge: '1' },
      rawBody: '{"event_id":"event-1"}',
    }));
  });

  it('rejects invalid JSON before calling the service', async () => {
    const request = new NextRequest('http://localhost/api/perception/webhooks/feishu-main', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid',
    });
    const response = await POST(request, { params: { connectorId: 'feishu-main' } });
    expect(response.status).toBe(400);
    expect(handlePerceptionWebhook).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared body before parsing', async () => {
    const request = new NextRequest('http://localhost/api/perception/webhooks/feishu-main', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(256 * 1024 + 1) },
      body: '{}',
    });
    const response = await POST(request, { params: { connectorId: 'feishu-main' } });
    expect(response.status).toBe(413);
    expect(handlePerceptionWebhook).not.toHaveBeenCalled();
  });

  it('maps structured gateway errors without exposing messages', async () => {
    const { WebhookGatewayError } = await import('@originos/core/modules/perception-runtime');
    handlePerceptionWebhook.mockRejectedValue(new WebhookGatewayError('UNAUTHORIZED', 'secret diagnostic'));
    const request = new NextRequest('http://localhost/api/perception/webhooks/feishu-main', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const response = await POST(request, { params: { connectorId: 'feishu-main' } });
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain('secret diagnostic');
  });
});
