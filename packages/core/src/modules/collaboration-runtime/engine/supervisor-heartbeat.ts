/**
 * SupervisorHeartbeat — Queen 风格的定时权威状态写入
 *
 * 借鉴 Ruflo 的 Queen 心跳机制，每分钟强制写入 Supervisor 状态，
 * 确保共享记忆中始终有最新的权威数据。
 *
 * 参考 Ruflo queen-coordinator:
 * - 每分钟写入 swarm$queen$status
 * - 每 2 分钟写入 swarm$queen$royal-report
 */

import type { TaskItem } from "../session/types";
import type { Blackboard } from "../session/blackboard";
import {
  buildSupervisorKey,
  buildWorkerKey,
  MemoryKeyCategory,
} from "../session/memory-keys";

export interface SupervisorHeartbeatConfig {
  /** 心跳间隔（毫秒），默认 1 分钟 */
  intervalMs?: number;
  /** Royal Report 间隔（毫秒），默认 2 分钟 */
  reportIntervalMs?: number;
}

export interface SupervisorStatus {
  agent: string;
  status: "sovereign-active" | "paused" | "failed" | "completed";
  hierarchyEstablished: boolean;
  subjects: string[]; // 活跃 Worker 列表
  royalDirectives: string[]; // 已下发指令列表
  successionPlan: string;
  timestamp: number;
  activeTaskCount: number;
  completedCount: number;
  failedCount: number;
  reportedCount: number;
}

export interface SupervisorReport {
  decree: string;
  swarmState: "operational" | "degraded" | "failed";
  objectivesCompleted: string[];
  objectivesPending: string[];
  resourceUtilization: {
    percentage: string;
    activeAgents: number;
    avgMemoryMb?: number;
    avgCpuPercentage?: number;
  };
  recommendations: string[];
  nextReview: number;
  timestamp: number;
}

export class SupervisorHeartbeat {
  private blackboard: Blackboard;
  private supervisorId: string;
  private sessionId: string;
  private intervalMs: number;
  private reportIntervalMs: number;
  private heartbeatTimer?: NodeJS.Timeout;
  private reportTimer?: NodeJS.Timeout;
  private objectives: { completed: string[]; pending: string[] } = {
    completed: [],
    pending: [],
  };

  constructor(
    blackboard: Blackboard,
    supervisorId: string,
    config: SupervisorHeartbeatConfig = {}
  ) {
    this.blackboard = blackboard;
    this.supervisorId = supervisorId;
    this.sessionId = blackboard.sessionId;
    this.intervalMs = config.intervalMs ?? 60_000; // 1 分钟
    this.reportIntervalMs = config.reportIntervalMs ?? 120_000; // 2 分钟
  }

  /**
   * 启动心跳定时器
   */
  start(): void {
    this.stop();
    this.writeStatus(); // 立即写入第一次

    // 状态心跳
    this.heartbeatTimer = setInterval(() => {
      this.writeStatus();
    }, this.intervalMs);

    // Royal Report
    this.reportTimer = setInterval(() => {
      this.writeRoyalReport();
    }, this.reportIntervalMs);

    this.heartbeatTimer.unref?.();
    this.reportTimer.unref?.();
    console.error(
      `[SupervisorHeartbeat] Started: supervisor=${this.supervisorId}, interval=${this.intervalMs}ms, reportInterval=${this.reportIntervalMs}ms`
    );
  }

  /**
   * 停止心跳定时器
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = undefined;
    }
    console.error(`[SupervisorHeartbeat] Stopped: supervisor=${this.supervisorId}`);
  }

  /**
   * 设置管理目标
   */
  setObjectives(completed: string[], pending: string[]): void {
    this.objectives = { completed, pending };
  }

  /**
   * 标记目标完成
   */
  markObjectiveCompleted(objective: string): void {
    const idx = this.objectives.pending.indexOf(objective);
    if (idx >= 0) {
      this.objectives.pending.splice(idx, 1);
      if (!this.objectives.completed.includes(objective)) {
        this.objectives.completed.push(objective);
      }
    }
  }

  /**
   * 添加新目标
   */
  addObjective(objective: string): void {
    if (!this.objectives.pending.includes(objective)) {
      this.objectives.pending.push(objective);
    }
  }

  /**
   * 写入权威状态（每分钟）
   */
  private writeStatus(): void {
    const tasks = this.blackboard.getTasks();
    const activeWorkers = new Set(
      tasks
        .filter((t) => t.status === "running" || t.status === "assigned")
        .map((t) => t.assignedTo)
        .filter((v): v is string => v !== undefined)
    );

    const status: SupervisorStatus = {
      agent: this.supervisorId,
      status: this.determineSwarmState(tasks),
      hierarchyEstablished: activeWorkers.size > 0,
      subjects: Array.from(activeWorkers),
      royalDirectives: this.extractDirectives(tasks),
      successionPlan: "collective-intelligence",
      timestamp: Date.now(),
      activeTaskCount: tasks.filter((t) => t.status === "running").length,
      completedCount: tasks.filter((t) => t.status === "completed").length,
      failedCount: tasks.filter((t) => t.status === "failed").length,
      reportedCount: tasks.filter((t) => t.status === "reported").length,
    };

    const key = buildSupervisorKey(MemoryKeyCategory.STATUS, this.sessionId);
    this.blackboard.setData(key, status, this.supervisorId, {
      sourceUri: `supervisor-heartbeat:${this.sessionId}`,
    });

    console.error(
      `[SupervisorHeartbeat] Status written: active=${status.activeTaskCount}, completed=${status.completedCount}, failed=${status.failedCount}, subjects=${status.subjects.length}`
    );
  }

