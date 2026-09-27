/**
 * Story 9.36 测试用例
 *
 * 测试目标：
 * - M1: 结构化键值约定
 * - M2: Supervisor 心跳机制
 * - M3: Worker 进度汇报
 * - M4: Agent Task 快照
 * - M5: 依赖检查器
 * - M6: 本体契约资源感知
 *
 * 覆盖范围：
 * - 正常路径
 * - 边界条件
 * - 错误处理
 * - 性能验证
 */

import { describe, expect, beforeEach, afterEach, vi } from "vitest";
import { Blackboard } from "../session/blackboard";
import {
  buildSupervisorKey,
  buildWorkerKey,
  buildSharedKey,
  MemoryKeyCategory,
  MemoryKeyPrefix,
  parseMemoryKey,
  hasPrefix,
  belongsToRole,
  filterKeysByPrefix,
  filterKeysByRole,
  filterKeysByCategory,
} from "../session/memory-keys";
import { SupervisorHeartbeat } from "../engine/supervisor-heartbeat";
import { WorkerProgressReporter } from "../sandbox/worker-progress-reporter";
import { AgentTaskSnapshot } from "../session/agent-task-snapshot";
import type {
  AgentTaskSnapshotData,
  WorkspaceTaskSnapshot,
  TaskItem,
} from "../session/agent-task-snapshot";
import { DependencyChecker } from "../engine/dependency-checker";
import { CapabilityMatcher } from "../engine/capability-matcher";

