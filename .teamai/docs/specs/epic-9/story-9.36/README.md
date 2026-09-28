# Story 9.36: 借鉴 Ruflo/Multica 的 Supervisor/Worker 模式重构

**状态:** 📋 Planning
**优先级:** High
**依赖:** 9.13, 9.28, 9.30
**估计工时:** 5-7 天

---

## 📋 概述

通过深入分析 **Ruflo** (CLAUDE.md 和 hierarchical-coordinator/queen-coordinator/worker-specialist skills) 和 **Multica** (agent-task-snapshot, use-agent-activity) 的 multi-agent 架构实践，对比当前 Epic 9 的 Blackboard + Supervisor/Worker 实现，识别关键差距，设计并实施改进方案。

---

## 🔍 架构对比分析

### Ruflo Supervisor/Worker 模式核心特性

#### 1. **Queen-Centric 内存协调协议**

Ruflo 的 `hierarchical-coordinator` 和 `queen-coordinator` 实现了强约束的内存协调：

```javascript
// Queen 写入权威状态（每分钟强制执行）
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm$queen$status",
  namespace: "coordination",
  value: JSON.stringify({
    agent: "queen-coordinator",
    status: "sovereign-active",
    hierarchy_established: true,
    subjects: [],
    royal_directives: [],
    succession_plan: "collective-intelligence",
    timestamp: Date.now()
  })
}

// Queen 每 2 分钟发出 royal report
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm$queen$royal-report",
  namespace: "coordination",
  value: JSON.stringify({
    decree: "Status Report",
    swarm_state: "operational",
    objectives_completed: ["obj1", "obj2"],
    objectives_pending: ["obj3", "obj4"],
    resource_utilization: "78%",
    recommendations: ["Spawn more workers", "Increase scout patrols"],
    next_review: Date.now() + 120000
  })
}
```

**关键特点：**
- ✅ **单一权威来源（SSOT）**：Queen 是唯一写入权威状态的实体，Worker 只能读不能覆盖
- ✅ **定时强制刷新**：每分钟必须写入状态，防止内存漂移
- ✅ **命名空间隔离**：所有内存操作使用 `coordination` 命名空间，键值结构清晰
- ✅ **指令链追踪**：`royal_directives` 显式记录下发指令，可追溯执行

#### 2. **Worker 被动执行协议**

Ruflo 的 `worker-specialist` 严格按照 Queen 指令执行：

```javascript
// START - 接受任务时立即报告
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm$worker-[ID]$status",
  namespace: "coordination",
  value: JSON.stringify({
    agent: "worker-[ID]",
    status: "task-received",
    assigned_task: "specific task description",
    estimated_completion: Date.now() + 3600000,
    dependencies: [],
    timestamp: Date.now()
  })
}

// PROGRESS - 每个显著步骤更新
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm$worker-[ID]$progress",
  namespace: "coordination",
  value: JSON.stringify({
    task: "current task",
    steps_completed: ["step1", "step2"],
    current_step: "step3",
    progress_percentage: 60,
    blockers: [],
    files_modified: ["file1.js", "file2.js"]
  })
}

// COMPLETE - 交付结果
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm$worker-[ID]$complete",
  namespace: "coordination",
  value: JSON.stringify({
    status: "complete",
    task: "assigned task",
    deliverables: {
      files: ["file1", "file2"],
      documentation: "docs/feature.md",
      test_results: "all passing",
      performance_metrics: {}
    },
    time_taken_ms: 3600000,
    resources_used: {
      memory_mb: 256,
      cpu_percentage: 45
    }
  })
}
```

**关键特点：**
- ✅ **强制进度汇报**：每 30-60 秒必须更新进度，不更新视为异常
- ✅ **依赖检查前置**：开始任务前必须验证依赖可用
- ✅ **阻塞立即报告**：检测到依赖缺失立即写入 `blocked` 状态
- ✅ **结果结构化交付**：`deliverables` 明确列出产出的文件、文档、测试结果

#### 3. **Memory 命名空间约定**

Ruflo 使用严格的键值约定，防止内存冲突：

```javascript
// 键值结构（强制）
"swarm$queen$status"           // Queen 权威状态
"swarm$queen$royal-report"     // Queen 定期报告
"swarm$queen$hive-health"      // Queen 健康监控
"swarm$worker-[ID]$status"     // Worker 状态
"swarm$worker-[ID]$progress"   // Worker 进度
"swarm$worker-[ID]$complete"   // Worker 完成报告
"swarm$shared$royal-directives"  // 共享指令
"swarm$shared$resource-allocation" // 共享资源分配
"swarm$shared$hierarchy"       // 共享层级结构

// 所有使用 namespace: "coordination"
```

**关键特点：**
- ✅ **分层键值**：`swarm$<role>$<category>` 结构清晰，层次分明
- ✅ **共享区隔离**：`swarm$shared$*` 用于跨 Agent 共享数据
- ✅ **单命名空间**：全部集中在 `coordination`，方便查询

---

### Multica Agent Task 管理

Multica 的 `agent-task-snapshot` 提供了**任务快照**机制：

```typescript
export const agentTaskSnapshotOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: ["agent-task-snapshot", wsId] as const,
    queryFn: ({ signal }) => api.listAgentTaskSnapshot({ signal }),
    enabled: !!wsId,
  });
```

