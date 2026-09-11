import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Memory } from '../core/memory';
import { CognitionBank } from './cognition-bank';
import type { CognitionDataFile, CognitionScope } from './types';

const MIGRATION_VERSION = '1.0';

export interface LegacyUserSignalMigrationInput {
  ownerDirectory: string;
  ownerScope: Exclude<CognitionScope, 'user'>;
  ownerId: string;
  userBank: CognitionBank;
}

export interface LegacyUserSignalMigrationData {
  migration: 'legacy-user-signals-v1';
  ownerScope: Exclude<CognitionScope, 'user'>;
  ownerId: string;
  recordIds: string[];
  sources: Array<'human' | 'taste'>;
}

export interface LegacyUserSignalMigrationResult {
  migrated: boolean;
  recordIds: string[];
  markerPath: string;
}

function evidenceId(ownerScope: string, ownerId: string, source: string, content: string): string {
  return createHash('sha256')
    .update(`legacy-user-signals-v1\0${ownerScope}\0${ownerId}\0${source}\0${content.trim()}`)
    .digest('hex');
}

/** One-time, non-destructive migration from owner-local legacy user signals. */
export function migrateLegacyUserSignals(input: LegacyUserSignalMigrationInput): LegacyUserSignalMigrationResult {
  const markerPath = path.join(input.ownerDirectory, 'cognition', 'migrations', 'legacy-user-signals-v1.json');
  if (fs.existsSync(markerPath)) {
    try {
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as CognitionDataFile<LegacyUserSignalMigrationData>;
      return { migrated: false, recordIds: marker.data.recordIds, markerPath };
    } catch {
      throw new Error(`Legacy user signal migration marker is corrupted: ${markerPath}`);
    }
  }

  const sources: Array<{ kind: 'human' | 'taste'; content: string }> = [];
  const memoryPath = path.join(input.ownerDirectory, 'Memory.md');
  const blocksPath = path.join(input.ownerDirectory, 'blocks.json');
  if (fs.existsSync(memoryPath) || fs.existsSync(blocksPath)) {
    const human = new Memory(input.ownerDirectory).getBlock('human')?.value.trim();
    if (human) sources.push({ kind: 'human', content: human });
  }
  const tastePath = path.join(input.ownerDirectory, 'Taste.md');
  if (fs.existsSync(tastePath)) {
    const taste = fs.readFileSync(tastePath, 'utf8').trim();
    if (taste) sources.push({ kind: 'taste', content: taste });
  }

  const now = new Date().toISOString();
  const recordIds = sources.map(({ kind, content }) => input.userBank.retain({
    kind: 'observation',
    content,
    confidence: 0.35,
    status: 'candidate',
    tags: ['legacy-migration', kind === 'taste' ? 'user-style-candidate' : 'user-profile-candidate'],
    evidence: {
      id: evidenceId(input.ownerScope, input.ownerId, kind, content),
      source: 'legacy',
      sourceId: `${input.ownerScope}:${input.ownerId}:${kind}`,
      excerpt: content.slice(0, 4096),
      observedAt: now,
    },
  }).id);

  const marker: CognitionDataFile<LegacyUserSignalMigrationData> = {
    version: MIGRATION_VERSION,
    createdAt: now,
    updatedAt: now,
    data: {
      migration: 'legacy-user-signals-v1',
      ownerScope: input.ownerScope,
      ownerId: input.ownerId,
      recordIds,
      sources: sources.map((source) => source.kind),
    },
  };
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  const temporaryPath = `${markerPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, markerPath);
  return { migrated: recordIds.length > 0, recordIds, markerPath };
}
