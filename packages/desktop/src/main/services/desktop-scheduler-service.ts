import {
  DefaultSchedulerActionRunner,
  SchedulerService,
  type ScheduledTask,
  type ScheduledTaskRun,
} from '../../../../core/src/modules/scheduler';
import { getNotificationManager, NotificationType } from '../../../../core/src/lib/integrations/pi-agent/notification-system';
import { showNativeSystemNotification } from './native-notification-service';

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
    if (task.action.type !== 'system' || task.action.command !== 'notify') {
      return super.run(task);
    }

    const payload = task.action.payload ?? {};
    const message = typeof payload['message'] === 'string' ? payload['message'] : task.title;
    const notification = await getNotificationManager().createNotification(
      NotificationType.SYSTEM_MESSAGE,
      task.title,
      message,
      { scheduleTaskId: task.id, ...payload }
    );
    const nativeNotification = await showNativeSystemNotification({
      title: task.title,
      body: message,
      activationTarget: payload['activationTarget'],
    });

    return {
      handled: true,
      command: task.action.command,
      notificationId: notification.id,
      nativeNotification,
    };
  }
}

function summarizeRun(run: ScheduledTaskRun): Record<string, string> {
  return {
    id: run.id,
    taskId: run.taskId,
    status: run.status,
    actionType: run.actionType,
  };
}
