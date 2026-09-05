import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type {
  EmailClientPort,
  EmailFetchBatch,
  EmailTransportMessage,
} from '../../../../../core/src/lib/integrations/perception/email';
import type { MailConnectorSettings, MailSecret } from '../../../../../core/src/types/perception';

export class ImapFlowEmailPollingClient implements EmailClientPort {
  constructor(
    private readonly profile: MailConnectorSettings,
    private readonly secret: MailSecret,
  ) {}

  async listSince(request: Parameters<EmailClientPort['listSince']>[0]): Promise<EmailFetchBatch> {
    const auth = this.secret.kind === 'oauth2-token'
      ? { user: this.profile.username, accessToken: this.secret.value }
      : { user: this.profile.username, pass: this.secret.value };
    const client = new ImapFlow({
      host: this.profile.host,
      port: this.profile.port,
      secure: this.profile.secure,
      auth,
      logger: false,
    });
    try {
      await client.connect();
      const mailbox = await client.mailboxOpen(request.mailbox, { readOnly: true });
      const safeBaselineUid = Math.max(0, mailbox.uidNext - 1);
      if (request.lastUid === 0) {
        return { uidValidity: String(mailbox.uidValidity), messages: [], safeBaselineUid };
      }
      const messages: EmailTransportMessage[] = [];
      if (mailbox.exists > 0) {
        for await (const item of client.fetch(`${request.lastUid + 1}:*`, { uid: true, envelope: true, internalDate: true, source: true }, { uid: true })) {
          if (item.uid <= request.lastUid) continue;
          const sender = item.envelope?.from?.[0];
          if (!sender?.address) continue;
          const parsed = item.source ? await simpleParser(item.source, { skipHtmlToText: false, skipTextToHtml: true }) : undefined;
          messages.push({
            uid: item.uid,
            uidValidity: String(mailbox.uidValidity),
            mailbox: mailbox.path,
            messageId: item.envelope?.messageId,
            receivedAt: normalizeDate(item.internalDate) ?? new Date().toISOString(),
            sentAt: normalizeDate(item.envelope?.date),
            from: { externalId: sender.address, displayName: sender.name },
            subject: item.envelope?.subject,
            text: normalizeBodyText(parsed?.text),
          });
          if (messages.length >= request.limit) break;
        }
      }
      return { uidValidity: String(mailbox.uidValidity), messages, safeBaselineUid };
    } finally {
      try { if (client.usable) await client.logout(); else client.close(); } catch { client.close(); }
    }
  }
}

function normalizeBodyText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return normalized || undefined;
}

function normalizeDate(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
