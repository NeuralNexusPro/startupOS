import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SolutionExecutionContractStore } from '../execution-contract-store';
import { body, ontology } from './execution-contract-fixtures';

import type { SolutionExecutionContract } from '../types';

async function publish(
  store: SolutionExecutionContractStore,
  version: '1.0' | '1.1'
): Promise<SolutionExecutionContract> {
  const source = body();
  const result = await store.publishCompiled(
    ontology(),
    'confirmed',
    version === '1.0'
      ? source
      : {
          ...source,
          contractId: `orders-solution@${version}`,
          solutionVersion: version,
        }
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('Fixture contract must publish');
  }
  return result.published.contract;
}

async function newStore(): Promise<{
  store: SolutionExecutionContractStore;
  root: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'solution-contract-'));
  return { store: new SolutionExecutionContractStore(root), root };
}

describe('solution execution contract store', () => {
  it('publishes and reads the exact immutable version', async () => {
    const { store } = await newStore();
    const first = await publish(store, '1.0');
    await publish(store, '1.1');

    await expect(
      store.load({
        projectId: first.projectId,
        solutionId: first.solutionId,
        solutionVersion: '1.0',
      })
    ).resolves.toEqual({ contract: first });
  });

  it('returns the existing contract for an identical publication retry', async () => {
    const { store } = await newStore();
    const published = await publish(store, '1.0');

    await expect(publish(store, '1.0')).resolves.toEqual(published);
    await expect(
      store.load({
        projectId: published.projectId,
        solutionId: published.solutionId,
        solutionVersion: published.solutionVersion,
      })
    ).resolves.toEqual({ contract: published });
  });

  it('rejects a stored contract whose hash no longer matches', async () => {
    const { store, root } = await newStore();
    const published = await publish(store, '1.0');
    const filePath = path.join(
      root,
      'projects',
      published.projectId,
      'solutions',
      'contracts',
      `${published.solutionId}-${published.solutionVersion}-contract.json`
    );
    const stored = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
      contract: SolutionExecutionContract;
    };
    stored.contract.solutionVersion = '1.1';
    await fs.writeFile(filePath, JSON.stringify(stored, null, 2), 'utf8');

    await expect(
      store.load({
        projectId: published.projectId,
        solutionId: published.solutionId,
        solutionVersion: published.solutionVersion,
      })
    ).rejects.toThrow(/does not match its file|contractHash/i);
  });

  it('revokes without modifying the contract body', async () => {
    const { store } = await newStore();
    const published = await publish(store, '1.0');
    const reference = {
      projectId: published.projectId,
      solutionId: published.solutionId,
      solutionVersion: published.solutionVersion,
      contractId: published.contractId,
    };

    const revoked = await store.revoke(reference, 'Retired solution');
    expect(revoked.contract).toEqual(published);
    expect(revoked.revocation?.reason).toBe('Retired solution');
    await expect(store.revoke(reference, 'Different reason')).resolves.toEqual(
      revoked
    );
  });

  it('lists exact project publications with revocation state', async () => {
    const { store } = await newStore();
    const first = await publish(store, '1.0');
    const second = await publish(store, '1.1');
    await store.revoke({
      projectId: second.projectId,
      solutionId: second.solutionId,
      solutionVersion: second.solutionVersion,
      contractId: second.contractId,
    }, 'Superseded');

    const catalog = await store.listProject(first.projectId);

    expect(catalog).toHaveLength(2);
    expect(catalog.map(({ contract }) => contract.solutionVersion)).toEqual(['1.0', '1.1']);
    expect(catalog[0]).toEqual({ contract: first });
    expect(catalog[1]).toMatchObject({
      contract: second,
      revocation: { contractId: second.contractId, reason: 'Superseded' },
    });
    await expect(store.listProject('other-project')).resolves.toEqual([]);
  });
});
