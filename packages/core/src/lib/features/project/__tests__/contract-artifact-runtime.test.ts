import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  extractJsonObject,
  resolveTargetDirectory,
} from '../composition/contract-artifact-runtime';

import type { CanonicalSkillContract } from '../../ontology';

const roots: string[] = [];

const skillContract: CanonicalSkillContract = {
  skillId: 'trend-record',
  ontology: { ontologyId: 'trends', ontologyVersion: '1' },
  inputs: [],
  outputs: [],
  actions: [],
  permissions: [],
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('resolveTargetDirectory', () => {
  it('resolves an agent-owned project skill through the approved task template', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-contract-target-'));
    roots.push(root);
    const expected = path.join(
      root,
      'projects',
      'project-1',
      'agents',
      'trend-tracker',
      'skills',
      'trend-record',
    );
    await fs.mkdir(expected, { recursive: true });

    await expect(resolveTargetDirectory(root, {
      projectId: 'project-1',
      target: { kind: 'skill', targetId: 'trend-record', contract: skillContract },
      taskTemplate: {
        id: 'track-trends',
        designNodeId: 'trend-record',
        objective: '记录技术趋势',
        candidateAgentIds: ['trend-tracker'],
        candidateSkillIds: ['trend-record'],
      },
    })).resolves.toBe(expected);
  });

  it('does not resolve a skill owned by an agent outside the approved template', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-contract-target-'));
    roots.push(root);
    await fs.mkdir(path.join(
      root,
      'projects',
      'project-1',
      'agents',
      'unapproved-agent',
      'skills',
      'trend-record',
    ), { recursive: true });

    await expect(resolveTargetDirectory(root, {
      projectId: 'project-1',
      target: { kind: 'skill', targetId: 'trend-record', contract: skillContract },
      taskTemplate: {
        id: 'track-trends',
        designNodeId: 'trend-record',
        objective: '记录技术趋势',
        candidateAgentIds: ['trend-tracker'],
        candidateSkillIds: ['trend-record'],
      },
    })).rejects.toThrow('CONTRACT_TARGET_UNAVAILABLE');
  });
});

describe('extractJsonObject', () => {
  it('accepts a JSON result wrapped by a short natural-language preface', () => {
    expect(extractJsonObject('处理完成。\n{"result":"success","summary":"已整理"}')).toEqual({
      result: 'success',
      summary: '已整理',
    });
  });

  it('returns the final JSON object when a response contains an earlier example', () => {
    expect(extractJsonObject([
      '格式示例：{"result":"example"}',
      '最终结果：{"result":"success","summary":"真实结果"}',
    ].join('\n'))).toMatchObject({ result: 'success', summary: '真实结果' });
  });
});
