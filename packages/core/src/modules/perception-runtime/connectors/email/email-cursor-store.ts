import path from 'node:path';
import { assertSafePerceptionId } from '../../protocol/validation';
import { AtomicDataFileStore } from '../../storage/data-file-store';
import { resolvePerceptionPath } from '../../storage/paths';

export interface EmailCursor {
  connectorId: string;
  mailbox: string;
  uidValidity?: string;
  lastUid: number;
  updatedAt: string;
}

function assertCursor(cursor: EmailCursor): void {
  assertSafePerceptionId(cursor.connectorId, 'connector id');
  if (!cursor.mailbox.trim()) throw new Error('Email cursor mailbox is required');
  if (!Number.isSafeInteger(cursor.lastUid) || cursor.lastUid < 0) throw new Error('Email cursor lastUid is invalid');
  if (cursor.uidValidity !== undefined && !cursor.uidValidity.trim()) throw new Error('Email cursor uidValidity is invalid');
  if (!Number.isFinite(Date.parse(cursor.updatedAt))) throw new Error('Email cursor updatedAt is invalid');
}

export class EmailCursorStore {
  constructor(private readonly dataRoot: string) {}

  read(connectorId: string, mailbox: string): EmailCursor | null {
    const store = this.store(connectorId);
    if (!store.exists()) return null;
    const cursor = store.read().data;
    assertCursor(cursor);
    if (cursor.connectorId !== connectorId || cursor.mailbox !== mailbox) {
      throw new Error('Email cursor does not match connector or mailbox');
    }
    return cursor;
  }

  write(cursor: EmailCursor): EmailCursor {
    assertCursor(cursor);
    this.store(cursor.connectorId).write(cursor);
    return cursor;
  }

  private store(connectorId: string): AtomicDataFileStore<EmailCursor> {
    assertSafePerceptionId(connectorId, 'connector id');
    const directory = resolvePerceptionPath(this.dataRoot, 'connectors', connectorId);
    return new AtomicDataFileStore<EmailCursor>(path.join(directory, 'email-cursor.json'));
  }
}