**核心概念：**
- ✅ **Workspace 级别快照**：每个 workspace 有一条完整的任务快照，包含所有活跃任务 + 每个 Agent 的最近终端任务
- ✅ **实时更新监听**：通过 WebSocket 监听任务生命周期事件（`task:queued`/`task:dispatch`/`task:completed`/`task:failed`/`task:cancelled`）
- ✅ **故意跳过高频事件**：不监听 `task:progress` 和 `task:message`，避免蜂窝数据成本的无效刷新风暴
- ✅ **缓存失效策略**：任务生命周期事件触发缓存更新，而非轮询

**移动端特殊规则：**
```typescript
// Workspace agent task snapshot — every active task plus each agent's most
// recent terminal task. Feeds the workload dimension of presence. Mobile
// invalidates on task lifecycle events (queued/dispatch/completed/failed/
// cancelled) but DELIBERATELY skips task:progress and task:message — those
// fire many times per active task and would invalidate-storm cellular data.
```

---

### Epic 9 当前实现对比

#### 当前 Blackboard 实现（`blackboard.ts`）

**现有字段：**
```typescript
export interface BlackboardState {
  sessionId: string;
  sharedData: Record<string, BlackboardEntry>;  // 自由键值
  messages: BlackboardMessage[];
  tasks: TaskItem[];
  artifacts: Record<string, BlackboardArtifact>;
  locks: Record<string, BlackboardLock>;
}
```

**问题 1：自由键值导致可观测性困难**
- ❌ `sharedData` 使用任意字符串键值，无法像 Ruflo 那样按 `swarm$<role>$<category>` 结构查询
- ❌ 无法区分 Queen 权威状态 vs Worker 临时状态
- ❌ 没有命名空间隔离机制，所有 Agent 共享同一个 `sharedData` 字典

**问题 2：缺少定时强制刷新**
- ❌ Queen/Supervisor 没有类似于 "每分钟写入 `swarm$queen$status`" 的强制心跳
- ❌ Worker 进度更新频率不固定，可能长时间沉寂（阻塞检测依赖超时而非主动汇报）

**问题 3：依赖检查缺失**
- ❌ Worker 在 `TASK_STARTED` 前没有检查上游依赖状态
- ❌ 没有显式的 `blocked` 状态机制，阻塞只能通过超时推断

**问题 4：结果交付不结构化**
- ❌ `TASK_COMPLETED` 只有 `output: string`，没有 `deliverables` 结构（文件路径、文档引用、测试结果）
- ❌ 没有资源使用统计（`memory_mb`, `cpu_percentage`），无法进行资源配额管理

---

#### 当前 Supervisor Mode 实现（`supervisor.ts`）

**现有字段：**
```typescript
export interface SubTask {
  id: string;
  parentTaskId?: string;
  description: string;
  requiredCapabilities?: string[];
  state: SubTaskState; // pending | allocating | executing | verifying | revision | completed | failed | reported
  assignedWorker?: string;
  verifierId?: string;
  result?: SubTaskResult;
  error?: string;
  revisionCount: number;
}

export interface SubTaskResult {
  output: string;
  artifacts?: string[];
  revisionCount: number;
}
```

**问题 5：缺少 Worker 活动快照**
- ❌ 没有 Multica 那样的 "agent-task-snapshot" 机制
- ❌ 无法快速查询所有活跃任务 + 每个 Agent 的最近终端任务
- ❌ `useWorkspaceActivityMap` 风格的 30 天活动统计不存在，无法进行负载均衡决策

**问题 6：状态更新不强制**
- ❌ Worker 进度更新没有频率约束（Ruflo 要求每 30-60 秒）
- ❌ 无法区分"正在执行但很久没更新" vs "真的阻塞了"

**问题 7：资源分配不透明**
- ❌ `CapabilityMatcher.scoreAgent` 只考虑 `currentLoad`（任务数），没有实际资源使用指标
- ❌ 没有 Multica 风格的 `resource_utilization: "78%"` 报告机制

---

## 🎯 修正方案设计

### 修正 1：引入结构化键值命名约定

**目标：** Ruflo 风格的 `swarm$<role>$<category>` 键值结构

**实施：**
```typescript
// 新增协作内存键值约定模块
// src/modules/collaboration-runtime/session/memory-keys.ts

export enum MemoryKeyCategory {
  STATUS = "status",           // 状态快照
  PROGRESS = "progress",       // 进度更新
  COMPLETE = "complete",       // 完成报告
  BLOCKED = "blocked",         // 阻塞报告
  METRICS = "metrics",         // 性能指标
  DIRECTIVE = "directive",     // 权威指令
  HEALTH = "health",           // 健康监控
  REPORT = "report",           // 定期报告
}

export function buildSupervisorKey(category: MemoryKeyCategory, sessionId: string): string {
  return `swarm$supervisor$${category}`;
}

export function buildWorkerKey(category: MemoryKeyCategory, workerId: string): string {
  return `swarm$worker-${workerId}$${category}`;
}

export function buildSharedKey(category: MemoryKeyCategory, sessionId: string): string {
  return `swarm$shared$${category}`;
}

// 示例
// swarm$supervisor$status
// swarm$supervisor$report
// swarm$supervisor$directives
// swarm$worker-coder$status
// swarm$worker-coder$progress
// swarm$worker-coder$blocked
// swarm$shared$dependencies
// swarm$shared$resource-allocation
```

**Blackboard 扩展：**
```typescript
export interface BlackboardState {
  sessionId: string;
  sharedData: Record<string, BlackboardEntry>;
  // ... 现有字段 ...
  /** 结构化键值索引（Ruflo 风格） */
  memoryIndex?: {
    supervisor: Map<string, BlackboardEntry>;  // supervisor$status, supervisor$report, ...
    workers: Map<string, Map<string, BlackboardEntry>>;  // worker-coder: {status, progress, ...}
    shared: Map<string, BlackboardEntry>;     // shared$dependencies, shared$hierarchy, ...
  };
}
```

