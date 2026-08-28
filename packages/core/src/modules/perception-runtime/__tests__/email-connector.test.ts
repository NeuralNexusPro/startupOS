import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  EmailClientPort,
  EmailFetchBatch,
  EmailTransportMessage,
} from '../../../lib/integrations/perception/email';
import {
  EMAIL_MAX_TEXT_BYTES,
  EmailCursorStore,
  EmailPoller,
  InboxStore,
  PerceptionEventStore,
  createFileBackedEmailPoller,
  type EmailEventPort,
} from '..';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-email-'));
  roots.push(root);
  return root;
}

function message(uid: number, overrides: Partial<EmailTransportMessage> = {}): EmailTransportMessage {
  return {
    uid,
    uidValidity: 'validity-1',
    mailbox: 'INBOX',
    messageId: `<message-${uid}@example.test>`,
    receivedAt: '2026-08-28T08:00:00.000Z',
    from: { externalId: 'sender@example.test', displayName: 'Sender' },
    subject: `Mail ${uid}`,
    text: `Body ${uid}`,
    ...overrides,
  };
}

function client(batch: EmailFetchBatch): EmailClientPort {
  return { listSince: async () => batch };
}

describe('EmailPoller', () => {
  it('processes an ordered incremental batch and commits the last UID', async () => {
    const root = tempRoot();
    const poller = createFileBackedEmailPoller(root, client({
      uidValidity: 'validity-1',
      messages: [message(12), message(10), message(11)],
    }));

    const result = await poller.poll({ connectorId: 'email-main', mailbox: 'INBOX', initialUid: 9 });

    expect(result).toMatchObject({ processed: 3, duplicates: 0, reset: false });
    expect(result.cursor.lastUid).toBe(12);
  });

  it('does not advance beyond a message that fails to persist', async () => {
    const root = tempRoot();
    const inbox = new InboxStore(root);
    const realEvents = new PerceptionEventStore(root);
    let saves = 0;
    const failingEvents: EmailEventPort = {
      save(event) {
        saves += 1;
        if (saves === 2) throw new Error('simulated event write failure');
        return realEvents.save(event);
      },
    };
    const cursors = new EmailCursorStore(root);
    cursors.write({
      connectorId: 'email-main',
      mailbox: 'INBOX',
      uidValidity: 'validity-1',
      lastUid: 9,
      updatedAt: '2026-08-28T08:00:00.000Z',
    });
    const poller = new EmailPoller({
      client: client({ uidValidity: 'validity-1', messages: [message(10), message(11), message(12)] }),
      inbox,
      events: failingEvents,
      cursors,
    });

    await expect(poller.poll({ connectorId: 'email-main', mailbox: 'INBOX' })).rejects.toThrow('simulated');
    expect(cursors.read('email-main', 'INBOX')?.lastUid).toBe(10);
  });

  it('resets a stale UIDVALIDITY to the provider safe baseline', async () => {
    const root = tempRoot();
    const cursors = new EmailCursorStore(root);
    cursors.write({
      connectorId: 'email-main',
      mailbox: 'INBOX',
      uidValidity: 'old-validity',
      lastUid: 900,
      updatedAt: '2026-08-28T08:00:00.000Z',
    });
    const updated = message(6, { uidValidity: 'new-validity' });
    const poller = createFileBackedEmailPoller(root, client({
      uidValidity: 'new-validity',
      safeBaselineUid: 5,
      messages: [updated],
    }));

    const result = await poller.poll({ connectorId: 'email-main', mailbox: 'INBOX' });

    expect(result.reset).toBe(true);
    expect(result.cursor).toMatchObject({ uidValidity: 'new-validity', lastUid: 6 });
  });

  it('truncates unsafe body content and emits controlled attachment references only', async () => {
    const root = tempRoot();
    const text = `safe\u0000${'界'.repeat(EMAIL_MAX_TEXT_BYTES)}`;
    const poller = createFileBackedEmailPoller(root, client({
      uidValidity: 'validity-1',
      messages: [message(1, {
        text,
        attachments: [
          { id: 'ok', name: 'report.pdf', mimeType: 'application/pdf', size: 42, contentRef: 'perception://attachment/email-main/ok' },
          { id: 'bad', name: 'secret.txt', mimeType: 'text/plain', size: 10, contentRef: 'file:///etc/passwd' },
        ],
      })],
    }));

    await poller.poll({ connectorId: 'email-main', mailbox: 'INBOX' });
    const eventFiles = fs.readdirSync(path.join(root, 'perception', 'events')).filter((name) => name !== 'dedupe-index.json');
    const eventId = eventFiles[0]?.replace(/\.json$/, '');
    expect(eventId).toBeTruthy();
    const event = new PerceptionEventStore(root).get(eventId as string);
    expect(Buffer.byteLength(event.content.text ?? '', 'utf8')).toBeLessThanOrEqual(EMAIL_MAX_TEXT_BYTES);
    expect(event.content.text).not.toContain('\u0000');
    expect(event.content.attachmentRefs).toEqual(['perception://attachment/email-main/ok']);

    const inboxDirectory = path.join(root, 'perception', 'inbox', 'email-main');
    const inboxFile = fs.readdirSync(inboxDirectory)[0];
    const envelope = JSON.parse(fs.readFileSync(path.join(inboxDirectory, inboxFile), 'utf8')) as {
      data: { payload: { textTruncated: boolean; attachments: Array<{ blocked: boolean; contentRef: string }> } };
    };
    expect(envelope.data.payload.textTruncated).toBe(true);
    expect(envelope.data.payload.attachments[1]).toEqual(expect.objectContaining({ blocked: true, contentRef: 'blocked://unsafe-reference' }));
  });

  it('deduplicates repeated source messages and resumes from a persisted cursor', async () => {
    const root = tempRoot();
    const first = createFileBackedEmailPoller(root, client({ uidValidity: 'validity-1', messages: [message(1)] }));
    await first.poll({ connectorId: 'email-main', mailbox: 'INBOX' });

    const cursors = new EmailCursorStore(root);
    cursors.write({ ...cursors.read('email-main', 'INBOX')!, lastUid: 0 });
    const second = createFileBackedEmailPoller(root, client({ uidValidity: 'validity-1', messages: [message(1), message(2)] }));
    const result = await second.poll({ connectorId: 'email-main', mailbox: 'INBOX' });

    expect(result).toMatchObject({ processed: 1, duplicates: 1 });
    expect(result.cursor.lastUid).toBe(2);
  });
});
