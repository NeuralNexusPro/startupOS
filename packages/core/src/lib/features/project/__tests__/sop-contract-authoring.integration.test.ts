import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadSkillsFromDir, loadSkillContent } from '../../../integrations/pi-agent/core/skills';
import { CanonicalOntologyStore, validateCanonicalOntology, type CanonicalOntology } from '../../ontology';
import { SolutionExecutionContractPublishingService, SolutionExecutionContractStore } from '../../solution';
import { ProjectSolutionDesignSource } from '../solution-design-source';


const fixture = path.resolve(__dirname, '../../../../../../../templates/skills/solution-design/references/canonical-example');
const reference = { projectId: 'project-1', solutionId: 'orders-solution', solutionVersion: 'v1.0' };
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'sop-authoring-'));
  const target = path.join(root, 'projects/project-1/solutions/v1.0');
  await mkdir(target, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(fixture, 'manifest.json'), 'utf8'));
  const agents = JSON.parse(await readFile(path.join(fixture, 'agents.json'), 'utf8'));
  const skills = JSON.parse(await readFile(path.join(fixture, 'skills.json'), 'utf8'));
  const save = async () => {
    for (const [name, data] of Object.entries({ manifest, agents, skills })) {
      await writeFile(path.join(target, `${name}.json`), JSON.stringify(data));
    }
  };
  await save();
  const rawOntology: unknown = JSON.parse(await readFile(path.join(fixture, 'ontology.json'), 'utf8'), (key, value: unknown) =>
    (key === 'createdAt' || key === 'updatedAt') && typeof value === 'string' ? new Date(value) : value);
  const exampleOntology = rawOntology as CanonicalOntology;
  expect(validateCanonicalOntology(exampleOntology).valid).toBe(true);
  await new CanonicalOntologyStore(root).writeOntology(reference.projectId, exampleOntology);
  const store = new SolutionExecutionContractStore(root);
  const publishing = new SolutionExecutionContractPublishingService(new ProjectSolutionDesignSource(root), store);
  return { root, target, manifest, agents, skills, save, store, publishing };
}

describe('P2.6 generated SOP contract publishing', () => {
  it('loads the creator output and publishes the exact generated three-file bundle', async () => {
    const { root, skills, publishing } = await setup();
    const skillDir = path.join(root, 'agents/preparer/skills/publisher');
    await mkdir(skillDir, { recursive: true });
    await cp(path.join(fixture, 'SKILL.example.txt'), path.join(skillDir, 'SKILL.md'));
    const loaded = loadSkillsFromDir({ dir: path.dirname(skillDir), source: 'project' });
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.skills).toHaveLength(1);
    expect(loaded.skills[0].contract).toEqual(skills.skills[0].contract);
    expect(loadSkillContent(loaded.skills[0]).frontmatter.contract).toEqual(skills.skills[0].contract);
    const published = await publishing.publish(reference);
    expect(published.ok).toBe(true);
    const stored = await publishing.read(reference);
    expect(stored.contract.skills).toEqual(skills.skills.map((skill: { contract: unknown }) => skill.contract));
  });

  it.each(['legacy', 'missing-ref', 'broken-flow', 'version', 'cycle', 'missing-policy'] as const)(
    'rejects %s without publishing or rewriting the source', async (failure) => {
      const state = await setup();
      const { manifest, skills, agents } = state;
      if (failure === 'legacy') {
        delete skills.skills[0].contract;
        skills.skills[0].inputContract = { requires: [{ objectType: 'Order', fields: ['status'] }] };
      }
      if (failure === 'missing-ref') delete skills.skills[0].contract.inputs[0].factType.factTypeId;
      if (failure === 'broken-flow') manifest.topologyViews.workflow.edges = [];
      if (failure === 'version') skills.skills[0].contract.inputs[0].factType.ontologyVersion = 'old';
      if (failure === 'cycle') {
        skills.skills[0].contract.outputs = structuredClone(agents.agents[0].contract.inputs);
        manifest.topologyViews.workflow.edges.push({ source: 'publish', target: 'prepare', factType: agents.agents[0].contract.inputs[0].factType });
      }
      if (failure === 'missing-policy') delete manifest.executionContract.budget;
      await state.save();
      const files = ['manifest.json', 'agents.json', 'skills.json'].map(name => path.join(state.target, name));
      const before = await Promise.all(files.map(file => readFile(file, 'utf8')));
      const result = await state.publishing.publish(reference);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Invalid design published');
      const codes = { legacy: 'MISSING_NODE_CONTRACT', 'missing-ref': 'MISSING_FACT_TYPE', 'broken-flow': 'REQUIRED_INPUT_UNBOUND', version: 'ONTOLOGY_VERSION_MISMATCH', cycle: 'CYCLIC_TOPOLOGY', 'missing-policy': 'MISSING_BUDGET' };
      expect(result.gaps.map(gap => gap.code)).toContain(codes[failure]);
      expect(result.gaps.some(gap => Boolean(gap.path))).toBe(true);
      expect(await state.store.load(reference)).toBeNull();
      expect(await Promise.all(files.map(file => readFile(file, 'utf8')))).toEqual(before);
    }
  );
});

describe('P2.6 skill metadata loading', () => {
  it('does not expose the golden example as a bundled skill', () => {
    expect(loadSkillsFromDir({ dir: fixture, source: 'bundled' }).skills).toEqual([]);
  });
  it('retains nested YAML canonical and legacy declarations without flattening keys', async () => {
    const { stringify } = await import('yaml');
    const { root, skills } = await setup();
    const dir = path.join(root, 'publisher');
    await mkdir(dir);
    const metadata = {
      name: 'publisher', description: 'Publish a verified order', contract: skills.skills[0].contract,
      inputContract: { requires: [{ objectType: 'Order', fields: ['status'] }] },
      outputContract: { produces: [] }, sopIO: { input: { source: 'previous-step', objects: [] }, output: { objects: [] } },
    };
    await writeFile(path.join(dir, 'SKILL.md'), `---\n${stringify(metadata)}---\nBody`);
    const loaded = loadSkillsFromDir({ dir: root, source: 'project' });
    const skill = loaded.skills.find(item => item.name === 'publisher');
    expect(skill).toMatchObject(metadata);
    expect(loadSkillContent(skill!).frontmatter).not.toHaveProperty('ontologyId');
  });

  it.each([
    'contract: broken',
    'contract: {skillId: publisher}',
    'contract: {}\ncontract: {}',
    'contract: *unknown',
  ])('reports malformed metadata without loading a falsely typed declaration: %s', async (metadata) => {
    const { root } = await setup();
    const dir = path.join(root, 'publisher');
    await mkdir(dir);
    await writeFile(path.join(dir, 'SKILL.md'), `---\nname: publisher\ndescription: Example\n${metadata}\n---\nBody`);
    const loaded = loadSkillsFromDir({ dir: root, source: 'project' });
    expect(loaded.skills).toHaveLength(0);
    expect(loaded.diagnostics.some(item => item.message.includes('Invalid skill contract metadata'))).toBe(true);
  });
});