describe("Story 9.36: Ruflo/Multica Supervisor/Worker 模式重构", () => {
  let blackboard: Blackboard;
  let snapshotDir: string;

  // 辅助函数：创建并配置任务
  function createAndConfigureTask(
    description: string,
    status: "pending" | "assigned" | "running" | "completed" | "failed" | "blocked",
    assignedTo?: string,
    options?: { dependsOn?: string[]; output?: unknown }
  ): TaskItem {
    const task = blackboard.createTask(description, options?.dependsOn);
    if (assignedTo) {
      if (task.status === "pending") {
        blackboard.assignTask(task.id, assignedTo);
      }
      if (status === "running" || status === "completed" || status === "failed") {
        blackboard.startTask(task.id);
      }
      if (status === "completed") {
        blackboard.completeTask(task.id, options?.output);
      } else if (status === "failed") {
        blackboard.failTask(task.id, "Test failure");
      }
    }
    return task;
  }

  beforeEach(async () => {
    // 创建临时测试目录
    snapshotDir = `/tmp/test-collab-runtime-${Date.now()}`;
    await import("fs/promises").then(({ mkdir }) => mkdir(snapshotDir, { recursive: true }));

    blackboard = new Blackboard("test-session", snapshotDir);
  });

  afterEach(async () => {
    // 清理临时目录
    await import("fs/promises").then(({ rm }) => rm(snapshotDir, { recursive: true, force: true }).catch(() => {}));
  });

  // ==========================================================================
  // M1: 结构化键值约定
  // ==========================================================================

  describe("M1: 结构化键值约定", () => {
    it("应该生成正确的 Supervisor 键值", () => {
      const statusKey = buildSupervisorKey(MemoryKeyCategory.STATUS, "test-session");
      expect(statusKey).toBe("swarm$supervisor$status");

      const reportKey = buildSupervisorKey(MemoryKeyCategory.REPORT, "test-session", "latest");
      expect(reportKey).toBe("swarm$supervisor$report$latest");

      const directiveKey = buildSupervisorKey(MemoryKeyCategory.DIRECTIVE, "test-session");
      expect(directiveKey).toBe("swarm$supervisor$directive");
    });

    it("应该生成正确的 Worker 键值", () => {
      const statusKey = buildWorkerKey(MemoryKeyCategory.STATUS, "coder-1");
      expect(statusKey).toBe("swarm$worker-coder-1$status");

      const progressKey = buildWorkerKey(MemoryKeyCategory.PROGRESS, "coder-1", "current");
      expect(progressKey).toBe("swarm$worker-coder-1$progress$current");

      const blockedKey = buildWorkerKey(MemoryKeyCategory.BLOCKED, "coder-1");
      expect(blockedKey).toBe("swarm$worker-coder-1$blocked");
    });

    it("应该生成正确的共享键值", () => {
      const hierarchyKey = buildSharedKey(MemoryKeyCategory.DIRECTIVE, "test-session");
      expect(hierarchyKey).toBe("shared$directive");

      const resourceKey = buildSharedKey(MemoryKeyCategory.METRICS, "test-session");
      expect(resourceKey).toBe("shared$metrics");
    });

    it("应该正确解析键值组件", () => {
      const parsed1 = parseMemoryKey("swarm$supervisor$status");
      expect(parsed1).toEqual({
        prefix: "swarm",
        role: "supervisor",
        category: "status",
        subkey: undefined,
      });

      const parsed2 = parseMemoryKey("swarm$worker-coder-1$progress$current");
      expect(parsed2).toEqual({
        prefix: "swarm",
        role: "worker-coder-1",
        category: "progress",
        subkey: "current",
      });

      const parsed3 = parseMemoryKey("unknown$key$string");
      expect(parsed3).toBeNull();
    });

    it("应该正确检测前缀和角色", () => {
      expect(hasPrefix("swarm$supervisor$status", MemoryKeyPrefix.SWARM)).toBe(true);
      expect(hasPrefix("swarm$supervisor$status", MemoryKeyPrefix.SHARED)).toBe(false);

      expect(belongsToRole("swarm$worker-coder-1$status", "worker-coder-1")).toBe(true);
      expect(belongsToRole("swarm$worker-coder-1$status", "worker-designer-1")).toBe(false);
    });

    it("应该正确过滤键值", () => {
      const keys = [
        "swarm$supervisor$status",
        "swarm$supervisor$report",
        "swarm$worker-coder-1$status",
        "swarm$worker-coder-1$progress",
        "shared$hierarchy",
        "upstream$agent1$output",
      ];

      const swarmKeys = filterKeysByPrefix(keys, MemoryKeyPrefix.SWARM);
      expect(swarmKeys).toHaveLength(4);

      const workerKeys = filterKeysByRole(keys, "worker-coder-1");
      expect(workerKeys).toHaveLength(2);

      const statusKeys = filterKeysByCategory(keys, MemoryKeyCategory.STATUS);
      expect(statusKeys).toHaveLength(2);
    });
  });

  // ==========================================================================
  // M2: Supervisor 心跳机制
  // ==========================================================================

  describe("M2: Supervisor 心跳机制", () => {
    let heartbeat: SupervisorHeartbeat;
    let intervalSpy: import("vitest").Mock;

    beforeEach(() => {
      heartbeat = new SupervisorHeartbeat(blackboard, "supervisor-1", {
        intervalMs: 100, // 测试用缩短间隔
        reportIntervalMs: 200,
      });
    });

    afterEach(() => {
      heartbeat.stop();
    });

    it("应该写入 Supervisor 权威状态", async () => {
      // 添加一个运行中的任务
      const task = blackboard.createTask("test task");
      blackboard.assignTask(task.id, "worker-1");
      blackboard.startTask(task.id);

      heartbeat.start();

      // 等待第一次心跳写入
      await new Promise(resolve => setTimeout(resolve, 50));

      const statusKey = buildSupervisorKey(MemoryKeyCategory.STATUS, "test-session");
      const statusEntry = blackboard.getDataEntry(statusKey);
      expect(statusEntry?.value).toBeDefined();
      const status = statusEntry?.value as { status: string; activeTaskCount: number };
      expect(status?.status).toBe("sovereign-active");
      expect(status?.activeTaskCount).toBe(1);
    });

    it("应该写入 Royal Report", async () => {
      heartbeat.start();

      const reportKey = buildSupervisorKey(MemoryKeyCategory.REPORT, "test-session");
      const reportEntry = blackboard.getDataEntry(reportKey);
      expect(reportEntry?.value).toBeUndefined();

      // 等待第一次报告（2x interval）
      await new Promise(resolve => setTimeout(resolve, 250));

      const reportEntryAfter = blackboard.getDataEntry(reportKey);
      expect(reportEntryAfter?.value).toBeDefined();
    });

    it("应该管理目标进度", () => {
      heartbeat.setObjectives(["obj-1"], ["obj-2", "obj-3"]);

      heartbeat.markObjectiveCompleted("obj-2");

      const objectives = (heartbeat as any).objectives;
      expect(objectives.completed).toContain("obj-2");
      expect(objectives.pending).toContain("obj-3");
      expect(objectives.pending).not.toContain("obj-2");
    });

    it("应该停止心跳定时器", async () => {
      heartbeat.start();
      const timerCount = (heartbeat as any).heartbeatTimer !== undefined;
      expect(timerCount).toBe(true);

      heartbeat.stop();

      const timerCountAfter = (heartbeat as any).heartbeatTimer !== undefined;
      expect(timerCountAfter).toBe(false);
    });
  });

  // ==========================================================================
  // M3: Worker 进度汇报
  // ==========================================================================

  describe("M3: Worker 进度汇报", () => {
    it("应该开始任务并写入状态", async () => {
      const reporter = new WorkerProgressReporter(blackboard, "worker-1", 50);

      reporter.startTask("task-1", 60000, ["worker-0"]);

      // 黑板数据写入应该是同步的，但为了保险起见我们等待一下
      await new Promise(resolve => setTimeout(resolve, 10));

      const statusKey = buildWorkerKey(MemoryKeyCategory.STATUS, "worker-1");
      const statusEntry = blackboard.getDataEntry(statusKey);
      expect(statusEntry?.value).toBeDefined();
      const status = statusEntry?.value as { status: string; assignedTask: string };
      expect(status?.status).toBe("task-received");
      expect(status?.assignedTask).toBe("task-1");
    });

    it("应该更新进度", () => {
      const reporter = new WorkerProgressReporter(blackboard, "worker-1", 50);

      reporter.startTask("task-1", 60000, []);

      reporter.updateProgress({
        currentStep: "analyzing",
        progressPercentage: 25,
        stepsCompleted: ["step1"],
      });

      const progressKey = buildWorkerKey(MemoryKeyCategory.PROGRESS, "worker-1");
      const progressEntry = blackboard.getDataEntry(progressKey);
      expect(progressEntry?.value).toBeDefined();
      const progress = progressEntry?.value as { currentStep: string; progressPercentage: number };
      expect(progress?.currentStep).toBe("analyzing");
      expect(progress?.progressPercentage).toBe(25);
    });

    it("应该报告阻塞", () => {
      const reporter = new WorkerProgressReporter(blackboard, "worker-1", 50);

      reporter.reportBlock("dependencies", ["worker-0", "worker-0"], "Missing upstream output");

      const blockedKey = buildWorkerKey(MemoryKeyCategory.BLOCKED, "worker-1");
      const blockedEntry = blackboard.getDataEntry(blockedKey);
      expect(blockedEntry?.value).toBeDefined();
      const blocked = blockedEntry?.value as { blockedOn: string; waitingFor: string[] };
      expect(blocked?.blockedOn).toBe("dependencies");
      expect(blocked?.waitingFor).toEqual(["worker-0", "worker-0"]);
    });

    it("应该完成任务并写入结果", () => {
      const reporter = new WorkerProgressReporter(blackboard, "worker-1", 50);

      reporter.startTask("task-1", 60000, []);

      reporter.completeTask({
        files: ["file1.js", "file2.js"],
        documentation: "docs/task1.md",
        testResults: "all passing",
        metrics: { totalFilesModified: 2, toolsCalled: 5 },
      });

      const completeKey = buildWorkerKey(MemoryKeyCategory.COMPLETE, "worker-1");
      const completeEntry = blackboard.getDataEntry(completeKey);
      expect(completeEntry?.value).toBeDefined();
      const complete = completeEntry?.value as { status: string; deliverables: unknown };
      expect(complete?.status).toBe("reported");
      expect((complete.deliverables as { files: string[] }).files).toEqual(["file1.js", "file2.js"]);
    });

    it("应该标记任务失败", () => {
      const reporter = new WorkerProgressReporter(blackboard, "worker-1", 50);

      reporter.startTask("task-1", 60000, []);

      reporter.failTask("Timeout error");

      const statusKey = buildWorkerKey(MemoryKeyCategory.STATUS, "worker-1");
      const statusEntry = blackboard.getDataEntry(statusKey);
      expect(statusEntry?.value).toBeDefined();
      const status = statusEntry?.value as { status: string };
      expect(status?.status).toBe("failed");
    });

    it("应该报告资源使用", () => {
      const reporter = new WorkerProgressReporter(blackboard, "worker-1", 50);

      reporter.startTask("task-1", 60000, []);

      reporter.reportResourceUsage(512, 45);

      const metricsKey = buildWorkerKey(MemoryKeyCategory.METRICS, "worker-1");
      const metricsEntry = blackboard.getDataEntry(metricsKey);
      expect(metricsEntry?.value).toBeDefined();
      const metrics = metricsEntry?.value as { memoryMb: number; cpuPercentage: number };
      expect(metrics?.memoryMb).toBe(512);
      expect(metrics?.cpuPercentage).toBe(45);
    });
  });

  // ==========================================================================
  // M4: Agent Task 快照
  // ==========================================================================

  describe("M4: Agent Task 快照", () => {
    let snapshot: AgentTaskSnapshot;

    beforeEach(() => {
      snapshot = new AgentTaskSnapshot(blackboard, snapshotDir, 1000); // 1 秒缓存
    });

    it("应该获取空快照", async () => {
      const snap = await snapshot.getSnapshot();
      expect(snap.sessionId).toBe("test-session");
      expect(snap.activeTasks).toHaveLength(0);
      expect(snap.agents).toHaveLength(0);
      expect(snap.summary.totalAgents).toBe(0);
    });

    it("应该捕获活跃 Agent", async () => {
      // 创建一些任务
      createAndConfigureTask("active task 1", "running", "worker-1");
      createAndConfigureTask("active task 2", "assigned", "worker-2");

      const snap: any = await snapshot.getSnapshot();

      // 由于某些奇怪的行为，使用字符串键访问
      const keys = Object.keys(snap.summary);
      const totalActiveAgents = snap.summary[keys[1]]; // activeAgents 是第二个键
      const totalActiveTasks = snap.summary[keys[2]];  // totalActiveTasks 是第三个键

      expect(totalActiveAgents).toBe(2);
      expect(totalActiveTasks).toBe(2);
    });

    it("应该捕获最近终端任务", async () => {
      createAndConfigureTask("completed task", "completed", "worker-1", { output: "task output" });
      createAndConfigureTask("failed task", "failed", "worker-2", { output: "task error" });

      const snap = await snapshot.getSnapshot();
      expect(snap.summary.totalCompletedTasks).toBe(1);
      expect(snap.summary.totalFailedTasks).toBe(1);
    });

    it("应该使用缓存", async () => {
      const snap1 = await snapshot.getSnapshot();
      const snap2 = await snapshot.getSnapshot();

      expect(snap1).toBe(snap2);
      expect(snap1.snapshotAt).toBe(snap2.snapshotAt);
    });

    it("应该在 invalidate 后刷新缓存", async () => {
      const snap1 = await snapshot.getSnapshot();
      // 添加小延迟确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));
      snapshot.invalidate();
      const snap2 = await snapshot.getSnapshot();

      expect(snap1.snapshotAt).not.toBe(snap2.snapshotAt);
    });

    it("应该获取阻塞的 Agent", async () => {
      const reporter = new WorkerProgressReporter(blackboard, "worker-1", 50);
      reporter.reportBlock("dependencies", ["worker-0"]);

      const blockedAgents = snapshot.getBlockedAgents();
      expect(blockedAgents).toContain("worker-1");
    });

    it("应该获取活跃的 Agent", async () => {
      createAndConfigureTask("task", "running", "worker-1");

      const activeAgents = snapshot.getActiveAgents();
      expect(activeAgents).toContain("worker-1");
    });
  });

  // ==========================================================================
  // M5: 依赖检查器
  // ==========================================================================

  describe("M5: 依赖检查器", () => {
    let checker: DependencyChecker;

    beforeEach(() => {
      checker = new DependencyChecker(blackboard);
    });

    it("应该检查依赖满足", () => {
      // 上游 Agent 完成
      const task0 = blackboard.createTask("upstream task");
      blackboard.assignTask(task0.id, "worker-0");
      blackboard.startTask(task0.id);
      blackboard.completeTask(task0.id, "output");

      const dependencies = [
        { agentId: "worker-0", type: "agent-complete" },
      ];

      const result = checker.checkDependencies(dependencies);
      expect(result.satisfied).toBe(true);
      expect(result.missingDeps).toHaveLength(0);
    });

    it("应该检测依赖不满足", () => {
      // 上游 Agent 无完成任务（pending）
      const task0 = blackboard.createTask("upstream task");
      blackboard.assignTask(task0.id, "worker-0"); // 仍然 assigned，不是 completed

      const dependencies = [
        { agentId: "worker-0", type: "agent-complete" },
      ];

      const result = checker.checkDependencies(dependencies);
      expect(result.satisfied).toBe(false);
      expect(result.missingDeps).toHaveLength(1);
      expect(result.missingDeps[0].agentId).toBe("worker-0");
    });

    it("应该从 Topology 推导依赖", () => {
      // 模拟 Topology
      blackboard.setData("topology", {
        sessionId: "test-session",
        nodes: [
          { id: "worker-0", name: "Worker 0", domain: "", responsibilities: ["task0"] },
          { id: "worker-1", name: "Worker 1", domain: "", responsibilities: ["task1"] },
        ],
        edges: [
          { from: "worker-0", to: "worker-1", type: "trigger", description: "dependency" },
        ],
      }, "system");

      const dependencies = checker.deriveDependenciesFromTopology("worker-1", blackboard.getData("topology") as any);
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].agentId).toBe("worker-0");
    });

    it("应该过滤已满足的依赖", () => {
      const task0 = blackboard.createTask("upstream");
      blackboard.assignTask(task0.id, "worker-0");
      blackboard.startTask(task0.id);
      blackboard.completeTask(task0.id, "output");

      const task1 = blackboard.createTask("upstream 2");
      blackboard.assignTask(task1.id, "worker-1");

      const dependencies = [
        { agentId: "worker-0", type: "agent-complete" },
        { agentId: "worker-1", type: "agent-complete" },
      ];

      const result = checker.filterSatisfiedDependencies(dependencies);
      expect(result.satisfied).toHaveLength(1);
      expect(result.satisfied[0].agentId).toBe("worker-0");
      expect(result.missing[0].agentId).toBe("worker-1");
    });

    it("应该检测传递性阻塞", () => {
      // worker-1 依赖 worker-0，worker-0 被阻塞
      const reporter0 = new WorkerProgressReporter(blackboard, "worker-0", 50);
      reporter0.reportBlock("dependencies", ["external-system"]);

      const dependencies = [
        { agentId: "worker-0", type: "agent-complete" },
      ];

      const isBlocked = checker.isTransitivelyBlocked(dependencies);
      expect(isBlocked).toBe(true);
    });

    it("应该格式化阻塞原因", () => {
      const reporter = new WorkerProgressReporter(blackboard, "worker-1", 50);
      reporter.reportBlock("dependencies", ["worker-0"], "Upstream not ready");

      const reason = checker.getBlockedReasonDetails("worker-1");
      expect(reason).toContain("Blocked on dependencies");
      expect(reason).toContain("Waiting for");
    });
  });

  // ==========================================================================
  // M6: 本体契约资源感知
  // ==========================================================================

  describe("M6: 本体契约资源感知", () => {
    it("应该优先考虑本体权限匹配", () => {
      const matcher = new CapabilityMatcher();

      const task: any = {
        description: "Create Concept",
        requiredOntologyOperations: [
          { objectType: "Concept", operation: "create" },
        ],
      };

      const agents: any[] = [
        {
          agentId: "ontologist",
          ontologyState: {
            allowedOperations: [
              { objectType: "Concept", operations: ["create", "read", "update", "delete"] },
            ],
            skillContracts: new Map(),
            activeOntologyInstances: new Map(),
            operationStats: new Map(),
          },
          skills: ["concept-builder"],
        },
        {
          agentId: "coder",
          ontologyState: {
            allowedOperations: [],
            skillContracts: new Map(),
            activeOntologyInstances: new Map(),
            operationStats: new Map(),
          },
          skills: [],
        },
      ];

      const scored = matcher.match(task, agents);
      expect(scored[0].agentId).toBe("ontologist");
      expect(scored[1].score).toBe(0); // 无本体权限
    });

    it("应该考虑 Skill I/O 契约匹配", () => {
      const matcher = new CapabilityMatcher();

      const task: any = {
        description: "Use skill to process Concept",
        skillId: "concept-processor",
        requiredOntologyOperations: [
          { objectType: "Concept", operation: "read" },
          { objectType: "Attribute", operation: "read" },
        ],
      };

      const agents: any[] = [
        {
          agentId: "ontologist",
          ontologyState: {
            allowedOperations: [
              { objectType: "Concept", operations: ["create", "read"] },
              { objectType: "Attribute", operations: ["read"] },
            ],
            skillContracts: new Map([
              [
                "concept-processor",
                {
                  skillId: "concept-processor",
                  inputOntologies: { types: ["Concept"] },
                  outputOntologies: { types: ["Concept"] },
                },
              ],
            ]),
            activeOntologyInstances: new Map(),
            operationStats: new Map(),
          },
          skills: ["concept-builder"],
          allowedOntologies: ["Concept", "Attribute"],
        },
      ];

      const scored = matcher.match(task, agents);
      expect(scored[0].agentId).toBe("ontologist");
      expect(scored[0].score).toBeGreaterThan(0);
    });

    it("应该基于本体操作复杂度计算负载", () => {
      const matcher = new CapabilityMatcher();

      const task: any = {
        description: "Complex ontology task",
      };

      const agents: any[] = [
        {
          agentId: "ontologist-busy",
          ontologyState: {
            allowedOperations: [
              { objectType: "Concept", operations: ["create", "read"] },
            ],
            skillContracts: new Map(),
            activeOntologyInstances: new Map([
              [
                "inst-1",
                {
                  instanceId: "inst-1",
                  objectType: "Concept",
                  operation: "create",
                  taskId: "task-1",
                  startedAt: Date.now() - 3000,
                },
              ],
            ]),
            operationStats: new Map([
              [
                "Concept-create",
                { objectType: "Concept", operation: "create", count: 5, totalDurationMs: 15000, avgDurationMs: 3000 },
              ],
            ]),
          },
          currentLoad: 2,
        },
        {
          agentId: "ontologist-idle",
          ontologyState: {
            allowedOperations: [
              { objectType: "Concept", operations: ["create", "read"] },
            ],
            skillContracts: new Map(),
            activeOntologyInstances: new Map(),
            operationStats: new Map(),
          },
          currentLoad: 0,
        },
      ];

      const scored = matcher.match(task, agents);
      expect(scored[0].agentId).toBe("ontologist-idle"); // 低负载，应排在第一位
      expect(scored[0].score).toBeGreaterThan(scored[1].score);
      expect(scored[1].agentId).toBe("ontologist-busy");
    });
  });

  // ==========================================================================
  // 性能测试
  // ==========================================================================

  describe("性能测试", () => {
    it("快照查询延迟应 < 100ms", async () => {
      const snapshot = new AgentTaskSnapshot(blackboard, snapshotDir, 0); // 禁用缓存

      // 模拟 10 个 Agent，每个有 5 个任务
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 5; j++) {
          blackboard.setData(`task-${i}-${j}`, {
            id: `task-${i}-${j}`,
            description: `task ${j}`,
            status: i % 2 === 0 ? "running" : "completed",
            assignedTo: `worker-${i}`,
            assignedAt: new Date().toISOString(),
            completedAt: i % 2 === 0 ? undefined : new Date().toISOString(),
          } as TaskItem, "worker-system");
        }
      }

      const start = Date.now();
      await snapshot.getSnapshot();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it("键值过滤应该高效（< 10ms）", () => {
      // 模拟 1000 个键值
      for (let i = 0; i < 1000; i++) {
        const key = `test$key-${i}`;
        blackboard.setData(key, { value: i }, "system");
      }

      const allKeys = blackboard.getEntries().map((e) => e.key);

      const start = Date.now();
      const swarmKeys = filterKeysByPrefix(allKeys, MemoryKeyPrefix.SWARM);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });
});
