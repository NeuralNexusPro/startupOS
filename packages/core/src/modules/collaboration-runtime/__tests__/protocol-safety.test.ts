import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Blackboard } from '../session/blackboard';
import { DependencyChecker } from '../engine/dependency-checker';
import { ProtocolObserver } from '../engine/protocol-observer';
import { WorkerProgressReporter } from '../sandbox/worker-progress-reporter';
import { AgentTaskSnapshot } from '../session/agent-task-snapshot';
import { CapabilityMatcher } from '../engine/capability-matcher';

describe('protocol safety boundaries', () => {
  it('rejects missing, reported and wrong-writer outputs until accepted', () => {
    const bb = new Blackboard('s', 'unused');
    const a = bb.createTask('upstream');
    bb.assignTask(a.id, 'a'); bb.startTask(a.id); bb.reportTask(a.id, 'result');
    const dependent = bb.createTask('downstream', ['absent']); bb.assignTask(dependent.id, 'b');
    const checker = new DependencyChecker(bb);
    expect(checker.checkDependencies(checker.deriveDependenciesFromDag('b', bb.getTasks())).satisfied).toBe(false);
    expect(checker.checkDependencies([{ agentId: 'a' }]).satisfied).toBe(false);
    bb.acceptTask(a.id);
    expect(checker.checkDependencies([{ agentId: 'a', outputKey: 'output' }]).satisfied).toBe(false);
    bb.setData('output', 'wrong', 'intruder');
    expect(checker.checkDependencies([{ agentId: 'a', outputKey: 'output' }]).satisfied).toBe(false);
    bb.setData('output', 'right', 'a');
    expect(checker.checkDependencies([{ agentId: 'a', outputKey: 'output' }]).satisfied).toBe(true);
  });

  it('observation flush cannot overwrite artifacts committed by a worker', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 's936-artifacts-'));
    const host = new Blackboard('s', dir);
    await host.snapshot();
    const worker = (await Blackboard.loadSnapshot('s', dir))!;
    worker.addArtifact('document', 'a', { content: 'saved' });
    await worker.snapshot();
    const original = await readFile(path.join(dir, 'blackboard.json'), 'utf8');
    const observer = new ProtocolObserver(host, 'supervisor', dir);
    observer.start();
    await observer.close();
    expect(await readFile(path.join(dir, 'blackboard.json'), 'utf8')).toBe(original);
    expect((await Blackboard.loadSnapshot('s', dir))?.getArtifact('document')).toBeDefined();
  });

  it('ranks identical capabilities by observed load without fabricated CPU metrics', () => {
    const matcher = new CapabilityMatcher();
    const ranked = matcher.match({ description: 'work' }, [
      { agentId: 'busy', skills: [], capabilities: [], currentLoad: 3, successRate: 1 },
      { agentId: 'idle', skills: [], capabilities: [], currentLoad: 0, successRate: 1 },
    ]);
    expect(ranked[0]?.agentId).toBe('idle');
  });
  it('gates depend edges and removes stale blockers after resume and report', async () => {
    const bb = new Blackboard('s', 'unused');
    const a = bb.createTask('upstream'); bb.assignTask(a.id, 'a'); bb.startTask(a.id);
    const checker = new DependencyChecker(bb);
    const deps = checker.deriveDependenciesFromTopology('b', { edges: [{ from: 'a', to: 'b', type: 'depend' }] } as never);
    expect(deps).toHaveLength(1);
    expect(checker.checkDependencies(deps).satisfied).toBe(false);
    bb.reportTask(a.id, 'output');
    expect(checker.checkDependencies(deps).satisfied).toBe(false);
    bb.acceptTask(a.id);
    expect(checker.checkDependencies(deps).satisfied).toBe(true);
    const b = bb.createTask('downstream'); bb.assignTask(b.id, 'b'); bb.startTask(b.id);
    const reporter = new WorkerProgressReporter(bb, 'b');
    reporter.startTask(b.id, 1000); reporter.reportBlock('human-input', []);
    expect((await new AgentTaskSnapshot(bb, '').getSnapshot()).agents.find(agent => agent.agentId === 'b')?.blockedStatus).toBeDefined();
    reporter.updateProgress({ currentStep: 'resumed' });
    expect((await new AgentTaskSnapshot(bb, '').getSnapshot()).agents.find(agent => agent.agentId === 'b')?.blockedStatus).toBeUndefined();
    reporter.completeTask({ files: [] });
    expect(bb.getDataEntry('swarm$worker-b$blocked')).toBeUndefined();
  });

});
