/**
 * AgentTaskSnapshot — Multica 风格的任务快照机制
 *
 * 提供 "所有活跃任务 + 每个 Agent 的最近终端任务" 的快照查询，
 * 类似 Multica agent-task-snapshot。
 *
 * 参考 Multica:
 * - Workspace 级别快照：所有活跃任务 + 每个 Agent 的最近终端任务
 * - 实时更新监听：任务生命周期事件触发缓存更新
 * - 故意跳过高频事件：不监听 task:progress 和 task:message
 */

import type { Blackboard } from "../session/blackboard";
import type { TaskItem } from "../session/types";
import {
  buildWorkerKey,
  parseMemoryKey,
  MemoryKeyCategory,
} from "../session/memory-keys";

export interface AgentTaskSnapshotData {
  agentId: string;
  agentName: string;
  /** 当前活跃任务（running/assigned） */
  activeTask?: {
    taskId: string;
    description: string;
    status: "running" | "assigned";
    assignedAt: string;
    startedAt?: string;
    progress?: WorkerProgressData;
  };
  /** 最近终端任务（completed/failed/reported） */
  recentTerminalTask?: {
    taskId: string;
    description: string;
    status: "completed" | "failed" | "reported";
    completedAt: string;
    output?: string;
  };
  /** 资源使用统计（最近 5 分钟） */
  resourceUsage?: {
    memoryMbAvg: number;
    cpuPercentageAvg: number;
    taskCount: number;
  };
  /** 最近阻塞状态 */
  blockedStatus?: {
    blockedOn: string;
    waitingFor: string[];
    since: string;
  };
}

export interface WorkerProgressData {
  taskId: string;
  stepsCompleted: string[];
  currentStep: string;
  progressPercentage: number;
  blockers: string[];
  filesModified: string[];
}

export interface WorkspaceTaskSnapshot {
  sessionId: string;
  /** 所有活跃任务 */
  activeTasks: TaskItem[];
  /** 每个 Agent 的快照 */
  agents: AgentTaskSnapshotData[];
  /** 全局统计 */
  summary: {
    totalAgents: number;
    activeAgents: number;
    totalActiveTasks: number;
    totalCompletedTasks: number;
    totalFailedTasks: number;
    totalBlockedTasks: number;
    avgMemoryMb?: number;
    avgCpuPercentage?: number;
  };
  /** 快照时间 */
  snapshotAt: string;
}

export class AgentTaskSnapshot {
  private blackboard: Blackboard;
  private cachedSnapshot?: WorkspaceTaskSnapshot;
  private cacheExpiryMs: number = 5_000; // 5 秒缓存
  private lastRefreshAt: number = 0;
  private pendingInvalidation: boolean = false;

  constructor(blackboard: Blackboard, _sessionDir: string, cacheExpiryMs?: number) {
    this.blackboard = blackboard;
    if (cacheExpiryMs) this.cacheExpiryMs = cacheExpiryMs;
  }

  /**
   * 获取快照（带缓存）
   */
  async getSnapshot(forceRefresh = false): Promise<WorkspaceTaskSnapshot> {
    const now = Date.now();

    if (!forceRefresh && !this.pendingInvalidation && this.cachedSnapshot && (now - this.lastRefreshAt) < this.cacheExpiryMs) {
      return this.cachedSnapshot;
    }

    this.pendingInvalidation = false;
    const snapshot = await this.buildSnapshot();

    this.cachedSnapshot = snapshot;
    this.lastRefreshAt = now;
    return snapshot;
  }

  /**
   * 使缓存失效（任务生命周期事件触发）
   */
  invalidate(): void {
    this.pendingInvalidation = true;
  }

  /**
   * 按 Agent ID 获取快照
   */
  /**
   * 按 Agent ID 获取快照
   */
  async getAgentSnapshot(agentId: string): Promise<AgentTaskSnapshotData | null> {
    const snapshot = await this.getSnapshot();
    return snapshot.agents.find((a) => a.agentId === agentId) ?? null;
  }

  /**
   * 构建快照
   */
  /**
   * 构建快照
   */
  private async buildSnapshot(): Promise<WorkspaceTaskSnapshot> {
    const tasks = this.blackboard.getTasks();
    const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "assigned");
    const completedTasks = tasks.filter((t) => t.status === "completed" || t.status === "reported");
    const failedTasks = tasks.filter((t) => t.status === "failed");
    const blockedTasks = tasks.filter((t) => t.status === "blocked");

    // 收集所有 Agent ID
    const agentIds = new Set(
      tasks.map((t) => t.assignedTo).filter(Boolean) as string[]
    );

    const agents: AgentTaskSnapshotData[] = [];
    for (const agentId of agentIds) {
      const agentSnapshot = await this.buildAgentSnapshot(
        agentId,
        tasks,
        activeTasks,
        completedTasks,
        failedTasks,
        blockedTasks
      );
      agents.push(agentSnapshot);
    }

