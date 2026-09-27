/**
 * WorkerProgressReporter — Worker 强制进度汇报协议
 *
 * 借鉴 Ruflo 的 worker-specialist，每 30-60 秒必须汇报进度，
 * 否则视为异常。支持依赖检测和阻塞报告。
 *
 * 参考 Ruflo worker-specialist:
 * - 接受任务时立即写入 swarm$worker-[ID]$status
 * - 每个显著步骤更新 swarm$worker-[ID]$progress
 * - 依赖缺失时写入 swarm$worker-[ID]$blocked
 * - 完成时写入 swarm$worker-[ID]$complete
 */

import type { Blackboard } from "../session/blackboard";
import {
  buildWorkerKey,
  MemoryKeyCategory,
} from "../session/memory-keys";

export interface WorkerProgress {
  taskId: string;
  stepsCompleted: string[];
  currentStep: string;
  progressPercentage: number;
  blockers: string[];
  filesModified: string[];
  estimatedCompletion: number; // timestamp
  resourcesUsed?: {
    memoryMb: number;
    cpuPercentage: number;
  };
}

export interface WorkerStatus {
  agent: string;
  status: "idle" | "task-received" | "executing" | "blocked" | "reported" | "completed" | "failed";
  assignedTask?: string;
  assignedAt?: number;
  estimatedCompletion?: number;
  dependencies: string[];
  timestamp: number;
}

export interface WorkerCompleted {
  status: "reported";
  task: string;
  deliverables: {
    files: string[];
    documentation?: string;
    testResults?: string;
    metrics?: {
      totalFilesModified: number;
      totalLinesModified: number;
      toolsCalled: number;
    };
  };
  timeTakenMs: number;
  resourcesUsed?: {
    memoryMb: number;
    cpuPercentage: number;
  };
  timestamp: number;
}

export interface WorkerBlocked {
  blockedOn: "dependencies" | "human-input" | "error" | "timeout";
  waitingFor: string[];
  since: number;
  taskId: string | null;
  rationale?: string;
  suggestedAction?: string;
}

export class WorkerProgressReporter {
  private blackboard: Blackboard;
  private workerId: string;
  private sessionId: string;
  private intervalMs: number = 45_000; // 45 秒
  private timer?: NodeJS.Timeout;
  private currentTaskId: string | null = null;
  private lastProgress: WorkerProgress | null = null;
  private startedAt = 0;
  private status: WorkerStatus["status"] = "idle";

  constructor(
    blackboard: Blackboard,
    workerId: string,
    intervalMs?: number
  ) {
    this.blackboard = blackboard;
    this.workerId = workerId;
    this.sessionId = blackboard.sessionId;
    if (intervalMs) this.intervalMs = intervalMs;
  }

  /**
   * 开始任务时注册
   */
  startTask(taskId: string, estimatedMs: number, dependencies: string[] = []): void {
    this.clearBlock();
    this.startedAt = Date.now();
    this.currentTaskId = taskId;
    this.status = "task-received";

    this.lastProgress = {
      taskId,
      stepsCompleted: [],
      currentStep: "task-received",
      progressPercentage: 0,
      blockers: [],
      filesModified: [],
      estimatedCompletion: Date.now() + estimatedMs,
    };

    this.writeStatus(dependencies);
    this.startHeartbeat();

    console.error(
      `[WorkerProgressReporter] Started: worker=${this.workerId}, task=${taskId}, estimated=${estimatedMs}ms`
    );
  }

  /**
   * 更新进度（Worker 子进程主动调用）
   */
  updateProgress(update: Partial<WorkerProgress>): void {
    if (!this.lastProgress) {
      console.warn(
        `[WorkerProgressReporter] updateProgress called without active task: worker=${this.workerId}`
      );
      return;
    }

    this.clearBlock();
    this.status = "executing";
    this.lastProgress = {
      ...this.lastProgress,
      ...update,
      progressPercentage: update.progressPercentage ?? this.lastProgress.progressPercentage,
    };

    this.writeProgress();
    this.writeStatus();
    this.resetHeartbeat(); // 重置定时器防止过早超时

    console.error(
      `[WorkerProgressReporter] Progress: worker=${this.workerId}, step=${this.lastProgress.currentStep}, progress=${this.lastProgress.progressPercentage}%`
    );
  }

