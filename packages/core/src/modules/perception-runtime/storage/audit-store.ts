import fs from 'node:fs';
import path from 'node:path';
import type { PerceptionAuditEntry } from '../protocol/types';
import { redactSensitiveContent } from '../security/content-defense';
import { resolvePerceptionPath } from './paths';

export class PerceptionAuditStore {
  private readonly filePath: string;

  constructor(dataRoot: string) {
    this.filePath = resolvePerceptionPath(dataRoot, 'audit', 'events.jsonl');
  }

  append(entry: PerceptionAuditEntry): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const safeEntry = redactSensitiveContent(entry as unknown as { [key: string]: import('../protocol/types').JsonValue });
    fs.appendFileSync(this.filePath, `${JSON.stringify(safeEntry)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  list(options: { connectorId?: string; eventId?: string; offset?: number; limit?: number } = {}): PerceptionAuditEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(1, Math.min(200, options.limit ?? 50));
    return fs.readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean)
      .map((line) => JSON.parse(line) as PerceptionAuditEntry)
      .filter((entry) => !options.connectorId || entry.connectorId === options.connectorId)
      .filter((entry) => !options.eventId || entry.eventId === options.eventId)
      .reverse().slice(offset, offset + limit)
      .map((entry) => redactSensitiveContent(entry as unknown as { [key: string]: import('../protocol/types').JsonValue }) as unknown as PerceptionAuditEntry);
  }
}
