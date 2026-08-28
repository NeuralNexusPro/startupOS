import { createHash, randomUUID } from 'node:crypto';
import type {
  EmailAttachmentReference,
  EmailClientPort,
  EmailTransportMessage,
} from '../../../../lib/integrations/perception/email';
import type { InboxRecord, JsonValue, PerceptionEventV1 } from '../../protocol/types';
import { redactSensitiveContent } from '../../security/content-defense';
import type { SaveEventResult } from '../../storage/event-store';
import { PerceptionEventStore } from '../../storage/event-store';
import { InboxStore } from '../../storage/inbox-store';
import { EmailCursorStore, type EmailCursor } from './email-cursor-store';

export const EMAIL_MAX_BATCH_SIZE = 50;
export const EMAIL_MAX_TEXT_BYTES = 64 * 1024;

export interface EmailPollRequest {
  connectorId: string;
  mailbox: string;
  initialUid?: number;
  limit?: number;
}

export interface EmailPollResult {
  processed: number;
  duplicates: number;
  reset: boolean;
  cursor: EmailCursor;
}

export interface EmailInboxPort {
  accept(connectorId: string, payload: JsonValue, receivedAt?: string): InboxRecord;
  reference(record: InboxRecord): string;
}

export interface EmailEventPort {
  save(event: PerceptionEventV1): SaveEventResult;
}

export interface EmailCursorPort {
  read(connectorId: string, mailbox: string): EmailCursor | null;
  write(cursor: EmailCursor): EmailCursor;
}

export interface EmailPollerOptions {
  client: EmailClientPort;
  inbox: EmailInboxPort;
  events: EmailEventPort;
  cursors: EmailCursorPort;
  now?: () => string;
}

interface NormalizedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  contentRef: string;
  blocked: boolean;
}

export function createFileBackedEmailPoller(dataRoot: string, client: EmailClientPort): EmailPoller {
  return new EmailPoller({
    client,
    inbox: new InboxStore(dataRoot),
    events: new PerceptionEventStore(dataRoot),
    cursors: new EmailCursorStore(dataRoot),
  });
}

export class EmailPoller {
  private readonly now: () => string;

  constructor(private readonly options: EmailPollerOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async poll(request: EmailPollRequest): Promise<EmailPollResult> {
    const initialUid = request.initialUid ?? 0;
    assertUid(initialUid, 'initialUid');
    const limit = request.limit ?? EMAIL_MAX_BATCH_SIZE;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > EMAIL_MAX_BATCH_SIZE) {
      throw new Error(`Email poll limit must be between 1 and ${EMAIL_MAX_BATCH_SIZE}`);
    }

    const stored = this.options.cursors.read(request.connectorId, request.mailbox);
    const previous: EmailCursor = stored ?? {
      connectorId: request.connectorId,
      mailbox: request.mailbox,
      lastUid: initialUid,
      updatedAt: this.now(),
    };
    const batch = await this.options.client.listSince({
      mailbox: request.mailbox,
      lastUid: previous.lastUid,
      limit,
    });
    if (!batch.uidValidity.trim()) throw new Error('Email batch uidValidity is required');

    const reset = previous.uidValidity !== undefined && previous.uidValidity !== batch.uidValidity;
    const baseline = reset ? batch.safeBaselineUid ?? 0 : previous.lastUid;
    assertUid(baseline, 'safeBaselineUid');
    let cursor: EmailCursor = {
      ...previous,
      uidValidity: batch.uidValidity,
      lastUid: baseline,
      updatedAt: this.now(),
    };
    if (reset) cursor = this.options.cursors.write(cursor);

    let processed = 0;
    let duplicates = 0;
    const messages = [...batch.messages].sort((left, right) => left.uid - right.uid);
    for (const message of messages) {
      if (message.uid <= cursor.lastUid) continue;
      validateMessage(message, request.mailbox, batch.uidValidity);
      const receivedAt = this.now();
      const payload = buildInboxPayload(message);
      const inboxRecord = this.options.inbox.accept(request.connectorId, payload, receivedAt);
      const saved = this.options.events.save(buildEvent(request.connectorId, message, inboxRecord, this.options.inbox, receivedAt));
      if (saved.duplicate) duplicates += 1;
      else processed += 1;
      cursor = this.options.cursors.write({ ...cursor, lastUid: message.uid, updatedAt: this.now() });
    }

    if (messages.length === 0 && (!stored || stored.uidValidity !== batch.uidValidity)) {
      cursor = this.options.cursors.write(cursor);
    }
    return { processed, duplicates, reset, cursor };
  }
}

