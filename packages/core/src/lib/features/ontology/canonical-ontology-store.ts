import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import { getDataRoot } from '../../paths';
import type { DataFile } from '../../storage/json-store';
import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  type CanonicalConcept,
  type CanonicalContextProjectionRecord,
  type CanonicalDomain,
  type CanonicalFactRecord,
  type CanonicalInstance,
  type CanonicalMigrationRecord,
  type CanonicalOntology,
  type CanonicalOperationRecord,
} from './types';

type StoredTimed<T extends { createdAt: Date; updatedAt: Date }> =
  Omit<T, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string };
type StoredOntology = Omit<CanonicalOntology, 'domains' | 'concepts' | 'instances' | 'createdAt' | 'updatedAt'> & {
  domains: StoredTimed<CanonicalDomain>[];
  concepts: StoredTimed<CanonicalConcept>[];
  instances: StoredTimed<CanonicalInstance>[];
  createdAt: string;
  updatedAt: string;
};
type StoredFact = Omit<CanonicalFactRecord, 'acceptedAt'> & { acceptedAt: string };
type StoredOperation = Omit<CanonicalOperationRecord, 'recordedAt'> & { recordedAt: string };
type StoredProjection = Omit<CanonicalContextProjectionRecord, 'createdAt'> & { createdAt: string };
type StoredMigration = Omit<CanonicalMigrationRecord, 'recordedAt'> & { recordedAt: string };

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assertProjectId(projectId: string): void {
  if (!PROJECT_ID.test(projectId) || projectId.includes('..') || path.isAbsolute(projectId)) {
    throw new TypeError(`Invalid projectId: ${projectId}`);
  }
}