---

### 修正 2：Supervisor 强制心跳机制

**目标：** Queen 风格的定时权威状态写入（每分钟强制）

**实施：**
```typescript
// 新增 SupervisorHeartbeat 定时器
// src/modules/collaboration-runtime/engine/supervisor-heartbeat.ts

export class SupervisorHeartbeat {
  private intervalMs: number = 60_000; // 1 分钟
  private timer?: NodeJS.Timeout;
  private blackboard: Blackboard;
  private supervisorId: string;
  private sessionId: string;

  constructor(blackboard: Blackboard, supervisorId: string, sessionId: string, intervalMs?: number) {
    this.blackboard = blackboard;
    this.supervisorId = supervisorId;
    this.sessionId = sessionId;
    if (intervalMs) this.intervalMs = intervalMs;
  }

  start(): void {
    this.stop(); // 清除旧定时器
    this.writeStatus(); // 立即写入第一次
    this.timer = setInterval(() => {
      this.writeStatus();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private writeStatus(): void {
    const key = buildSupervisorKey(MemoryKeyCategory.STATUS, this.sessionId);
    const tasks = this.blackboard.getTasks();
    const activeWorkers = new Set(
      tasks.filter(t => t.status === "running" || t.status === "assigned").map(t => t.assignedTo)
    );

    const status = {
      agent: this.supervisorId,
      status: "sovereign-active",
      hierarchy_established: true,
      subjects: Array.from(activeWorkers),
      timestamp: Date.now(),
      activeTaskCount: tasks.filter(t => t.status === "running").length,
      completedCount: tasks.filter(t => t.status === "completed").length,
      failedCount: tasks.filter(t => t.status === "failed").length,
      reportedCount: tasks.filter(t => t.status === "reported").length,
    };

    this.blackboard.write(key, status, {
      writer: this.supervisorId,
      timestamp: new Date().toISOString(),
      source_uri: `supervisor-heartbeat:${this.sessionId}`,
    });
  }

  /** 写入 Royal Report（每 2 分钟一次，可单独配置） */
  writeRoyalReport(objectives?: { completed: string[]; pending: string[] }): void {
    const key = buildSupervisorKey(MemoryKeyCategory.REPORT, this.sessionId);
    const report = {
      decree: "Status Report",
      swarm_state: "operational",
      objectives_completed: objectives?.completed ?? [],
      objectives_pending: objectives?.pending ?? [],
      resource_utilization: this.calculateResourceUtilization(),
      recommendations: this.generateRecommendations(),
      timestamp: Date.now(),
    };

    this.blackboard.write(key, report, {
      writer: this.supervisorId,
      timestamp: new Date().toISOString(),
      source_uri: `supervisor-report:${this.sessionId}`,
    });
  }
}
```

**集成：**
- 在 `SupervisorMode.start()` 中启动 heartbeat
- 在 `SupervisorMode.complete()` 或 `stop()` 中停止 heartbeat
- 每 2 分钟调用 `writeRoyalReport`（可选，独立定时器）

---

### 修正 3：Worker 强制进度汇报协议

**目标：** Worker 每 30-60 秒必须汇报进度，否则视为异常

