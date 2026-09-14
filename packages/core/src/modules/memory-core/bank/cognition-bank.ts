import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { cosineSimilarity, embeddingEngine } from '../archival/embedding';
import type {
  CognitionBankData,
  CognitionBankLocation,
  CognitionDataFile,
  CognitionRecord,
  CognitionRecallOptions,
  CognitionRecallResult,
  RetainInput,
} from './types';

const DATA_VERSION = '1.0';
const OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_VERSIONS = 10;

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

function redactSensitiveContent(content: string): string {
  return content
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*)['"]?[^\s'"]+['"]?/gi, '$1[REDACTED]');
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
  readonly scope: CognitionBankLocation['scope'];
  readonly ownerId: string;
  private readonly location: CognitionBankLocation;

  constructor(location: CognitionBankLocation) {
    this.location = location;
    this.scope = location.scope;
    this.ownerId = location.ownerId;
    this.directory = resolveCognitionBankDirectory(location);
    this.filePath = path.join(this.directory, 'records.json');
  }

  list(): CognitionRecord[] {
    return this.read().data.records;
  }

  get(recordId: string): CognitionRecord | null {
    return this.read().data.records.find((record) => record.id === recordId) ?? null;
  }

  update(recordId: string, mutate: (record: CognitionRecord) => void): CognitionRecord {
    const file = this.read();
    const record = file.data.records.find((candidate) => candidate.id === recordId);
    if (!record) throw new Error(`Cognition record not found: ${recordId}`);
    mutate(record);
    record.confidence = clampConfidence(record.confidence);
    record.proofCount = record.evidence.length;
    record.updatedAt = new Date().toISOString();
    this.write(file);
    return record;
  }

  async recall(query: string, options: CognitionRecallOptions = {}): Promise<CognitionRecallResult[]> {
    const normalizedQuery = normalizeContent(query);
    if (!normalizedQuery) return [];
    const records = this.filterRecords(options);
    try {
      const queryEmbedding = await embeddingEngine.encode(normalizedQuery);
      const scored = await Promise.all(records.map(async (record) => ({
        record,
        score: cosineSimilarity(queryEmbedding, await embeddingEngine.encode(this.searchableText(record))),
        strategy: 'semantic' as const,
      })));
      return this.rank(scored, options.limit);
    } catch {
      return this.recallKeywordRecords(normalizedQuery, records, options.limit);
    }
  }

  recallKeyword(query: string, options: CognitionRecallOptions = {}): CognitionRecallResult[] {
    const normalizedQuery = normalizeContent(query);
    if (!normalizedQuery) return [];
    return this.recallKeywordRecords(normalizedQuery, this.filterRecords(options), options.limit);
  }

  retain(input: RetainInput): CognitionRecord {
    const content = redactSensitiveContent(input.content).trim();
    if (!content) throw new Error('Cognition content must not be empty');
    const evidence = {
      ...input.evidence,
      excerpt: redactSensitiveContent(input.evidence.excerpt),
    };
    if (evidence.excerpt.length > 4096) throw new Error('Evidence excerpt exceeds 4096 characters');

    const file = this.read();
    const key = recordKey(input.kind, content);
    const existing = file.data.records.find(
      (record) => recordKey(record.kind, record.content) === key && record.status !== 'retracted',
    );
    const now = new Date().toISOString();

    if (existing) {
      if (!existing.evidence.some((existingEvidence) => existingEvidence.id === evidence.id)) {
        existing.evidence.push(evidence);
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
      evidence: [evidence],
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
    let parsed: CognitionDataFile<CognitionBankData>;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as CognitionDataFile<CognitionBankData>;
    } catch (error) {
      return this.restoreCorruptedFile(error);
    }
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
    this.writeVersion(file);
  }

  private filterRecords(options: CognitionRecallOptions): CognitionRecord[] {
    return this.read().data.records.filter((record) =>
      (!options.kinds || options.kinds.includes(record.kind)) &&
      (!options.statuses || options.statuses.includes(record.status))
    );
  }

  private searchableText(record: CognitionRecord): string {
    return [record.content, ...record.tags, ...record.evidence.map((evidence) => evidence.excerpt)].join(' ');
  }

  private recallKeywordRecords(query: string, records: CognitionRecord[], limit = 5): CognitionRecallResult[] {
    const terms = query.split(/\s+/).filter(Boolean);
    return this.rank(records.map((record) => {
      const text = normalizeContent(this.searchableText(record));
      const matches = terms.filter((term) => text.includes(term)).length;
      return { record, score: matches / Math.max(terms.length, 1), strategy: 'keyword' as const };
    }), limit);
  }

  private rank(results: CognitionRecallResult[], limit = 5): CognitionRecallResult[] {
    return results
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score || right.record.updatedAt.localeCompare(left.record.updatedAt))
      .slice(0, Math.max(0, limit));
  }

  private versionsDirectory(): string {
    return path.join(this.directory, 'versions');
  }

  private writeVersion(file: CognitionDataFile<CognitionBankData>): void {
    const directory = this.versionsDirectory();
    fs.mkdirSync(directory, { recursive: true });
    const versionPath = path.join(directory, `records.${file.updatedAt.replace(/[:.]/g, '-')}.${randomUUID()}.json`);
    fs.writeFileSync(versionPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    const versions = fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort().reverse();
    for (const stale of versions.slice(MAX_VERSIONS)) fs.unlinkSync(path.join(directory, stale));
  }

  private restoreCorruptedFile(cause: unknown): CognitionDataFile<CognitionBankData> {
    const quarantinePath = path.join(this.directory, `records.corrupt-${Date.now()}.json`);
    fs.renameSync(this.filePath, quarantinePath);
    const directory = this.versionsDirectory();
    const versions = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort().reverse()
      : [];
    for (const name of versions) {
      try {
        const candidate = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as CognitionDataFile<CognitionBankData>;
        if (candidate.data.scope !== this.location.scope || candidate.data.ownerId !== this.location.ownerId) continue;
        const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
        fs.writeFileSync(temporaryPath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
        fs.renameSync(temporaryPath, this.filePath);
        return candidate;
      } catch {
        continue;
      }
    }
    throw new Error(`Cognition bank is corrupt and no valid version is available: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
