import { afterEach, expect, it, vi } from 'vitest';
import { ImapFlow } from 'imapflow';
import type { PerceptionPluginRuntimeContext } from '@originos/core/modules/perception-runtime/plugins';
import { EmailPerceptionPlugin } from '../plugin';

afterEach(() => { vi.restoreAllMocks(); });
it('real IMAP factory disables protocol logs and reports asynchronous connection errors', async () => {
  const clients: ImapFlow[] = [];
  const failure = Object.assign(new Error('ECONNRESET PRIVATE_BODY'), { code: 'ECONNRESET' });
  vi.spyOn(ImapFlow.prototype, 'connect').mockImplementation(async function (this: ImapFlow) { clients.push(this); this.emit('error', failure); throw failure; });
  vi.spyOn(ImapFlow.prototype, 'close').mockImplementation(() => {});
  const write = vi.fn(() => { throw new Error('sink unavailable'); });
  const context: PerceptionPluginRuntimeContext = { pluginId: 'originos.email', connectorId: 'mail', settings: { host: 'imap.invalid', port: 993, secure: true, username: 'fixture', authMode: 'password', mailbox: 'INBOX', pollIntervalSeconds: 30, secretRef: 'ref' }, ports: {
    credentials: { resolve: vi.fn(async () => JSON.stringify({ kind: 'password', value: 'secret' })), bind: vi.fn(), remove: vi.fn() },
    events: { submit: vi.fn(async () => []) }, state: { read: vi.fn(), write: vi.fn(), remove: vi.fn() },
    schedule: { every: vi.fn(), cancel: vi.fn() }, health: { report: vi.fn() }, log: { write },
  } };
  const plugin = new EmailPerceptionPlugin();
  await expect(plugin.start(context)).resolves.toBeUndefined();
  expect(clients).toHaveLength(1);
  expect((clients[0] as unknown as { options: { logger: unknown } }).options.logger).toBe(false);
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ stage: 'mail.connection', error: failure }));
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ stage: 'mail.poll', error: failure }));
  await expect(plugin.provision({ ...context, secrets: { secret: 'fixture' } })).rejects.toBe(failure);
  expect(context.ports.credentials?.bind).not.toHaveBeenCalled();
  await plugin.stop(context);
});