**实施：**
```typescript
// 新增 WorkerProgressReporter
// src/modules/collaboration-runtime/sandbox/worker-progress-reporter.ts

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

export class WorkerProgressReporter {
  private blackboard: Blackboard;
  private workerId: string;
  private sessionId: string;
  private intervalMs: number = 45_000; // 45 秒
  private timer?: NodeJS.Timeout;
  private currentTaskId: string | null = null;
  private lastProgress: WorkerProgress | null = null;

  constructor(blackboard: Blackboard, workerId: string, sessionId: string, intervalMs?: number) {
    this.blackboard = blackboard;
    this.workerId = workerId;
    this.sessionId = sessionId;
    if (intervalMs) this.intervalMs = intervalMs;
  }

  /** 开始任务时注册 */
  startTask(taskId: string, estimatedMs: number): void {
    this.currentTaskId = taskId;
    this.lastProgress = {
      taskId,
      stepsCompleted: [],
      currentStep: "task-received",
      progressPercentage: 0,
      blockers: [],
      filesModified: [],
      estimatedCompletion: Date.now() + estimatedMs,
    };
    this.writeStatus();
    this.startHeartbeat();
  }

  /** 更新进度（Worker 子进程主动调用） */
  updateProgress(update: Partial<WorkerProgress>): void {
    if (!this.lastProgress) return;
    this.lastProgress = {
      ...this.lastProgress,
      ...update,
      progressPercentage: update.progressPercentage ?? this.lastProgress.progressPercentage,
    };
    this.writeProgress();
    this.resetHeartbeat(); // 重置定时器防止过早超时
  }

  /** 报告阻塞（检测到依赖缺失） */
  reportBlock(blockers: string[]): void {
    const key = buildWorkerKey(MemoryKeyCategory.BLOCKED, this.workerId);
    const blocked = {
      blockedOn: "dependencies",
      waitingFor: blockers,
      since: Date.now(),
      taskId: this.currentTaskId,
    };
    this.blackboard.write(key, blocked, {
      writer: this.workerId,
      timestamp: new Date().toISOString(),
      source_uri: `worker-block:${this.sessionId}:${this.workerId}`,
    });
  }

  /** 完成任务时注册结果 */
  completeTask(deliverables: { files: string[]; documentation?: string; testResults?: string }): void {
    this.stopHeartbeat();
    const key = buildWorkerKey(MemoryKeyCategory.COMPLETE, this.workerId);
    const complete = {
      status: "complete",
      task: this.lastProgress?.taskId,
      deliverables: {
        files: deliverables.files,
        documentation: deliverables.documentation,
        test_results: deliverables.testResults,
      },
      timeTakenMs: this.lastProgress ? (Date.now() - (this.lastProgress.estimatedCompletion - this.lastProgress.progressPercentage * this.lastProgress.estimatedCompletion)) : 0, // 粗略估算
      resourcesUsed: this.lastProgress?.resourcesUsed ?? { memoryMb: 0, cpuPercentage: 0 },
      timestamp: Date.now(),
    };
    this.blackboard.write(key, complete, {
      writer: this.workerId,
      timestamp: new Date().toISOString(),
      source_uri: `worker-complete:${this.sessionId}:${this.workerId}`,
    });
    this.currentTaskId = null;
    this.lastProgress = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.timer = setInterval(() => {
      // 触发超时检查（由外部监听 worker 进程存活）
      this.writeProgress(); // 强制写入当前进度
    }, this.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private resetHeartbeat(): void {
    this.stopHeartbeat();
    this.startHeartbeat();
  }

  private writeStatus(): void {
    const key = buildWorkerKey(MemoryKeyCategory.STATUS, this.workerId);
    const status = {
      agent: this.workerId,
      status: this.currentTaskId ? "task-received" : "idle",
      assigned_task: this.currentTaskId ? `task-${this.currentTaskId}` : null,
      estimated_completion: this.lastProgress?.estimatedCompletion,
      dependencies: [],
      timestamp: Date.now(),
    };
    this.blackboard.write(key, status, {
      writer: this.workerId,
      timestamp: new Date().toISOString(),
      source_uri: `worker-status:${this.sessionId}:${this.workerId}`,
    });
  }

  private writeProgress(): void {
    if (!this.lastProgress) return;
    const key = buildWorkerKey(MemoryKeyCategory.PROGRESS, this.workerId);
    this.blackboard.write(key, this.lastProgress, {
      writer: this.workerId,
      timestamp: new Date().toISOString(),
      source_uri: `worker-progress:${this.sessionId}:${this.workerId}`,
    });
  }
}
```

---

### 修正 4：Agent Task Snapshot 机制（Multica 风格）

**目标：** 提供 "所有活跃任务 + 每个 Agent 最近终端任务" 的快照查询

**实施：**
```typescript
// 新增 AgentTaskSnapshot
// src/modules/collaboration-runtime/session/agent-task-snapshot.ts

export interface AgentTaskSnapshot {
  agentId: string;
  agentName: string;
  /** 当前活跃任务（running/assigned） */
  activeTask?: {
    taskId: string;
    description: string;
    status: TaskState;
    assignedAt: string;
    startedAt?: string;
    progress?: WorkerProgress;
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
}

export interface WorkspaceTaskSnapshot {
  sessionId: string;
  /** 所有活跃任务 */
  activeTasks: TaskItem[];
  /** 每个 AGENT 的快照 */
  agents: AgentTaskSnapshot[];
  /** 全局统计 */
  summary: {
    totalAgents: number;
    activeAgents: number;
    totalActiveTasks: number;
    totalCompletedTasks: number;
    totalFailedTasks: number;
    avgMemoryMb: number;
    avgCpuPercentage: number;
  };
}

export class AgentTaskSnapshot {
  private blackboard: Blackboard;
  private sessionDir: string;
  private cachedSnapshot?: WorkspaceTaskSnapshot;
  private cacheExpiryMs: number = 5_000; // 5 秒缓存
  private lastRefreshAt: number = 0;

  constructor(blackboard: Blackboard, sessionDir: string, cacheExpiryMs?: number) {
    this.blackboard = blackboard;
    this.sessionDir = sessionDir;
    if (cacheExpiryMs) this.cacheExpiryMs = cacheExpiryMs;
  }

  /** 获取快照（带缓存） */
  async getSnapshot(forceRefresh = false): Promise<WorkspaceTaskSnapshot> {
    const now = Date.now();
    if (!forceRefresh && this.cachedSnapshot && (now - this.lastRefreshAt) < this.cacheExpiryMs) {
      return this.cachedSnapshot;
    }

    const tasks = this.blackboard.getTasks();
    const activeTasks = tasks.filter(t => t.status === "running" || t.status === "assigned");
    const completedTasks = tasks.filter(t => t.status === "completed");
    const failedTasks = tasks.filter(t => t.status === "failed");
    const reportedTasks = tasks.filter(t => t.status === "reported");

    // 收集所有 Agent ID
    const agentIds = new Set(tasks.map(t => t.assignedTo).filter(Boolean) as string[]);

    const agents: AgentTaskSnapshot[] = [];
    for (const agentId of agentIds) {
      const activeTask = activeTasks.find(t => t.assignedTo === agentId);
      const recentTerminalTask = [...completedTasks, ...failedTasks, ...reportedTasks]
        .filter(t => t.assignedTo === agentId)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];

      // 从 memoryKeys 读取进度和状态
      const statusKey = buildWorkerKey(MemoryKeyCategory.STATUS, agentId);
      const progressKey = buildWorkerKey(MemoryKeyCategory.PROGRESS, agentId);
      const statusEntry = this.blackboard.read(statusKey);
      const progressEntry = this.blackboard.read(progressKey);

      agents.push({
        agentId,
        agentName: this.blackboard.getAgentName(agentId),
        activeTask: activeTask ? {
          taskId: activeTask.id,
          description: activeTask.description,
          status: activeTask.status,
          assignedAt: activeTask.assignedAt,
          startedAt: activeTask.startedAt,
          progress: progressEntry?.value as WorkerProgress | undefined,
        } : undefined,
        recentTerminalTask: recentTerminalTask ? {
          taskId: recentTerminalTask.id,
          description: recentTerminalTask.description,
          status: recentTerminalTask.status as "completed" | "failed" | "reported",
          completedAt: recentTerminalTask.completedAt!,
          output: recentTerminalTask.output,
        } : undefined,
        resourceUsage: this.calculateResourceUsage(agentId, activeTask?.id),
      });
    }

    const snapshot: WorkspaceTaskSnapshot = {
      sessionId: this.blackboard.sessionId,
      activeTasks,
      agents,
      summary: {
        totalAgents: agentIds.size,
        activeAgents: activeTasks.length,
        totalActiveTasks: activeTasks.length,
        totalCompletedTasks: completedTasks.length,
        totalFailedTasks: failedTasks.length,
        avgMemoryMb: this.calculateAvgMemory(agents),
        avgCpuPercentage: this.calculateAvgCpu(agents),
      },
    };

    this.cachedSnapshot = snapshot;
    this.lastRefreshAt = now;
    return snapshot;
  }

  private calculateResourceUsage(agentId: string, taskId?: string): AgentTaskSnapshot["resourceUsage"] {
    // 从 memoryKeys 读取最近的 metrics
    const metricsKey = buildWorkerKey(MemoryKeyCategory.METRICS, agentId);
    const metricsEntry = this.blackboard.read(metricsKey);
    if (metricsEntry?.value) {
      return metricsEntry.value as AgentTaskSnapshot["resourceUsage"];
    }
    return undefined;
  }

  private calculateAvgMemory(agents: AgentTaskSnapshot[]): number {
    const usages = agents.map(a => a.resourceUsage?.memoryMbAvg ?? 0).filter(v => v > 0);
    return usages.length > 0 ? usages.reduce((a, b) => a + b, 0) / usages.length : 0;
  }

  private calculateAvgCpu(agents: AgentTaskSnapshot[]): number {
    const usages = agents.map(a => a.resourceUsage?.cpuPercentageAvg ?? 0).filter(v => v > 0);
    return usages.length > 0 ? usages.reduce((a, b) => a + b, 0) / usages.length : 0;
  }
}
```

