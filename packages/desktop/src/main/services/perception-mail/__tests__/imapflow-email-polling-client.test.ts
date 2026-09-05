import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  mailboxOpen: vi.fn(),
  fetch: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('imapflow', () => ({
  ImapFlow: class {
    usable = true;
    connect = mocks.connect;
    mailboxOpen = mocks.mailboxOpen;
    fetch = mocks.fetch;
    logout = mocks.logout;
    close = vi.fn();
  },
}));

import { ImapFlowEmailPollingClient } from '../imapflow-email-polling-client';

describe('ImapFlowEmailPollingClient', () => {
  beforeEach(() => {
    mocks.mailboxOpen.mockResolvedValue({ path: 'INBOX', exists: 400, uidNext: 501, uidValidity: 42n });
    mocks.fetch.mockImplementation(() => { throw new Error('historical fetch must not run'); });
  });

  it('returns UIDNEXT - 1 as an empty first-poll baseline', async () => {
    const client = new ImapFlowEmailPollingClient(
      { host: 'imap.example.test', port: 993, secure: true, username: 'user@example.test', authMode: 'password', mailbox: 'INBOX', pollIntervalSeconds: 60 },
      { kind: 'password', value: 'test-only' },
    );
    await expect(client.listSince({ mailbox: 'INBOX', lastUid: 0, limit: 50 })).resolves.toEqual({ uidValidity: '42', messages: [], safeBaselineUid: 500 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.logout).toHaveBeenCalled();
  });

  it('fetches and decodes the complete MIME body for downstream targets', async () => {
    mocks.mailboxOpen.mockResolvedValue({ path: 'INBOX', exists: 1, uidNext: 12, uidValidity: 42n });
    const mime = [
      'From: Sender <sender@example.test>',
      'Subject: =?UTF-8?B?5oSf55+l5rWL6K+V?=',
      'Content-Type: multipart/alternative; boundary="part"',
      '',
      '--part',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('第一行正文\n第二行完整正文', 'utf8').toString('base64'),
      '--part',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>不应优先使用 HTML</p>',
      '--part--',
    ].join('\r\n');
    mocks.fetch.mockImplementation(async function* () {
      yield { uid: 11, envelope: { from: [{ address: 'sender@example.test', name: 'Sender' }], subject: '感知测试', messageId: '<11@example.test>' }, internalDate: new Date('2026-09-04T08:00:00.000Z'), source: Buffer.from(mime) };
    });
    const client = new ImapFlowEmailPollingClient(
      { host: 'imap.example.test', port: 993, secure: true, username: 'user@example.test', authMode: 'password', mailbox: 'INBOX', pollIntervalSeconds: 60 },
      { kind: 'password', value: 'test-only' },
    );

    const result = await client.listSince({ mailbox: 'INBOX', lastUid: 10, limit: 50 });

    expect(mocks.fetch).toHaveBeenCalledWith('11:*', expect.objectContaining({ source: true }), { uid: true });
    expect(result.messages[0]?.text).toBe('第一行正文\n第二行完整正文');
  });

  it('converts an HTML-only MIME body into readable text', async () => {
    mocks.mailboxOpen.mockResolvedValue({ path: 'INBOX', exists: 1, uidNext: 13, uidValidity: 42n });
    const mime = [
      'From: Sender <sender@example.test>',
      'Subject: HTML only',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<h1>=E9=9C=80=E8=A6=81=E4=BA=BA=E5=B7=A5=E5=A4=84=E7=90=86</h1><p>=E8=AF=B7=E6=9F=A5=E7=9C=8B=E8=AE=A2=E5=8D=95 123</p>',
    ].join('\r\n');
    mocks.fetch.mockImplementation(async function* () {
      yield { uid: 12, envelope: { from: [{ address: 'sender@example.test' }], subject: 'HTML only' }, internalDate: new Date('2026-09-04T08:00:00.000Z'), source: Buffer.from(mime) };
    });
    const client = new ImapFlowEmailPollingClient(
      { host: 'imap.example.test', port: 993, secure: true, username: 'user@example.test', authMode: 'password', mailbox: 'INBOX', pollIntervalSeconds: 60 },
      { kind: 'password', value: 'test-only' },
    );

    const result = await client.listSince({ mailbox: 'INBOX', lastUid: 11, limit: 50 });

    expect(result.messages[0]?.text).toContain('需要人工处理');
    expect(result.messages[0]?.text).toContain('请查看订单 123');
    expect(result.messages[0]?.text).not.toContain('<h1>');
  });
});
