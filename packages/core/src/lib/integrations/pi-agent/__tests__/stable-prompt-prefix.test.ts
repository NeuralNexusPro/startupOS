import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { buildAgentPromptBoundary } from '@/lib/features/services/launcher/base';
import type { ProjectCollaborationContext } from '../project-agent/project-collaboration-context';
import { buildCollaborationPromptBoundary } from '../project-agent/collaboration-prompt';
import type { ProjectContext } from '../project-agent/project-context';
import { buildProjectPromptBoundary } from '../project-agent/project-prompt';
import { buildAgentSessionContext, buildProjectLauncherSessionContext, injectSessionContext } from '../prompt-boundary';
import { loadFrozenSessionContext } from '../session-prompt-context';
import type { RoleContext } from '../role-agent/role-context';
import { buildRolePromptBoundary } from '../role-agent/system-prompt';

const roleContext = (overrides: Partial<RoleContext> = {}): RoleContext => ({
  agentMd: '# Role', roleMd: null, tasteMd: 'brief', memoryMd: '## Memory\nfirst',
  toolMd: null, knowledgeMd: '## Knowledge', patternsMd: '## Pattern', memoryBlocks: null,
  currentPhase: 'plan', installedSkills: [], allowedTools: [], agentBaseDir: '/tmp/role',
  ...overrides,
});

const projectContext = (overrides: Partial<ProjectContext> = {}): ProjectContext => ({
  agentMd: '# Project', toolMd: null, tasteMd: 'brief', memoryMd: '## Memory\nfirst',
  knowledgeMd: '## Knowledge', patternsMd: '## Pattern', memoryBlocks: null,
  installedSkills: [], allowedTools: [], workingDirectory: '/tmp/project', projectId: 'p1',
  agentId: 'a1', originosProjectId: null, ...overrides,
});

const collaborationContext = (
  overrides: Partial<ProjectCollaborationContext> = {},
): ProjectCollaborationContext => ({
  agentMd: '# Collaborator', dataMd: 'schema', processMd: '## Process\nfixed', toolMd: null,
  tasteMd: 'brief', memoryMd: '## Memory\nfirst', knowledgeMd: '## Knowledge',
  patternsMd: '## Pattern', installedSkills: [], allowedTools: ['read_file'],
  workingDirectory: '/tmp/collab', projectId: 'p1', agentId: 'a1', originosProjectId: null,
  ...overrides,
});

describe('stable prompt boundary', () => {
  it('普通 Agent 的 Memory 与工作目录变化不改变稳定 hash', () => {
    const first = buildAgentPromptBoundary('# Agent', { memory: '## M\none', baseDir: '/a' });
    const restored = buildAgentPromptBoundary('# Agent', { memory: '## M\ntwo', baseDir: '/b' });
    expect(restored.stablePromptHash).toBe(first.stablePromptHash);
    expect(restored.sessionContext).not.toBe(first.sessionContext);
  });

  it('RoleAgent 的阶段与 Memory 只进入 session context，Skill 变化使 hash 变化', () => {
    const first = buildRolePromptBoundary(roleContext());
    const dynamic = buildRolePromptBoundary(roleContext({ currentPhase: 'execute', memoryMd: '## Memory\nsecond' }));
    expect(dynamic.stablePromptHash).toBe(first.stablePromptHash);
    expect(dynamic.sessionContext).not.toBe(first.sessionContext);

    const skill = { name: 'Review', description: 'review', code: 'review', path: '.skills/review', frontmatter: {} };
    expect(buildRolePromptBoundary(roleContext({ installedSkills: [skill] })).stablePromptHash)
      .not.toBe(first.stablePromptHash);
  });

  it('Project Agent 恢复时以相同输入重建相同边界', () => {
    const first = buildProjectPromptBoundary(projectContext());
    const restored = buildProjectPromptBoundary(projectContext());
    expect(restored).toEqual(first);
    expect(buildProjectPromptBoundary(projectContext({ workingDirectory: '/other' })).stablePromptHash)
      .toBe(first.stablePromptHash);
  });

  it('协作 Agent 将 Memory、目录和额外指令留在 session context', () => {
    const first = buildCollaborationPromptBoundary(collaborationContext(), 'turn one');
    const dynamic = buildCollaborationPromptBoundary(
      collaborationContext({ memoryMd: '## Memory\nsecond', workingDirectory: '/other' }),
      'turn two',
    );
    expect(dynamic.stablePromptHash).toBe(first.stablePromptHash);
    expect(dynamic.sessionContext).not.toBe(first.sessionContext);
    expect(first.systemPrompt).not.toContain('/tmp/collab');
    expect(first.systemPrompt).not.toContain('turn one');
  });

  it('模型边界注入不改写 transcript，并保持确定性前缀', () => {
    const transcript = [{ role: 'user', content: [{ type: 'text', text: 'hello' }], timestamp: 1 }] as const;
    const transformed = injectSessionContext([...transcript], 'frozen context');
    expect(transcript).toHaveLength(1);
    expect(transformed).toHaveLength(2);
    expect(transformed[0]?.role).toBe('user');
    expect(transformed[0]).toEqual(injectSessionContext([...transcript], 'frozen context')[0]);
  });

  it('普通 Agent 与 ProjectLauncher 恢复时重建完全相同的 session context', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'originos-prompt-'));
    try {
      writeFileSync(path.join(directory, 'Memory.md'), '## Memory\nrestored');
      writeFileSync(path.join(directory, 'Knowledge.md'), '## Knowledge');
      writeFileSync(path.join(directory, 'Patterns.md'), '## Pattern');
      expect(await loadFrozenSessionContext({ agentType: 'assistant', workingDirectory: directory }))
        .toBe(buildAgentSessionContext({
          memory: '## Memory\nrestored', knowledge: '## Knowledge', patterns: '## Pattern', baseDir: directory,
        }));

      mkdirSync(path.join(directory, 'ontology'));
      writeFileSync(path.join(directory, 'ontology', 'business-model.json'), '{"name":"demo"}');
      expect(await loadFrozenSessionContext({ agentType: 'project', workingDirectory: directory }))
        .toBe(buildProjectLauncherSessionContext({
          memory: '## Memory\nrestored', baseDir: directory, businessModel: '{"name":"demo"}',
        }));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('RoleAgent 旧目录 fallback 恢复 Role.md', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'originos-role-prompt-'));
    try {
      writeFileSync(path.join(directory, 'Role.md'), 'phase: legacy');
      writeFileSync(path.join(directory, 'Memory.md'), '## Memory\nlegacy');
      expect(await loadFrozenSessionContext({ agentType: 'role-agent', workingDirectory: directory }))
        .toBe(buildAgentSessionContext({
          role: 'phase: legacy', memory: '## Memory\nlegacy', baseDir: directory,
        }));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
