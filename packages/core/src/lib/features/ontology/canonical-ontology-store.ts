import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import { getDataRoot } from '../../paths';
import type { DataFile } from '../../storage/json-store';
import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  CANONICAL_SEMANTIC_KINDS,
  type CanonicalConcept,
  type CanonicalContextProjectionRecord,
  type CanonicalDomain,
  type CanonicalFactRecord,
  type CanonicalInstance,
  type CanonicalMigrationRecord,
  type CanonicalOntology,
  type CanonicalOperationRecord,
} from './types';
import {
  AUTHORING_REVISION_METADATA_KEY,
  LAST_AUTHORING_COMMAND_HASH_METADATA_KEY,
  LAST_AUTHORING_OPERATION_METADATA_KEY,
  type CanonicalOntologyAuthoringMutationResult,
  type CanonicalOntologyAuthoringReceipt,
  type CanonicalOntologyAuthoringResult,
} from './authoring-types';

type StoredTimed<T extends { createdAt: Date; updatedAt: Date }> = Omit<
  T,
  'createdAt' | 'updatedAt'
> & { createdAt: string; updatedAt: string };
type StoredOntology = Omit<
  CanonicalOntology,
  'domains' | 'concepts' | 'instances' | 'createdAt' | 'updatedAt'
> & {
  domains: StoredTimed<CanonicalDomain>[];
  concepts: StoredTimed<CanonicalConcept>[];
  instances: StoredTimed<CanonicalInstance>[];
  createdAt: string;
  updatedAt: string;
};
type StoredFact = Omit<CanonicalFactRecord, 'acceptedAt'> & {
  acceptedAt: string;
};
type StoredOperation = Omit<CanonicalOperationRecord, 'recordedAt'> & {
  recordedAt: string;
};
type StoredProjection = Omit<CanonicalContextProjectionRecord, 'createdAt'> & {
  createdAt: string;
};
type StoredMigration = Omit<CanonicalMigrationRecord, 'recordedAt'> & {
  recordedAt: string;
};
type StoredAuthoringReceipt = Omit<
  CanonicalOntologyAuthoringReceipt,
  'recordedAt' | 'summary'
> & {
  recordedAt: string;
  summary: Omit<CanonicalOntologyAuthoringReceipt['summary'], 'updatedAt'> & {
    updatedAt: string;
  };
};

export interface CanonicalOntologyAuthoringTransaction {
  projectId: string;
  ontologyId: string;
  ontologyVersion: string;
  expectedRevision: number;
  operationId: string;
  commandType: CanonicalOntologyAuthoringReceipt['commandType'];
  commandHash: string;
  audit?: Record<string, unknown>;
  mutate: (
    ontology: CanonicalOntology
  ) => CanonicalOntologyAuthoringMutationResult;
}

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assertProjectId(projectId: string): void {
  if (
    !PROJECT_ID.test(projectId) ||
    projectId.includes('..') ||
    path.isAbsolute(projectId)
  ) {
    throw new TypeError(`Invalid projectId: ${projectId}`);
  }
}

function date(value: unknown, field: string): Date {
  if (typeof value !== 'string') throw new Error(`Invalid date at ${field}`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`Invalid date at ${field}`);
  return parsed;
}

