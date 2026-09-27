import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CanonicalOntologyStore } from '../../ontology';
import { ProjectOntologyEntryService } from '../project-ontology-entry-service';
import { InterviewOntologySyncService } from '../interview-ontology-sync-service';

describe('InterviewOntologySyncService', () => {
  it('creates, binds, and incrementally updates the canonical interview model', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'originos-interview-sync-'));
    const projectId = 'project-1';
    await mkdir(path.join(root, 'projects', projectId), { recursive: true });
    await writeFile(path.join(root, 'projects', projectId, 'project.json'), JSON.stringify({ id: projectId, name: '访谈项目', metadata: {} }));
    const store = new CanonicalOntologyStore(root);
    const entry = new ProjectOntologyEntryService(root, store);
    const service = new InterviewOntologySyncService(store, entry, root);
    try {
      const initial = await service.record({
        projectId, sourceId: 'session-1', operationId: 'observation-1', projectName: '访谈项目',
        domain: { name: '订单管理' }, concepts: [{ name: '客户', semanticKind: 'role' }, { name: '订单', semanticKind: 'object' }],
        relations: [{ name: '下单', sourceConceptName: '客户', targetConceptName: '订单', cardinality: 'one-to-many' }],
      });
      const updated = await service.record({
        projectId, sourceId: 'session-1', operationId: 'observation-2', domain: { name: '订单管理' }, concepts: [{ name: '订单' }, { name: '产品' }],
      });
      expect(initial.results).toHaveLength(3);
      expect(updated.ontology.domains).toHaveLength(1);
      expect(updated.ontology.concepts.map((item) => item.name)).toEqual(['客户', '订单', '产品']);
      expect(updated.ontology.relations).toHaveLength(1);
      expect((await entry.resolveProject(projectId)).kind).toBe('canonical');
      const memory = await readFile(path.join(root, 'projects', projectId, 'Memory.md'), 'utf8');
      expect(memory).toContain('## 已识别实体');
      expect(memory).toContain('客户');
      expect(memory).toContain('产品');
      expect(memory).toContain('## 已识别关系');
      expect(memory).toContain('客户 下单 订单');
      const metadata = JSON.parse(await readFile(path.join(root, 'projects', projectId, 'project.json'), 'utf8'));
      expect(metadata.metadata.ontologyRef.ontologyId).toBe(`ontology-${projectId}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts relationship-only ID input, rejects unknown endpoints, and preserves a user correction', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'originos-interview-sync-'));
    const projectId = 'project-2';
    await mkdir(path.join(root, 'projects', projectId), { recursive: true });
    await writeFile(path.join(root, 'projects', projectId, 'project.json'), JSON.stringify({ id: projectId, name: '访谈项目', metadata: {} }));
    const store = new CanonicalOntologyStore(root); const service = new InterviewOntologySyncService(store, new ProjectOntologyEntryService(root, store), root);
    try {
      const created = await service.record({ projectId, sourceId: 's1', operationId: 'create', domain: { name: '质量' }, concepts: [{ name: '审核员', semanticKind: 'role' }, { name: '报告', semanticKind: 'document' }] });
      const [auditor, report] = created.ontology.concepts;
      const relation = await service.record({ projectId, sourceId: 's1', operationId: 'relation', domain: { name: '质量' }, concepts: [], relations: [{ name: '编写', sourceConceptId: auditor!.id, targetConceptId: report!.id }] });
      expect(relation.results[0]).toMatchObject({ status: 'accepted', item: 'relation' });
      const rejected = await service.record({ projectId, sourceId: 's1', operationId: 'bad-relation', domain: { name: '质量' }, concepts: [], relations: [{ name: '错误', sourceConceptId: 'missing', targetConceptId: report!.id }] });
      expect(rejected.results[0]).toMatchObject({ status: 'rejected', issues: [expect.objectContaining({ code: 'UNKNOWN_CONCEPT_ENDPOINT' })] });
      const corrected = await service.record({ projectId, sourceId: 's2', operationId: 'correct', domain: { name: '质量' }, concepts: [], classificationCorrections: [{ conceptId: auditor!.id, semanticKind: 'organization' }] });
      expect(corrected.ontology.concepts.find((item) => item.id === auditor!.id)).toMatchObject({ semanticKind: 'organization', classificationSource: { classifiedBy: 'user', userConfirmed: true } });
      const later = await service.record({ projectId, sourceId: 's3', operationId: 'later', domain: { name: '质量' }, concepts: [{ name: '审核员', semanticKind: 'role' }] });
      expect(later.ontology.concepts.find((item) => item.id === auditor!.id)?.semanticKind).toBe('organization');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