  /**
   * 报告步骤完成
   */
  completeStep(stepName: string): void {
    if (!this.lastProgress) return;

    if (!this.lastProgress.stepsCompleted.includes(stepName)) {
      this.lastProgress.stepsCompleted.push(stepName);
    }

    this.lastProgress.currentStep = `completed-${stepName}`;
    this.updateProgress({
      stepsCompleted: this.lastProgress.stepsCompleted,
      currentStep: this.lastProgress.currentStep,
    });
  }

  /**
   * 报告文件修改
   */
  reportFileModified(filePath: string): void {
    if (!this.lastProgress) return;

    if (!this.lastProgress.filesModified.includes(filePath)) {
      this.lastProgress.filesModified.push(filePath);
    }

    this.updateProgress({
      filesModified: this.lastProgress.filesModified,
    });
  }

  /**
   * 报告资源使用
   */
  reportResourceUsage(memoryMb: number, cpuPercentage: number): void {
    if (!this.lastProgress) return;

    this.lastProgress.resourcesUsed = { memoryMb, cpuPercentage };
    this.updateProgress({
      resourcesUsed: this.lastProgress.resourcesUsed,
    });

    // 同时写入独立 metrics 键值（供心跳查询）
    this.writeMetrics(memoryMb, cpuPercentage);
  }

  /**
   * 报告阻塞（检测到依赖缺失）
   */
  reportBlock(
    blockedOn: WorkerBlocked["blockedOn"],
    waitingFor: string[],
    rationale?: string,
    suggestedAction?: string
  ): void {
    this.stopHeartbeat();
    this.status = "blocked";
    this.writeStatus();

    const blocked: WorkerBlocked = {
      blockedOn,
      waitingFor,
      since: Date.now(),
      taskId: this.currentTaskId,
      rationale,
      suggestedAction,
    };

    const key = buildWorkerKey(MemoryKeyCategory.BLOCKED, this.workerId);
    this.blackboard.setData(key, blocked, this.workerId, {
      sourceUri: `worker-block:${this.sessionId}:${this.workerId}`,
    });

    console.error(
      `[WorkerProgressReporter] Blocked: worker=${this.workerId}, blockedOn=${blockedOn}, waitingFor=${waitingFor.length}`
    );
  }

  /**
   * 完成任务时注册结果
   */
  completeTask(deliverables: {
    files: string[];
    documentation?: string;
    testResults?: string;
    metrics?: {
      totalFilesModified?: number;
      totalLinesModified?: number;
      toolsCalled?: number;
    };
  }): void {
    this.stopHeartbeat();
    this.clearBlock();

    const status: WorkerStatus = {
      agent: this.workerId,
      status: "reported",
      assignedTask: this.lastProgress?.taskId,
      assignedAt: this.startedAt,
      dependencies: [],
      timestamp: Date.now(),
    };

    const key = buildWorkerKey(MemoryKeyCategory.STATUS, this.workerId);
    this.blackboard.setData(key, status, this.workerId, {
      sourceUri: `worker-complete:${this.sessionId}:${this.workerId}`,
    });

    const complete: WorkerCompleted = {
      status: "reported",
      task: this.lastProgress?.taskId ?? "unknown",
      deliverables: deliverables as WorkerCompleted['deliverables'],
      timeTakenMs: Date.now() - this.startedAt,
      resourcesUsed: this.lastProgress?.resourcesUsed,
      timestamp: Date.now(),
    };

    const completeKey = buildWorkerKey(MemoryKeyCategory.COMPLETE, this.workerId);
    this.blackboard.setData(completeKey, complete, this.workerId, {
      sourceUri: `worker-complete:${this.sessionId}:${this.workerId}`,
    });

    console.error(
      `[WorkerProgressReporter] Completed: worker=${this.workerId}, task=${complete.task}, time=${complete.timeTakenMs}ms, files=${deliverables.files.length}`
    );

    this.currentTaskId = null;
    this.lastProgress = null;
  }