function encodeOntology(ontology: CanonicalOntology): StoredOntology {
  const encodeTimed = <T extends { createdAt: Date; updatedAt: Date }>(
    value: T
  ): StoredTimed<T> => ({
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
  const decodeTimed = <T extends { createdAt: string; updatedAt: string }>(
    value: T,
    field: string
  ) => ({
    ...value,
    createdAt: date(value.createdAt, `${field}.createdAt`),
    updatedAt: date(value.updatedAt, `${field}.updatedAt`),
  });
  if (
    !Array.isArray(stored.domains) ||
    !Array.isArray(stored.concepts) ||
    !Array.isArray(stored.instances)
  ) {
    throw new Error('Invalid canonical ontology date-bearing collections');
  }
  return {
    ...stored,
    domains: stored.domains.map((value, index) =>
      decodeTimed(value, `domains[${index}]`)
    ),
    concepts: stored.concepts.map((value, index) => {
      const concept = decodeTimed(value, `concepts[${index}]`);
      const semanticKind = concept.semanticKind;
      if (
        semanticKind !== undefined &&
        !CANONICAL_SEMANTIC_KINDS.includes(semanticKind)
      ) {
        throw new Error(`Invalid semanticKind at concepts[${index}].semanticKind`);
      }
      return semanticKind === undefined
        ? { ...concept, semanticKind: 'unclassified' }
        : concept;
    }),
    instances: stored.instances.map((value, index) =>
      decodeTimed(value, `instances[${index}]`)
    ),
    createdAt: date(stored.createdAt, 'createdAt'),
    updatedAt: date(stored.updatedAt, 'updatedAt'),
  };
}

function isDataFile(value: unknown): value is DataFile<unknown> {
  if (!value || typeof value !== 'object') return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file['version'] === 'string' &&
    typeof file['createdAt'] === 'string' &&
    typeof file['updatedAt'] === 'string' &&
    'data' in file
  );
}

function authoringIssue(code: string, path: string, message: string) {
  return { code, path, message, severity: 'error' as const };
}

function authoringRevision(ontology: CanonicalOntology): number {
  const value = ontology.metadata?.[AUTHORING_REVISION_METADATA_KEY];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export class CanonicalOntologyStore {
  private static readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly dataRoot = getDataRoot()) {}

  async writeOntology(
    projectId: string,
    ontology: CanonicalOntology,
    options: { createOnly?: boolean } = {}
  ): Promise<DataFile<CanonicalOntology>> {
    if (ontology.projectId !== projectId) {
      throw new TypeError(
        `Ontology projectId ${ontology.projectId} does not match ${projectId}`
      );
    }
    const filePath = this.file(projectId, 'ontology.json');
    return this.enqueue(filePath, async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const existing = await this.readDataFile(filePath);
      if (options.createOnly && existing) {
        throw new Error(`Canonical ontology already exists for ${projectId}`);
      }
      const stored = await this.writeSnapshot(
        filePath,
        ontology,
        existing?.createdAt
      );
      return { ...stored, data: ontology };
    });
  }

  async readOntology(
    projectId: string
  ): Promise<DataFile<CanonicalOntology> | null> {
    const filePath = this.file(projectId, 'ontology.json');
    await this.pending(filePath);
    const stored = await this.readDataFile(filePath);
    if (!stored) return null;
    return { ...stored, data: decodeOntology(stored.data as StoredOntology) };
  }

  async deleteOntology(
    projectId: string,
    expectedUpdatedAt?: string
  ): Promise<boolean> {
    const filePath = this.file(projectId, 'ontology.json');
    return this.enqueue(filePath, async () => {
      const existing = await this.readDataFile(filePath);
      if (!existing) return false;
      if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
        throw new Error(
          `Canonical ontology ${projectId} changed after migration`
        );
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
    return this.append(projectId, 'facts.jsonl', {
      ...record,
      acceptedAt: record.acceptedAt.toISOString(),
    });
  }

  async readFacts(projectId: string): Promise<CanonicalFactRecord[]> {
    const records = await this.readLines<StoredFact>(projectId, 'facts.jsonl');
    return records.map((record, index) => ({
      ...record,
      acceptedAt: date(record.acceptedAt, `facts[${index}].acceptedAt`),
    }));
  }

  appendOperation(
    projectId: string,
    record: CanonicalOperationRecord
  ): Promise<void> {
    return this.append(projectId, 'operations.jsonl', {
      ...record,
      recordedAt: record.recordedAt.toISOString(),
    });
  }

  async readOperations(projectId: string): Promise<CanonicalOperationRecord[]> {
    const records = await this.readLines<StoredOperation>(
      projectId,
      'operations.jsonl'
    );
    return records.map((record, index) => ({
      ...record,
      recordedAt: date(record.recordedAt, `operations[${index}].recordedAt`),
    }));
  }

  async getLatestOperation(
    projectId: string,
    operationId: string
  ): Promise<CanonicalOperationRecord | null> {
    const records = await this.readOperations(projectId);
    return (
      records.findLast((record) => record.operationId === operationId) ?? null
    );
  }

  async readAuthoringReceipts(
    projectId: string
  ): Promise<CanonicalOntologyAuthoringReceipt[]> {
    const records = await this.readLines<StoredAuthoringReceipt>(
      projectId,
      'authoring.jsonl'
    );
    return records.map((record, index) => ({
      ...record,
      recordedAt: date(record.recordedAt, `authoring[${index}].recordedAt`),
      summary: {
        ...record.summary,
        updatedAt: date(
          record.summary.updatedAt,
          `authoring[${index}].summary.updatedAt`
        ),
      },
    }));
  }

  async getLatestAuthoringReceipt(
    projectId: string,
    operationId: string
  ): Promise<CanonicalOntologyAuthoringReceipt | null> {
    const records = await this.readAuthoringReceipts(projectId);
    return (
      records.findLast((record) => record.operationId === operationId) ?? null
    );
  }

  async compareAndSwapAuthoring(
    transaction: CanonicalOntologyAuthoringTransaction
  ): Promise<CanonicalOntologyAuthoringResult> {
    const filePath = this.file(transaction.projectId, 'ontology.json');
    return this.enqueue(filePath, async () => {
      const storedFile = await this.readDataFile(filePath);
      if (!storedFile) {
        return {
          ok: false,
          issues: [
            authoringIssue(
              'ONTOLOGY_NOT_FOUND',
              'projectId',
              `No canonical ontology for ${transaction.projectId}`
            ),
          ],
        };
      }
      const ontology = decodeOntology(storedFile.data as StoredOntology);
      const receipts = await this.readLinesDirect<StoredAuthoringReceipt>(
        this.file(transaction.projectId, 'authoring.jsonl')
      );
      const existingStored = receipts.findLast(
        (record) => record.operationId === transaction.operationId
      );
      if (existingStored) {
        const existing = this.decodeAuthoringReceipt(
          existingStored,
          receipts.indexOf(existingStored)
        );
        if (existing.commandHash !== transaction.commandHash) {
          return {
            ok: false,
            issues: [
              authoringIssue(
                'OPERATION_CONFLICT',
                'operationId',
                `Operation ${transaction.operationId} was already used by another command`
              ),
            ],
          };
        }
        return { ok: true, receipt: existing, ontology };
      }

      const currentRevision = authoringRevision(ontology);
      const lastOperationId =
        ontology.metadata?.[LAST_AUTHORING_OPERATION_METADATA_KEY];
      const lastCommandHash =
        ontology.metadata?.[LAST_AUTHORING_COMMAND_HASH_METADATA_KEY];
      if (lastOperationId === transaction.operationId) {
        if (lastCommandHash !== transaction.commandHash) {
          return {
            ok: false,
            issues: [
              authoringIssue(
                'OPERATION_CONFLICT',
                'operationId',
                `Operation ${transaction.operationId} was already used by another command`
              ),
            ],
          };
        }
        const recovered = this.makeAuthoringReceipt(
          transaction,
          ontology,
          Math.max(0, currentRevision - 1),
          currentRevision
        );
        await this.appendDirect(
          this.file(transaction.projectId, 'authoring.jsonl'),
          this.encodeAuthoringReceipt(recovered)
        );
        return { ok: true, receipt: recovered, ontology };
      }

      if (ontology.id !== transaction.ontologyId) {
        return {
          ok: false,
          issues: [
            authoringIssue(
              'ONTOLOGY_ID_MISMATCH',
              'ontologyId',
              `Expected ontology ${ontology.id}`
            ),
          ],
        };
      }
      if (ontology.version !== transaction.ontologyVersion) {
        return {
          ok: false,
          issues: [
            authoringIssue(
              'ONTOLOGY_VERSION_MISMATCH',
              'ontologyVersion',
              `Expected ontology version ${ontology.version}`
            ),
          ],
        };
      }
      if (currentRevision !== transaction.expectedRevision) {
        return {
          ok: false,
          issues: [
            authoringIssue(
              'REVISION_CONFLICT',
              'expectedRevision',
              `Expected revision ${currentRevision}, received ${transaction.expectedRevision}`
            ),
          ],
        };
      }

      const mutation = transaction.mutate(ontology);
      if (!mutation.ontology || mutation.issues?.length) {
        return {
          ok: false,
          issues: mutation.issues ?? [
            authoringIssue(
              'AUTHORING_FAILED',
              'command',
              'Authoring mutation produced no ontology'
            ),
          ],
        };
      }

      const nextRevision = currentRevision + 1;
      const nextOntology: CanonicalOntology = {
        ...mutation.ontology,
        metadata: {
          ...mutation.ontology.metadata,
          [AUTHORING_REVISION_METADATA_KEY]: nextRevision,
          [LAST_AUTHORING_OPERATION_METADATA_KEY]: transaction.operationId,
          [LAST_AUTHORING_COMMAND_HASH_METADATA_KEY]: transaction.commandHash,
        },
      };
      await this.writeSnapshot(filePath, nextOntology, storedFile.createdAt);
      const receipt = this.makeAuthoringReceipt(
        transaction,
        nextOntology,
        currentRevision,
        nextRevision
      );
      await this.appendDirect(
        this.file(transaction.projectId, 'authoring.jsonl'),
        this.encodeAuthoringReceipt(receipt)
      );
      return { ok: true, receipt, ontology: nextOntology };
    });
  }

  appendProjection(
    projectId: string,
    record: CanonicalContextProjectionRecord
  ): Promise<void> {
    return this.append(projectId, 'projections.jsonl', {
      ...record,
      createdAt: record.createdAt.toISOString(),
    });
  }

  async readProjections(
    projectId: string
  ): Promise<CanonicalContextProjectionRecord[]> {
    const records = await this.readLines<StoredProjection>(
      projectId,
      'projections.jsonl'
    );
    return records.map((record, index) => ({
      ...record,
      createdAt: date(record.createdAt, `projections[${index}].createdAt`),
    }));
  }

  appendMigration(
    projectId: string,
    record: CanonicalMigrationRecord
  ): Promise<void> {
    return this.append(projectId, 'migrations.jsonl', {
      ...record,
      recordedAt: record.recordedAt.toISOString(),
    });
  }

  async readMigrations(projectId: string): Promise<CanonicalMigrationRecord[]> {
    const records = await this.readLines<StoredMigration>(
      projectId,
      'migrations.jsonl'
    );
    return records.map((record, index) => ({
      ...record,
      recordedAt: date(record.recordedAt, `migrations[${index}].recordedAt`),
    }));
  }

  private file(projectId: string, suffix: string): string {
    assertProjectId(projectId);
    return path.join(this.dataRoot, 'ontology', `${projectId}-${suffix}`);
  }

  private async readDataFile(
    filePath: string
  ): Promise<DataFile<unknown> | null> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (!isDataFile(parsed)) throw new Error(`Invalid DataFile: ${filePath}`);
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private async writeSnapshot(
    filePath: string,
    ontology: CanonicalOntology,
    createdAt?: string
  ): Promise<DataFile<StoredOntology>> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const now = new Date().toISOString();
    const stored: DataFile<StoredOntology> = {
      version: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
      createdAt: createdAt ?? now,
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
    return stored;
  }

  private append<T>(
    projectId: string,
    suffix: string,
    record: T
  ): Promise<void> {
    const filePath = this.file(projectId, suffix);
    return this.enqueue(filePath, async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
    });
  }

  private async appendDirect<T>(filePath: string, record: T): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  private async readLines<T>(projectId: string, suffix: string): Promise<T[]> {
    const filePath = this.file(projectId, suffix);
    await this.pending(filePath);
    return this.readLinesDirect<T>(filePath);
  }

  private async readLinesDirect<T>(filePath: string): Promise<T[]> {
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
      const line = lines[index];
      if (!line?.trim()) continue;
      try {
        records.push(JSON.parse(line) as T);
      } catch (error) {
        if (index === lastNonEmpty) break;
        throw new Error(`Invalid JSONL at ${filePath}:${index + 1}`, {
          cause: error,
        });
      }
    }
    return records;
  }

  private enqueue<T>(filePath: string, task: () => Promise<T>): Promise<T> {
    const result = (
      CanonicalOntologyStore.queues.get(filePath) ?? Promise.resolve()
    ).then(task);
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    CanonicalOntologyStore.queues.set(filePath, tail);
    void tail.then(() => {
      if (CanonicalOntologyStore.queues.get(filePath) === tail)
        CanonicalOntologyStore.queues.delete(filePath);
    });
    return result;
  }

  private async pending(filePath: string): Promise<void> {
    await CanonicalOntologyStore.queues.get(filePath);
  }

  private encodeAuthoringReceipt(
    receipt: CanonicalOntologyAuthoringReceipt
  ): StoredAuthoringReceipt {
    return {
      ...receipt,
      recordedAt: receipt.recordedAt.toISOString(),
      summary: {
        ...receipt.summary,
        updatedAt: receipt.summary.updatedAt.toISOString(),
      },
    };
  }

  private decodeAuthoringReceipt(
    stored: StoredAuthoringReceipt,
    index: number
  ): CanonicalOntologyAuthoringReceipt {
    return {
      ...stored,
      recordedAt: date(stored.recordedAt, `authoring[${index}].recordedAt`),
      summary: {
        ...stored.summary,
        updatedAt: date(
          stored.summary.updatedAt,
          `authoring[${index}].summary.updatedAt`
        ),
      },
    };
  }

  private makeAuthoringReceipt(
    transaction: CanonicalOntologyAuthoringTransaction,
    ontology: CanonicalOntology,
    beforeRevision: number,
    afterRevision: number
  ): CanonicalOntologyAuthoringReceipt {
    return {
      operationId: transaction.operationId,
      commandHash: transaction.commandHash,
      commandType: transaction.commandType,
      status: 'accepted',
      beforeRevision,
      afterRevision,
      recordedAt: new Date(),
      summary: {
        ontologyId: ontology.id,
        ontologyVersion: ontology.version,
        projectId: ontology.projectId,
        revision: afterRevision,
        updatedAt: ontology.updatedAt,
      },
      audit: transaction.audit,
    };
  }
}
