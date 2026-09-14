import fs from 'node:fs';
import path from 'node:path';
import type { PerceptionDataFile } from '../protocol/types';

const DATA_VERSION = '1.0';

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
        throw new AggregateError([currentError, recoveryError], `Perception DataFile and recovery are unreadable: ${this.filePath}`);
      }
    }
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