  updateReportedDeliverables(taskId: string, files: string[]): void {
    const key = buildWorkerKey(MemoryKeyCategory.COMPLETE, this.workerId);
    const entry = this.blackboard.getDataEntry(key)?.value as WorkerCompleted | undefined;
    if (entry?.task !== taskId) return;
    this.blackboard.setData(key, { ...entry, deliverables: { ...entry.deliverables, files } }, this.workerId);
  }

  /**
   * 标记任务失败
   */
  failTask(error: string): void {
    this.stopHeartbeat();
    this.clearBlock();

    const status: WorkerStatus = {
      agent: this.workerId,
      status: "failed",
      assignedTask: this.lastProgress?.taskId,
      dependencies: [],
      timestamp: Date.now(),
    };

    const key = buildWorkerKey(MemoryKeyCategory.STATUS, this.workerId);
    this.blackboard.setData(key, status, this.workerId, {
      sourceUri: `worker-fail:${this.sessionId}:${this.workerId}`,
    });

    this.currentTaskId = null;
    this.lastProgress = null;

    console.error(`[WorkerProgressReporter] Failed: worker=${this.workerId}, error=${error}`);
  }

  /**
   * 标记为空闲（无任务时）
   */
  setIdle(): void {
    this.stopHeartbeat();
    this.clearBlock();

    const status: WorkerStatus = {
      agent: this.workerId,
      status: "idle",
      dependencies: [],
      timestamp: Date.now(),
    };

    const key = buildWorkerKey(MemoryKeyCategory.STATUS, this.workerId);
    this.blackboard.setData(key, status, this.workerId, {
      sourceUri: `worker-idle:${this.sessionId}:${this.workerId}`,
    });

    this.status = "idle";

    console.error(`[WorkerProgressReporter] Idle: worker=${this.workerId}`);
  }

  private clearBlock(): void {
    this.blackboard.deleteData(buildWorkerKey(MemoryKeyCategory.BLOCKED, this.workerId), this.workerId);
  }

  resumeHeartbeat(): void {
    if (this.currentTaskId && this.status !== "blocked") this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.timer = setInterval(() => {
      this.writeProgress();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stopHeartbeat(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private resetHeartbeat(): void {
    this.stopHeartbeat();
    this.startHeartbeat();
  }

  private writeStatus(dependencies: string[] = []): void {
    const status: WorkerStatus = {
      agent: this.workerId,
      status: this.status,
      assignedTask: this.currentTaskId?.toString(),
      assignedAt: this.startedAt,
      estimatedCompletion: this.lastProgress?.estimatedCompletion,
      dependencies,
      timestamp: Date.now(),
    };

    const key = buildWorkerKey(MemoryKeyCategory.STATUS, this.workerId);
    this.blackboard.setData(key, status, this.workerId, {
      sourceUri: `worker-status:${this.sessionId}:${this.workerId}`,
    });
  }

  private writeProgress(): void {
    if (!this.lastProgress) return;

    const key = buildWorkerKey(MemoryKeyCategory.PROGRESS, this.workerId);
    this.blackboard.setData(key, this.lastProgress, this.workerId, {
      sourceUri: `worker-progress:${this.sessionId}:${this.workerId}`,
    });
  }

  private writeMetrics(memoryMb: number, cpuPercentage: number): void {
    const key = buildWorkerKey(MemoryKeyCategory.METRICS, this.workerId);
    this.blackboard.setData(key, { memoryMb, cpuPercentage, timestamp: Date.now() }, this.workerId, {
      sourceUri: `worker-metrics:${this.sessionId}:${this.workerId}`,
    });
  }
}
