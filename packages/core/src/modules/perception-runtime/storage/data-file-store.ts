import fs from 'node:fs';
import path from 'node:path';
import type { PerceptionDataFile } from '../protocol/types';

const DATA_VERSION = '1.0';
// All instances in the owning Host process serialize a file's async read/modify/write.
const asyncWrites = new Map<string, Promise<unknown>>();

function parseDataFile<T>(text: string, filePath: string): PerceptionDataFile<T> {
  const parsed = JSON.parse(text) as PerceptionDataFile<T>;
  if (!parsed || parsed.version !== DATA_VERSION || typeof parsed.createdAt !== 'string' || typeof parsed.updatedAt !== 'string' || !('data' in parsed)) {
    throw new Error(`Invalid perception DataFile: ${filePath}`);
  }
  return parsed;
}

export class AtomicDataFileStore<T> {
  readonly filePath: string;
  readonly recoveryPath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.recoveryPath = `${filePath}.recovery`;
  }

  exists(): boolean {
    return fs.existsSync(this.filePath) || fs.existsSync(this.recoveryPath);
  }

  read(): PerceptionDataFile<T> {
    try {
      return parseDataFile<T>(fs.readFileSync(this.filePath, 'utf8'), this.filePath);
    } catch (currentError) {
      if (!fs.existsSync(this.recoveryPath)) throw currentError;
      try {
        return parseDataFile<T>(fs.readFileSync(this.recoveryPath, 'utf8'), this.recoveryPath);
      } catch (recoveryError) {
        const unreadable = new Error(`Perception DataFile and recovery are unreadable: ${this.filePath}`) as Error & { errors: unknown[] };
        unreadable.errors = [currentError, recoveryError];
        throw unreadable;
      }
    }
  }

  async readAsync(): Promise<PerceptionDataFile<T> | undefined> {
    try { return parseDataFile<T>(await fs.promises.readFile(this.filePath, 'utf8'), this.filePath); }
    catch (error) {
      try { return parseDataFile<T>(await fs.promises.readFile(this.recoveryPath, 'utf8'), this.recoveryPath); }
      catch (recoveryError) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && (recoveryError as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        const unreadable = new Error('Unreadable perception DataFile') as Error & { errors: unknown[] };
        unreadable.errors = [error, recoveryError];
        throw unreadable;
      }
    }
  }

  /** Atomic async transaction. The updater is synchronous; never hold this queue across SDK calls. */
  async updateAsync(update: (data: T | undefined) => T): Promise<PerceptionDataFile<T>> {
    const key = path.resolve(this.filePath);
    const operation = (asyncWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const previous = await this.readAsync();
      const now = new Date().toISOString();
      const file: PerceptionDataFile<T> = { version: DATA_VERSION, createdAt: previous?.createdAt ?? now, updatedAt: now, data: update(previous?.data) };
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      if (previous) await fs.promises.writeFile(this.recoveryPath, `${JSON.stringify(previous)}\n`, { encoding: 'utf8', mode: 0o600 });
      const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await fs.promises.writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await fs.promises.rename(temporaryPath, this.filePath);
        // Both copies must contain a reservation before the caller performs an external write.
        await fs.promises.writeFile(this.recoveryPath, `${JSON.stringify(file)}\n`, { encoding: 'utf8', mode: 0o600 });
      } finally { await fs.promises.unlink(temporaryPath).catch(() => {}); }
      return file;
    });
    asyncWrites.set(key, operation);
    try { return await operation; }
    finally { if (asyncWrites.get(key) === operation) asyncWrites.delete(key); }
  }

  write(data: T): PerceptionDataFile<T> {
    const now = new Date().toISOString();
    const previous = this.exists() ? this.read() : null;
    const file: PerceptionDataFile<T> = {
      version: DATA_VERSION,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      data,
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, this.recoveryPath);
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    return file;
  }
}
