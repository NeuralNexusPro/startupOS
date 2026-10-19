import { describe, expect, it } from 'vitest';

import {
  normalizeAgentsJsonAgents,
  toManifestAgent,
} from '../supervisor-dag-manifest';

describe('supervisor DAG manifest normalization', () => {
  it('maps canonical solution fields into the collaboration runtime contract', () => {
    const [agent] = normalizeAgentsJsonAgents([
      {
        id: 'trend-tracker',
        name: '趋势跟踪 Agent',
        type: 'agent',
        description: '浏览榜单并维护待看清单',
        domain: '技术趋势跟踪',
        ontologyObjects: {
          'GitHub 上榜项目': ['create', 'read'],
        },
        collaborations: [
          {
            target: 'deep-analyst',
            type: 'trigger',
            description: '进入深度分析',
          },
        ],
      },
    ]);

    expect(agent).toMatchObject({
      responsibility: '浏览榜单并维护待看清单',
      businessDomain: '技术趋势跟踪',
      dataOperations: {
        'GitHub 上榜项目': ['create', 'read'],
      },
      collaborations: [{ targetAgentId: 'deep-analyst' }],
    });
    expect(toManifestAgent(agent!)).toMatchObject({
      responsibility: '浏览榜单并维护待看清单',
      domain: '技术趋势跟踪',
      dataOperations: {
        'GitHub 上榜项目': ['create', 'read'],
      },
    });
  });
});
