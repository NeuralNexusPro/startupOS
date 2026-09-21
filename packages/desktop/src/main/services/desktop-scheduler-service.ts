import { showNativeSystemNotification, type NativeNotificationRequest } from './native-notification-service';
import {
  DefaultSchedulerActionRunner,
  SchedulerService,
  type ScheduledTask,
  type ScheduledTaskRun,
} from '../../../../core/src/modules/scheduler';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_USER_SCAN_INTERVAL_MS = 30_000;

export class DesktopSchedulerService {
  private readonly scheduler: SchedulerService;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private nextUserScanAt = 0;

  constructor(
    private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    scheduler?: SchedulerService,
    private readonly userScanIntervalMs = DEFAULT_USER_SCAN_INTERVAL_MS
  ) {
    this.scheduler = scheduler ?? new SchedulerService(undefined, new DesktopSchedulerActionRunner());
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.scheduler.startSystemTasks();
    this.nextUserScanAt = 0;
    void this.tick('startup');
    this.timer = setInterval(() => {
      void this.tick('interval');
    }, this.pollIntervalMs);
    this.timer.unref();
    console.log('[DesktopSchedulerService] started', { pollIntervalMs: this.pollIntervalMs });
  }

  async stop(): Promise<void> {
    this.pause();
    await this.scheduler.stopSystemTasks();
    console.log('[DesktopSchedulerService] stopped');
  }

  pause(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.scheduler.pauseSystemTasks();
  }

  every(key: string, intervalMs: number, task: () => Promise<void>): void {
    const parts = key.split(':');
    this.scheduler.registerSystemTask({
      id: key,
      ownerId: parts.length > 1 ? parts.slice(0, -1).join(':') : 'perception-plugin',
      intervalMs,
      callback: task,
      runImmediately: false,
    });
  }

  cancel(key: string): void {
    this.scheduler.cancelSystemTask(key);
  }

  private async tick(reason: 'startup' | 'interval'): Promise<void> {
    const systemCount = this.scheduler.runDueSystemTasks();
    const now = Date.now();
    if (now < this.nextUserScanAt) return;
    if (this.running) {
      if (systemCount > 0) console.log('[DesktopSchedulerService] system tasks dispatched', { reason, count: systemCount });
      return;
    }

    this.running = true;
    this.nextUserScanAt = now + this.userScanIntervalMs;
    try {
      const runs = await this.scheduler.runDueTasks();
      if (runs.length > 0) {
        console.log('[DesktopSchedulerService] due tasks executed', {
          reason,
          count: runs.length,
          runs: runs.map(summarizeRun),
        });
      }
    } catch (error) {
      console.error('[DesktopSchedulerService] failed to run due tasks', error);
    } finally {
      this.running = false;
    }
  }
}

class DesktopSchedulerActionRunner extends DefaultSchedulerActionRunner {
  override async run(task: ScheduledTask): Promise<unknown> {
    const result = await super.run(task);
    const request = getNativeNotificationRequest(task);
    if (!request) {
      return result;
    }

    const nativeNotification = await showNativeSystemNotification(request);

    return {
      ...(result as Record<string, unknown>),
      nativeNotification,
    };
  }
}

export function getNativeNotificationRequest(task: ScheduledTask): NativeNotificationRequest | null {
  if (task.action.type === 'system' && task.action.command === 'notify') {
    const payload = task.action.payload ?? {};
    return {
      title: task.title,
      body: typeof payload['message'] === 'string' ? payload['message'] : task.title,
      activationTarget: payload['activationTarget'],
    };
  }
  if (task.action.type === 'agent') {
    return {
      title: `定时角色任务: ${task.title}`,
      body: `需要启动角色 ${task.action.agentName}: ${task.action.prompt}`,
      activationTarget: {
        entryType: 'agent',
        entryId: task.action.agentName,
        title: task.action.agentName,
        initialMessage: task.action.prompt,
      },
    };
  }
  if (task.action.type === 'skill') {
    return {
      title: `定时技能任务: ${task.title}`,
      body: `需要启动技能 ${task.action.skillName}${task.action.prompt ? `: ${task.action.prompt}` : ''}`,
      activationTarget: {
        entryType: 'skill',
        entryId: task.action.skillName,
        title: task.action.skillName,
        ...(task.action.prompt ? { initialMessage: task.action.prompt } : {}),
      },
    };
  }
  return null;
}

function summarizeRun(run: ScheduledTaskRun): Record<string, string> {
  return {
    id: run.id,
    taskId: run.taskId,
    status: run.status,
    actionType: run.actionType,
  };
}
