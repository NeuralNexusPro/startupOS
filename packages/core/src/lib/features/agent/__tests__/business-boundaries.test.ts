import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { AgentManager } from '../../../integrations/pi-agent/agent-manager';
import { PersistentAgent, type PersistentAgentConfig } from '../../../integrations/pi-agent/persistent-agent';
import { createPiAgentStore } from '../../../integrations/pi-agent/store';
import { initializeBuiltInTools, getToolRegistry, getAgentToolsForScope, createOwnedCognitiveProviders } from '../server';
import { ObservationPolicyResolver } from '../../../../modules/memory-core';
import { getToolContextManager } from '../../../integrations/pi-agent/tools/context';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-business-boundaries-'));
  vi.stubEnv('DATA_ROOT', directory);
  getToolContextManager().setDefaultContext({ workingDirectory: directory });
});
afterEach(() => {
  getToolContextManager().setDefaultContext({});
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('agent business composition', () => {
  it('fails explicitly when runtime business dependencies are absent', async () => {
    await expect(new AgentManager().getOrCreateAgent('missing', 'project')).rejects.toThrow('business dependencies');
    expect(() => new PersistentAgent({} as PersistentAgentConfig)).toThrow('business dependencies');
  });

  it('registers the complete collection once and retains scope and input contracts', async () => {
    initializeBuiltInTools();
    const registry = getToolRegistry();
    const initial = registry.getAll().map(tool => tool.name).sort();
    initializeBuiltInTools();
    expect(registry.getAll().map(tool => tool.name).sort()).toEqual(initial);
    expect(new Set(initial).size).toBe(initial.length);
    expect(initial).toEqual(expect.arrayContaining(['read_document', 'read_spreadsheet', 'create_domain', 'create_instance', 'schedule_task', 'run_schedule_now']));
    expect(getAgentToolsForScope('worker').some(tool => tool.name === 'create_domain')).toBe(false);
    expect(getAgentToolsForScope('project').some(tool => tool.name === 'create_domain')).toBe(true);
    const ontology = registry.getAll().find(tool => tool.name === 'query_ontology')!;
    expect(Value.Check(ontology.parameters, { ontologyId: '' })).toBe(false);
    const result = await ontology.execute('invalid-path', { ontologyId: '../escape' });
    expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('false') })]));
    const schedule = registry.getAll().find(tool => tool.name === 'schedule_task')!;
    const hostile = { title: 'unsafe', trigger: { type: 'interval', everyMs: 1 }, action: { type: 'shell', command: 'echo unsafe' } };
    expect(Value.Check(schedule.parameters, hostile)).toBe(false);
    expect((await schedule.execute('unsafe', hostile)).details).toMatchObject({ ok: false });
  });

  it('uses the real document capability and rejects paths outside its boundary', async () => {
    initializeBuiltInTools();
    fs.writeFileSync(path.join(directory, 'sample.md'), '# business tool smoke');
    const tool = getToolRegistry().getAll().find(candidate => candidate.name === 'read_document')!;
    const result = await tool.execute('read', { filePath: 'sample.md' });
    expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('business tool smoke') })]));
    expect((await tool.execute('escape', { filePath: '../outside.md' })).details).toMatchObject({ error: true });
  });

  it('keeps concurrent owners separate across writes, flush and reload', async () => {
    const create = (id: string) => createOwnedCognitiveProviders({
      ownerScope: 'project', ownerId: id, userId: 'default', dataRoot: directory,
      workingDirectory: path.join(directory, 'projects', id), sessionId: `session-${id}`,
    }, new ObservationPolicyResolver().resolve({ entryType: 'project', projectId: id, sessionId: `session-${id}` }));
    await Promise.all(['a', 'b'].map(async id => {
      const bundle = create(id);
      bundle.memoryCore.memory.appendBlock('project', `private-${id}`);
      await bundle.memoryProvider.sync_turn({ turnNumber: 1, userMessage: `request-${id}`, assistantMessage: `reply-${id}`, assistantThinking: '', toolCalls: [], outcome: { resolved: true, toolChainLength: 0 }, timestamp: Date.now() });
      await bundle.memoryProvider.on_session_end([]);
    }));
    for (const id of ['a', 'b']) {
      const prompt = await create(id).memoryProvider.system_prompt_block();
      expect(prompt).toContain(`private-${id}`);
      expect(prompt).not.toContain(`private-${id === 'a' ? 'b' : 'a'}`);
    }
  });

  it('asks the injected tool initializer on local store initialization', async () => {
    const initialize = vi.fn(() => { throw new Error('business setup unavailable'); });
    const store = createPiAgentStore(initialize);
    await expect(store.getState().initialize('local', { projectId: 'p' }, {})).rejects.toThrow('business setup unavailable');
    expect(initialize).toHaveBeenCalledOnce();
  });
});