  /**
   * 写入 Royal Report（每 2 分钟）
   */
  writeRoyalReport(): void {
    const tasks = this.blackboard.getTasks();
    const totalTasks = tasks.length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const progress = totalTasks > 0 ? (completed / totalTasks) * 100 : 0;

    const report: SupervisorReport = {
      decree: "Status Report",
      swarmState: this.determineSwarmState(tasks) === "sovereign-active" ? "operational" : "degraded",
      objectivesCompleted: this.objectives.completed,
      objectivesPending: this.objectives.pending,
      resourceUtilization: {
        percentage: Math.round(progress).toString() + "%",
        activeAgents: this.extractActiveWorkers(tasks).length,
        avgMemoryMb: this.calculateAvgMemory(),
        avgCpuPercentage: this.calculateAvgCpu(),
      },
      recommendations: this.generateRecommendations(tasks),
      nextReview: Date.now() + this.reportIntervalMs,
      timestamp: Date.now(),
    };

    const key = buildSupervisorKey(MemoryKeyCategory.REPORT, this.sessionId);
    this.blackboard.setData(key, report, this.supervisorId, {
      sourceUri: `supervisor-report:${this.sessionId}`,
    });

    console.error(
      `[SupervisorHeartbeat] Royal Report written: progress=${progress.toFixed(1)}%, recommendations=${report.recommendations.length}`
    );
  }

  /**
   * 确定 Swarm 状态
   */
  private determineSwarmState(tasks: TaskItem[]): SupervisorStatus["status"] {
    const failed = tasks.filter((t) => t.status === "failed").length;
    const blocked = tasks.filter((t) => t.status === "blocked").length;

    if (failed > 0 && failed > tasks.length / 2) {
      return "failed";
    }
    if (blocked > 0) {
      return "paused";
    }
    return "sovereign-active";
  }

  /**
   * 提取活跃 Worker
   */
  private extractActiveWorkers(tasks: TaskItem[]): string[] {
    return Array.from(
      new Set(tasks.filter((t) => t.status === "running").map((t) => t.assignedTo))
    ).filter((agentId): agentId is string => typeof agentId === "string" && agentId.length > 0);
  }

  /**
   * 提取已下发指令
   */
  private extractDirectives(tasks: TaskItem[]): string[] {
    return tasks
      .filter((t) => t.status === "assigned" || t.status === "running")
      .map((t) => `dispatch-${t.id}`);
  }

  /**
   * 计算平均内存使用
   */
  private calculateAvgMemory(): number | undefined {
    const agents = this.getWorkersWithMetrics();
    if (agents.length === 0) return undefined;

    const memoryValues = agents
      .map((a) => a.metrics?.memoryMb)
      .filter((m): m is number => m !== undefined && m > 0);

    return memoryValues.length > 0
      ? memoryValues.reduce((sum, m) => sum + m, 0) / memoryValues.length
      : undefined;
  }

  /**
   * 计算平均 CPU 使用
   */
  private calculateAvgCpu(): number | undefined {
    const agents = this.getWorkersWithMetrics();
    if (agents.length === 0) return undefined;

    const cpuValues = agents
      .map((a) => a.metrics?.cpuPercentage)
      .filter((c): c is number => c !== undefined && c >= 0);

    return cpuValues.length > 0
      ? cpuValues.reduce((sum, c) => sum + c, 0) / cpuValues.length
      : undefined;
  }

  /**
   * 获取有指标数据的 Worker
   */
  private getWorkersWithMetrics(): Array<{ agentId: string; metrics?: { memoryMb?: number; cpuPercentage?: number } }> {
    const tasks = this.blackboard.getTasks();
    const workerIds = Array.from(
      new Set(tasks.map((t) => t.assignedTo).filter((v): v is string => v !== undefined))
    );

    return workerIds.map((agentId: string) => {
      const metricsKey = buildWorkerKey(MemoryKeyCategory.METRICS, agentId);
      const metricsEntry = this.blackboard.getDataEntry(metricsKey);
      return {
        agentId,
        metrics: metricsEntry?.value as { memoryMb?: number; cpuPercentage?: number } | undefined,
      };
    });
  }

  /**
   * 生成推荐
   */
  private generateRecommendations(tasks: TaskItem[]): string[] {
    const recommendations: string[] = [];
    const blocked = tasks.filter((t) => t.status === "blocked").length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const running = tasks.filter((t) => t.status === "running").length;

    if (blocked > 0) {
      recommendations.push(
        `Resolve ${blocked} blocked task${blocked > 1 ? "s" : ""}: check dependencies or escalate to human`
      );
    }

    if (pending > running) {
      recommendations.push(
        `Spawn more workers: ${pending} pending tasks but only ${running} executing`
      );
    }

    if (running === 0 && pending > 0) {
      recommendations.push("No active workers: all tasks pending, check worker pool");
    }

    const failed = tasks.filter((t) => t.status === "failed").length;
    if (failed > 0) {
      recommendations.push(
        `Review ${failed} failed task${failed > 1 ? "s" : ""}: consider task reassignment or retry logic`
      );
    }

    if (recommendations.length === 0 && running > 0) {
      recommendations.push("Swarm operating normally: continue monitoring");
    }

    return recommendations;
  }
}
