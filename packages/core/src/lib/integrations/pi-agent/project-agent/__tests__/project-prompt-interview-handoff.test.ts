import { describe, expect, it } from 'vitest';

import type { ProjectContext } from '../project-context';
import { buildProjectPromptLayers } from '../project-prompt';

function context(
  overrides: Partial<
    Extract<
      ProjectContext['ontologyContext'],
      { kind: 'canonical' }
    >['ontology']
  > = {}
): ProjectContext {
  return {
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
        factTypeCount: 2,
        factTypeGapCount: 0,
        factTypeGapNames: [],
        actionCount: 2,
        ruleCount: 1,
        documentFieldGapCount: 0,
        ...overrides,
      },
    },
  };
}

describe('project interview solution handoff prompt', () => {
  it('requires an explicit completion message and solution-design recommendation after trusted completion', () => {
    const layers = buildProjectPromptLayers(context());

    expect(layers.thinkingLoop).toContain('访谈收尾与阶段交接');
    expect(layers.thinkingLoop).toContain('访谈已完成');
    expect(layers.thinkingLoop).toContain('业务模型已准备好');
    expect(layers.thinkingLoop).toContain('进入解决方案设计');
    expect(layers.thinkingLoop).toContain('不要声称已经自动打开');
  });

  it.each([
    ['关系尚未确认', { relationCount: 0 }],
    ['行为尚未可信发布', { factTypeCount: 0, actionCount: 0, ruleCount: 0 }],
    ['仍有对象缺少数据形态', { factTypeGapCount: 1, factTypeGapNames: ['供应商'] }],
    ['单据字段仍有缺口', { documentFieldGapCount: 1 }],
  ])('does not declare completion when %s', (_label, overrides) => {
    const layers = buildProjectPromptLayers(context(overrides));

    expect(layers.thinkingLoop).not.toContain('访谈收尾与阶段交接');
    expect(layers.thinkingLoop).not.toContain('业务模型已准备好');
  });

  it('lists partial behavior gaps and keeps the interview in confirmation', () => {
    const layers = buildProjectPromptLayers(context({
      factTypeCount: 2,
      factTypeGapCount: 1,
      factTypeGapNames: ['供应商'],
      actionCount: 1,
      ruleCount: 0,
    }));

    expect(layers.stateMemory).toContain('1 个业务对象尚未定义数据形态：供应商');
    expect(layers.stateMemory).toContain('尚未发布业务规则');
    expect(layers.thinkingLoop).toContain('不能收尾或推荐进入解决方案设计');
    expect(layers.thinkingLoop).toContain('供应商');
    expect(layers.thinkingLoop).toContain('引导用户在右侧审稿卡片确认发布');
  });
});