**集成：**
- 在 `CollaborationRuntime` 中注册 `AgentTaskSnapshot` 实例
- 添加 `/api/collaboration/sessions/[id]/snapshot` 路由，返回 `WorkspaceTaskSnapshot`
- UI 使用该快照展示 Agent 活动仪表盘

---

### 修正 5：依赖检查前置机制

**目标：** Worker 在 `TASK_STARTED` 前必须检查依赖状态，否则写入 `blocked`

**实施：**
```typescript
// 新增 DependencyChecker
// src/modules/collaboration-runtime/engine/dependency-checker.ts

export interface DependencySpec {
  /** 依赖的 Agent ID */
  agentId: string;
  /** 依赖的任务 ID（optional，表示只要该 Agent 有任何已完成任务即可） */
  taskId?: string;
  /** 依赖的输出键名（optional，从 deliverables 中提取） */
  outputKey?: string;
}

export class DependencyChecker {
  private blackboard: Blackboard;
  private snapshot: AgentTaskSnapshot;

  constructor(blackboard: Blackboard, snapshot: AgentTaskSnapshot) {
    this.blackboard = blackboard;
    this.snapshot = snapshot;
  }

  /** 检查依赖是否满足 */
  checkDependencies(dependencies: DependencySpec[]): {
    satisfied: boolean;
    missingDeps: DependencySpec[];
  } {
    const missingDeps: DependencySpec[] = [];

    for (const dep of dependencies) {
      const satisfied = this.checkSingleDependency(dep);
      if (!satisfied) {
        missingDeps.push(dep);
      }
    }

    return {
      satisfied: missingDeps.length === 0,
      missingDeps,
    };
  }

  private checkSingleDependency(dep: DependencySpec): boolean {
    if (dep.taskId) {
      // 检查特定任务是否完成
      const task = this.blackboard.getTasks().find(t => t.id === dep.taskId);
      return task?.status === "completed" && !!task.completedAt;
    } else {
      // 检查 Agent 是否有任何已完成任务
      const agentSnapshot = (this.snapshot.cachedSnapshot?.agents ?? []).find(a => a.agentId === dep.agentId);
      return !!agentSnapshot?.recentTerminalTask?.completedAt;
    }
  }

  /** 从 Topology 自动推导依赖（对于上游 Agent） */
  deriveDependenciesFromTopology(agentId: string, topology: CollaborationTopology): DependencySpec[] {
    const dependencies: DependencySpec[] = [];
    const incomingEdges = topology.edges.filter(e => e.to === agentId && e.type === "trigger");

    for (const edge of incomingEdges) {
      dependencies.push({
        agentId: edge.from,
        taskId: undefined, // 只要上游完成了即可
        outputKey: undefined,
      });
    }

    return dependencies;
  }
}
```

