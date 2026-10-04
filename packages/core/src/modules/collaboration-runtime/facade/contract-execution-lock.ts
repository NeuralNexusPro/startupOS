/**
 * contract-execution-lock — 协作执行账本的文件互斥锁实现（FileCollaborationMutationLock）。
 */

import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import type { CollaborationMutationLockPort } from './contract-execution-types';
import {
  CollaborationMutationConflictError,
  identifier,
} from './contract-execution-shared';

export class FileCollaborationMutationLock
implements CollaborationMutationLockPort {
  constructor(
    private readonly dataRoot: string,
    private readonly timeoutMs = 5_000,
    private readonly retryMs = 10,
  ) {}

  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    identifier(key, 'lock key');
    const lockRoot = path.join(this.dataRoot, '.collaboration-locks');
    await fs.mkdir(lockRoot, { recursive: true });
    const lockPath = path.join(lockRoot, `${key}.lock`);
    const startedAt = Date.now();
    let handle: FileHandle | undefined;
    while (!handle) {
      try {
        handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
        }));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() - startedAt >= this.timeoutMs) {
          const stat = await fs.stat(lockPath).catch(() => undefined);
          if (stat && Date.now() - stat.mtimeMs >= this.timeoutMs) {
            await fs.unlink(lockPath).catch((unlinkError: unknown) => {
              if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw unlinkError;
              }
            });
            continue;
          }
          throw new CollaborationMutationConflictError(
            `Timed out acquiring mutation lock for ${key}`,
          );
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.retryMs);
        });
      }
    }
    try {
      return await operation();
    } finally {
      await handle.close();
      await fs.unlink(lockPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
  }
}
