import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getDataRoot } from '../../paths';
import {
  compileSolutionExecutionContract,
  verifySolutionExecutionContractIntegrity,
} from './execution-contract';
import type {
  ContractRef,
  DesignGap,
  PublishedSolutionExecutionContract,
  SolutionExecutionContract,
  SolutionExecutionContractBody,
  SolutionVersionRef,
} from './types';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;

export type SolutionContractPublicationResult =
  | { readonly ok: true; readonly published: PublishedSolutionExecutionContract }
  | { readonly ok: false; readonly gaps: readonly DesignGap[] };

function identifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

function assertRef(input: SolutionVersionRef): void {
  identifier(input.projectId, 'projectId');
  identifier(input.solutionId, 'solutionId');
  identifier(input.solutionVersion, 'solutionVersion');
}

function assertContractRef(input: ContractRef): void {
  assertRef(input);
  identifier(input.contractId, 'contractId');
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export class SolutionExecutionContractStore {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly dataRoot = getDataRoot()) {}

  async publishCompiled(
    ontology: Parameters<typeof compileSolutionExecutionContract>[0],
    solutionStatus: Parameters<typeof compileSolutionExecutionContract>[1],
    body: SolutionExecutionContractBody
  ): Promise<SolutionContractPublicationResult> {
    const compilation = compileSolutionExecutionContract(
      ontology,
      solutionStatus,
      body
    );
    if (compilation.ok === false) return { ok: false, gaps: compilation.gaps };
    return {
      ok: true,
      published: await this.publish(compilation.contract),
    };
  }

  private async publish(
    contract: SolutionExecutionContract
  ): Promise<PublishedSolutionExecutionContract> {
    const integrity = this.verifyIntegrity(contract);
    if (integrity.valid !== true) throw new Error(integrity.message);
    const input: ContractRef = {
      projectId: contract.projectId,
      solutionId: contract.solutionId,
      solutionVersion: contract.solutionVersion,
      contractId: contract.contractId,
    };
    assertContractRef(input);
    const filePath = this.contractPath(input);
    return this.enqueue(filePath, async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      await fs.writeFile(
        temporary,
        JSON.stringify({ contract }, null, 2),
        'utf8'
      );
      try {
        await fs.link(temporary, filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new Error(
            `Execution contract already exists for ${input.solutionId}@${input.solutionVersion}`
          );
        }
        throw error;
      } finally {
        await fs.unlink(temporary).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        });
      }
      return { contract };
    });
  }

  async revoke(input: ContractRef, reason: string): Promise<PublishedSolutionExecutionContract> {
    assertContractRef(input);
    if (!reason.trim()) throw new TypeError('Revocation reason is required');
    const contractPath = this.contractPath(input);
    const revocationPath = this.revocationPath(input);
    return this.enqueue(contractPath, async () => {
      const published = await this.readContract(input);
      if (!published) {
        throw new Error(
          `Execution contract not found for ${input.solutionId}@${input.solutionVersion}`
        );
      }
      if (published.contract.contractId !== input.contractId) {
        throw new Error(
          `Execution contract ID ${published.contract.contractId} does not match ${input.contractId}`
        );
      }
      if (published.revocation) return published;
      const revocation = {
        contractId: input.contractId,
        revokedAt: new Date().toISOString(),
        reason,
      };
      await fs.mkdir(path.dirname(revocationPath), { recursive: true });
      const temporary = `${revocationPath}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(revocation, null, 2), 'utf8');
      try {
        await fs.link(temporary, revocationPath);
      } finally {
        await fs.unlink(temporary).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        });
      }
      return { contract: published.contract, revocation };
    });
  }

  async load(
    input: SolutionVersionRef
  ): Promise<PublishedSolutionExecutionContract | null> {
    assertRef(input);
    return this.readContract(input);
  }

  verifyIntegrity(
    contract: SolutionExecutionContract
  ): ReturnType<typeof verifySolutionExecutionContractIntegrity> {
    return verifySolutionExecutionContractIntegrity(contract);
  }

  private async readContract(
    input: SolutionVersionRef
  ): Promise<PublishedSolutionExecutionContract | null> {
    const stored = await readJson<{ contract: SolutionExecutionContract }>(
      this.contractPath(input)
    );
    if (!stored?.contract) {
      return null;
    }
    if (
      stored.contract.projectId !== input.projectId ||
      stored.contract.solutionId !== input.solutionId ||
      stored.contract.solutionVersion !== input.solutionVersion
    ) {
      throw new Error('Execution contract reference does not match its file');
    }
    const integrity = this.verifyIntegrity(stored.contract);
    if (integrity.valid !== true) throw new Error(integrity.message);
    const revocation = await readJson<PublishedSolutionExecutionContract['revocation']>(
      this.revocationPath(input)
    );
    return revocation ? { contract: stored.contract, revocation } : { contract: stored.contract };
  }

  private contractPath(input: SolutionVersionRef): string {
    return path.join(
      this.dataRoot,
      'projects',
      input.projectId,
      'solutions',
      'contracts',
      `${input.solutionId}-${input.solutionVersion}-contract.json`
    );
  }

  private revocationPath(input: SolutionVersionRef): string {
    return path.join(
      this.dataRoot,
      'projects',
      input.projectId,
      'solutions',
      'contracts',
      `${input.solutionId}-${input.solutionVersion}-revocation.json`
    );
  }

  private async enqueue<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const queued = this.queues.get(key)?.then(operation, operation) ?? operation();
    this.queues.set(key, queued);
    try {
      return await queued;
    } finally {
      if (this.queues.get(key) === queued) this.queues.delete(key);
    }
  }
}
