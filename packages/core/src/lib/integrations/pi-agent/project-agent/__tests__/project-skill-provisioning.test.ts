import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { provisionProjectSkill } from '../project-skill-provisioning';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

async function createProjectDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-project-skills-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('project skill provisioning', () => {
  it('copies a bundled skill with its supporting files', async () => {
    const projectDir = await createProjectDirectory();

    const result = await provisionProjectSkill(projectDir, 'project-skill-creator');

    expect(result.status).toBe('created');
    await expect(fs.access(path.join(projectDir, 'skills', 'project-skill-creator', 'SKILL.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(projectDir, 'skills', 'project-skill-creator', 'references', 'schemas.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(projectDir, 'skills', 'project-skill-creator', 'scripts', 'quick_validate.py'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(projectDir, 'skills', 'project-skill-creator', 'scripts', '__pycache__'))).rejects.toThrow();
  });

  it('preserves existing project changes while backfilling missing dependencies', async () => {
    const projectDir = await createProjectDirectory();
    const skillDir = path.join(projectDir, 'skills', 'project-skill-creator');
    const skillPath = path.join(skillDir, 'SKILL.md');
    const dependencyPath = path.join(skillDir, 'references', 'schemas.md');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillPath, 'user customized skill', 'utf-8');

    const result = await provisionProjectSkill(projectDir, 'project-skill-creator');

    expect(result.status).toBe('updated');
    await expect(fs.readFile(skillPath, 'utf-8')).resolves.toBe('user customized skill');
    await expect(fs.access(dependencyPath)).resolves.toBeUndefined();
  });

  it('does not fail agent startup when a customized file conflicts with a source directory', async () => {
    const projectDir = await createProjectDirectory();
    const skillDir = path.join(projectDir, 'skills', 'project-skill-creator');
    const conflictingPath = path.join(skillDir, 'references');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(conflictingPath, 'user-owned content', 'utf-8');

    const result = await provisionProjectSkill(projectDir, 'project-skill-creator');

    expect(result.status).toBe('created');
    await expect(fs.readFile(conflictingPath, 'utf-8')).resolves.toBe('user-owned content');
    await expect(fs.access(path.join(skillDir, 'SKILL.md'))).resolves.toBeUndefined();
  });
});
