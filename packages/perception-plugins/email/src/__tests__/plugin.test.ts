import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginRuntimeContext } from '@originos/core/modules/perception-runtime/plugins';
import { EmailPerceptionPlugin, emailManifest } from '../plugin';

const connect = vi.fn();
const mailboxOpen = vi.fn();
const fetchMessages = vi.fn();
const logout = vi.fn();
vi.mock('imapflow', () => ({
  ImapFlow: class {
    usable = true;
    connect = connect;
    mailboxOpen = mailboxOpen;
    fetch = fetchMessages;
    logout = logout;
    close = vi.fn();
  },
}));
vi.mock('mailparser', () => ({
  simpleParser: vi.fn(async () => ({ text: '完整正文' })),
}));

function context(cursor?: unknown): PerceptionPluginRuntimeContext {
  return {
    pluginId: 'originos.email',
    connectorId: 'email-main',
    settings: {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      username: 'me@example.com',
      authMode: 'password',
      mailbox: 'INBOX',
      pollIntervalSeconds: 30,
      secretRef: 'secret://perception/mail/email-main',
    },
    ports: {
      credentials: {
        bind: vi.fn(),
        remove: vi.fn(),
        resolve: vi.fn(async () =>
          JSON.stringify({ kind: 'password', value: 'secret' })
        ),
      },
      events: { submit: vi.fn(async () => []) },
      schedule: { every: vi.fn(), cancel: vi.fn() },
      state: {
        read: vi.fn(async () => cursor as never),
        write: vi.fn(),
        remove: vi.fn(),
      },
      health: { report: vi.fn() },
    },
  };
}
describe('Email perception plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue(undefined);
    logout.mockResolvedValue(undefined);
  });
  it('declares isolated poll capabilities', () => {
    expect(emailManifest).toMatchObject({
      source: 'email',
      transport: 'poll',
      permissions: expect.arrayContaining([
        'credentials',
        'events',
        'schedule',
        'state',
      ]),
    });
  });
  it('establishes the mailbox head as the first-run baseline', async () => {
    mailboxOpen.mockResolvedValue({
      uidValidity: '1',
      uidNext: 42,
      exists: 41,
    });
    fetchMessages.mockReturnValue([]);
    const host = context();
    await new EmailPerceptionPlugin().start(host);
    expect(fetchMessages).not.toHaveBeenCalled();
    expect(host.ports.state?.write).toHaveBeenCalledWith('cursor', {
      uidValidity: '1',
      lastUid: 41,
    });
  });
  it('submits only messages newer than the persisted cursor with complete text', async () => {
    mailboxOpen.mockResolvedValue({
      uidValidity: '1',
      uidNext: 43,
      exists: 42,
    });
    fetchMessages.mockReturnValue(
      (async function* () {
        yield {
          uid: 42,
          envelope: {
            from: [{ address: 'sender@example.com' }],
            subject: '增量邮件',
            messageId: 'm-42',
          },
          internalDate: new Date('2026-09-07T00:00:00Z'),
          source: Buffer.from('mail'),
        };
      })()
    );
    const host = context({ uidValidity: '1', lastUid: 41 });
    await new EmailPerceptionPlugin().start(host);
    expect(host.ports.events?.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'email',
        content: { subject: '增量邮件', text: '完整正文' },
      })
    );
    expect(host.ports.state?.write).toHaveBeenCalledWith('cursor', {
      uidValidity: '1',
      lastUid: 42,
    });
  });
});