**集成到 Worker 执行流程：**
```typescript
// 在 TaskOrchestrator 或 agent-worker.ts 中
const dependencies = dependencyChecker.deriveDependenciesFromTopology(agentId, topology);
const { satisfied, missingDeps } = dependencyChecker.checkDependencies(dependencies);

if (!satisfied) {
  // 写入 blocked 状态
  reporter.reportBlock(missingDeps.map(d => d.agentId));

  // 发送 TASK_BLOCKED 事件
  emitEvent("TASK_BLOCKED", {
    taskId,
    workerId: agentId,
    missingDeps: missingDeps.map(d => d.agentId),
  });

  // 不执行 TASK_STARTED，等待依赖满足
  return;
}

// 依赖满足，继续正常流程
emitEvent("TASK_STARTED", { taskId });
```

---

### 修正 6：CapabilityMatcher 基于本体契约的资源感知

**核心概念：** 
资源感知不再基于通用的 CPU/内存指标，而是基于**本体实例数据操作** 和 **Skill 输入输出契约**。每个 Agent / Skill 都有明确的：
- **可操作的本体类型**：`ontologyOperations`（哪些本体对象可以读/写）
- **Skill I/O 契约**：输入需要哪些本体实例，输出产生哪些本体实例
- **当前操作负载**：正在处理哪些本体实例（而非任务数统计）

**数据来源：**
- `Agent.md` 的 `ontologyOperations` 字段
- `Skill.md` 的 frontmatter 中声明的输入/输出本体类型
- 运行时 Blackboard 中的 `ontologyOperations$<agentId>` 键值记录当前正在操作的本体实例

**实施：**

```typescript
// 扩展类型定义
// src/modules/collaboration-runtime/session/types.ts

export interface OntologyOperationSpec {
  /** 本体对象类型（从 ontology schema 读取） */
  objectType: string;
  /** 允许的操作：create | read | update | delete | query */
  operations: string[];
}

export interface SkillOntologyContract {
  skillId: string;
  /** 输入本体约束（skill 执行完成时） */
  inputOntologies: {
    /** 需要的本体类型 */
    types: string[];
    /** 预期实例数范围（可选） */
    instanceRange?: { min: number; max: number };
  };
  /** 输出本体约束（skill 执行完成时） */
  outputOntologies: {
    /** 产生的本体类型 */
    types: string[];
    /** 预期实例数范围（可选） */
    instanceRange?: { min: number; max: number };
  };
}

export interface AgentOntologyState {
  /** Agent 可操作的本体类型操作权限 */
  allowedOperations: OntologyOperationSpec[];
  /** 已安装 Skill 的本体契约 */
  skillContracts: Map<string, SkillOntologyContract>;
  /** 当前正在处理的本体实例（任务级） */
  activeOntologyInstances: Map<string, {
    /** 实例 ID */
    instanceId: string;
    /** 本体类型 */
    objectType: string;
    /** 当前操作 */
    operation: 'read' | 'write' | 'query';
    /** 关联任务 ID */
    taskId: string;
    /** 开始时间 */
    startedAt: string;
  }>;
  /** 最近 30 分钟的操作统计（用于负载评估） */
  operationStats: Map<string, {
    objectType: string;
    operation: string;
    count: number;
    totalDurationMs: number;
    avgDurationMs: number;
  }>;
}

// 扩展 Blackboard 键值约定
export const ONTOLOGY_STATE_KEY_PREFIX = "ontology_state";

export function buildOntologyStateKey(agentId: string): string {
  return `${ONTOLOGY_STATE_KEY_PREFIX}$${agentId}`;
}
```

