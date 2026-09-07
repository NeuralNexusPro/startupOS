import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPerceptionDashboard = vi.fn();
const setPerceptionConnectorEnabled = vi.fn();
const replayPerceptionDeadLetter = vi.fn();
const savePerceptionConnector = vi.fn();
const savePerceptionRule = vi.fn();
const deletePerceptionRule = vi.fn();
const savePerceptionGrant = vi.fn();
const deletePerceptionGrant = vi.fn();
vi.mock('@/services/perceptionManagementService', () => ({
  getPerceptionDashboard, setPerceptionConnectorEnabled, replayPerceptionDeadLetter,
  savePerceptionConnector, savePerceptionRule, deletePerceptionRule, savePerceptionGrant, deletePerceptionGrant,
}));
const { GET, PATCH } = await import('../route');

describe('/api/perception/management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPerceptionDashboard.mockReturnValue({ connectors: [], grants: [], rules: [], health: [], audit: [], eventTraces: [], deadLetters: [] });
    setPerceptionConnectorEnabled.mockReturnValue({ id: 'email-main', enabled: false, secretConfigured: true });
    replayPerceptionDeadLetter.mockReturnValue({ id: 'retry-1', status: 'scheduled' });
    savePerceptionConnector.mockReturnValue({ id: 'email-main', enabled: false, secretConfigured: true });
    savePerceptionRule.mockReturnValue({ id: 'rule-1', enabled: false });
    deletePerceptionRule.mockReturnValue(true);
    savePerceptionGrant.mockReturnValue({ target: { kind: 'project', id: 'project-1' }, enabled: true });
    deletePerceptionGrant.mockReturnValue(true);
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

  it('returns distinct safe codes for unauthorized targets and invalid rules', async () => {
    savePerceptionRule.mockImplementationOnce(() => { throw new Error('Perception rule target is not authorized for external triggers'); });
    const unauthorized = await PATCH(new NextRequest('http://localhost/api/perception/management', {
      method: 'PATCH', body: JSON.stringify({ action: 'save-rule', rule: { id: 'rule-1' } }),
    }));
    expect(await unauthorized.json()).toMatchObject({ error: { code: 'TARGET_NOT_AUTHORIZED' } });
    savePerceptionRule.mockImplementationOnce(() => { throw new Error('internal validation detail'); });
    const invalid = await PATCH(new NextRequest('http://localhost/api/perception/management', {
      method: 'PATCH', body: JSON.stringify({ action: 'save-rule', rule: { id: '中文' } }),
    }));
    expect(await invalid.json()).toMatchObject({ error: { code: 'INVALID_TRIGGER_RULE' } });
  });

  it('rejects credential-shaped fields before the management service', async () => {
    const connector = { id: 'email-main', source: 'email', mode: 'email-poll', enabled: false, settings: { password: 'must-not-cross-web' } };
    const response = await PATCH(new NextRequest('http://localhost/api/perception/management', {
      method: 'PATCH', body: JSON.stringify({ action: 'save-connector', connector }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'CREDENTIAL_NOT_ALLOWED' } });
    expect(savePerceptionConnector).not.toHaveBeenCalled();
  });

  it('maps target grant save and delete actions', async () => {
    const grant = { target: { kind: 'project', id: 'project-1' }, enabled: true };
    const save = await PATCH(new NextRequest('http://localhost/api/perception/management', { method: 'PATCH', body: JSON.stringify({ action: 'save-grant', grant }) }));
    expect(save.status).toBe(200);
    expect(savePerceptionGrant).toHaveBeenCalledWith(grant);
    const remove = await PATCH(new NextRequest('http://localhost/api/perception/management', { method: 'PATCH', body: JSON.stringify({ action: 'delete-grant', kind: 'project', id: 'project-1' }) }));
    expect(remove.status).toBe(200);
    expect(deletePerceptionGrant).toHaveBeenCalledWith('project', 'project-1');
  });

  it('maps trigger rule deletion', async () => {
    const response = await PATCH(new NextRequest('http://localhost/api/perception/management', { method: 'PATCH', body: JSON.stringify({ action: 'delete-rule', id: 'rule-1' }) }));
    expect(response.status).toBe(200);
    expect(deletePerceptionRule).toHaveBeenCalledWith('rule-1');
  });
});
