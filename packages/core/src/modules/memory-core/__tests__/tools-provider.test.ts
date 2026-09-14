import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCore } from '../core/memory-core';
import { MemoryProvider } from '../session/memory-provider';
import { MentalModelStore, ObservationPolicyResolver } from '../bank';
import fs from 'node:fs';
import path from 'node:path';

let completeResponse = '[SKIP]';

vi.mock('@originos/pi-agent-adapter/ai', () => ({
  complete: vi.fn(async () => ({
    content: [{ type: 'text', text: completeResponse }],
  })),
}));

function makeTestDir(): string {
  const dir = path.join('/tmp', `provider-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function reachReflectThreshold(provider: MemoryProvider): Promise<void> {
  for (let turnNumber = 3; turnNumber <= 5; turnNumber++) {
    await provider.sync_turn({
      turnNumber,
      userMessage: `继续当前任务 ${turnNumber}`,
      assistantMessage: '继续处理。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now() + turnNumber,
    });
  }
}

describe('MemoryCore ownership context (M.12)', () => {
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = makeTestDir();
  });

  afterEach(() => {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  it('constructs isolated user and project cognition banks from explicit ownership', () => {
    const projectDirectory = path.join(dataRoot, 'projects', 'project-1');
    const core = new MemoryCore({
      ownerScope: 'project',
      ownerId: 'project-1',
      userId: 'default',
      dataRoot,
      workingDirectory: projectDirectory,
      ownerDirectory: projectDirectory,
      sessionId: 'session-1',
    });

    expect(core.ownership?.ownerScope).toBe('project');
    expect(core.userCognition?.filePath).toBe(path.join(dataRoot, 'users', 'default', 'cognition', 'records.json'));
    expect(core.ownerCognition?.filePath).toBe(path.join(projectDirectory, 'cognition', 'records.json'));
  });

  it('keeps the legacy human block readable but rejects new writes with explicit ownership', async () => {
    const agentDirectory = path.join(dataRoot, 'agents', 'role-1');
    const legacyMemory = new MemoryCore(agentDirectory);
    legacyMemory.memory.setBlock('human', 'legacy preference');
    const core = new MemoryCore({
      ownerScope: 'agent',
      ownerId: 'role-1',
      userId: 'default',
      dataRoot,
      workingDirectory: agentDirectory,
      ownerDirectory: agentDirectory,
    });

    expect(await core.coreTools.read_memory_block('human')).toBe('legacy preference');
    expect(await core.coreTools.core_memory_append('human', 'new preference')).toContain('legacy read-only');
    expect(await core.coreTools.core_memory_replace('human', 'legacy', 'new')).toContain('legacy read-only');
    expect(core.memory.getBlock('human')?.value).toBe('legacy preference');
  });

  it('keeps legacy construction compatible without guessing cognition ownership', () => {
    const core = new MemoryCore(path.join(dataRoot, 'legacy-agent'));
    expect(core.ownership).toBeNull();
    expect(core.userCognition).toBeNull();
    expect(core.ownerCognition).toBeNull();
  });

  it('reads materialized cognition snapshots into the prompt in fixed order', async () => {
    const agentDirectory = path.join(dataRoot, 'agents', 'role-2');
    const core = new MemoryCore({
      ownerScope: 'agent',
      ownerId: 'role-2',
      userId: 'default',
      dataRoot,
      workingDirectory: agentDirectory,
      ownerDirectory: agentDirectory,
    });
    const evidence = { id: 'confirmed', source: 'user_confirmation' as const, sourceId: 's1', excerpt: '简洁回答', observedAt: '2026-09-09T00:00:00.000Z' };
    core.userCognition?.retain({ kind: 'observation', content: '用户偏好简洁回答', status: 'active', evidence });
    core.ownerCognition?.retain({ kind: 'world_fact', content: '领域使用事件驱动架构', status: 'active', evidence: { ...evidence, id: 'domain-fact' } });
    const snapshots = new MentalModelStore();
    snapshots.refreshUserProfile(core.userCognition!);
    snapshots.refreshWorldModel(core.ownerCognition!);

    const prompt = await new MemoryProvider(core).system_prompt_block();

    expect(prompt.indexOf('<global_user_profile')).toBeLessThan(prompt.indexOf('<owner_world_model'));
    expect(prompt.indexOf('<owner_world_model')).toBeLessThan(prompt.indexOf('<memory_blocks>'));
    expect(prompt).toContain('用户偏好简洁回答');
    expect(prompt).toContain('领域使用事件驱动架构');
  });

  it('materializes explicit user preferences into the global user profile without LLM instructions', async () => {
    const agentDirectory = path.join(dataRoot, 'agents', 'architect');
    const core = new MemoryCore({
      ownerScope: 'agent',
      ownerId: 'architect',
      userId: 'default',
      dataRoot,
      workingDirectory: agentDirectory,
      ownerDirectory: agentDirectory,
      sessionId: 'atlas-session',
    });
    const context = new ObservationPolicyResolver().resolve({
      entryType: 'role-agent',
      sessionId: 'atlas-session',
      agentId: 'architect',
    });
    const provider = new MemoryProvider(core, 'atlas-session', undefined, {
      context,
      consumers: {},
    });
    await provider.sync_turn({
      turnNumber: 1,
      userMessage: '请记住：我偏好简洁回答，示例优先使用 TypeScript。',
      assistantMessage: '已记住。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now(),
    });
    await provider.sync_turn({
      turnNumber: 2,
      userMessage: '这个偏好长期有效。',
      assistantMessage: '明白。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now() + 1,
    });

    await provider.on_session_end([]);

    const profile = new MentalModelStore().read(core.userCognition!, 'user-profile');
    expect(profile?.data.content).toContain('TypeScript');
    expect(core.userCognition?.list().some((record) =>
      record.scope === 'user' && record.status === 'active' && record.content.includes('TypeScript')
    )).toBe(true);
    expect(core.ownerCognition?.list().some((record) => record.content.includes('TypeScript'))).toBe(false);
  });
});

describe('CoreMemoryTools (M.5)', () => {
  let dir: string;
  let core: MemoryCore;

  beforeEach(() => {
    dir = makeTestDir();
    core = new MemoryCore(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('appends to a block', async () => {
    const result = await core.coreTools.core_memory_append('human', 'user likes dark mode');
    expect(result).toContain('appended successfully');
    expect(core.memory.getBlock('human')!.value).toBe('user likes dark mode');
  });

  it('replaces content in a block', async () => {
    await core.coreTools.core_memory_append('human', 'old preference');
    const result = await core.coreTools.core_memory_replace('human', 'old', 'new');
    expect(result).toContain('replaced successfully');
    expect(core.memory.getBlock('human')!.value).toBe('new preference');
  });

  it('returns error for non-existent block', async () => {
    const result = await core.coreTools.core_memory_append('nonexistent', 'content');
    expect(result).toContain('Error');
  });

  it('returns error for read-only block', async () => {
    const result = await core.coreTools.core_memory_append('temporal', 'content');
    expect(result).toContain('read-only');
  });

  it('returns error when exceeding limit', async () => {
    const block = core.memory.getBlock('scratchpad')!;
    const tooLong = 'x'.repeat(block.limit + 1);
    await core.coreTools.core_memory_append('scratchpad', 'start');
    const result = await core.coreTools.core_memory_replace('scratchpad', 'start', tooLong);
    expect(result).toContain('exceeds');
  });

  it('inserts a new block', async () => {
    const result = await core.coreTools.insert_memory_block('custom', 'value', 'my block', 500);
    expect(result).toContain('created successfully');
    expect(core.memory.getBlock('custom')).not.toBeNull();
  });

  it('returns error for duplicate block', async () => {
    await core.coreTools.insert_memory_block('custom', 'value');
    const result = await core.coreTools.insert_memory_block('custom', 'other');
    expect(result).toContain('already exists');
  });

  it('reads a block', async () => {
    await core.coreTools.core_memory_append('human', 'test data');
    const result = await core.coreTools.read_memory_block('human');
    expect(result).toBe('test data');
  });

  it('returns error for reading non-existent block', async () => {
    const result = await core.coreTools.read_memory_block('nope');
    expect(result).toContain('Error');
  });
});

describe('ArchivalMemoryTools (M.5)', () => {
  let dir: string;
  let core: MemoryCore;

  beforeEach(() => {
    dir = makeTestDir();
    core = new MemoryCore(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('inserts and returns save message', async () => {
    const result = await core.archivalTools.archival_memory_insert('remember this', ['important']);
    expect(result).toContain('saved');
  });

  it('searches and formats results', async () => {
    await core.archivalTools.archival_memory_insert('Python is great');
    await core.archivalTools.archival_memory_insert('JavaScript is also good');
    const result = await core.archivalTools.archival_memory_search('programming language');
    expect(result).toContain('Found');
  });

  it('returns not found for empty search', async () => {
    const result = await core.archivalTools.archival_memory_search('xyznonexistent123');
    expect(result).toContain('No relevant');
  });
});

describe('MemoryProvider (M.6)', () => {
  let dir: string;
  let provider: MemoryProvider;

  beforeEach(() => {
    dir = makeTestDir();
    provider = new MemoryProvider(dir);
    completeResponse = '[SKIP]';
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('has correct name', () => {
    expect(provider.name).toBe('memory');
  });

  it('system_prompt_block returns xml', async () => {
    const block = await provider.system_prompt_block();
    expect(block).toContain('<memory_blocks>');
  });

  it('sync_turn records to recall memory', async () => {
    await provider.sync_turn({
      turnNumber: 1,
      userMessage: 'hello',
      assistantMessage: 'hi there',
      assistantThinking: 'let me think',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now(),
    });
    const entries = (provider.recallMemory as any).entries;
    expect(entries.length).toBeGreaterThan(0);
  });

  it('sync_turn does not append transient turn data into Memory.md blocks', async () => {
    const before = await provider.system_prompt_block();

    await provider.sync_turn({
      turnNumber: 1,
      userMessage: '这是一次临时计划，不应该直接进入长期记忆。',
      assistantMessage: '收到。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now(),
    });

    const after = await provider.system_prompt_block();
    expect(after).toBe(before);
    expect(after).not.toContain('这是一次临时计划');
  });

  it('prefetch returns null when empty', async () => {
    const result = await provider.prefetch('anything');
    // With TF-IDF fallback, empty results should return null
    expect(result).toBeNull();
  });

  it('prefetch returns results after sync_turn', async () => {
    await provider.sync_turn({
      turnNumber: 1,
      userMessage: 'How to use React hooks',
      assistantMessage: 'useState and useEffect',
      assistantThinking: 'thinking',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now(),
    });
    const result = await provider.prefetch('React hooks');
    // With TF-IDF keyword search, "React" and "hooks" should match
    expect(result).not.toBeNull();
    expect(result).toContain('React');
  });

  it('on_session_end caches consolidation result', async () => {
    completeResponse = '- [UPDATE:human] 用户以后都偏好简洁回答';
    await provider.sync_turn({
      turnNumber: 1,
      userMessage: '以后都请用简洁回答。',
      assistantMessage: '好的，我会保持简洁。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now(),
    });
    await provider.sync_turn({
      turnNumber: 2,
      userMessage: '这个偏好长期有效。',
      assistantMessage: '已记录。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now() + 1,
    });

    const result = await provider.on_session_end([]);
    expect(result).not.toBeNull();
    expect(provider.getLastConsolidation()).toEqual(result);
    expect(result?.stableMemory.length).toBeGreaterThan(0);
  });

  it('prefetch includes stable memory and knowledge candidates from last consolidation', async () => {
    completeResponse = '- [UPDATE:human] 用户以后都偏好简洁回答';
    await provider.sync_turn({
      turnNumber: 1,
      userMessage: '以后都请用简洁回答，并记录 Tesla Factory 的产线规则。',
      assistantMessage: 'Tesla Factory uses a three-shift schedule.',
      assistantThinking: '',
      toolCalls: [
        {
          name: 'read_file',
          params: { path: 'factory.md' },
          result: 'Tesla Factory uses a three-shift schedule and requires badge access.',
          success: true,
        },
      ],
      outcome: { resolved: true, toolChainLength: 1 },
      timestamp: Date.now(),
    });
    await provider.sync_turn({
      turnNumber: 2,
      userMessage: '这些信息以后还要继续用。',
      assistantMessage: '明白。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now() + 1,
    });

    await reachReflectThreshold(provider);
    await provider.on_session_end([]);

    const stableMemoryResult = await provider.prefetch('简洁回答');
    expect(stableMemoryResult).not.toBeNull();
    expect(stableMemoryResult).toContain('Stable Memory');

    const knowledgeResult = await provider.prefetch('Tesla Factory');
    expect(knowledgeResult).not.toBeNull();
    expect(knowledgeResult).toContain('Knowledge Candidates');

    const candidatesPath = path.join(dir, 'knowledge', 'candidates.json');
    expect(fs.existsSync(candidatesPath)).toBe(true);
    const persistedCandidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
    expect(persistedCandidates.length).toBeGreaterThan(0);
  });

  it('queryMemory returns structured buckets', async () => {
    completeResponse = '- [UPDATE:human] 用户以后都偏好简洁回答';
    await provider.sync_turn({
      turnNumber: 1,
      userMessage: '以后都请用简洁回答，并记录 Tesla Factory 的产线规则。',
      assistantMessage: 'Tesla Factory uses a three-shift schedule.',
      assistantThinking: '',
      toolCalls: [
        {
          name: 'read_file',
          params: { path: 'factory.md' },
          result: 'Tesla Factory uses a three-shift schedule and requires badge access.',
          success: true,
        },
      ],
      outcome: { resolved: true, toolChainLength: 1 },
      timestamp: Date.now(),
    });
    await provider.sync_turn({
      turnNumber: 2,
      userMessage: '这些信息以后还要继续用。',
      assistantMessage: '明白。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now() + 1,
    });

    await reachReflectThreshold(provider);
    await provider.on_session_end([]);

    const result = await provider.queryMemory('Tesla Factory');
    expect(result.recent_history.length).toBeGreaterThan(0);
    expect(result.knowledge_candidate.some((item) => item.includes('Tesla Factory'))).toBe(true);

    const stableMemoryResult = await provider.queryMemory('简洁回答');
    expect(stableMemoryResult.stable_memory.some((item) => item.includes('简洁回答'))).toBe(true);
  });

  it('on_session_end forwards knowledge candidates to knowledge consumer', async () => {
    const consumer = {
      ingestCandidates: vi.fn(async () => undefined),
    };
    provider = new MemoryProvider(dir, 'default', consumer);
    completeResponse = '[SKIP]';

    await provider.sync_turn({
      turnNumber: 1,
      userMessage: '记录 Tesla Factory 的产线规则。',
      assistantMessage: 'Tesla Factory uses a three-shift schedule.',
      assistantThinking: '',
      toolCalls: [
        {
          name: 'read_file',
          params: { path: 'factory.md' },
          result: 'Tesla Factory uses a three-shift schedule and requires badge access.',
          success: true,
        },
      ],
      outcome: { resolved: true, toolChainLength: 1 },
      timestamp: Date.now(),
    });
    await provider.sync_turn({
      turnNumber: 2,
      userMessage: 'Tesla Factory 的这些信息以后还会继续用。',
      assistantMessage: '我会继续沿用 Tesla Factory 的规则。',
      assistantThinking: '',
      toolCalls: [],
      outcome: { resolved: true, toolChainLength: 0 },
      timestamp: Date.now() + 1,
    });

    await reachReflectThreshold(provider);
    await provider.on_session_end([]);

    expect(consumer.ingestCandidates).toHaveBeenCalledTimes(1);
    const forwarded = consumer.ingestCandidates.mock.calls[0]?.[0];
    expect(forwarded?.[0]?.entities?.some((entity: { name: string }) => entity.name === 'Tesla Factory')).toBe(true);
  });
});