```typescript
// 重写 CapabilityMatcher 基于本体契约
// src/modules/collaboration-runtime/engine/supervisor.ts

export class CapabilityMatcher {
  private blackboard: Blackboard;
  private snapshot: AgentTaskSnapshot;

  constructor(blackboard: Blackboard, snapshot: AgentTaskSnapshot) {
    this.blackboard = blackboard;
    this.snapshot = snapshot;
  }

  /**
   * 检查 Agent 是否具备处理任务所需的本体操作能力
   */
  async checkOntologyCapabilities(
    agentId: string,
    requiredOntologyTypes: string[],
    requiredOperation: 'create' | 'read' | 'update' | 'delete' | 'query'
  ): Promise<boolean> {
    const stateKey = buildOntologyStateKey(agentId);
    const stateEntry = this.blackboard.read(stateKey);

    if (!stateEntry?.value) {
      // 尝试从 Agent.md 加载
      const agentState = await AgentOntologyState.loadFromAgentMd(agentId, this.blackboard.sessionId);
      return this.hasOperationCapability(agentState.requiredOntologies, requiredOntologyTypes, requiredOperation);
    }

    const agentState = stateEntry.value as AgentOntologyState;
    return this.hasOperationCapability(agentState.allowedOperations, requiredOntologyTypes, requiredOperation);
  }

  /**
   * 检查 Agent 当前本体操作负载（而非简单的任务数）
   */
  getCurrentOntologyLoad(agentId: string): {
    activeInstances: number;
    lockedObjectTypes: string[];
    estimatedComplexity: number;
  } {
    const stateKey = buildOntologyStateKey(agentId);
    const stateEntry = this.blackboard.read(stateKey);
    
    if (!stateEntry?.value) {
      return { activeInstances: 0, lockedObjectTypes: [], estimatedComplexity: 0 };
    }

    const agentState = stateEntry.value as AgentOntologyState;
    const activeInstances = agentState.activeOntologyInstances.size;
    const lockedObjectTypes = Array.from(new Set(
      Array.from(agentState.activeOntologyInstances.values()).map(i => i.objectType)
    ));

    // 基于历史操作统计计算复杂度评估
    let complexity = 0;
    for (const instance of agentState.activeOntologyInstances.values()) {
      const stats = agentState.operationStats.get(`${instance.objectType}-${instance.operation}`);
      const avgDuration = stats?.avgDurationMs ?? 0;
      complexity += avgDuration / 1000; // 每秒一个复杂度单位
    }

    return { activeInstances, lockedObjectTypes, estimatedComplexity: complexity };
  }

  /**
   * 选择最优 Agent，基于本体契约匹配 + 当前操作负载
   */
  async matchAgentForOntologyTask(
    task: {
      description: string;
      requiredOntologyTypes: string[];
      requiredOperation: 'create' | 'read' | 'update' | 'delete' | 'query';
      skillId?: string; // 可选，指定使用哪个 Skill
    },
    availableAgents: AgentCapability[]
  ): Promise<AgentCapability[]> {
    if (availableAgents.length === 0) { return []; }

    const scored = await Promise.all(availableAgents.map(async (agent) => {
      const capabilityScore = agent.capabilities.includes(task.requiredOperation) ? 20 : 0;
      
      // 检查本体操作权限
      const canOperate = await this.checkOntologyCapabilities(agent.agentId, task.requiredOntologyTypes, task.requiredOperation);
      if (!canOperate) return { agent, score: 0 };

      // 检查 Skill 契约（如果指定了 Skill）
      let skillContractMatch = true;
      let skillBonus = 0;
      if (task.skillId) {
        const stateKey = buildOntologyStateKey(agent.agentId);
        const stateEntry = this.blackboard.read(stateKey);
        const agentState = stateEntry?.value as AgentOntologyState;
        const contract = agentState?.skillContracts.get(task.skillId);
        
        if (contract) {
          // 验证 Skill 输入 ontologies 是否匹配任务需求
          const inputMatch = contract.inputOntologies.types.some(t => task.requiredOntologyTypes.includes(t));
          skillContractMatch = inputMatch;
          skillBonus = inputMatch ? 10 : 0; // 使用正确 Skill 有加分
        } else {
          skillContractMatch = false;
        }
      }

      if (!skillContractMatch) return { agent, score: 0 };

      // 获取当前本体操作负载
      const load = this.getCurrentOntologyLoad(agent.agentId);
      
      // 负载评分：操作实例越少越好，复杂度越低越好
      const loadScore = Math.max(0, 30 - load.estimatedComplexity - load.activeInstances * 2);

      // 能力匹配高权重
      const capabilityWeight = task.requiredOntologyTypes.length > 0 ? 30 : 0;
      const ontologyMatchCount = task.requiredOntologyTypes.filter(type => 
        this.canAgentOperateType(agent, type)
      ).length;
      const ontologyScore = (ontologyMatchCount / task.requiredOntologyTypes.length) * capabilityWeight;

      // 历史成功率（从 operationStats 推断）
      const stateKey = buildOntologyStateKey(agent.agentId);
      const stateEntry = this.blackboard.read(stateKey);
      const agentState = stateEntry?.value as AgentOntologyState;
      let successRate = 0.8; // 默认值
      if (agentState?.operationStats.size) {
        // 简单推断：操作数越多且平均耗时越低，说明越熟练
        const totalOps = Array.from(agentState.operationStats.values()).reduce((sum, s) => sum + s.count, 0);
        const avgDuration = Array.from(agentState.operationStats.values()).reduce((sum, s) => sum + s.avgDurationMs, 0) / agentState.operationStats.size;
        successRate = Math.min(1, 0.5 + (totalOps / 100) * 0.3 + (5000 / (avgDuration + 1)) * 0.2);
      }
      const historyScore = successRate * 20;

      const totalScore = capabilityScore + loadScore + ontologyScore + skillBonus + historyScore;
      return { agent, score: totalScore };
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.agent);
  }

  private hasOperationCapability(
    allowedOperations: OntologyOperationSpec[],
    requiredTypes: string[],
    requiredOperation: string
  ): boolean {
    if (allowedOperations.length === 0) return true; // 无约束，允许所有操作

    for (const type of requiredTypes) {
      const spec = allowedOperations.find(op => op.objectType === type);
      if (!spec || !spec.operations.includes(requiredOperation)) {
        return false;
      }
    }
    return true;
  }

  private canAgentOperateType(agent: AgentCapability, ontologyType: string): boolean {
    // 检查 allowedOntologies 字段（扩展 AgentCapability）
    const capability = agent as any; // 允许向下转型
    if (!capability.allowedOntologies) return false;
    return capability.allowedOntologies.includes(ontologyType);
  }
}
```

**数据来源更新：**
1. **Agent.md 加载时解析 `ontologyOperations`**：初始化 `AgentOntologyState.allowedOperations`
2. **Skill.md frontmatter 解析 I/O 契约**：填充 `AgentOntologyState.skillContracts`
3. **任务开始时**：登记到 `activeOntologyInstances`，记录操作的本体实例
4. **任务完成时**：更新 `operationStats` 统计
5. **Blackboard 持久化**：`ontology_state$<agentId>` 键值存储完整状态

**示例 Agent.md frontmatter：**
```yaml
---
name: ontologist-coder
type: coder
allowedOntologies: ["Concept", "Attribute", "Relationship"]
ontologyOperations:
  - objectType: Concept
    operations: ["create", "read", "update", "delete", "query"]
  - objectType: Attribute
    operations: ["read", "update", "delete"]
---
```

