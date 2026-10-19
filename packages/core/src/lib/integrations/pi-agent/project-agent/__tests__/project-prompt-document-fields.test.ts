import { describe, expect, it } from 'vitest';

import { buildProjectPromptLayers } from '../project-prompt';
import type { ProjectContext } from '../project-context';

describe('project interview document field reminder', () => {
  it('blocks interview completion and asks the user to decompose incomplete documents', () => {
    const context: ProjectContext = {
      agentMd: '项目访谈助手',
      toolMd: null,
      tasteMd: null,
      memoryMd: null,
      knowledgeMd: null,
      patternsMd: null,
      memoryBlocks: null,
      installedSkills: [],
      allowedTools: [],
      workingDirectory: '/tmp/project',
      projectId: 'project-1',
      agentId: 'project-agent',
      originosProjectId: 'project-1',
      ontologyContext: {
        kind: 'canonical',
        ontology: {
          ontologyId: 'ontology-project-1',
          ontologyVersion: '1.0.0',
          name: '供应商管理',
          domainCount: 1,
          conceptCount: 3,
          relationCount: 2,
          documentFieldGapCount: 1,
          documentFieldGapNames: ['供应商审核单'],
        },
      },
    };

    const layers = buildProjectPromptLayers(context);

    expect(layers.stateMemory).toContain('供应商审核单');
    expect(layers.thinkingLoop).toContain('访谈不能收尾');
    expect(layers.thinkingLoop).toContain('主动提醒用户逐项拆解');
    expect(layers.thinkingLoop).toContain('字段名称、内容类型、是否必填和业务含义');
  });
});
