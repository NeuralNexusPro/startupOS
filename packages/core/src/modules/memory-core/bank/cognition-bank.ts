import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type {
  CognitionBankData,
  CognitionBankLocation,
  CognitionDataFile,
  CognitionRecord,
  RetainInput,
} from './types';

const DATA_VERSION = '1.0';
const OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertOwnerId(ownerId: string): void {
  if (!OWNER_ID_PATTERN.test(ownerId)) {
    throw new Error(`Invalid cognition owner id: ${ownerId}`);
  }
}

function isWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveCognitionBankDirectory(location: CognitionBankLocation): string {
  assertOwnerId(location.ownerId);
  const dataRoot = path.resolve(location.dataRoot);
  let bankDirectory: string;

  if (location.scope === 'user') {
    bankDirectory = path.join(dataRoot, 'users', location.ownerId, 'cognition');
  } else if (location.ownerDirectory) {
    const ownerDirectory = path.resolve(location.ownerDirectory);
    if (!isWithin(ownerDirectory, dataRoot)) {
      throw new Error('Cognition owner directory must be inside data root');
    }
    bankDirectory = path.join(ownerDirectory, 'cognition');
  } else {
    const collection = location.scope === 'agent' ? 'agents' : 'projects';
    bankDirectory = path.join(dataRoot, collection, location.ownerId, 'cognition');
  }

  if (!isWithin(bankDirectory, dataRoot)) {
    throw new Error('Resolved cognition bank escaped data root');
  }
  return bankDirectory;
}

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function recordKey(kind: RetainInput['kind'], content: string): string {
  return createHash('sha256').update(`${kind}\0${normalizeContent(content)}`).digest('hex');
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class CognitionBank {
  readonly directory: string;
  readonly filePath: string;
  private readonly location: CognitionBankLocation;

  constructor(location: CognitionBankLocation) {
    this.location = location;
    this.directory = resolveCognitionBankDirectory(location);
    this.filePath = path.join(this.directory, 'records.json');
  }

  list(): CognitionRecord[] {
    return this.read().data.records;
  }

  retain(input: RetainInput): CognitionRecord {
    const content = input.content.trim();
    if (!content) throw new Error('Cognition content must not be empty');
    if (input.evidence.excerpt.length > 4096) throw new Error('Evidence excerpt exceeds 4096 characters');

    const file = this.read();
    const key = recordKey(input.kind, content);
    const existing = file.data.records.find(
      (record) => recordKey(record.kind, record.content) === key && record.status !== 'retracted',
    );
    const now = new Date().toISOString();

    if (existing) {
      if (!existing.evidence.some((evidence) => evidence.id === input.evidence.id)) {
        existing.evidence.push(input.evidence);
      }
      existing.proofCount = existing.evidence.length;
      existing.confidence = clampConfidence(Math.max(existing.confidence, input.confidence ?? 0.5));
      existing.tags = [...new Set([...existing.tags, ...(input.tags ?? [])])];
      existing.updatedAt = now;
      this.write(file);
      return existing;
    }

    const record: CognitionRecord = {
      id: randomUUID(),
      scope: this.location.scope,
      ownerId: this.location.ownerId,
      kind: input.kind,
      content,
      confidence: clampConfidence(input.confidence ?? 0.5),
      status: input.status ?? 'candidate',
      evidence: [input.evidence],
      proofCount: 1,
      tags: [...new Set(input.tags ?? [])],
      validFrom: input.validFrom,
      validTo: input.validTo,
      createdAt: now,
      updatedAt: now,
    };
    file.data.records.push(record);
    this.write(file);
    return record;
  }

  private read(): CognitionDataFile<CognitionBankData> {
    if (!fs.existsSync(this.filePath)) {
      const now = new Date().toISOString();
      return {
        version: DATA_VERSION,
        createdAt: now,
        updatedAt: now,
        data: { scope: this.location.scope, ownerId: this.location.ownerId, records: [] },
      };
    }
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as CognitionDataFile<CognitionBankData>;
    if (parsed.data.scope !== this.location.scope || parsed.data.ownerId !== this.location.ownerId) {
      throw new Error('Cognition bank ownership mismatch');
    }
    return parsed;
  }

  private write(file: CognitionDataFile<CognitionBankData>): void {
    fs.mkdirSync(this.directory, { recursive: true });
    file.updatedAt = new Date().toISOString();
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}

