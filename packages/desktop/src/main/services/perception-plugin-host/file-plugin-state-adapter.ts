import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  JsonValue,
  PluginStatePort,
} from '../../../../../core/src/modules/perception-runtime';

export class FilePluginStateAdapter implements PluginStatePort {
  constructor(private readonly dataRoot: string) {}
  async read(key: string): Promise<JsonValue | undefined> {
    const file = this.file(key);
    if (!fs.existsSync(file)) return this.readLegacyEmailCursor(key);
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      data?: JsonValue;
    };
    return value.data;
  }
  async write(key: string, value: JsonValue): Promise<void> {
    const file = this.file(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const now = new Date().toISOString();
    const payload = {
      version: '1.0',
      createdAt: now,
      updatedAt: now,
      data: value,
    };
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(payload, null, 2));
    fs.renameSync(temp, file);
  }
  async remove(key: string): Promise<void> {
    try {
      fs.unlinkSync(this.file(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  private file(key: string): string {
    return path.join(
      this.dataRoot,
      'perception',
      'plugin-state',
      `${createHash('sha256').update(key).digest('hex')}.json`
    );
  }
  private readLegacyEmailCursor(key: string): JsonValue | undefined {
    const match = /^originos\.email:([A-Za-z0-9._-]+):cursor$/.exec(key);
    if (!match?.[1]) return undefined;
    const legacy = path.join(
      this.dataRoot,
      'perception',
      'connectors',
      match[1],
      'email-cursor.json'
    );
    if (!fs.existsSync(legacy)) return undefined;
    const record = JSON.parse(fs.readFileSync(legacy, 'utf8')) as {
      data?: { uidValidity?: string; lastUid?: number };
    };
    return record.data && Number.isSafeInteger(record.data.lastUid)
      ? {
          ...(record.data.uidValidity
            ? { uidValidity: record.data.uidValidity }
            : {}),
          lastUid: record.data.lastUid as number,
        }
      : undefined;
  }
}
