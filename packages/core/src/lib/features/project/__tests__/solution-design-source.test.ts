import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CanonicalOntologyStore } from '../../ontology';
import {
  SolutionExecutionContractPublishingService,
  SolutionExecutionContractStore,
  type SolutionVersionRef,
} from '../../solution';
import {
  body,
  ontology,
} from '../../solution/__tests__/execution-contract-fixtures';
import { ProjectSolutionDesignSource } from '../solution-design-source';

const reference: SolutionVersionRef = {
  projectId: 'project-1',
  solutionId: 'orders-solution',
  solutionVersion: '1.0',
};

interface BundleFixture {
  manifest: Record<string, unknown>;
  agents: Record<string, unknown>;
  skills: Record<string, unknown>;
}

function validBundle(): BundleFixture {
  const contract = body();
  return {
    manifest: {
      version: '1.0.0',
      status: 'confirmed',
      solutionVersion: reference.solutionVersion,
      modeling: { dimension: 'task' },
      topologyViews: {
        workflow: {
          nodes: contract.topology.nodes.map((node) => ({
            id: node.id,
            type: node.kind,
            contractRef: node.contractRef,
            requiresVerification: node.requiresVerification,
            ...(node.hitlPolicyId ? { hitlPolicyId: node.hitlPolicyId } : {}),
          })),
          edges: contract.topology.edges.map((edge) => ({
            source: edge.fromNodeId,
            target: edge.toNodeId,
            factType: edge.factType,
          })),
        },
      },
      executionContract: {
        semanticContext: contract.semanticContext,
        externalInputs: contract.topology.externalInputs,
        verification: contract.verification,
        hitl: contract.hitl,
        permissions: contract.permissions,
        budget: contract.budget,
      },
      createdAt: contract.createdAt,
    },
    agents: {
      version: '1.0.0',
      status: 'confirmed',
      solutionVersion: reference.solutionVersion,
      agents: contract.agents.map((agent) => ({
        id: agent.agentId,
        name: agent.agentId,
        contract: agent,
      })),
    },
    skills: {
      version: '1.0.0',
      status: 'confirmed',
      solutionVersion: reference.solutionVersion,
      skills: contract.skills.map((skill) => ({
        id: skill.skillId,
        name: skill.skillId,
        contract: skill,
      })),
    },
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Fixture value must be an object');
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Fixture value must be an array');
  }
  return value;
}

async function root(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'project-solution-source-'));
}

async function writeBundle(
  dataRoot: string,
  bundle: BundleFixture,
  version = reference.solutionVersion
): Promise<void> {
  const directory = path.join(
    dataRoot,
    'projects',
    reference.projectId,
    'solutions',
    version
  );
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify(bundle.manifest),
      'utf8'
    ),
    writeFile(
      path.join(directory, 'agents.json'),
      JSON.stringify(bundle.agents),
      'utf8'
    ),
    writeFile(
      path.join(directory, 'skills.json'),
      JSON.stringify(bundle.skills),
      'utf8'
    ),
  ]);
}

async function writeOntology(dataRoot: string): Promise<void> {
  await new CanonicalOntologyStore(dataRoot).writeOntology(
    reference.projectId,
    ontology()
  );
}

function gapCodes(
  result: Awaited<ReturnType<ProjectSolutionDesignSource['load']>>
): string[] {
  expect(result?.ok).toBe(false);
  if (!result || result.ok) {
    return [];
  }
  return result.gaps.map(({ code }) => code);
}

