import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SupervisorHeartbeat } from './supervisor-heartbeat';
import { WorkerProgressReporter } from '../sandbox/worker-progress-reporter';
import type { Blackboard } from '../session/blackboard';

/** Host-owned observations. Never accepts a WorkItem or commits a business outcome. */
export class ProtocolObserver {
  private readonly heartbeat: SupervisorHeartbeat;
  private readonly workers = new Map<string, WorkerProgressReporter>();
  private persistence: Promise<void> = Promise.resolve();
  private flushTimer?: ReturnType<typeof setInterval>;
  private closed = false;
  onCancel?: () => void;
  get isClosed(): boolean { return this.closed; }

  constructor(readonly blackboard: Blackboard, supervisorId: string, private readonly observationDir: string) {
    this.heartbeat = new SupervisorHeartbeat(blackboard, supervisorId);
  }

  start(): void {
    if (this.closed) return;
    this.heartbeat.start();
    for (const worker of this.workers.values()) worker.resumeHeartbeat();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => this.persist(), 15_000);
    this.flushTimer.unref?.();
  }

  worker(id: string): WorkerProgressReporter {
    let reporter = this.workers.get(id);
    if (!reporter) {
      reporter = new WorkerProgressReporter(this.blackboard, id);
      this.workers.set(id, reporter);
    }
    return reporter;
  }

  pause(): void {
    this.heartbeat.stop();
    for (const worker of this.workers.values()) worker.stopHeartbeat();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = undefined;
    this.persist();
  }

  persist(): void {
    this.persistence = this.persistence.then(async () => {
      const state = this.blackboard.toState();
      const projection = { sessionId: state.sessionId, tasks: state.tasks, sharedData: Object.fromEntries(Object.entries(state.sharedData).filter(([key]) => key.startsWith("swarm$"))) };
      await fs.mkdir(this.observationDir, { recursive: true });
      const temporary = path.join(this.observationDir, `protocol.${randomUUID()}.tmp`);
      await fs.writeFile(temporary, JSON.stringify(projection), "utf8");
      await fs.rename(temporary, path.join(this.observationDir, "protocol-observation.json"));
    }).catch(() => {
      // Observability persistence failure cannot retry business effects.
      console.error('[collaboration-protocol] observation persistence failed');
    });
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.pause();
    }
    await this.persistence;
  }
}

const observers = new Map<string, ProtocolObserver>();
export function activeProtocolObserver(sessionId: string): ProtocolObserver | undefined {
  return observers.get(sessionId);
}
export async function registerProtocolObserver(observer: ProtocolObserver): Promise<void> {
  if (observers.has(observer.blackboard.sessionId)) throw new Error("SESSION_ALREADY_EXECUTING");
  observers.set(observer.blackboard.sessionId, observer);
}
export async function stopProtocolObserver(sessionId: string, cancel = false, expected?: ProtocolObserver): Promise<void> {
  const observer = observers.get(sessionId);
  if (expected && expected !== observer) return;
  observers.delete(sessionId);
  if (cancel) observer?.onCancel?.();
  await observer?.close();
}