function validateMessage(message: EmailTransportMessage, mailbox: string, uidValidity: string): void {
  assertUid(message.uid, 'message uid');
  if (message.mailbox !== mailbox) throw new Error('Email message mailbox does not match poll request');
  if (message.uidValidity !== uidValidity) throw new Error('Email message UIDVALIDITY does not match batch');
  if (!message.from.externalId.trim()) throw new Error('Email sender is required');
  if (!Number.isFinite(Date.parse(message.receivedAt))) throw new Error('Email receivedAt is invalid');
}

function assertUid(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Email ${label} is invalid`);
}

function stableSourceEventId(message: EmailTransportMessage): string {
  const source = message.messageId?.trim() || `${message.uidValidity}:${message.uid}`;
  return `mail:${createHash('sha256').update(source).digest('hex')}`;
}

function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return { text, truncated: false };
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, middle), 'utf8') <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return { text: text.slice(0, low), truncated: true };
}

function sanitizeText(value: string | undefined): { text?: string; truncated: boolean } {
  if (value === undefined) return { truncated: false };
  const safe = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return truncateUtf8(safe, EMAIL_MAX_TEXT_BYTES);
}

function isControlledContentRef(contentRef: string): boolean {
  return /^perception:\/\/attachment\/[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/.test(contentRef);
}

function normalizeAttachment(attachment: EmailAttachmentReference): NormalizedAttachment {
  const blocked = !isControlledContentRef(attachment.contentRef);
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: Number.isFinite(attachment.size) && attachment.size >= 0 ? attachment.size : 0,
    contentRef: blocked ? 'blocked://unsafe-reference' : attachment.contentRef,
    blocked,
  };
}

function buildInboxPayload(message: EmailTransportMessage): JsonValue {
  const body = sanitizeText(message.text);
  const attachments: JsonValue[] = (message.attachments ?? []).map((attachment) => {
    const normalized = normalizeAttachment(attachment);
    return {
      id: normalized.id,
      name: normalized.name,
      mimeType: normalized.mimeType,
      size: normalized.size,
      contentRef: normalized.contentRef,
      blocked: normalized.blocked,
    };
  });
  const payload: JsonValue = {
    uid: message.uid,
    uidValidity: message.uidValidity,
    mailbox: message.mailbox,
    messageId: message.messageId ?? null,
    receivedAt: message.receivedAt,
    sentAt: message.sentAt ?? null,
    from: {
      externalId: message.from.externalId,
      displayName: message.from.displayName ?? null,
    },
    subject: message.subject ?? null,
    text: body.text ?? null,
    textTruncated: body.truncated,
    attachments,
  };
  return redactSensitiveContent(payload);
}

function buildEvent(
  connectorId: string,
  message: EmailTransportMessage,
  inboxRecord: InboxRecord,
  inbox: EmailInboxPort,
  receivedAt: string,
): PerceptionEventV1 {
  const body = sanitizeText(message.text);
  const attachments = (message.attachments ?? []).map(normalizeAttachment);
  return {
    schemaVersion: '1.0',
    id: randomUUID(),
    source: 'email',
    sourceEventId: stableSourceEventId(message),
    connectorId,
    type: 'mail.received',
    occurredAt: message.sentAt ?? message.receivedAt,
    receivedAt,
    actor: { ...message.from },
    conversation: { externalId: message.mailbox, kind: 'thread' },
    content: {
      subject: message.subject,
      text: body.text,
      attachmentRefs: attachments.filter((attachment) => !attachment.blocked).map((attachment) => attachment.contentRef),
    },
    provenance: { rawPayloadRef: inbox.reference(inboxRecord) },
  };
}
