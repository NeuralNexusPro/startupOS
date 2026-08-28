import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPerceptionDashboard = vi.fn();
const setPerceptionConnectorEnabled = vi.fn();
const replayPerceptionDeadLetter = vi.fn();
const savePerceptionConnector = vi.fn();
const savePerceptionRule = vi.fn();
const savePerceptionGrant = vi.fn();
vi.mock('@/services/perceptionManagementService', () => ({
  getPerceptionDashboard, setPerceptionConnectorEnabled, replayPerceptionDeadLetter,
  savePerceptionConnector, savePerceptionRule, savePerceptionGrant,
}));
const { GET, PATCH } = await import('../route');

describe('/api/perception/management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPerceptionDashboard.mockReturnValue({ connectors: [], grants: [], rules: [], health: [], audit: [], deadLetters: [] });
    setPerceptionConnectorEnabled.mockReturnValue({ id: 'email-main', enabled: false, secretConfigured: true });
    replayPerceptionDeadLetter.mockReturnValue({ id: 'retry-1', status: 'scheduled' });
    savePerceptionConnector.mockReturnValue({ id: 'email-main', enabled: false, secretConfigured: true });
    savePerceptionRule.mockReturnValue({ id: 'rule-1', enabled: false });
  });

  it('returns the redacted management dashboard from the Web service', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { connectors: [] } });
  });

  it('maps connector toggle and dead-letter replay actions', async () => {
    const toggle = await PATCH(new NextRequest('http://localhost/api/perception/management', {
      method: 'PATCH', body: JSON.stringify({ action: 'set-connector-enabled', id: 'email-main', enabled: false }),
    }));
    expect(toggle.status).toBe(200);
    expect(setPerceptionConnectorEnabled).toHaveBeenCalledWith('email-main', false);
    const replay = await PATCH(new NextRequest('http://localhost/api/perception/management', {
      method: 'PATCH', body: JSON.stringify({ action: 'replay-dead-letter', connectorId: 'email-main', id: 'dead-1' }),
    }));
    expect(replay.status).toBe(200);
    expect(replayPerceptionDeadLetter).toHaveBeenCalledWith('email-main', 'dead-1');
  });

  it('does not echo a connector secret reference and delegates rule validation', async () => {
    const connector = { id: 'email-main', source: 'email', mode: 'email-poll', enabled: false, secretRef: 'secret://perception/email-main', settings: {}, createdAt: '2026-08-28T08:00:00.000Z', updatedAt: '2026-08-28T08:00:00.000Z' };
    const response = await PATCH(new NextRequest('http://localhost/api/perception/management', {
      method: 'PATCH', body: JSON.stringify({ action: 'save-connector', connector }),
    }));
    expect(response.status).toBe(200);
    expect(savePerceptionConnector).toHaveBeenCalledWith(connector);
    expect(JSON.stringify(await response.json())).not.toContain('secret://perception/email-main');

    const rule = { id: 'rule-1' };
    const ruleResponse = await PATCH(new NextRequest('http://localhost/api/perception/management', {
      method: 'PATCH', body: JSON.stringify({ action: 'save-rule', rule }),
    }));
    expect(ruleResponse.status).toBe(200);
    expect(savePerceptionRule).toHaveBeenCalledWith(rule);
  });

  it('rejects malformed and unknown actions without exposing exception text', async () => {
    const malformed = await PATCH(new NextRequest('http://localhost/api/perception/management', { method: 'PATCH', body: '{' }));
    expect(malformed.status).toBe(400);
    setPerceptionConnectorEnabled.mockImplementation(() => { throw new Error('secret diagnostic'); });
    const failed = await PATCH(new NextRequest('http://localhost/api/perception/management', {
      method: 'PATCH', body: JSON.stringify({ action: 'set-connector-enabled', id: 'email-main', enabled: true }),
    }));
    expect(failed.status).toBe(409);
    expect(JSON.stringify(await failed.json())).not.toContain('secret diagnostic');
  });
});
