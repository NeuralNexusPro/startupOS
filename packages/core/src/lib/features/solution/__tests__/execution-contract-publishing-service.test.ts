import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SolutionContractPublishingError,
  SolutionExecutionContractPublishingService,
  SolutionExecutionContractStore,
  type DesignGap,
  type SolutionDesignSource,
  type SolutionDesignSourceResult,
  type SolutionExecutionContractBody,
  type SolutionVersionRef,
} from '../index';
import { body, ontology } from './execution-contract-fixtures';

const reference: SolutionVersionRef = {
  projectId: 'project-1',
  solutionId: 'orders-solution',
  solutionVersion: '1.0',
};

class FixtureDesignSource implements SolutionDesignSource {
  constructor(public result: SolutionDesignSourceResult | null) {}

  async load(
    input: SolutionVersionRef
  ): Promise<SolutionDesignSourceResult | null> {
    expect(input).toEqual(reference);
    return this.result;
  }
}

function ready(
  status: 'draft' | 'reviewing' | 'confirmed' = 'confirmed',
  contractBody: SolutionExecutionContractBody = body()
): SolutionDesignSourceResult {
  return {
    ok: true,
    design: { ontology: ontology(), status, body: contractBody },
  };
}

async function dataRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'solution-publishing-service-'));
}

function contractFilePath(root: string): string {
  return path.join(
    root,
    'projects',
    reference.projectId,
    'solutions',
    'contracts',
    `${reference.solutionId}-${reference.solutionVersion}-contract.json`
  );
}

function service(
  source: SolutionDesignSource,
  root: string
): SolutionExecutionContractPublishingService {
  return new SolutionExecutionContractPublishingService(
    source,
    new SolutionExecutionContractStore(root)
  );
}

