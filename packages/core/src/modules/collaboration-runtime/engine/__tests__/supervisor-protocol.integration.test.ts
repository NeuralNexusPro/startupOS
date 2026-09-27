import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type { RuntimeEvent } from '../../session/types';

const state = vi.hoisted(() => ({ root: '', callbacks: new Map<string, (event: RuntimeEvent) => void>(), results: new Map<string, (value: string) => void>(), gate: null as Promise<void> | null }));
vi.mock('@originos/pi-agent-adapter/ai', () => ({ streamSimple: async function* () { if (state.gate) await state.gate; yield { type: 'text_delta', delta: '{"passed":true,"reasoning":"verified"}' }; } }));
vi.mock('../../../../lib/paths', () => ({ getDataRoot: () => state.root }));
vi.mock('../../sandbox', () => ({
  getGlobalSpawner: () => ({
    spawn: vi.fn(async (config: { agentId: string }, callback: (event: RuntimeEvent) => void) => {
      state.callbacks.set(config.agentId, callback);
      return { prompt: async () => {}, resume: async () => {}, sendToolResult: (id: string, value: string) => state.results.get(id)?.(value) };
    }),
    get: () => ({ sendToolResult: (id: string, value: string) => state.results.get(id)?.(value), resume: async () => {} }),
    destroy: async () => {},
  }),
}));
import { executeSupervisorDag, resumeSupervisorHitl } from '../supervisor-dag';
import { activeProtocolObserver, stopProtocolObserver } from '../protocol-observer';
import { Blackboard } from '../../session/blackboard';

function emit(agentId: string, type: RuntimeEvent['type'], payload: Record<string, unknown> = {}) {
  state.callbacks.get(agentId)!({ id: Math.random().toString(), sessionId: 's', seq: 0, type, source: agentId, payload, timestamp: new Date().toISOString() });
}
async function command(name: string, args: Record<string, unknown>) {
  const id = Math.random().toString();
  const response = new Promise<string>(resolve => state.results.set(id, resolve));
  emit('supervisor-s', 'SUPERVISOR_TOOL_CALL', { toolCallId: id, toolName: name, args });
  return JSON.parse(await response) as Record<string, unknown>;
}
async function start(parallel = false) {
  const dir = path.join(state.root, 'projects/p/solutions/v1.0');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'agents.json'), JSON.stringify({ agents: ['a', 'b', 'c'].map((id, i) => ({ id, name: id, skills: [], responsibility: id, businessDomain: 'test', collaborations: !parallel && i < 2 ? [{ targetAgentId: ['b', 'c'][i], type: 'trigger' }] : [] })) }));
  const running = executeSupervisorDag({ projectId: 'p', sessionId: 's', globalGoal: 'test', modelFactory: { createAutoModel: () => ({}) } }, { append: async () => {} } as never);
  await vi.waitFor(() => expect(state.callbacks.has('supervisor-s')).toBe(true));
  return { running };
}
describe('production Supervisor protocol', () => {
  beforeEach(async () => { state.root = await mkdtemp(path.join(tmpdir(), 's936-production-')); state.callbacks.clear(); state.results.clear(); state.gate = null; });
  afterEach(async () => { await stopProtocolObserver('s', true); vi.useRealTimers(); });

  it('gates three-agent chain on verified completion and persists reported state', async () => {
    const { running } = await start();
    expect((await command('dispatch_worker', { workerId: 'b' })).status).toBe('blocked');
    expect(state.callbacks.has('b')).toBe(false);
    for (const id of ['a', 'b', 'c']) {
      expect((await command('dispatch_worker', { workerId: id })).status).toBe('dispatched');
      emit(id, 'AGENT_END', { content: 'saved', messages: [{ role: 'assistant', content: [{ type: 'toolCall', name: 'write', arguments: { path: 'file' } }] }] });
      const observer = activeProtocolObserver('s')!;
      expect(observer.blackboard.getTasks().find(task => task.assignedTo === id)?.status).toBe('reported');
      if (id === 'a') expect((await command('dispatch_worker', { workerId: 'b' })).status).toBe('blocked');
      const verified = await command('run_verifier', { workerId: id });
      expect(verified.passed).toBe(true);
    }
    emit('supervisor-s', 'AGENT_END');
    expect((await running).completedAgents).toEqual(['a', 'b', 'c']);
    expect(activeProtocolObserver('s')).toBeUndefined();
    const recovered = new Blackboard('s', 'unused');
    const projection = JSON.parse(await readFile(path.join(state.root, 'projects/p/collaboration-sessions/s/protocol-observation.json'), 'utf8'));
    recovered.restoreFromState({ ...recovered.toState(), ...projection });
    expect(recovered?.getTasks().filter(task => task.status === 'completed')).toHaveLength(3);
    expect(recovered?.memoryIndex.supervisor?.status).toBeDefined();
  });

  it('runs three independent workers and cancels every observation timer', async () => {
    const { running } = await start(true);
    for (const id of ['a', 'b', 'c']) await command('dispatch_worker', { workerId: id });
    vi.useFakeTimers();
    // Restart in fake clock to observe lifecycle without touching real worker effects.
    const observer = activeProtocolObserver('s')!;
    observer.start();
    for (const id of ['a', 'b', 'c']) observer.worker(id).updateProgress({ currentStep: 'working' });
    expect(vi.getTimerCount()).toBe(6);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(observer.blackboard.memoryIndex.supervisor?.report).toBeDefined();
    await stopProtocolObserver('s', true);
    await running;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('ignores an old verifier result after redispatch and accepts only the new task', async () => {
    const { running } = await start(true);
    await command('dispatch_worker', { workerId: 'a' });
    emit('a', 'AGENT_END', { content: 'first', messages: [{ role: 'assistant', content: [{ type: 'text', text: 'first' }] }] });
    let release!: () => void;
    state.gate = new Promise<void>(resolve => { release = resolve; });
    const stale = command('run_verifier', { workerId: 'a' });
    await command('dispatch_worker', { workerId: 'a' });
    emit('a', 'AGENT_END', { content: 'second', messages: [{ role: 'assistant', content: [{ type: 'text', text: 'second' }] }] });
    release();
    expect((await stale).reason).toBe('STALE_VERIFICATION');
    state.gate = null;
    expect((await command('run_verifier', { workerId: 'a' })).passed).toBe(true);
    emit('supervisor-s', 'AGENT_END');
    expect((await running).status).toBe('completed');
  });

  it('pauses all periodic work for HITL and resumes still-active workers', async () => {
    const { running } = await start(true);
    await command('dispatch_worker', { workerId: 'a' });
    await command('dispatch_worker', { workerId: 'b' });
    const observer = activeProtocolObserver('s')!;
    vi.useFakeTimers();
    observer.start();
    emit('a', 'HITL_ESCALATE', { question: 'Continue?' });
    expect(vi.getTimerCount()).toBe(0);
    expect(resumeSupervisorHitl('s', 'yes', 'a')).toBe(true);
    expect(vi.getTimerCount()).toBe(5);
    expect(observer.blackboard.getDataEntry('swarm$worker-a$blocked')).toBeUndefined();
    await stopProtocolObserver('s', true); await running;
    expect(vi.getTimerCount()).toBe(0);
  });

});
