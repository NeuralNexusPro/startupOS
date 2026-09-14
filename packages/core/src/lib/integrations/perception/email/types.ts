export interface EmailAddress {
  externalId: string;
  displayName?: string;
}

export interface EmailAttachmentReference {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  contentRef: string;
}

export interface EmailTransportMessage {
  uid: number;
  uidValidity: string;
  mailbox: string;
  messageId?: string;
  receivedAt: string;
  sentAt?: string;
  from: EmailAddress;
  subject?: string;
  text?: string;
  attachments?: EmailAttachmentReference[];
}

export interface EmailListSinceRequest {
  mailbox: string;
  lastUid: number;
  limit: number;
}

export interface EmailFetchBatch {
  uidValidity: string;
  messages: EmailTransportMessage[];
  /** Safe provider-specific baseline used when UIDVALIDITY changes. */
  safeBaselineUid?: number;
}

/** Implemented by Desktop/Service adapters. The adapter must open mailboxes read-only. */
export interface EmailClientPort {
  listSince(request: EmailListSinceRequest): Promise<EmailFetchBatch>;
}
