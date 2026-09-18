import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt } from '@/lib/features/services/launcher/base';
import type { ProjectContext } from '../project-agent/project-context';
import type { ProjectCollaborationContext } from '../project-agent/project-collaboration-context';
import { buildCollaborationPrompt } from '../project-agent/collaboration-prompt';
import { buildProjectPromptLayers } from '../project-agent/project-prompt';
import type { RoleContext } from '../role-agent/role-context';
import { buildRoleSystemPrompt } from '../role-agent/system-prompt';
import {
  buildPromptMemorySections,
  renderMarkdownHeadingCatalog,
} from '../memory-consumption';

const knowledgeMd = `# Knowledge

知识简介

## Customers

KNOWLEDGE_BODY_SECRET

### Active Customers`;

const patternsMd = `# Patterns

模式简介

## Verify First

PATTERN_BODY_SECRET

#### Retry Safely`;

function expectCatalogOnly(prompt: string): void {
  expect(prompt).toContain('## Customers');
  expect(prompt).toContain('### Active Customers');
  expect(prompt).toContain('## Verify First');
  expect(prompt).toContain('#### Retry Safely');
  expect(prompt).toContain('read_file');
  expect(prompt).toContain('Knowledge.md');
  expect(prompt).toContain('Patterns.md');
  expect(prompt).not.toContain('KNOWLEDGE_BODY_SECRET');
  expect(prompt).not.toContain('PATTERN_BODY_SECRET');
}

describe('progressive cognitive catalog', () => {
  it('按文件顺序提取 h2-h4，并应用固定字符预算', () => {
    const markdown = '# ignored\n## First\nbody\n### Second\n#### Third';
    expect(renderMarkdownHeadingCatalog(markdown)).toBe('## First\n### Second\n#### Third');

    const limited = renderMarkdownHeadingCatalog(markdown, 12);
    expect(limited).toBe(renderMarkdownHeadingCatalog(markdown, 12));
    expect(limited.length).toBeLessThanOrEqual(12);
    expect(limited.startsWith('## First')).toBe(true);
  });

  it('空内容不生成目录 section', () => {
    const sections = buildPromptMemorySections({
      knowledgeMd: '  \n',
      patternsMd: null,
    });
    expect(sections.knowledgeSection).toBe('');
    expect(sections.patternsSection).toBe('');
  });

  it('普通 Agent 只注入共享目录', () => {
    expectCatalogOnly(buildAgentSystemPrompt('assistant', { knowledge: knowledgeMd, patterns: patternsMd }));
  });

  it('RoleAgent 只注入共享目录', () => {
    const ctx: RoleContext = {
      agentMd: '# Role',
      roleMd: null,
      tasteMd: null,
      memoryMd: null,
      toolMd: null,
      knowledgeMd,
      patternsMd,
      memoryBlocks: null,
      currentPhase: 'default',
      installedSkills: [],
      allowedTools: [],
      agentBaseDir: '/tmp/role',
    };
    expectCatalogOnly(buildRoleSystemPrompt(ctx));
  });

  it('Project Agent 只注入共享目录', () => {
    const ctx: ProjectContext = {
      agentMd: '# Project',
      toolMd: null,
      tasteMd: null,
      memoryMd: null,
      knowledgeMd,
      patternsMd,
      memoryBlocks: null,
      installedSkills: [],
      allowedTools: [],
      workingDirectory: '/tmp/project',
      projectId: 'project-1',
      agentId: 'agent-1',
      originosProjectId: null,
    };
    expectCatalogOnly(buildProjectPromptLayers(ctx).stateMemory);
  });

  it('协作 Agent 只注入共享目录', () => {
    const ctx: ProjectCollaborationContext = {
      agentMd: '# Collaboration Agent',
      dataMd: '',
      processMd: '',
      toolMd: null,
      tasteMd: null,
      memoryMd: null,
      knowledgeMd,
      patternsMd,
      installedSkills: [],
      allowedTools: [],
      workingDirectory: '/tmp/collaboration',
      projectId: 'project-1',
      agentId: 'agent-1',
      originosProjectId: null,
    };
    expectCatalogOnly(buildCollaborationPrompt(ctx));
  });
});
