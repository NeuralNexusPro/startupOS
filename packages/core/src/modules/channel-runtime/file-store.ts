import fs from 'node:fs';
import path from 'node:path';

interface DataFile<T> { version: '1.0'; createdAt: string; updatedAt: string; data: T }

export class ChannelDataFileStore<T> {
  constructor(readonly filePath: string) {}

  exists(): boolean { return fs.existsSync(this.filePath); }

  read(): T {
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as DataFile<T>;
    if (parsed.version !== '1.0' || !parsed.createdAt || !parsed.updatedAt || !('data' in parsed)) throw new Error('CHANNEL_DATA_CORRUPT');
    return parsed.data;
  }

  write(data: T): void {
    const now = new Date().toISOString();
    let createdAt = now;
    if (this.exists()) {
      const current = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as DataFile<T>;
      if (current.version === '1.0' && current.createdAt) createdAt = current.createdAt;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ version: '1.0', createdAt, updatedAt: now, data }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }
}
