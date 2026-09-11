/**
 * User Registry — 用户自定义 Agent 和 Skill 的发现与解析
 *
 * 从 data/agents/ 和 data/skills/ 目录扫描，解析 Agent.md / SKILL.md frontmatter。
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { getDataRoot } from '../../paths';
import { listBundledSkillIdentifiers } from '../../integrations/pi-agent/core/skills';

// ============================================================================
// Types
// ============================================================================

import type { UserAgent, UserSkill } from '../../../types/user-registry';
export type { UserAgent, UserSkill } from '../../../types/user-registry';

// ============================================================================
// Frontmatter Parser
// ============================================================================

function parseFrontmatter(content: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of (match[1] || '').split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function extractFirstParagraph(content: string): string {
  const bodyMatch = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!bodyMatch) return '';
  const body = (bodyMatch[1] || '').trim();
  return body.split('\n').find((line) => line.trim() && !line.startsWith('#')) || '';
}

function isTruthyFrontmatterValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function findMarkdownFile(dirPath: string, expectedName: string): string | null {
  const directPath = join(dirPath, expectedName);
  if (existsSync(directPath)) return directPath;

  try {
    const expectedLower = expectedName.toLowerCase();
    const entry = readdirSync(dirPath, { withFileTypes: true })
      .find((candidate) => candidate.isFile() && candidate.name.toLowerCase() === expectedLower);
    return entry ? join(dirPath, entry.name) : null;
  } catch {
    return null;
  }
}

// ============================================================================
// User Agents
// ============================================================================

export function listUserAgents(): UserAgent[] {
  const agentsDir = join(getDataRoot(), 'agents');
  const agents: UserAgent[] = [];

  if (!existsSync(agentsDir)) return agents;

  const entries = readdirSync(agentsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const dirPath = join(agentsDir, entry.name);
    const agentMdPath = findMarkdownFile(dirPath, 'Agent.md');
    const skillMdPath = findMarkdownFile(dirPath, 'SKILL.md');

    if (!agentMdPath) continue;

    try {
      const content = readFileSync(agentMdPath, 'utf-8');
      const frontmatter = parseFrontmatter(content);

      agents.push({
        id: entry.name,
        name: frontmatter['name'] || entry.name,
        description: extractFirstParagraph(content) || `User-created agent: ${frontmatter['name'] || entry.name}`,
        agentType: (frontmatter['agentType'] as UserAgent['agentType']) || 'unknown',
        role: frontmatter['role'],
        domain: frontmatter['domain'],
        version: frontmatter['version'],
        dirPath,
        hasSkillMd: Boolean(skillMdPath),
      });
    } catch (err) {
      console.error(`Failed to parse Agent.md in ${entry.name}:`, err);
    }
  }

  return agents;
}

export function getUserAgent(id: string): UserAgent | null {
  const agents = listUserAgents();
  return agents.find((a) => a.id === id) || null;
}

export function deleteUserAgent(id: string): boolean {
  const agentDir = join(getDataRoot(), 'agents', id);
  if (!existsSync(agentDir)) return false;
  rmSync(agentDir, { recursive: true, force: true });
  return true;
}

// ============================================================================
// User Skills
// ============================================================================

export function listUserSkills(): UserSkill[] {
  const skillsDir = join(getDataRoot(), 'skills');
  const skills: UserSkill[] = [];
  const bundledSkillIdentifiers = listBundledSkillIdentifiers();

  if (!existsSync(skillsDir)) return skills;

  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const dirPath = join(skillsDir, entry.name);
    const skillMdPath = findMarkdownFile(dirPath, 'SKILL.md');

    if (!skillMdPath) continue;

    try {
      const content = readFileSync(skillMdPath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      const skillCode = frontmatter['code'] || entry.name;
      const skillName = frontmatter['name'] || entry.name;
      if (
        isTruthyFrontmatterValue(frontmatter['originos-system']) ||
        bundledSkillIdentifiers.has(entry.name) ||
        bundledSkillIdentifiers.has(skillCode) ||
        bundledSkillIdentifiers.has(skillName)
      ) {
        continue;
      }
      const tags = frontmatter['tags'];

      skills.push({
        id: entry.name,
        name: skillName,
        code: skillCode,
        description: frontmatter['description'] || `User-created skill: ${entry.name}`,
        type: frontmatter['type'],
        tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
        dirPath,
      });
    } catch (err) {
      console.error(`Failed to parse SKILL.md in ${entry.name}:`, err);
    }
  }

  return skills;
}

export function getUserSkill(id: string): UserSkill | null {
  const skills = listUserSkills();
  return skills.find((s) => s.id === id) || null;
}

export function deleteUserSkill(id: string): boolean {
  const skillDir = join(getDataRoot(), 'skills', id);
  if (!existsSync(skillDir)) return false;
  rmSync(skillDir, { recursive: true, force: true });
  return true;
}
