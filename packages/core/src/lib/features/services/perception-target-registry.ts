import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PerceptionTargetExistencePort, PerceptionTargetProfile, PerceptionTargetProfilePort, PerceptionTriggerTarget } from '../../../types/perception';
import { loadSkills, parseFrontmatter } from '../../integrations/pi-agent/core/skills';
import { getDataRoot } from '../../paths';

export class FileSystemPerceptionTargetRegistry implements PerceptionTargetExistencePort, PerceptionTargetProfilePort {
  constructor(private readonly dataRoot = getDataRoot()) {}

  async exists(target: PerceptionTriggerTarget): Promise<boolean> {
    if (target.kind === 'project') {
      const directory = path.join(this.dataRoot, 'projects', target.id);
      return existsSync(path.join(directory, 'project.json')) || existsSync(path.join(directory, 'Agent.md'));
    }
    if (target.kind === 'role-agent') return existsSync(path.join(this.dataRoot, 'agents', target.id, 'Agent.md'));
    if (existsSync(path.join(this.dataRoot, 'skills', target.id, 'SKILL.md'))) return true;
    const loaded = loadSkills({ includeDefaults: true });
    return loaded.skills.some((skill) => skill.code === target.id || skill.name === target.id);
  }

  async describe(target: PerceptionTriggerTarget): Promise<PerceptionTargetProfile | undefined> {
    const profile = target.kind === 'project'
      ? this.describeProject(target.id)
      : target.kind === 'role-agent'
        ? this.describeRole(target.id)
        : this.describeSkill(target.id);
    if (!profile || target.kind !== 'skill' || target.skillOwnership?.mode !== 'inherited') return profile;
    const owner = target.skillOwnership;
    const ownerProfile = owner.ownerKind === 'project' ? this.describeProject(owner.ownerId) : this.describeRole(owner.ownerId);
    return ownerProfile ? { ...profile, owner: { kind: owner.ownerKind, name: ownerProfile.name, ...(ownerProfile.description ? { description: ownerProfile.description } : {}) } } : profile;
  }

  private describeProject(id: string): PerceptionTargetProfile | undefined {
    const value = readJson(path.join(this.dataRoot, 'projects', id, 'project.json'));
    if (!value) return undefined;
    const metadata = record(value['metadata']);
    const tags = stringArray(metadata?.['tags']);
    return profile({
      name: string(value['name']) ?? id,
      description: string(value['description']) ?? string(metadata?.['mainFeatures']),
      domain: string(value['domain']),
      tags,
    });
  }

  private describeRole(id: string): PerceptionTargetProfile | undefined {
    const filePath = path.join(this.dataRoot, 'agents', id, 'Agent.md');
    if (!existsSync(filePath)) return undefined;
    const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(readFileSync(filePath, 'utf8'));
    const role = string(frontmatter['role']);
    const background = section(body, '角色背景');
    return profile({
      name: string(frontmatter['name']) ?? id,
      description: [role, background].filter(Boolean).join('。'),
      domain: string(frontmatter['domain']),
    });
  }

  private describeSkill(id: string): PerceptionTargetProfile | undefined {
    const localPath = path.join(this.dataRoot, 'skills', id, 'SKILL.md');
    if (existsSync(localPath)) return this.profileFromSkillFile(localPath, id);
    const skill = loadSkills({ includeDefaults: true }).skills.find((item) => item.code === id || item.name === id);
    return skill ? this.profileFromSkillFile(skill.filePath, skill.name) : undefined;
  }

  private profileFromSkillFile(filePath: string, fallbackName: string): PerceptionTargetProfile | undefined {
    try {
      const { frontmatter } = parseFrontmatter<Record<string, unknown>>(readFileSync(filePath, 'utf8'));
      return profile({
        name: string(frontmatter['name']) ?? fallbackName,
        description: string(frontmatter['description']),
        domain: string(frontmatter['category']) ?? string(frontmatter['type']),
        tags: stringArray(frontmatter['tags']),
      });
    } catch { return undefined; }
  }
}

function profile(value: PerceptionTargetProfile): PerceptionTargetProfile {
  return {
    name: compact(value.name, 120),
    ...(value.description ? { description: compact(value.description, 600) } : {}),
    ...(value.domain ? { domain: compact(value.domain, 120) } : {}),
    ...(value.tags?.length ? { tags: value.tags.map((tag) => compact(tag, 80)).filter(Boolean).slice(0, 8) } : {}),
  };
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  try { return record(JSON.parse(readFileSync(filePath, 'utf8'))); }
  catch { return undefined; }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  if (typeof value !== 'string') return undefined;
  return value.replace(/^\[|\]$/g, '').split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

function section(body: string, title: string): string | undefined {
  const match = new RegExp(`^##\\s+${title}\\s*$`, 'm').exec(body);
  if (!match || match.index === undefined) return undefined;
  const content = body.slice(match.index + match[0].length);
  const next = content.search(/^##\s+/m);
  return compact(next === -1 ? content : content.slice(0, next), 600) || undefined;
}

function compact(value: string, limit: number): string {
  return value.replace(/[`*_>#]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}
