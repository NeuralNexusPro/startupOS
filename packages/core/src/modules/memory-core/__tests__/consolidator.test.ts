import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryConsolidator } from '../core/consolidator';
import { HistoryStore } from '../recall/history-store';
import { CognitionBank } from '../bank';
import { Memory } from '../core/memory';

let testDir: string;
let completeResponse = '- [UPDATE:human] 用户以后都偏好简洁回答';

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-consolidator-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function createModelFactory() {
  return {
    createAutoModel() {
      return { id: 'mock-model', provider: 'mock' };
    },
  };
}

function appendFillerTurns(history: HistoryStore): void {
  for (let turnNumber = 3; turnNumber <= 5; turnNumber++) {
    history.append({
      turnNumber,
      summary: `补充对话 ${turnNumber}`,
      userMessage: `继续当前任务 ${turnNumber}`,
      assistantMessage: '继续处理。',
      toolCalls: [],
      timestamp: Date.now() + turnNumber,
    });
  }
}

vi.mock('@originos/pi-agent-adapter/ai', () => ({
  complete: vi.fn(async () => ({
    content: [{ type: 'text', text: completeResponse }],
  })),
}));

describe('MemoryConsolidator', () => {
  it('extracts stable memory from explicit preference turns', async () => {
    completeResponse = '- [UPDATE:human] 用户以后都偏好简洁回答';
    const history = new HistoryStore(path.join(testDir, 'memory', 'history'), 'default');
    history.append({
      turnNumber: 1,
      summary: '用户以后都偏好简洁回答',
      userMessage: '以后都请用简洁回答，默认不要展开太多。',
      assistantMessage: '好的，我会保持简洁。',
      toolCalls: [],
      timestamp: Date.now(),
    });
    history.append({
      turnNumber: 2,
      summary: '确认偏好',
      userMessage: '这个偏好长期有效。',
      assistantMessage: '已记录。',
      toolCalls: [],
      timestamp: Date.now() + 1,
    });

    appendFillerTurns(history);
    const consolidator = new MemoryConsolidator(testDir, 'default', createModelFactory());
    const result = await consolidator.consolidate();

    expect(result.consolidated).toBe(true);
    expect(result.stableMemory.some((item) => item.includes('以后都请用简洁回答'))).toBe(true);
    expect(result.patterns).toHaveLength(0);
  });

  it('skips LLM reflect below five turns but still extracts explicit preferences', async () => {
    const history = new HistoryStore(path.join(testDir, 'memory', 'history'), 'default');
    for (let turnNumber = 1; turnNumber <= 4; turnNumber++) {
      history.append({
        turnNumber,
        summary: `turn ${turnNumber}`,
        userMessage: turnNumber === 1 ? '我偏好简洁回答。' : `普通对话 ${turnNumber}`,
        assistantMessage: '收到。',
        timestamp: Date.now() + turnNumber,
      });
    }

    const result = await new MemoryConsolidator(testDir, 'default', createModelFactory()).consolidate();

    expect(result.consolidated).toBe(false);
    expect(result.reason).toBe('too few turns');
    expect(result.stableMemory).toEqual(['我偏好简洁回答。']);
  });

  it('ingests failed tool turns as reflections', async () => {
    completeResponse = '[SKIP]';
    const history = new HistoryStore(path.join(testDir, 'memory', 'history'), 'default');
    history.append({
      turnNumber: 1,
      summary: '用户要求读取报价文件',
      userMessage: '读取报价文件并总结错误原因',
      assistantMessage: '开始处理。',
      toolCalls: [
        {
          name: 'read_file',
          params: { path: 'quote.md' },
          result: 'Error: file not found',
          success: false,
        },
      ],
      timestamp: Date.now(),
    });
    history.append({
      turnNumber: 2,
      summary: '补充确认',
      userMessage: '如果文件不存在就先告诉我。',
      assistantMessage: '明白。',
      toolCalls: [],
      timestamp: Date.now() + 1,
    });

    appendFillerTurns(history);
    const consolidator = new MemoryConsolidator(testDir, 'default', createModelFactory());
    const result = await consolidator.consolidate();

    expect(result.consolidated).toBe(true);
    expect(result.patterns.some((item) => item.startsWith('[REFLECTION]'))).toBe(true);

    const archivalPath = path.join(testDir, 'archival', 'entries.jsonl');
    expect(fs.existsSync(archivalPath)).toBe(true);
    const archivalContent = fs.readFileSync(archivalPath, 'utf-8');
    expect(archivalContent).toContain('失败原因');
    expect(archivalContent).toContain('read_file');
  });

  it('extracts knowledge candidates from entities and successful tool results', async () => {
    completeResponse = '[SKIP]';
    const history = new HistoryStore(path.join(testDir, 'memory', 'history'), 'default');
    history.append({
      turnNumber: 1,
      summary: '讨论 Tesla Factory',
      userMessage: '请记录 Tesla Factory 的产线约束。',
      assistantMessage: '我会整理 Tesla Factory 的产线约束。',
      toolCalls: [
        {
          name: 'read_file',
          params: { path: 'factory.md' },
          result: 'Tesla Factory uses a three-shift schedule and requires badge access.',
          success: true,
        },
      ],
      timestamp: Date.now(),
    });
    history.append({
      turnNumber: 2,
      summary: '确认知识',
      userMessage: '这些信息后面还会用到。',
      assistantMessage: '已记下。',
      toolCalls: [],
      timestamp: Date.now() + 1,
    });

    appendFillerTurns(history);
    const consolidator = new MemoryConsolidator(testDir, 'default', createModelFactory());
    const result = await consolidator.consolidate();

    expect(result.knowledgeCandidates.length).toBeGreaterThan(0);
    expect(result.knowledgeCandidates[0]?.entities.some((entity) => entity.name === 'Tesla Factory')).toBe(true);
    expect(result.knowledgeCandidates[0]?.facts.some((fact) => fact.includes('three-shift schedule'))).toBe(true);
  });

  it('routes user preferences and owner evidence without writing the legacy human block', async () => {
    completeResponse = '- [UPDATE:human] 用户偏好简洁回答';
    const projectDir = path.join(testDir, 'projects', 'project-1');
    const history = new HistoryStore(path.join(projectDir, 'memory', 'history'), 'session-1');
    history.append({
      turnNumber: 1,
      summary: '偏好',
      userMessage: '以后都请简洁回答。',
      assistantMessage: '好的，我会保持简洁。',
      toolCalls: [{ name: 'read_file', result: 'Successfully read the project requirements document.', success: true }],
      timestamp: Date.now(),
    });
    history.append({
      turnNumber: 2,
      summary: '确认',
      userMessage: '这个偏好长期有效。',
      assistantMessage: '已确认。',
      toolCalls: [],
      timestamp: Date.now() + 1,
    });
    const userBank = new CognitionBank({ scope: 'user', ownerId: 'default', dataRoot: testDir });
    const ownerBank = new CognitionBank({ scope: 'project', ownerId: 'project-1', dataRoot: testDir, ownerDirectory: projectDir });
    appendFillerTurns(history);
    const consolidator = new MemoryConsolidator(projectDir, 'session-1', createModelFactory(), { userBank, ownerBank });

    await consolidator.consolidate();
    await consolidator.consolidate();

    expect(userBank.list()).toHaveLength(1);
    expect(userBank.list()[0]?.proofCount).toBe(1);
    expect(ownerBank.list().some((record) => record.kind === 'experience')).toBe(true);
    expect(new Memory(projectDir).getBlock('human')?.value).toBe('');
  });
});
