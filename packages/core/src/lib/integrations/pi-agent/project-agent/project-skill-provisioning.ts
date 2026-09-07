import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';

import { findBundledSkillDir } from '../core/skills';

export const PROJECT_DEFAULT_SKILLS = [
  'domain-discovery',
  'business-refinement',
  'model-review',
  'solution-design',
  'project-skill-creator',
  'agent-creator',
] as const;

export type ProjectSkillProvisionStatus = 'created' | 'updated' | 'existing' | 'missing';

export interface ProjectSkillProvisionResult {
  skillName: string;
  status: ProjectSkillProvisionStatus;
  copiedFiles: number;
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs.access(targetPath).then(() => true).catch(() => false);
}

async function copyMissingTree(sourceDir: string, targetDir: string): Promise<number> {
  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch (error) {
    // 存量项目可能把技能子目录定制成同名文件。不得覆盖用户内容，
    // 也不能因此阻止 Project Agent 启动。
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return 0;
    throw error;
  }
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  let copiedFiles = 0;

  for (const entry of entries) {
    if (
      entry.name === '.git' ||
      entry.name === '__pycache__' ||
      entry.name === '.DS_Store' ||
      entry.name.endsWith('.pyc')
    ) continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copiedFiles += await copyMissingTree(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) continue;

    try {
      await fs.copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
      copiedFiles += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  return copiedFiles;
}

/**
 * 将内置技能定义幂等补齐到项目目录。
 * 已存在的文件不会被覆盖，因此用户对项目技能的修改会被保留。
 */
export async function provisionProjectSkill(
  projectDir: string,
  skillName: string,
): Promise<ProjectSkillProvisionResult> {
  const sourceDir = findBundledSkillDir(skillName);
  if (!sourceDir) {
    return { skillName, status: 'missing', copiedFiles: 0 };
  }

  const targetDir = path.join(projectDir, 'skills', skillName);
  const targetSkillPath = path.join(targetDir, 'SKILL.md');
  const existedBefore = await pathExists(targetSkillPath);
  const copiedFiles = await copyMissingTree(sourceDir, targetDir);

  return {
    skillName,
    status: copiedFiles === 0 ? 'existing' : existedBefore ? 'updated' : 'created',
    copiedFiles,
  };
}

export async function provisionProjectSkills(
  projectDir: string,
  skillNames: readonly string[] = PROJECT_DEFAULT_SKILLS,
): Promise<ProjectSkillProvisionResult[]> {
  const results: ProjectSkillProvisionResult[] = [];
  for (const skillName of skillNames) {
    results.push(await provisionProjectSkill(projectDir, skillName));
  }
  return results;
}