describe('solution execution contract publishing service', () => {
  it('checks a confirmed design without writing and returns a deterministic hash', async () => {
    const root = await dataRoot();
    const publishing = service(new FixtureDesignSource(ready()), root);

    const first = await publishing.check(reference);
    const second = await publishing.check(reference);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.contract.contractHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    await expect(publishing.read(reference)).rejects.toMatchObject({
      code: 'CONTRACT_NOT_FOUND',
    });
  });

  it('normalizes object key order before producing the contract hash', async () => {
    const root = await dataRoot();
    const original = body();
    const reordered = Object.fromEntries(
      Object.entries(original).reverse()
    ) as unknown as SolutionExecutionContractBody;
    const first = await service(
      new FixtureDesignSource(ready('confirmed', original)),
      root
    ).check(reference);
    const second = await service(
      new FixtureDesignSource(ready('confirmed', reordered)),
      root
    ).check(reference);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.contract.contractHash).toBe(second.contract.contractHash);
  });

  it('enforces the confirmed gate and preserves every source DesignGap', async () => {
    const root = await dataRoot();
    const draft = service(new FixtureDesignSource(ready('draft')), root);
    const draftResult = await draft.publish(reference);
    expect(draftResult).toEqual({
      ok: false,
      gaps: [expect.objectContaining({ code: 'SOLUTION_NOT_CONFIRMED' })],
    });

    const gaps: readonly DesignGap[] = [
      {
        code: 'MISSING_VERIFIER',
        severity: 'error',
        scope: 'node',
        refId: 'prepare',
        path: 'topology.nodes[0]',
        message: '节点缺少验证器。',
        remediation: '为节点配置验证器。',
      },
      {
        code: 'MISSING_PERMISSION',
        severity: 'error',
        scope: 'policy',
        path: 'permissions.allowed',
        message: '方案缺少权限。',
        remediation: '确认并配置所需权限。',
      },
    ];
    const incomplete = service(
      new FixtureDesignSource({ ok: false, gaps }),
      root
    );
    await expect(incomplete.check(reference)).resolves.toEqual({
      ok: false,
      gaps,
    });
  });

  it('makes concurrent publication of identical content idempotent across store instances', async () => {
    const root = await dataRoot();
    const first = service(new FixtureDesignSource(ready()), root);
    const second = service(new FixtureDesignSource(ready()), root);

    const [left, right] = await Promise.all([
      first.publish(reference),
      second.publish(reference),
    ]);

    expect(left).toEqual(right);
    expect(left.ok).toBe(true);
    if (!left.ok) {
      return;
    }
    expect(left.published.contract.solutionVersion).toBe('1.0');
    expect(left.published.contract.contractHash).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
  });

  it('rejects different content for an already published solution version', async () => {
    const root = await dataRoot();
    const source = new FixtureDesignSource(ready());
    const publishing = service(source, root);
    const published = await publishing.publish(reference);
    expect(published.ok).toBe(true);
    const originalBytes = await readFile(contractFilePath(root));

    const changed = body();
    source.result = ready('confirmed', {
      ...changed,
      budget: { ...changed.budget, maxTokens: changed.budget.maxTokens + 1 },
    });

    await expect(publishing.publish(reference)).rejects.toEqual(
      expect.objectContaining<SolutionContractPublishingError>({
        code: 'CONTRACT_VERSION_CONFLICT',
        category: 'conflict',
      })
    );
    const unchanged = await publishing.read(reference);
    expect(await readFile(contractFilePath(root))).toEqual(originalBytes);
    if (!published.ok) {
      return;
    }
    expect(unchanged.contract.contractHash).toBe(
      published.published.contract.contractHash
    );
  });

  it('revokes without deleting the contract and reads the exact state after restart', async () => {
    const root = await dataRoot();
    const publishing = service(new FixtureDesignSource(ready()), root);
    const publication = await publishing.publish(reference);
    expect(publication.ok).toBe(true);
    if (!publication.ok) {
      return;
    }

    const revoked = await publishing.revoke({
      ...reference,
      contractId: publication.published.contract.contractId,
      reason: '方案已由所有者撤销',
    });
    expect(revoked.contract).toEqual(publication.published.contract);
    expect(revoked.revocation?.reason).toBe('方案已由所有者撤销');

    const restarted = service(new FixtureDesignSource(null), root);
    await expect(restarted.read(reference)).resolves.toEqual(revoked);
    await expect(
      restarted.revoke({
        ...reference,
        contractId: publication.published.contract.contractId,
        reason: '重复请求使用不同说明',
      })
    ).resolves.toEqual(revoked);
  });

  it('maps a tampered persisted contract to a structured integrity error', async () => {
    const root = await dataRoot();
    const publishing = service(new FixtureDesignSource(ready()), root);
    const publication = await publishing.publish(reference);
    expect(publication.ok).toBe(true);

    const contractPath = contractFilePath(root);
    const stored = JSON.parse(await readFile(contractPath, 'utf8')) as {
      contract: SolutionExecutionContractBody & { contractHash: string };
    };
    stored.contract.budget = {
      ...stored.contract.budget,
      maxTokens: stored.contract.budget.maxTokens + 1,
    };
    await writeFile(contractPath, JSON.stringify(stored, null, 2), 'utf8');

    const restarted = service(new FixtureDesignSource(null), root);
    await expect(restarted.read(reference)).rejects.toMatchObject({
      code: 'CONTRACT_INTEGRITY_FAILED',
      category: 'integrity',
    });
  });

  it('does not expose an unexpected source error through the public error message', async () => {
    const root = await dataRoot();
    const publishing = service(
      {
        async load() {
          throw new Error('credential=must-not-leak');
        },
      },
      root
    );

    await expect(publishing.check(reference)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      category: 'internal',
      message: 'Solution execution contract operation failed',
    });
  });

  it('returns structured errors for missing designs, mismatched refs and invalid revocation', async () => {
    const root = await dataRoot();
    const missing = service(new FixtureDesignSource(null), root);
    await expect(missing.check(reference)).rejects.toMatchObject({
      code: 'DESIGN_NOT_FOUND',
    });

    const mismatchedBody = { ...body(), solutionVersion: '2.0' };
    const mismatched = service(
      new FixtureDesignSource(ready('confirmed', mismatchedBody)),
      root
    );
    await expect(mismatched.check(reference)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });

    await expect(
      missing.revoke({ ...reference, contractId: 'missing', reason: '撤销' })
    ).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
  });
});
