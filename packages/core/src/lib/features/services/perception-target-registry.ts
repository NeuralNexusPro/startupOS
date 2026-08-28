import { existsSync } from 'node:fs';
import path from 'node:path';
import type { PerceptionTargetExistencePort, PerceptionTriggerTarget } from '../../../types/perception';
import { loadSkills } from '../../integrations/pi-agent/core/skills';
import { getDataRoot } from '../../paths';

export class FileSystemPerceptionTargetRegistry implements PerceptionTargetExistencePort {
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
}
