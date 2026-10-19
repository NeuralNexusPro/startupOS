import { describe, expect, it } from 'vitest';

import {
  renderSolutionAgentFiles,
  renderSolutionSkill,
} from '../solution-materialization-server';

const contract = {
  skillId: 'invoice-review',
  ontology: {
    ontologyId: 'ontology-project-1',
    ontologyVersion: '1.0.0',
  },
  inputs: [{
    factType: {
      ontologyId: 'ontology-project-1',
      ontologyVersion: '1.0.0',
      conceptId: 'invoice',
      factTypeId: 'invoice-submitted',
    },
    required: true,
  }],
  outputs: [],
  actions: [],
  permissions: [],
};

describe('solution materialization renderer', () => {
  it('renders all Agent files and registers its generated Skill', () => {
    const files = renderSolutionAgentFiles({
      id: 'invoice-agent',
      name: '发票 Agent',
      type: 'agent',
      description: '核对发票事实。',
      domain: '财务',
      contract: { agentId: 'invoice-agent' },
    }, [{
      id: 'invoice-review',
      code: 'invoice-review',
      name: '发票核对',
      agentId: 'invoice-agent',
      description: '核对发票。',
    }]);

    expect(Object.keys(files).sort()).toEqual([
      'Agent.md',
      'Data.md',
      'Memory.md',
      'Process.md',
      'Taste.md',
      'Tool.md',
    ]);
    expect(files['Tool.md']).toContain('skills/invoice-review/SKILL.md');
    expect(files['Agent.md']).toContain('核对发票事实');
  });

  it('preserves the canonical Skill contract and installs the reference link', () => {
    const skill = renderSolutionSkill({
      id: 'invoice-review',
      code: 'invoice-review',
      name: '发票核对',
      description: '核对发票。',
      triggerType: 'event',
      contract,
      skillFileOutline: {
        triggerScenario: '收到发票事实时',
        steps: ['调用 get_concept_schema 校验字段', '调用 query_instances 查询发票'],
        inputFormat: '发票事实',
        outputFormat: '核对结果',
      },
    });

    const contractLine = skill.split('\n').find((line) => line.startsWith('contract:'));
    expect(contractLine).toBe(`contract: ${JSON.stringify(contract)}`);
    expect(skill).toContain('[references/ontology-tools.md](references/ontology-tools.md)');
    expect(skill).toContain('`get_concept_schema`');
    expect(skill).toContain('`query_instances`');
  });
});
