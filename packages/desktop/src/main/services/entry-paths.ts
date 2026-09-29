import path from 'node:path';
import { getDataRoot } from '@originos/core/lib/paths';

export const EXPORTABLE_ENTRY_TYPES = ['skill', 'agent', 'role-agent'] as const;

export type ExportableEntryType = (typeof EXPORTABLE_ENTRY_TYPES)[number];

export class EntryPathError extends Error {
  constructor(
    public readonly code: 'INVALID_ENTRY_TYPE' | 'INVALID_ENTRY_ID',
    message: string,
  ) {
    super(message);
    this.name = 'EntryPathError';
  }
}

export function isExportableEntryType(value: unknown): value is ExportableEntryType {
  return typeof value === 'string'
    && EXPORTABLE_ENTRY_TYPES.includes(value as ExportableEntryType);
}

export function assertSafeEntryId(entryId: unknown): asserts entryId is string {
  if (
    typeof entryId !== 'string'
    || entryId.length === 0
    || entryId.trim() !== entryId
    || entryId === '.'
    || entryId === '..'
    || entryId.includes('/')
    || entryId.includes('\\')
    || entryId.includes('\0')
    || path.isAbsolute(entryId)
  ) {
    throw new EntryPathError('INVALID_ENTRY_ID', 'Entry identifier is invalid');
  }
}

export function resolveExportableEntryDirectory(
  entryType: unknown,
  entryId: unknown,
  dataRoot = getDataRoot(),
): string {
  if (!isExportableEntryType(entryType)) {
    throw new EntryPathError('INVALID_ENTRY_TYPE', 'Entry type is not exportable');
  }
  assertSafeEntryId(entryId);

  const collection = entryType === 'skill' ? 'skills' : 'agents';
  const collectionRoot = path.resolve(dataRoot, collection);
  const entryDirectory = path.resolve(collectionRoot, entryId);
  const relative = path.relative(collectionRoot, entryDirectory);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new EntryPathError('INVALID_ENTRY_ID', 'Entry identifier escapes its data directory');
  }

  return entryDirectory;
}