**示例 Skill.md frontmatter：**
```yaml
---
name: concept-builder
inputOntologies:
  types: ["Attribute", "Relationship"]
outputOntologies:
  types: ["Concept"]
  instanceRange: { min: 1, max: 10 }
---
```

---

## 📊 问题清单 vs 修正方案汇总表

| 问题编号 | 问题描述 | Ruflo/Multica 对标 | 修正方案编号 | 修正方案描述 |
|---------|----------|-------------------|------------|-------------|
| P1 | 自由键值导致可观测性困难 | Ruflo：强制 `swarm$<role>$<category>` 结构 | M1 | 引入结构化键值命名约定，建立内存索引映射 |
| P2 | 缺少定时强制刷新 | Ruflo：Queen 每分钟必写权威状态 | M2 | SupervisorHeartbeat 定时器，1 分钟强制心跳 |
| P3 | Worker 进度更新频率不固定 | Ruflo：每 30-60 秒必汇报 | M3 | WorkerProgressReporter 45 秒强制进度汇报 |
| P4 | 依赖检查前置机制缺失 | Ruflo：Worker 开始前检查依赖 | M5 | DependencyChecker，TASK_STARTED 前必查依赖 |
| P5 | 缺少 Worker 活动快照 | Multica：agent-task-snapshot | M4 | AgentTaskSnapshot，活跃任务 + 最近终端任务 |
| P6 | 状态更新不强制，异常检测困难 | Ruflo：心跳超时检测 | M2+M3 | 双心跳机制（Queen+Worker），超时触发异常 |
| P7 | 资源分配不透明 | Ruflo：资源使用统计 | M6 | CapabilityMatcher 增资源感知（内存/CPU） |
| P8 | 结果交付不结构化 | Ruflo：`deliverables` 明确 | M3 | `completeTask()` 传入结构化输出 |

---

## 🛠️ 技术文件修改清单

### 新增文件

```
src/modules/collaboration-runtime/
├── session/
│   ├── memory-keys.ts                    # M1: 结构化键值约定
│   ├── agent-task-snapshot.ts            # M4: Agent Task 快照
│   └── dependency-checker.ts             # M5: 依赖检查器
├── engine/
│   └── supervisor-heartbeat.ts           # M2: Supervisor 心跳
└── sandbox/
    └── worker-progress-reporter.ts       # M3: Worker 进度汇报器
```

### 修改文件

```
src/modules/collaboration-runtime/
├── session/blackboard.ts                 # M1: 扩展 memoryIndex
├── engine/supervisor.ts                  # M2: 集成 SupervisorHeartbeat
├── engine/task-orchestrator.ts           # M5: 集成 DependencyChecker
└── sandbox/agent-worker.mts              # M3: 集成 WorkerProgressReporter

src/lib/collaboration-runtime-bridge/
└── multi-agent-executor.ts               # M4: 集成 AgentTaskSnapshot

src/app/api/collaboration/sessions/
└── [id]/snapshot/route.ts                # M4: 新增快照 API
```

---

## ✅ 验收标准

- [ ] **M1 - 结构化键值**：`buildSupervisorKey()` / `buildWorkerKey()` 生成正确键值格式
- [ ] **M1 - 内存索引**：`Blackboard.memoryIndex` 正确映射 Agent 状态，可按角色/类别查询
- [ ] **M2 - Supervisor 心跳**：每分钟自动写入 `supervisor$status`，包含活跃任务统计
- [ ] **M2 - Royal Report**：每 2 分钟写入 `supervisor$report`，包含目标进度和推荐
- [ ] **M3 - Worker 进度汇报**：Worker 每 45 秒自动更新 `worker-[ID]$progress`
- [ ] **M3 - Worker 阻塞报告**：依赖缺失时立即写入 `worker-[ID]$blocked`
- [ ] **M3 - Worker 完成报告**：任务完成时写入 `worker-[ID]$complete`，包含结构化 `deliverables`
- [ ] **M4 - Agent Task 快照**：`getSnapshot()` 返回所有活跃任务 + 每个 Agent 的最近终端任务
- [ ] **M4 - 快照 API**：`/api/collaboration/sessions/[id]/snapshot` 返回 `WorkspaceTaskSnapshot`
- [ ] **M5 - 依赖检查**：`TASK_STARTED` 前检查上游依赖，不满足则写入 `blocked`
- [ ] **M6 - CapabilityMatcher 增强**：考虑资源使用指标（内存/CPU）和历史成功率
- [ ] **集成测试**：完整执行 3-agent 直线拓扑 + 3-agent 并行拓扑，验证所有机制正常工作
- [ ] **性能测试**：10 个 Agent 并发执行，快照查询延迟 < 100ms

---

## 🔄 与现有 Story 9.XX 的依赖关系

| Story | 依赖关系 | 说明 |
|-------|---------|------|
| 9.13 (Supervisor 模式) | 依赖 9.13 | 本 Story 增强现有 Supervisor，不改变基础架构 |
| 9.28 (Swarm/Supervisor 生产接线) | 依赖 9.28 | 本 Story 修正 Supervisor 行为，TaskOrchestrator 调用方式不变 |
| 9.30 (Supervisor Agent 化) | 并行开发 | 9.30 聚焦 Agent 实现细节，本 Story 聚焦协作协议 |
| 9.31-9.35 (单前台 Agent 契约) | 兼容 | 本 Story 的内存键值约定不违反 9.31 的单前台约束 |

---

**变更记录：**

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-22 | 初始版本：对比 Ruflo/Multica，识别 8 个问题，设计 6 个修正方案 | AI |
