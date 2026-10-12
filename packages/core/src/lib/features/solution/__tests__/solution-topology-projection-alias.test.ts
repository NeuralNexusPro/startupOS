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

describe('loadProjectSolutionTopologyProjection canonical alias compatibility', () => {
  it('accepts target/domain naming from the canonical solution-design template', async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'solution-topology-alias-'));
    await writeAgents(dataRoot, 'project-canon', 'v1.0', [
      {
        id: 'intake', name: '受理', type: 'agent', domain: '行政受理与协调',
        responsibility: '受理需求；路由至对应领域 Agent',
        collaborations: [{ target: 'reimburse', type: 'trigger', description: '转交' }],
      },
      {
        id: 'reimburse', name: '报销', type: 'agent', domain: '物资报销',
        responsibility: '处理报销单',
        collaborations: [{ target: 'intake', type: 'notify', description: '回执' }],
      },
    ]);

    const projection = await loadProjectSolutionTopologyProjection({ projectId: 'project-canon', dataRoot });

    expect(Object.keys(projection?.agents ?? {})).toEqual(['intake', 'reimburse']);
    expect(projection?.agents['intake']?.domain).toBe('行政受理与协调');
    expect(projection?.edges).toEqual([
      { from: 'intake', to: 'reimburse', type: 'trigger', description: '转交' },
      { from: 'reimburse', to: 'intake', type: 'notify', description: '回执' },
    ]);
    expect(projection?.entryPoints).toEqual([]);
    expect(projection?.exitPoints).toEqual([]);
    expect(projection?.mode).toBe('system');
  });

  it('still prefers targetAgentId when both keys exist', async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'solution-topology-alias-'));
    await writeAgents(dataRoot, 'project-mixed', 'v1.0', [
      {
        id: 'a', name: 'A', responsibility: '分析输入', businessDomain: '研究',
        collaborations: [{ targetAgentId: 'b', target: 'c', type: 'trigger', description: 'both' }],
      },
      { id: 'b', name: 'B', responsibility: '验证' },
      { id: 'c', name: 'C', responsibility: '兜底' },
    ]);

    const projection = await loadProjectSolutionTopologyProjection({ projectId: 'project-mixed', dataRoot });
    expect(projection?.edges).toEqual([
      { from: 'a', to: 'b', type: 'trigger', description: 'both' },
    ]);
  });
});
