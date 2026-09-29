import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../ipc-protocol';
import type {
  IpcResponse,
  WorkspaceUploadRequest,
  WorkspaceUploadResponse,
} from '@originos/core/lib/integrations/electron';
import { getDataRoot, getMonorepoRoot } from '@originos/core/lib/paths';
import { loadSkills } from '@originos/core/lib/integrations/pi-agent/core/skills';
import { recordUploads } from '@originos/core/lib/integrations/pi-agent/upload-tracker';
import {
  assertRealPathWithin,
  assertSafeWorkspaceFileName,
  assertWorkspacePathCanBeCreated,
  isPathWithin,
  resolveWorkspaceBasePath,
  writeWorkspaceUploadFile,
} from '@originos/core/lib/integrations/electron/workspace-paths';
import { resolveExportableEntryDirectory } from './entry-paths';

const ALLOWED_BASES = [
  getDataRoot(),
  path.join(getDataRoot(), 'skills'),
  path.join(getMonorepoRoot(), 'skills'),
  path.join(getMonorepoRoot(), 'tmp'),
];

function assertAllowed(p: string): void {
  const normalized = resolveWorkspaceBasePath(p, {
    dataRoot: getDataRoot(),
    monorepoRoot: getMonorepoRoot(),
  });
  if (!ALLOWED_BASES.some((base) => isPathWithin(normalized, base))) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
  }
}

async function resolveProjectDir(entryId: string): Promise<{ baseDir: string; entryId: string; ontologyId: string }> {
  const projectsRoot = path.join(getDataRoot(), 'projects');
  const candidates = [
    entryId,
    entryId.startsWith('project-') ? entryId.slice('project-'.length) : null,
    `project-${entryId}`,
  ].filter((id): id is string => Boolean(id));

  for (const candidate of [...new Set(candidates)]) {
    const baseDir = path.join(projectsRoot, candidate);
    try {
      const stats = await fs.stat(baseDir);
      if (stats.isDirectory()) {
        return { baseDir, entryId: candidate, ontologyId: `ontology-${candidate}` };
      }
    } catch {
      // Try next compatibility candidate.
    }
  }

  const fallbackId = entryId.startsWith('project-') ? entryId.slice('project-'.length) : entryId;
  return {
    baseDir: path.join(projectsRoot, fallbackId),
    entryId: fallbackId,
    ontologyId: `ontology-${fallbackId}`,
  };
}

const MAX_UPLOAD_FILE_SIZE = 500 * 1024 * 1024; // 500MB

function decodeUploadContent(file: { name: string; content: unknown; encoding?: string }): Buffer {
  if (file.encoding === 'base64') {
    if (typeof file.content !== 'string') {
      throw new Error(`Invalid upload payload for "${file.name}": base64 content must be a string`);
    }
    return Buffer.from(file.content, 'base64');
  }
  if (typeof file.content === 'string') {
    return Buffer.from(file.content, 'base64');
  }
  if (file.content instanceof ArrayBuffer) {
    return Buffer.from(file.content);
  }
  if (ArrayBuffer.isView(file.content)) {
    return Buffer.from(file.content.buffer, file.content.byteOffset, file.content.byteLength);
  }
  throw new Error(`Invalid upload payload for "${file.name}": unsupported content type ${Object.prototype.toString.call(file.content)}`);
}

export class WorkspaceService {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // ── Workspace Resolve ─────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_RESOLVE,
      async (_event, request: { entryType: string; entryId: string }): Promise<IpcResponse<unknown>> => {
        try {
          console.log('[WorkspaceService] resolve request', request);
          if (!request.entryType || !request.entryId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'entryType and entryId are required' },
              timestamp: new Date().toISOString(),
            };
          }

          // Special handling for skills
          if (request.entryType === 'skill') {
            const result = loadSkills({ includeDefaults: true });
            const skill = result.skills.find((s) => s.name === request.entryId || s.code === request.entryId);
            if (!skill) {
              return {
                success: false,
                error: { code: 'NOT_FOUND', message: `Skill "${request.entryId}" not found` },
                timestamp: new Date().toISOString(),
              };
            }
            // 技能工作区使用数据目录（可写），而不是 Resources 目录（只读）
            const skillWorkspaceDir = resolveExportableEntryDirectory('skill', request.entryId);
            console.log('[WorkspaceService] resolve skill result', {
              entryId: request.entryId,
              baseDir: skillWorkspaceDir,
              sourceDir: skill.baseDir,
            });
            return {
              success: true,
              data: { baseDir: skillWorkspaceDir, entryType: request.entryType, entryId: request.entryId },
              timestamp: new Date().toISOString(),
            };
          }

