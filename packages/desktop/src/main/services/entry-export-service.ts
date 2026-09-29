import archiver = require('archiver');
import type { Archiver } from 'archiver';
import { randomUUID } from 'node:crypto';
import { createWriteStream, type WriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ipcMain, shell } from 'electron';
import type {
  EntryExportRequest,
  EntryExportResponse,
  IpcResponse,
} from '@originos/core/lib/integrations/electron';
import {
  isSystemSkillFrontmatter,
  parseFrontmatter,
} from '@originos/core/lib/integrations/pi-agent/core/skills';
import { IPC_CHANNELS } from '../ipc-protocol';
import {
  EntryPathError,
  resolveExportableEntryDirectory,
} from './entry-paths';

export type EntryExportErrorCode =
  | 'INVALID_ENTRY_TYPE'
  | 'INVALID_ENTRY_ID'
  | 'ENTRY_NOT_FOUND'
  | 'EXPORT_NOT_ALLOWED'
  | 'EXPORT_FAILED'
  | 'REVEAL_FAILED';

export class EntryExportError extends Error {
  constructor(
    public readonly code: EntryExportErrorCode,
    message: string,
    public readonly zipPath?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EntryExportError';
  }
}

interface EntryExportDependencies {
  dataRoot?: string;
  revealItem?: (zipPath: string) => void | Promise<void>;
  archiveEntry?: typeof archiveDirectory;
}

interface ArchiveDirectoryOptions {
  archiveFactory?: () => Archiver;
  outputFactory?: (targetPath: string) => WriteStream;
}

async function addDirectoryEntries(
  archive: Archiver,
  sourceDirectory: string,
  relativeDirectory = '',
): Promise<void> {
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  if (entries.length === 0 && relativeDirectory) {
    archive.append('', { name: `${relativeDirectory.split(path.sep).join('/')}/` });
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(sourceDirectory, entry.name);
    const relativePath = relativeDirectory
      ? path.join(relativeDirectory, entry.name)
      : entry.name;
    const zipPath = relativePath.split(path.sep).join('/');

    if (entry.isSymbolicLink()) {
      archive.symlink(zipPath, await fs.readlink(fullPath));
    } else if (entry.isDirectory()) {
      await addDirectoryEntries(archive, fullPath, relativePath);
    } else if (entry.isFile()) {
      archive.file(fullPath, { name: zipPath });
    }
  }
}

export async function archiveDirectory(
  sourceDirectory: string,
  targetPath: string,
  options: ArchiveDirectoryOptions = {},
): Promise<void> {
  const output = options.outputFactory?.(targetPath) ?? createWriteStream(targetPath, { flags: 'wx' });
  const archive = options.archiveFactory?.() ?? new archiver.ZipArchive({ zlib: { level: 9 } });

  const completion = new Promise<void>((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
    archive.on('warning', (warning: NodeJS.ErrnoException) => {
      if (warning.code !== 'ENOENT') {
        reject(warning);
      }
    });
  });

  archive.pipe(output);

  try {
    await addDirectoryEntries(archive, sourceDirectory);
    await archive.finalize();
    await completion;
  } catch (error) {
    archive.abort();
    output.destroy();
    throw error;
  }
}

async function replaceFileAtomically(tempPath: string, targetPath: string): Promise<void> {
  const backupPath = `${targetPath}.${randomUUID()}.bak`;
  let hasBackup = false;

  try {
    try {
      await fs.rename(targetPath, backupPath);
      hasBackup = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.rename(tempPath, targetPath);

    if (hasBackup) {
      await fs.rm(backupPath, { force: true }).catch((error) => {
        console.warn('[EntryExportService] Failed to remove previous ZIP backup', error);
      });
    }
  } catch (error) {
    if (hasBackup) {
      try {
        await fs.rename(backupPath, targetPath);
      } catch (restoreError) {
        console.error('[EntryExportService] Failed to restore previous ZIP', restoreError);
      }
    }
    throw error;
  }
}

export async function exportEntryDirectory(
  request: EntryExportRequest,
  dependencies: EntryExportDependencies = {},
): Promise<EntryExportResponse> {
  let sourceDirectory: string;

  try {
    sourceDirectory = resolveExportableEntryDirectory(
      request.entryType,
      request.entryId,
      dependencies.dataRoot,
    );
  } catch (error) {
    if (error instanceof EntryPathError) {
      throw new EntryExportError(error.code, error.message, undefined, { cause: error });
    }
    throw error;
  }

  let sourceStats;
  try {
    sourceStats = await fs.stat(sourceDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new EntryExportError('ENTRY_NOT_FOUND', 'Entry work directory does not exist');
    }
    throw new EntryExportError('EXPORT_FAILED', 'Unable to inspect entry work directory', undefined, { cause: error });
  }

  if (!sourceStats.isDirectory()) {
    throw new EntryExportError('ENTRY_NOT_FOUND', 'Entry work directory does not exist');
  }

  const sourceLinkStats = await fs.lstat(sourceDirectory);
  if (sourceLinkStats.isSymbolicLink()) {
    throw new EntryExportError('INVALID_ENTRY_ID', 'Entry work directory cannot be a symbolic link');
  }

  if (request.entryType === 'skill') {
    try {
      const skillContent = await fs.readFile(path.join(sourceDirectory, 'SKILL.md'), 'utf8');
      if (isSystemSkillFrontmatter(parseFrontmatter(skillContent).frontmatter)) {
        throw new EntryExportError('EXPORT_NOT_ALLOWED', 'Built-in skills cannot be exported');
      }
    } catch (error) {
      if (error instanceof EntryExportError) {
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new EntryExportError(
          'EXPORT_FAILED',
          'Unable to inspect skill metadata',
          undefined,
          { cause: error },
        );
      }
    }
  }

  const zipPath = `${sourceDirectory}.zip`;
  const tempPath = `${zipPath}.${randomUUID()}.tmp`;

  try {
    await (dependencies.archiveEntry ?? archiveDirectory)(sourceDirectory, tempPath);
    await replaceFileAtomically(tempPath, zipPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw new EntryExportError('EXPORT_FAILED', 'Unable to create ZIP archive', undefined, { cause: error });
  }

  try {
    await dependencies.revealItem?.(zipPath);
  } catch (error) {
    throw new EntryExportError(
      'REVEAL_FAILED',
      'ZIP was created but could not be shown in the file manager',
      zipPath,
      { cause: error },
    );
  }

  return { zipPath };
}

function errorResponse(error: unknown): IpcResponse<EntryExportResponse> {
  const knownError = error instanceof EntryExportError ? error : null;
  return {
    success: false,
    error: {
      code: knownError?.code ?? 'EXPORT_FAILED',
      message: knownError?.message ?? 'Unable to export entry directory',
      ...(knownError?.zipPath ? { details: { zipPath: knownError.zipPath } } : {}),
    },
    timestamp: new Date().toISOString(),
  };
}

export async function handleEntryExport(
  request: EntryExportRequest,
  dependencies: EntryExportDependencies = {},
): Promise<IpcResponse<EntryExportResponse>> {
  try {
    const data = await exportEntryDirectory(request, {
      ...dependencies,
      revealItem: dependencies.revealItem ?? ((zipPath) => shell.showItemInFolder(zipPath)),
    });
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[EntryExportService] Export failed', error);
    return errorResponse(error);
  }
}

export class EntryExportService {
  constructor() {
    ipcMain.handle(
      IPC_CHANNELS.ENTRY_EXPORT,
      async (_event, request: EntryExportRequest) => handleEntryExport(request),
    );
  }
}
