import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSystemPerceptionTargetRegistry } from '../perception-target-registry';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-target-profile-'));
  roots.push(value);
  return value;
}

describe('FileSystemPerceptionTargetRegistry profiles', () => {
  it('uses project metadata, role background, skill frontmatter, and an inherited skill owner', async () => {
    const dataRoot = root();
    fs.mkdirSync(path.join(dataRoot, 'projects', 'product'), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'projects', 'product', 'project.json'), JSON.stringify({ name: '产品规划', description: '制定迭代计划', domain: '产品', metadata: { tags: ['规划'] } }));
    fs.mkdirSync(path.join(dataRoot, 'agents', 'researcher'), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'agents', 'researcher', 'Agent.md'), '---\nname: 调研员\nrole: 市场研究\ndomain: B2B\n---\n\n## 角色背景\n\n专注企业市场调研和用户访谈。\n\n## 核心职责\n\n调研。');
    fs.mkdirSync(path.join(dataRoot, 'skills', 'brief'), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'skills', 'brief', 'SKILL.md'), '---\nname: 简报\ndescription: 产出结构化项目简报\ncategory: 文档\ntags: [文档, 汇总]\n---');
    const registry = new FileSystemPerceptionTargetRegistry(dataRoot);
    await expect(registry.describe({ kind: 'project', id: 'product' })).resolves.toMatchObject({ name: '产品规划', description: '制定迭代计划', domain: '产品', tags: ['规划'] });
    await expect(registry.describe({ kind: 'role-agent', id: 'researcher' })).resolves.toMatchObject({ name: '调研员', description: '市场研究。专注企业市场调研和用户访谈。', domain: 'B2B' });
    await expect(registry.describe({ kind: 'skill', id: 'brief', skillOwnership: { mode: 'inherited', ownerKind: 'role-agent', ownerId: 'researcher' } })).resolves.toMatchObject({ name: '简报', description: '产出结构化项目简报', domain: '文档', tags: ['文档', '汇总'], owner: { kind: 'role-agent', name: '调研员' } });
  });
});
