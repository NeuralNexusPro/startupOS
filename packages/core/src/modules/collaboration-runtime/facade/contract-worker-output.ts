import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseCollaborationArtifactRef } from './artifact-reference';

interface ContractArtifactEnvelopeProjection {
  schemaVersion?: string;
  content?: string;
  files?: readonly {
    path?: string;
    operation?: 'created' | 'updated' | 'produced';
  }[];
}

export interface ContractWorkerFile {
  readonly path: string;
  readonly operation: 'created' | 'updated' | 'produced';
}

export interface ContractWorkerProjection {
  readonly output?: string;
  readonly files: readonly ContractWorkerFile[];
}

function formatBusinessValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => `- ${formatBusinessValue(item)}`).join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => `**${key}**：${formatBusinessValue(child)}`)
      .join('\n\n');
  }
  return String(value);
}

export function presentContractWorkerContent(content: unknown): string | undefined {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const record = content as Record<string, unknown>;
  if (typeof record['summary'] === 'string' && record['summary'].trim()) {
    return record['summary'].trim();
  }
  const outcome = record['outcome'];
  if (outcome && typeof outcome === 'object' && !Array.isArray(outcome)) {
    const outputs = (outcome as Record<string, unknown>)['outputs'];
    if (Array.isArray(outputs)) {
      const rendered = outputs.flatMap((output) => {
        if (!output || typeof output !== 'object' || Array.isArray(output)) return [];
        const value = (output as Record<string, unknown>)['value'];
        const text = formatBusinessValue(value).trim();
        return text ? [text] : [];
      });
      if (rendered.length) return rendered.join('\n\n---\n\n');
    }
  }
  if (typeof record['result'] === 'string' && record['result'] !== 'success') {
    return record['result'];
  }
  return undefined;
}

export async function readContractWorkerOutput(
  dataRoot: string,
  refs: readonly string[],
): Promise<string | undefined> {
  for (const ref of refs) {
    if (!ref.startsWith('artifact://collaboration/')) continue;
    try {
      const raw = await fs.readFile(parseCollaborationArtifactRef(dataRoot, ref), 'utf8');
      const envelope = JSON.parse(raw) as ContractArtifactEnvelopeProjection;
      if (typeof envelope.content !== 'string') continue;
      const presented = presentContractWorkerContent(JSON.parse(envelope.content) as unknown);
      if (presented) return presented;
    } catch {
      // A missing/corrupt internal receipt must not break runtime status or projection reads.
    }
  }
  return undefined;
}

function declaredRootPaths(content: unknown): string[] {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return [];
  const outcome = (content as Record<string, unknown>)['outcome'];
  const outputs = outcome && typeof outcome === 'object' && !Array.isArray(outcome)
    ? (outcome as Record<string, unknown>)['outputs']
    : undefined;
  if (!Array.isArray(outputs)) return [];
  return outputs.flatMap((output) => {
    if (!output || typeof output !== 'object' || Array.isArray(output)) return [];
    const value = (output as Record<string, unknown>)['value'];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const rootPath = (value as Record<string, unknown>)['rootPath'];
    return typeof rootPath === 'string' && rootPath.trim() ? [rootPath.trim()] : [];
  });
}

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    await Promise.all(entries.map(async (entry) => {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }));
  };
  await visit(directory);
  return files;
}

/** Reads the internal receipt while exposing only project-local user deliverables. */
export async function readContractWorkerProjection(
  dataRoot: string,
  refs: readonly string[],
  options?: {
    readonly projectId: string;
    readonly targetDirectory?: string;
  },
): Promise<ContractWorkerProjection> {
  for (const ref of refs) {
    if (!ref.startsWith('artifact://collaboration/')) continue;
    try {
      const raw = await fs.readFile(parseCollaborationArtifactRef(dataRoot, ref), 'utf8');
      const envelope = JSON.parse(raw) as ContractArtifactEnvelopeProjection;
      if (typeof envelope.content !== 'string') continue;
      const content = JSON.parse(envelope.content) as unknown;
      const output = presentContractWorkerContent(content);
      const projectRoot = options ? path.join(dataRoot, 'projects', options.projectId) : undefined;
      const recorded = (envelope.files ?? []).flatMap((file): ContractWorkerFile[] => {
        if (!projectRoot || typeof file.path !== 'string' || !file.path.trim()) return [];
        const absolute = path.resolve(projectRoot, file.path);
        const relative = path.relative(projectRoot, absolute);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return [];
        return [{ path: relative.split(path.sep).join('/'), operation: file.operation ?? 'produced' }];
      });
      if (recorded.length > 0 || !options?.targetDirectory || !projectRoot) {
        return { output, files: recorded };
      }

      // Compatibility for receipts written before files were recorded. A canonical
      // output may explicitly declare its product root; only that exact directory is read.
      const recovered: ContractWorkerFile[] = [];
      for (const declared of declaredRootPaths(content)) {
        const absolute = path.resolve(options.targetDirectory, declared);
        const relativeToTarget = path.relative(options.targetDirectory, absolute);
        if (relativeToTarget.startsWith('..') || path.isAbsolute(relativeToTarget)) continue;
        const stat = await fs.stat(absolute).catch(() => null);
        const candidates = stat?.isFile() ? [absolute] : stat?.isDirectory() ? await listFiles(absolute) : [];
        for (const candidate of candidates) {
          const relative = path.relative(projectRoot, candidate);
          if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
          recovered.push({ path: relative.split(path.sep).join('/'), operation: 'produced' });
        }
      }
      return { output, files: recovered.sort((left, right) => left.path.localeCompare(right.path)) };
    } catch {
      // A missing/corrupt internal receipt must not break runtime status or projection reads.
    }
  }
  return { files: [] };
}
