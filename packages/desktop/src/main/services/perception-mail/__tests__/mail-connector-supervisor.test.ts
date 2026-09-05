import { describe, expect, it, vi } from 'vitest';
import type { PerceptionConnectorConfig } from '../../../../../../core/src/types/perception';
import { MailConnectorSupervisor } from '../mail-connector-supervisor';

vi.mock('electron', () => ({ safeStorage: {} }));

function connector(id: string): PerceptionConnectorConfig {
  const now = new Date().toISOString();
  return { id, source: 'email', mode: 'email-poll', enabled: true, secretRef: `secret://perception/mail/${id}`, settings: { host: 'imap.example.com', port: 993, secure: true, username: `${id}@example.com`, authMode: 'password', mailbox: 'INBOX', pollIntervalSeconds: 60 }, createdAt: now, updatedAt: now };
}

describe('MailConnectorSupervisor', () => {
  it('isolates connector failures and routes events produced by healthy polls', async () => {
    const health = vi.fn();
    const route = vi.fn(async () => undefined);
    const supervisor = new MailConnectorSupervisor({
      listConnectors: () => [connector('broken'), connector('healthy')],
      poll: vi.fn(async (config) => {
        if (config.id === 'broken') throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
        return { lastUid: 42, eventIds: ['event-42'] };
      }),
      route,
      health,
    });
    await supervisor.runDue(1_000);
    expect(route).toHaveBeenCalledWith('event-42');
    expect(health).toHaveBeenCalledWith(expect.objectContaining({ id: 'broken' }), 'degraded', { safeCode: 'DNS_FAILED' });
    expect(health).toHaveBeenCalledWith(expect.objectContaining({ id: 'healthy' }), 'healthy', { lastUid: 42 });
  });

  it('does not poll a connector again before its independent due time', async () => {
    const poll = vi.fn(async () => ({ lastUid: 1, eventIds: [] }));
    const supervisor = new MailConnectorSupervisor({ listConnectors: () => [connector('one')], poll, route: vi.fn(), health: vi.fn() });
    await supervisor.runDue(1_000);
    await supervisor.runDue(2_000);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
