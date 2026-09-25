import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadProjectSolutionTopologyProjection } from '../solution-topology-projection';

async function writeAgents(dataRoot: string, projectId: string, version: string, agents: unknown): Promise<void> {
  const directory = path.join(dataRoot, 'projects', projectId, 'solutions', version);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'agents.json'), JSON.stringify({ agents }), 'utf8');
}

describe('loadProjectSolutionTopologyProjection', () => {
  it('reads the latest version as a read-only projection and preserves loop edges as notify', async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'solution-topology-'));
    await writeAgents(dataRoot, 'project-a', 'v1.0', [{
      id: 'old', name: 'Old', responsibility: '分析旧数据', businessDomain: 'old', collaborations: [],
    }]);
    await writeAgents(dataRoot, 'project-a', 'v1.2', [
      {
        id: 'a', name: 'A', responsibility: '分析输入；生成报告', businessDomain: 'research', skills: ['s1'],
        collaborations: [{ targetAgentId: 'b', type: 'trigger', description: 'handoff' }],
      },
      {
        id: 'b', name: 'B', responsibility: '验证报告', businessDomain: 'review',
        collaborations: [{ targetAgentId: 'a', type: 'trigger', description: 'feedback' }],
      },
    ]);

    const projection = await loadProjectSolutionTopologyProjection({ projectId: 'project-a', dataRoot });

    expect(Object.keys(projection?.agents ?? {})).toEqual(['a', 'b']);
    expect(projection?.edges).toEqual([
      { from: 'a', to: 'b', type: 'trigger', description: 'handoff' },
      { from: 'b', to: 'a', type: 'notify', description: 'feedback' },
    ]);
    expect(projection?.entryPoints).toEqual([]);
    expect(projection?.exitPoints).toEqual([]);
    expect(projection?.mode).toBe('system');
  });

  it('rejects path traversal and malformed persisted input', async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'solution-topology-'));
    await expect(loadProjectSolutionTopologyProjection({ projectId: '../escape', dataRoot }))
      .rejects.toThrow('INVALID_PROJECT_ID');

    await writeAgents(dataRoot, 'project-b', 'v1.0', [{ id: 'a', name: 'A' }]);
    await expect(loadProjectSolutionTopologyProjection({ projectId: 'project-b', dataRoot }))
      .rejects.toThrow('INVALID_SOLUTION_TOPOLOGY');
  });
});
