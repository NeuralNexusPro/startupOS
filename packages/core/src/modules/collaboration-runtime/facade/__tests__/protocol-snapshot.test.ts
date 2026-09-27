import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ root: '' }));
vi.mock('../../../../lib/paths', () => ({ getDataRoot: () => state.root }));
vi.mock('../session-store', () => ({ getSession: async (id: string) => id === 's' ? { projectId: 'p' } : null }));
import { getSessionTaskSnapshot } from '../protocol-snapshot';
import { Blackboard } from '../../session/blackboard';
import { ProtocolObserver } from '../../engine/protocol-observer';

describe('restored read-only protocol snapshots', () => {
  it('returns null for unknown session', async () => { expect(await getSessionTaskSnapshot('missing')).toBeNull(); });
  it('restores 10 agents under 100ms and latest terminal by timestamp without executing or writing', async () => {
    state.root = await mkdtemp(path.join(tmpdir(), 's936-snapshot-'));
    const dir = path.join(state.root, 'projects/p/collaboration-sessions/s');
    const bb = new Blackboard('s', dir);
    for (let index = 0; index < 10; index++) { const task = bb.createTask('work'); bb.assignTask(task.id, `a${index}`); bb.startTask(task.id); }
    const observer = new ProtocolObserver(bb, 'supervisor', dir);
    observer.start(); await observer.close();
    const runDir = path.join(state.root, 'projects/p/collaboration-runs');
    await mkdir(runDir, { recursive: true });
    const runFile = path.join(runDir, 'r.json');
    const contents = JSON.stringify({ runId: 'r', projectId: 'p', binding: { parentSessionId: 's' }, createdAt: '2026-01-01', revision: 3, status: 'paused', workItems: [
      { id: 'latest', assignedAgentId: 'a0', status: 'completed', attempts: [{ updatedAt: '2026-09-20' }] },
      { id: 'older', assignedAgentId: 'a0', status: 'completed', attempts: [{ updatedAt: '2026-09-19' }] },
      { id: 'reported', assignedAgentId: 'a1', status: 'reported', attempts: [{ updatedAt: '2026-09-21' }] },
    ] });
    await writeFile(runFile, contents);
    const before = performance.now();
    const restored = await getSessionTaskSnapshot('s');
    expect(performance.now() - before).toBeLessThan(100);
    expect(restored?.agents).toHaveLength(10);
    expect(restored?.runs[0]?.recentTerminalTasks.map(item => item.id)).toEqual(['latest']);
    expect(restored?.runs[0]?.activeTasks[0]?.status).toBe('reported');
    expect(await readFile(runFile, 'utf8')).toBe(contents);
  });
});
