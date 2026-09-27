import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { CollaborationRunSnapshot } from './contract-execution';

export interface RunObservation {
  runId: string;
  runRevision: number;
  observedAt: string;
  phase: 'status' | 'report' | 'progress' | 'settled';
  tasks: Array<{ id: string; agentId: string; status: string; outputRefs: readonly string[] }>;
}

/** A read-only projection of the authoritative ledger. Observation failures never retry execution. */
export class RunObserver {
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  constructor(private readonly dataRoot: string, private readonly hostId: string, private readonly read: () => Promise<CollaborationRunSnapshot>) {}

  start(): void {
    this.record('status');
    for (const [phase, interval] of [['status', 60_000], ['report', 120_000], ['progress', 45_000]] as const) {
      const timer = setInterval(() => this.record(phase), interval);
      timer.unref?.();
      this.timers.push(timer);
    }
  }

  checkpoint(): void { this.record("status"); }

  private record(phase: RunObservation['phase']): void {
    if (this.stopped) return;
    this.queue = this.queue.then(async () => {
      if (this.stopped && phase !== 'settled') return;
      const run = await this.read();
      if (phase !== 'settled' && (this.stopped || run.status !== 'running' || run.terminalStatus)) {
        for (const timer of this.timers) clearInterval(timer);
        this.timers.length = 0;
        return;
      }
      const observation: RunObservation = {
        runId: run.runId, runRevision: run.revision, observedAt: new Date().toISOString(), phase,
        tasks: run.workItems.map(item => ({ id: item.id, agentId: item.assignedAgentId, status: item.status, outputRefs: item.outputRefs })),
      };
      const dir = path.join(this.dataRoot, 'projects', run.projectId, 'collaboration-observations', run.runId, createHash('sha256').update(this.hostId).digest('hex'));
      await fs.mkdir(dir, { recursive: true });
      const temporary = path.join(dir, `${phase}.${randomUUID()}.tmp`);
      await fs.writeFile(temporary, JSON.stringify(observation), 'utf8');
      await fs.rename(temporary, path.join(dir, `${phase}.json`));
    }).catch(() => { console.error('[collaboration-protocol] run observation failed'); });
  }

  async stop(): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
    if (!this.stopped) this.record('settled');
    this.stopped = true;
    await this.queue;
  }
}