describe('ProjectSolutionDesignSource', () => {
  it('adapts the exact P2 bundle and canonical ontology into a publishable design', async () => {
    const dataRoot = await root();
    await Promise.all([
      writeBundle(dataRoot, validBundle()),
      writeOntology(dataRoot),
    ]);
    const source = new ProjectSolutionDesignSource(dataRoot);

    const loaded = await source.load(reference);

    expect(loaded).toEqual({
      ok: true,
      design: {
        ontology: ontology(),
        status: 'confirmed',
        body: body(),
      },
    });
    const publishing = new SolutionExecutionContractPublishingService(
      source,
      new SolutionExecutionContractStore(dataRoot)
    );
    const checked = await publishing.check(reference);
    expect(checked.ok).toBe(true);
  });

  it('returns null only when the exact solution version does not exist', async () => {
    const dataRoot = await root();
    const source = new ProjectSolutionDesignSource(dataRoot);

    await expect(source.load(reference)).resolves.toBeNull();
  });

  it('reports all blocking categories for an incomplete legacy bundle and missing ontology', async () => {
    const dataRoot = await root();
    const directory = path.join(
      dataRoot,
      'projects',
      reference.projectId,
      'solutions'
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'solution-1.0.json'),
      JSON.stringify({
        version: '1.0.0',
        status: 'confirmed',
        solutionVersion: '1.0',
        modeling: { dimension: 'task' },
        agents: [{ id: 'legacy-agent', inputContract: { requires: [] } }],
        skills: [{ id: 'legacy-skill', outputContract: { produces: [] } }],
      }),
      'utf8'
    );

    const source = new ProjectSolutionDesignSource(dataRoot);
    const implicit = await source.load(reference);
    expect(gapCodes(implicit)).toEqual([
      'LEGACY_COMPATIBILITY_SELECTION_REQUIRED',
    ]);

    const explicit = await source.load(reference, {
      sourceFormat: 'legacy_compatibility',
    });
    const codes = gapCodes(explicit);
    expect(codes).toEqual(
      expect.arrayContaining([
        'CANONICAL_ONTOLOGY_NOT_FOUND',
        'MISSING_ONTOLOGY_VERSION',
        'MISSING_FACT_TYPE',
        'MISSING_ACTION_BINDING',
        'MISSING_VERIFIER',
        'MISSING_PERMISSIONS',
        'MISSING_SEMANTIC_INPUTS',
        'MISSING_SEMANTIC_CONTEXT',
      ])
    );
    expect(explicit).not.toHaveProperty('design');

    const contracts = new SolutionExecutionContractStore(dataRoot);
    const publishing = new SolutionExecutionContractPublishingService(
      source,
      contracts
    );
    await expect(
      publishing.publish({
        ...reference,
        sourceFormat: 'legacy_compatibility',
      })
    ).resolves.toMatchObject({ ok: false });
    await expect(contracts.load(reference)).resolves.toBeNull();
  });

  it('publishes a complete legacy envelope only after explicit compatibility selection', async () => {
    const dataRoot = await root();
    const fixture = validBundle();
    const directory = path.join(
      dataRoot,
      'projects',
      reference.projectId,
      'solutions'
    );
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(directory, 'solution-1.0.json'),
        JSON.stringify({
          data: {
            manifest: fixture.manifest,
            agentsFile: fixture.agents,
            skillsFile: fixture.skills,
          },
        }),
        'utf8'
      ),
      writeOntology(dataRoot),
    ]);

    const source = new ProjectSolutionDesignSource(dataRoot);
    expect(gapCodes(await source.load(reference))).toEqual([
      'LEGACY_COMPATIBILITY_SELECTION_REQUIRED',
    ]);
    const publishing = new SolutionExecutionContractPublishingService(
      source,
      new SolutionExecutionContractStore(dataRoot)
    );
    const result = await publishing.publish({
      ...reference,
      sourceFormat: 'legacy_compatibility',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.published.contract.solutionVersion).toBe('1.0');
      expect(
        result.published.contract.semanticContext.factPolicies
      ).toHaveLength(2);
    }
  });

  it('collects missing FactType, Action, verifier, permissions and semantic inputs without defaults', async () => {
    const dataRoot = await root();
    const fixture = validBundle();
    const execution = object(fixture.manifest.executionContract);
    delete execution.externalInputs;
    delete execution.verification;
    delete execution.permissions;
    delete object(execution.semanticContext).objectSlots;
    delete object(execution.semanticContext).factPolicies;

    const workflow = object(object(fixture.manifest.topologyViews).workflow);
    delete object(array(workflow.edges)[0]).factType;
    const firstAgent = object(array(fixture.agents.agents)[0]);
    delete object(firstAgent.contract).actions;

    await Promise.all([
      writeBundle(dataRoot, fixture),
      writeOntology(dataRoot),
    ]);
    const result = await new ProjectSolutionDesignSource(dataRoot).load(
      reference
    );
    const codes = gapCodes(result);

    expect(codes).toEqual(
      expect.arrayContaining([
        'MISSING_FACT_TYPE',
        'MISSING_ACTION_BINDING',
        'MISSING_VERIFIER',
        'MISSING_PERMISSIONS',
        'MISSING_SEMANTIC_INPUTS',
        'MISSING_SEMANTIC_CONTEXT',
        'MISSING_FACT_POLICY',
      ])
    );
    expect(result).not.toHaveProperty('design');
  });

  it('requires persisted concept confirmation and fact policies instead of inferring defaults', async () => {
    const dataRoot = await root();
    const fixture = validBundle();
    const semantic = object(
      object(fixture.manifest.executionContract).semanticContext
    );
    delete object(array(semantic.objectSlots)[0]).resolution;
    delete semantic.factPolicies;
    await Promise.all([
      writeBundle(dataRoot, fixture),
      writeOntology(dataRoot),
    ]);

    const result = await new ProjectSolutionDesignSource(dataRoot).load(
      reference
    );

    expect(gapCodes(result)).toEqual(
      expect.arrayContaining([
        'CONCEPT_CONFIRMATION_REQUIRED',
        'MISSING_FACT_POLICY',
      ])
    );
    expect(result).not.toHaveProperty('design');
  });

  it('rejects stale ontology and inconsistent bundle versions', async () => {
    const dataRoot = await root();
    const fixture = validBundle();
    object(
      object(fixture.manifest.executionContract).semanticContext
    ).ontology = {
      ontologyId: ontology().id,
      ontologyVersion: '2',
    };
    fixture.agents.solutionVersion = '1.1';
    fixture.skills.status = 'draft';
    await Promise.all([
      writeBundle(dataRoot, fixture),
      writeOntology(dataRoot),
    ]);

    const result = await new ProjectSolutionDesignSource(dataRoot).load(
      reference
    );

    expect(gapCodes(result)).toEqual(
      expect.arrayContaining([
        'ONTOLOGY_VERSION_MISMATCH',
        'SOLUTION_VERSION_MISMATCH',
        'SOLUTION_STATUS_MISMATCH',
      ])
    );
  });

  it('does not select another topology view or infer a missing node contract', async () => {
    const dataRoot = await root();
    const fixture = validBundle();
    delete object(fixture.manifest.topologyViews).workflow;
    const firstSkill = object(array(fixture.skills.skills)[0]);
    delete firstSkill.contract;
    await Promise.all([
      writeBundle(dataRoot, fixture),
      writeOntology(dataRoot),
    ]);

    const result = await new ProjectSolutionDesignSource(dataRoot).load(
      reference
    );

    expect(gapCodes(result)).toEqual(
      expect.arrayContaining([
        'MISSING_TOPOLOGY_VIEW',
        'MISSING_NODE_CONTRACT',
        'MISSING_FACT_TYPE',
        'MISSING_ACTION_BINDING',
        'MISSING_PERMISSIONS',
      ])
    );
  });

  it('fails closed for malformed JSON rather than exposing a partial design', async () => {
    const dataRoot = await root();
    const directory = path.join(
      dataRoot,
      'projects',
      reference.projectId,
      'solutions',
      reference.solutionVersion
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'manifest.json'), '{broken', 'utf8');

    const result = await new ProjectSolutionDesignSource(dataRoot).load(
      reference
    );

    expect(gapCodes(result)).toContain('MALFORMED_SOLUTION_BUNDLE');
    expect(result).not.toHaveProperty('design');
  });
});
