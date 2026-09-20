import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SchedulerService } from '../../../../../core/src/modules/scheduler';
import type { ScheduleStore } from '../../../../../core/src/modules/scheduler/schedule-store';
import { DesktopSchedulerService, getNativeNotificationRequest } from '../desktop-scheduler-service';

const memoryStore = (): ScheduleStore => ({
  listTasks: vi.fn(async () => []),
  saveTasks: vi.fn(async () => undefined),
  getTask: vi.fn(async () => undefined),
  appendRun: vi.fn(async () => undefined),
}) as unknown as ScheduleStore;

describe('DesktopSchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses its single timer to dispatch plugin system tasks', async () => {
    const store = memoryStore();
    const scheduler = new SchedulerService(store, undefined, { now: Date.now, random: () => 0 });
    const service = new DesktopSchedulerService(1000, scheduler);
    const callback = vi.fn(async () => undefined);
    service.every('originos.email:mail-a:poll', 1000, callback);

    service.start();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(callback).toHaveBeenCalledOnce();
    expect(store.listTasks).toHaveBeenCalledOnce();
    expect(scheduler.listSystemTasks()[0]).toMatchObject({ ownerId: 'originos.email:mail-a' });
    await service.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('continues system dispatch while a user-task scan is still running', async () => {
    let release!: () => void;
    const store = {
      listTasks: vi.fn(async () => new Promise<never>((resolve) => { release = () => resolve([] as never); })),
    } as unknown as ScheduleStore;
    const scheduler = new SchedulerService(store, undefined, { now: Date.now, random: () => 0 });
    const service = new DesktopSchedulerService(1000, scheduler);
    const callback = vi.fn(async () => undefined);
    service.every('originos.email:mail-a:poll', 1000, callback);

    service.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback).toHaveBeenCalledTimes(2);
    release();
    await service.stop();
  });

  it('keeps user-store scans on their slower cadence', async () => {
    const store = memoryStore();
    const scheduler = new SchedulerService(store, undefined, { now: Date.now });
    const service = new DesktopSchedulerService(1000, scheduler, 3000);

    service.start();
    await vi.advanceTimersByTimeAsync(2999);
    expect(store.listTasks).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.listTasks).toHaveBeenCalledTimes(2);
    await service.stop();
  });

  it('maps visible scheduled actions to native notifications', () => {
    const task = {
      id: 'task-1',
      title: '每日整理',
      status: 'enabled',
      trigger: { type: 'once', runAt: '2026-09-20T10:00:00.000Z' },
      action: { type: 'skill', skillName: '待办整理', prompt: '整理今天的待办' },
      timezone: 'Asia/Shanghai',
      nextRunAt: '2026-09-20T10:00:00.000Z',
      createdAt: '2026-09-20T09:00:00.000Z',
      updatedAt: '2026-09-20T09:00:00.000Z',
    } as const;

    expect(getNativeNotificationRequest(task)).toEqual({
      title: '定时技能任务: 每日整理',
      body: '需要启动技能 待办整理: 整理今天的待办',
      activationTarget: {
        entryType: 'skill',
        entryId: '待办整理',
        title: '待办整理',
        initialMessage: '整理今天的待办',
      },
    });
    expect(getNativeNotificationRequest({ ...task, action: { type: 'system-tool', toolName: 'get_current_time', input: {} } })).toBeNull();
  });
});