function date(value: unknown, field: string): Date {
  if (typeof value !== 'string') throw new Error(`Invalid date at ${field}`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date at ${field}`);
  return parsed;
}

function encodeOntology(ontology: CanonicalOntology): StoredOntology {
  const encodeTimed = <T extends { createdAt: Date; updatedAt: Date }>(value: T): StoredTimed<T> => ({
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  });
  return {
    ...ontology,
    domains: ontology.domains.map(encodeTimed),
    concepts: ontology.concepts.map(encodeTimed),
    instances: ontology.instances.map(encodeTimed),
    createdAt: ontology.createdAt.toISOString(),
    updatedAt: ontology.updatedAt.toISOString(),
  };
}

function decodeOntology(stored: StoredOntology): CanonicalOntology {
  const decodeTimed = <T extends { createdAt: string; updatedAt: string }>(value: T, field: string) => ({
    ...value,
    createdAt: date(value.createdAt, `${field}.createdAt`),
    updatedAt: date(value.updatedAt, `${field}.updatedAt`),
  });
  if (!Array.isArray(stored.domains) || !Array.isArray(stored.concepts) || !Array.isArray(stored.instances)) {
    throw new Error('Invalid canonical ontology date-bearing collections');
  }
  return {
    ...stored,
    domains: stored.domains.map((value, index) => decodeTimed(value, `domains[${index}]`)),
    concepts: stored.concepts.map((value, index) => decodeTimed(value, `concepts[${index}]`)),
    instances: stored.instances.map((value, index) => decodeTimed(value, `instances[${index}]`)),
    createdAt: date(stored.createdAt, 'createdAt'),
    updatedAt: date(stored.updatedAt, 'updatedAt'),
  };
}

function isDataFile(value: unknown): value is DataFile<unknown> {
  if (!value || typeof value !== 'object') return false;
  const file = value as Record<string, unknown>;
  return typeof file.version === 'string'
    && typeof file.createdAt === 'string'
    && typeof file.updatedAt === 'string'
    && 'data' in file;
}

export class CanonicalOntologyStore {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly dataRoot = getDataRoot()) {}

  async writeOntology(
    projectId: string,
    ontology: CanonicalOntology,
    options: { createOnly?: boolean } = {},
  ): Promise<DataFile<CanonicalOntology>> {
    if (ontology.projectId !== projectId) {
      throw new TypeError(`Ontology projectId ${ontology.projectId} does not match ${projectId}`);
    }
    const filePath = this.file(projectId, 'ontology.json');
    return this.enqueue(filePath, async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const existing = await this.readDataFile(filePath);
      if (options.createOnly && existing) {
        throw new Error(`Canonical ontology already exists for ${projectId}`);
      }
      const now = new Date().toISOString();
      const stored: DataFile<StoredOntology> = {
        version: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        data: encodeOntology(ontology),
      };
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(stored, null, 2), 'utf8');
        await fs.rename(temporary, filePath);
      } finally {
        await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
      return { ...stored, data: ontology };
    });
  }

  async readOntology(projectId: string): Promise<DataFile<CanonicalOntology> | null> {
    const filePath = this.file(projectId, 'ontology.json');
    await this.pending(filePath);
    const stored = await this.readDataFile(filePath);
    if (!stored) return null;
    return { ...stored, data: decodeOntology(stored.data as StoredOntology) };
  }

  async deleteOntology(projectId: string, expectedUpdatedAt?: string): Promise<boolean> {
    const filePath = this.file(projectId, 'ontology.json');
    return this.enqueue(filePath, async () => {
      const existing = await this.readDataFile(filePath);
      if (!existing) return false;
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
        throw new Error(`Canonical ontology ${projectId} changed after migration`);
      }
      try {
        await fs.unlink(filePath);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
    });
  }

  appendFact(projectId: string, record: CanonicalFactRecord): Promise<void> {
    return this.append(projectId, 'facts.jsonl', { ...record, acceptedAt: record.acceptedAt.toISOString() });
  }

  async readFacts(projectId: string): Promise<CanonicalFactRecord[]> {
    const records = await this.readLines<StoredFact>(projectId, 'facts.jsonl');
    return records.map((record, index) => ({
      ...record,
      acceptedAt: date(record.acceptedAt, `facts[${index}].acceptedAt`),
    }));
  }

  appendOperation(projectId: string, record: CanonicalOperationRecord): Promise<void> {
    return this.append(projectId, 'operations.jsonl', { ...record, recordedAt: record.recordedAt.toISOString() });
  }

  async readOperations(projectId: string): Promise<CanonicalOperationRecord[]> {
    const records = await this.readLines<StoredOperation>(projectId, 'operations.jsonl');
    return records.map((record, index) => ({
      ...record,
      recordedAt: date(record.recordedAt, `operations[${index}].recordedAt`),
    }));
  }

  async getLatestOperation(projectId: string, operationId: string): Promise<CanonicalOperationRecord | null> {
    const records = await this.readOperations(projectId);
    return records.findLast((record) => record.operationId === operationId) ?? null;
  }

  appendProjection(projectId: string, record: CanonicalContextProjectionRecord): Promise<void> {
    return this.append(projectId, 'projections.jsonl', { ...record, createdAt: record.createdAt.toISOString() });
  }

  async readProjections(projectId: string): Promise<CanonicalContextProjectionRecord[]> {
    const records = await this.readLines<StoredProjection>(projectId, 'projections.jsonl');
    return records.map((record, index) => ({
      ...record,
      createdAt: date(record.createdAt, `projections[${index}].createdAt`),
    }));
  }

  appendMigration(projectId: string, record: CanonicalMigrationRecord): Promise<void> {
    return this.append(projectId, 'migrations.jsonl', { ...record, recordedAt: record.recordedAt.toISOString() });
  }

  async readMigrations(projectId: string): Promise<CanonicalMigrationRecord[]> {
    const records = await this.readLines<StoredMigration>(projectId, 'migrations.jsonl');
    return records.map((record, index) => ({
      ...record,
      recordedAt: date(record.recordedAt, `migrations[${index}].recordedAt`),
    }));
  }

  private file(projectId: string, suffix: string): string {
    assertProjectId(projectId);
    return path.join(this.dataRoot, 'ontology', `${projectId}-${suffix}`);
  }

  private async readDataFile(filePath: string): Promise<DataFile<unknown> | null> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (!isDataFile(parsed)) throw new Error(`Invalid DataFile: ${filePath}`);
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private append<T>(projectId: string, suffix: string, record: T): Promise<void> {
    const filePath = this.file(projectId, suffix);
    return this.enqueue(filePath, async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
    });
  }

  private async readLines<T>(projectId: string, suffix: string): Promise<T[]> {
    const filePath = this.file(projectId, suffix);
    await this.pending(filePath);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const lines = content.split(/\r?\n/);
    const lastNonEmpty = lines.findLastIndex((line) => line.trim().length > 0);
    const records: T[] = [];
    for (let index = 0; index <= lastNonEmpty; index += 1) {
      if (!lines[index].trim()) continue;
      try {
        records.push(JSON.parse(lines[index]) as T);
      } catch (error) {
        if (index === lastNonEmpty) break;
        throw new Error(`Invalid JSONL at ${filePath}:${index + 1}`, { cause: error });
      }
    }
    return records;
  }

  private enqueue<T>(filePath: string, task: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(filePath) ?? Promise.resolve()).then(task);
    const tail = result.then(() => undefined, () => undefined);
    this.queues.set(filePath, tail);
    void tail.then(() => {
      if (this.queues.get(filePath) === tail) this.queues.delete(filePath);
    });
    return result;
  }

  private async pending(filePath: string): Promise<void> {
    await this.queues.get(filePath);
  }
}