          if (request.entryType === 'project') {
            const resolved = await resolveProjectDir(request.entryId);
            console.log('[WorkspaceService] resolve project result', {
              requestedEntryId: request.entryId,
              resolvedEntryId: resolved.entryId,
              baseDir: resolved.baseDir,
              ontologyId: resolved.ontologyId,
            });
            return {
              success: true,
              data: { ...resolved, entryType: request.entryType },
              timestamp: new Date().toISOString(),
            };
          }

          if (request.entryType !== 'agent' && request.entryType !== 'role-agent') {
            return {
              success: false,
              error: { code: 'INVALID_ENTRY_TYPE', message: `Unknown entryType: ${request.entryType}` },
              timestamp: new Date().toISOString(),
            };
          }

          return {
            success: true,
            data: {
              baseDir: resolveExportableEntryDirectory(request.entryType, request.entryId),
              entryType: request.entryType,
              entryId: request.entryId,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[WorkspaceService] Resolve failed');
        }
      }
    );

    // ── Workspace File List ───────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_FILE_LIST,
      async (_event, request: { basePath: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.basePath) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'basePath is required' },
              timestamp: new Date().toISOString(),
            };
          }
          assertAllowed(request.basePath);
          const files = await this.scanDir(request.basePath, request.basePath);
          files.sort((a, b) => b.modifiedAt - a.modifiedAt);
          return {
            success: true,
            data: { files, total: files.length },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'FORBIDDEN') {
            return {
              success: false,
              error: { code: 'FORBIDDEN', message: 'Access denied' },
              timestamp: new Date().toISOString(),
            };
          }
          return this.toErrorResponse(error, '[WorkspaceService] File list failed');
        }
      }
    );

    // ── Workspace File Read ───────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_FILE_READ,
      async (_event, request: { basePath: string; filePath: string[] }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.basePath || !request.filePath?.length) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'basePath and filePath are required' },
              timestamp: new Date().toISOString(),
            };
          }
          const fullPath = this.resolveAndCheck(request.basePath, request.filePath);
          const stats = await fs.stat(fullPath);
          const relPath = request.filePath.join('/');
          const content = await fs.readFile(fullPath, 'utf-8');
          return {
            success: true,
            data: {
              file: {
                id: Buffer.from(relPath).toString('base64'),
                projectId: request.basePath,
                path: relPath,
                name: path.basename(relPath),
                size: Number(stats.size),
                createdAt: Number(stats.birthtimeMs),
                modifiedAt: Number(stats.mtimeMs),
                type: 'file',
                extension: path.extname(relPath).slice(1),
              },
              content,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'FORBIDDEN') {
            return {
              success: false,
              error: { code: 'FORBIDDEN', message: 'Access denied' },
              timestamp: new Date().toISOString(),
            };
          }
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'File not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return this.toErrorResponse(error, '[WorkspaceService] File read failed');
        }
      }
    );

    // ── Workspace File Write ──────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_FILE_WRITE,
      async (_event, request: { basePath: string; filePath: string[]; content: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.basePath || !request.filePath?.length) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'basePath and filePath are required' },
              timestamp: new Date().toISOString(),
            };
          }
          const fullPath = this.resolveAndCheck(request.basePath, request.filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, request.content, 'utf-8');
          const stats = await fs.stat(fullPath);
          const relPath = request.filePath.join('/');
          return {
            success: true,
            data: {
              id: Buffer.from(relPath).toString('base64'),
              projectId: request.basePath,
              path: relPath,
              name: path.basename(relPath),
              size: Number(stats.size),
              createdAt: Number(stats.birthtimeMs),
              modifiedAt: Number(stats.mtimeMs),
              type: 'file',
              extension: path.extname(relPath).slice(1),
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'FORBIDDEN') {
            return {
              success: false,
              error: { code: 'FORBIDDEN', message: 'Access denied' },
              timestamp: new Date().toISOString(),
            };
          }
          return this.toErrorResponse(error, '[WorkspaceService] File write failed');
        }
      }
    );

    // ── Workspace File Delete ─────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_FILE_DELETE,
      async (_event, request: { basePath: string; filePath: string[] }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.basePath || !request.filePath?.length) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'basePath and filePath are required' },
              timestamp: new Date().toISOString(),
            };
          }
          const fullPath = this.resolveAndCheck(request.basePath, request.filePath);
          await fs.unlink(fullPath);
          return {
            success: true,
            data: { deleted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'FORBIDDEN') {
            return {
              success: false,
              error: { code: 'FORBIDDEN', message: 'Access denied' },
              timestamp: new Date().toISOString(),
            };
          }
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'File not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return this.toErrorResponse(error, '[WorkspaceService] File delete failed');
        }
      }
    );

    // ── Workspace File Upload ─────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_FILE_UPLOAD,
      async (_event, request?: WorkspaceUploadRequest | null): Promise<IpcResponse<WorkspaceUploadResponse>> => {
        const basePath = request?.basePath;
        const files = request?.files;
        try {
          console.log('[WorkspaceService] file upload request', {
            basePath,
            fileCount: files?.length ?? 0,
            fileNames: files?.map((file) => file.name) ?? [],
          });
          if (!basePath || !files?.length) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'basePath and files are required' },
              timestamp: new Date().toISOString(),
            };
          }

          const resolvedBasePath = this.resolveAllowedBase(basePath);
          console.log('[WorkspaceService] file upload path resolved', {
            basePath,
            resolvedBasePath,
            dataRoot: getDataRoot(),
          });
          await assertWorkspacePathCanBeCreated(resolvedBasePath, ALLOWED_BASES);
          await fs.mkdir(resolvedBasePath, { recursive: true });
          await assertRealPathWithin(resolvedBasePath, ALLOWED_BASES);

          const uploadedFiles: WorkspaceUploadResponse['files'] = [];
          for (const file of files) {
            if (!file.name) {
              return {
                success: false,
                error: { code: 'INVALID_REQUEST', message: 'file name is required' },
                timestamp: new Date().toISOString(),
              };
            }
            assertSafeWorkspaceFileName(file.name);

            const buffer = decodeUploadContent(file);
            if (buffer.length > MAX_UPLOAD_FILE_SIZE) {
              return {
                success: false,
                error: { code: 'FILE_TOO_LARGE', message: `文件 "${file.name}" 超过 500MB 大小限制` },
                timestamp: new Date().toISOString(),
              };
            }

            const writtenFile = await writeWorkspaceUploadFile(
              resolvedBasePath,
              file.name,
              buffer,
            );
            uploadedFiles.push({
              name: writtenFile.fileName,
              path: path.relative(resolvedBasePath, writtenFile.fullPath),
              size: buffer.length,
            });
          }

          await recordUploads(resolvedBasePath, uploadedFiles);

          return {
            success: true,
            data: { files: uploadedFiles },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          const uploadError = error as NodeJS.ErrnoException;
          console.warn('[WorkspaceService] file upload rejected', {
            basePath,
            code: uploadError.code,
            message: uploadError.message,
          });
          if ((error as NodeJS.ErrnoException).code === 'FORBIDDEN') {
            return {
              success: false,
              error: { code: 'FORBIDDEN', message: 'Access denied' },
              timestamp: new Date().toISOString(),
            };
          }
          if (uploadError.code === 'INVALID_FILE_NAME') {
            return {
              success: false,
              error: { code: 'INVALID_FILE_NAME', message: uploadError.message },
              timestamp: new Date().toISOString(),
            };
          }
          return this.toErrorResponse(error, '[WorkspaceService] File upload failed');
        }
      }
    );
  }

  private resolveAndCheck(basePath: string, segments: string[]): string {
    const norm = this.resolveAllowedBase(basePath);
    const full = path.join(norm, ...segments);
    if (!isPathWithin(full, norm)) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }
    return full;
  }

  private resolveAllowedBase(basePath: string): string {
    const norm = resolveWorkspaceBasePath(basePath, {
      dataRoot: getDataRoot(),
      monorepoRoot: getMonorepoRoot(),
    });
    if (!ALLOWED_BASES.some((base) => isPathWithin(norm, base))) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }
    return norm;
  }

  private async scanDir(dir: string, contextId: string, rel = ''): Promise<Array<{
    id: string;
    projectId: string;
    path: string;
    name: string;
    size: number;
    createdAt: number;
    modifiedAt: number;
    type: string;
    extension?: string;
    parentPath?: string;
  }>> {
    const files: Array<{
      id: string;
      projectId: string;
      path: string;
      name: string;
      size: number;
      createdAt: number;
      modifiedAt: number;
      type: string;
      extension?: string;
      parentPath?: string;
    }> = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        const stats = await fs.stat(full);
        files.push({
          id: Buffer.from(relPath).toString('base64'),
          projectId: contextId,
          path: relPath,
          name: e.name,
          size: e.isDirectory() ? 0 : stats.size,
          createdAt: stats.birthtimeMs,
          modifiedAt: stats.mtimeMs,
          type: e.isDirectory() ? 'folder' : 'file',
          extension: e.isFile() ? path.extname(e.name).slice(1) : undefined,
          parentPath: rel || undefined,
        });
        if (e.isDirectory()) {
          files.push(...await this.scanDir(full, contextId, relPath));
        }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return files;
  }

  private toErrorResponse<T>(error: unknown, logMessage: string): IpcResponse<T> {
    console.error(logMessage, error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
