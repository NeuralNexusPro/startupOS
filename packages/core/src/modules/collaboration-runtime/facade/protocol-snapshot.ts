import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDataRoot } from '../../../lib/paths';
import { activeProtocolObserver } from '../engine/protocol-observer';
import { Blackboard, type BlackboardState } from '../session/blackboard';
import { AgentTaskSnapshot } from '../session/agent-task-snapshot';
import { getSession } from './session-store';
import type { CollaborationRunSnapshot } from './contract-execution';

/** Pure read projection: reading does not recover/execute WorkItems or rewrite persisted state. */
export async function readRunProtocolSnapshots(dataRoot: string, projectId: string, sessionId: string) {
  const dir = path.join(dataRoot, 'projects', projectId, 'collaboration-runs');
  let files: string[];
  try { files = await fs.readdir(dir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const runs = await Promise.all(files.filter(file => file.endsWith('.json')).map(async file => {
    const run = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8')) as CollaborationRunSnapshot;
    if (run.binding.parentSessionId !== sessionId) return null;
    const terminal = new Set(['completed', 'failed']);
    const latest = new Map<string, typeof run.workItems[number]>();
    for (const item of run.workItems) {
      const previous = latest.get(item.assignedAgentId);
      const timestamp = item.attempts.at(-1)?.updatedAt ?? run.createdAt;
      const previousTimestamp = previous?.attempts.at(-1)?.updatedAt ?? run.createdAt;
      if (terminal.has(item.status) && (!previous || timestamp >= previousTimestamp)) latest.set(item.assignedAgentId, item);
    }
    return {
      runId: run.runId, revision: run.revision, status: run.status, terminalStatus: run.terminalStatus,
      activeTasks: run.workItems.filter(item => !terminal.has(item.status)),
      recentTerminalTasks: [...latest.values()],
    };
  }));
  return runs.filter(run => run !== null);
}

export async function getSessionTaskSnapshot(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) return null;
  const root = getDataRoot();
  const dir = path.join(root, 'projects', session.projectId, 'collaboration-sessions', sessionId);
  const blackboard = activeProtocolObserver(sessionId)?.blackboard
    ?? await Blackboard.loadSnapshot(sessionId, dir)
    ?? new Blackboard(sessionId, dir);
  if (!activeProtocolObserver(sessionId)) {
    try {
      const projection = JSON.parse(await fs.readFile(path.join(dir, 'protocol-observation.json'), 'utf8')) as Pick<BlackboardState, 'tasks' | 'sharedData'>;
      const state = blackboard.toState();
      blackboard.restoreFromState({ ...state, tasks: projection.tasks, sharedData: { ...state.sharedData, ...projection.sharedData } });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const snapshot = await new AgentTaskSnapshot(blackboard, dir).getSnapshot(true);
  return { ...snapshot, memoryIndex: blackboard.memoryIndex, runs: await readRunProtocolSnapshots(root, session.projectId, sessionId) };
}
