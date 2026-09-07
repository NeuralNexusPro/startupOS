import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { InboxRecord, JsonValue } from '../protocol/types';
import { assertSafePerceptionId } from '../protocol/validation';
import { jsonByteLength, redactSensitiveContent } from '../security/content-defense';
import { AtomicDataFileStore } from './data-file-store';
import { resolvePerceptionPath } from './paths';

export const DEFAULT_MAX_PAYLOAD_BYTES = 256 * 1024;

export class PayloadTooLargeError extends Error {
  readonly code = 'PAYLOAD_TOO_LARGE';
}

export class InboxStore {
  constructor(private readonly dataRoot: string, private readonly maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES) {}

  accept(connectorId: string, payload: JsonValue, receivedAt = new Date().toISOString()): InboxRecord {
    assertSafePerceptionId(connectorId, 'connector id');
    const byteLength = jsonByteLength(payload);
    if (byteLength > this.maxPayloadBytes) {
      throw new PayloadTooLargeError(`Perception payload exceeds ${this.maxPayloadBytes} bytes`);
    }
    const id = randomUUID();
    const redacted = redactSensitiveContent(payload);
    const record: InboxRecord = {
      id,
      connectorId,
      receivedAt,
      payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      payload: redacted,
    };
    const directory = resolvePerceptionPath(this.dataRoot, 'inbox', connectorId);
    new AtomicDataFileStore<InboxRecord>(path.join(directory, `${id}.json`)).write(record);
    return record;
  }

  read(connectorId: string, inboxId: string): InboxRecord {
    const directory = resolvePerceptionPath(this.dataRoot, 'inbox', connectorId);
    assertSafePerceptionId(inboxId, 'inbox id');
    return new AtomicDataFileStore<InboxRecord>(path.join(directory, `${inboxId}.json`)).read().data;
  }

  reference(record: InboxRecord): string {
    return `perception://inbox/${record.connectorId}/${record.id}`;
  }
}

