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
      await service.record({
        projectId, sourceId: 'session-1', projectName: '访谈项目',
        domain: { name: '订单管理' }, concepts: [{ name: '客户' }, { name: '订单' }],
        relations: [{ name: '下单', sourceConceptName: '客户', targetConceptName: '订单', cardinality: 'one-to-many' }],
      });
      const updated = await service.record({
        projectId, sourceId: 'session-1', domain: { name: '订单管理' }, concepts: [{ name: '订单' }, { name: '产品' }],
      });
      expect(updated.domains).toHaveLength(1);
      expect(updated.concepts.map((item) => item.name)).toEqual(['客户', '订单', '产品']);
      expect(updated.relations).toHaveLength(1);
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
});