    return {
      sessionId: this.blackboard.sessionId,
      activeTasks,
      agents,
      summary: {
        totalAgents: agentIds.size,
        activeAgents: activeTasks.length,
        totalActiveTasks: activeTasks.length,
        totalCompletedTasks: completedTasks.filter((task) => task.status === "completed").length,
        totalFailedTasks: failedTasks.length,
        totalBlockedTasks: blockedTasks.length,
        avgMemoryMb: this.calculateAvgMemory(agents),
        avgCpuPercentage: this.calculateAvgCpu(agents),
      },
      snapshotAt: new Date().toISOString(),
    };
  }

  /**
   * 构建单个 Agent 快照
   */
  /**
   * 构建单个 Agent 快照
   */
  private async buildAgentSnapshot(
    agentId: string,
    _allTasks: TaskItem[],
    activeTasks: TaskItem[],
    completedTasks: TaskItem[],
    failedTasks: TaskItem[],
    blockedTasks: TaskItem[]
  ): Promise<AgentTaskSnapshotData> {
    const activeTask = activeTasks.find((t) => t.assignedTo === agentId);
    const recentTerminalTask = [...completedTasks, ...failedTasks, ...blockedTasks]
      .filter((t) => t.assignedTo === agentId)
      .sort((a, b) => {
        const timeA = ((a.completedAt && new Date(a.completedAt).getTime()) ?? 0) as number;
        const timeB = ((b.completedAt && new Date(b.completedAt).getTime()) ?? 0) as number;
        return timeB - timeA;
      })[0];

    // 读取进度
    const progressEntry = this.blackboard.getDataEntry(
      buildWorkerKey(MemoryKeyCategory.PROGRESS, agentId)
    );
    const progress: WorkerProgressData | undefined = progressEntry?.value as WorkerProgressData | undefined;

    // 读取阻塞状态
    const blockedEntry = this.blackboard.getDataEntry(
      buildWorkerKey(MemoryKeyCategory.BLOCKED, agentId)
    );
    const blockedStatus = blockedEntry?.value as
      | { blockedOn: string; waitingFor: string[]; since: string }
      | undefined;

    return {
      agentId,
      agentName: this.blackboard.getAgentName(agentId),
      activeTask: activeTask
        ? {
            taskId: activeTask.id,
            description: activeTask.description,
            status: activeTask.status as "running" | "assigned",
            assignedAt: activeTask.createdAt,
            startedAt: activeTask.createdAt,
            progress,
          }
        : undefined,
      recentTerminalTask: recentTerminalTask
        ? {
            taskId: recentTerminalTask.id,
            description: recentTerminalTask.description,
            status: recentTerminalTask.status as "completed" | "failed" | "reported",
            completedAt: recentTerminalTask.completedAt!,
            output: recentTerminalTask.output as string | undefined,
          }
        : undefined,
      resourceUsage: this.calculateResourceUsage(agentId),
      blockedStatus,
    };
  }

  /**
   * 计算 Agent 资源使用
   */
  /**
   * 计算 Agent 资源使用
   */
  private calculateResourceUsage(agentId: string): AgentTaskSnapshotData["resourceUsage"] {
    const metricsEntry = this.blackboard.getDataEntry(
      buildWorkerKey(MemoryKeyCategory.METRICS, agentId)
    );

    if (!metricsEntry?.value) {
      return undefined;
    }

    const metrics = metricsEntry.value as {
      memoryMb: number;
      cpuPercentage: number;
      timestamp?: number;
      taskCount?: number;
    };

    const tasks = this.blackboard.getTasks();
    const agentTasks = tasks.filter((t) => t.assignedTo === agentId);

    return {
      memoryMbAvg: metrics.memoryMb,
      cpuPercentageAvg: metrics.cpuPercentage,
      taskCount: agentTasks.length,
    };
  }

  /**
   * 计算平均内存使用
   */
  /**
   * 计算平均内存使用
   */
  private calculateAvgMemory(agents: AgentTaskSnapshotData[]): number | undefined {
    const usages = agents
      .map((a) => a.resourceUsage?.memoryMbAvg ?? 0)
      .filter((v) => v > 0);

    return usages.length > 0 ? usages.reduce((sum, m) => sum + m, 0) / usages.length : undefined;
  }

  /**
   * 计算平均 CPU 使用
   */
  /**
   * 计算平均 CPU 使用
   */
  private calculateAvgCpu(agents: AgentTaskSnapshotData[]): number | undefined {
    const usages = agents
      .map((a) => a.resourceUsage?.cpuPercentageAvg)
      .filter((v): v is number => v !== undefined && v >= 0);

    return usages.length > 0 ? usages.reduce((sum, c) => sum + c, 0) / usages.length : undefined;
  }

  /**
   * 获取所有阻塞的 Agent
   */
  getBlockedAgents(): string[] {
    const blockedAgents: string[] = [];
    const allKeys = this.blackboard.getEntries().map((e) => e.key);

    for (const key of allKeys) {
      const parsed = parseMemoryKey(key);
      if (parsed?.category === MemoryKeyCategory.BLOCKED && parsed.role?.startsWith("worker-")) {
        const agentId = parsed.role.replace("worker-", "");
        if (!blockedAgents.includes(agentId)) {
          blockedAgents.push(agentId);
        }
      }
    }

    return blockedAgents;
  }

  /**
   * 获取所有活跃 Agent
   */
  getActiveAgents(): string[] {
    const tasks = this.blackboard.getTasks();
    return Array.from(
      new Set(
        tasks
          .filter((t) => t.status === "running" || t.status === "assigned")
          .map((t) => t.assignedTo)
          .filter((v): v is string => v !== undefined)
      )
    );
  }
}
