# 架构设计 - Story 9.13

**Story:** Supervisor 模式（Supervisor-Worker）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-18

---

## 技术栈

- TypeScript 5.x+（严格模式）
- React 18.x+（函数式组件 + Hooks）
- Zustand 4.x+（状态管理）
- Tailwind CSS 3.x+（样式）

---

## 数据结构

### SupervisorOptions

```typescript
interface SupervisorOptions {
  maxIterations: number;      // 最大分解-执行轮次
  timeoutMs: number;          // 全局超时
  retryCount: number;         // Worker 失败重试次数
}
```

### SubTask

```typescript
interface SubTask {
  id: string;
  description: string;
  requiredCapabilities: string[];
  dependencies: string[];    // 依赖的子任务 ID
  deadline?: Date;
}
```

### SupervisorResult

```typescript
interface SupervisorResult {
  success: boolean;
  subTasks: SubTask[];
  workerResults: WorkerResult[];
  summary: string;
  iterations: number;
  totalCost: { tokens: number; time: number };
}
```

---

## 模块设计

### 文件结构

```
src/modules/collaboration-runtime/engine/supervisor-executor.ts  # Supervisor 执行器
src/modules/collaboration-runtime/engine/blackboard-coordinator.ts # 黑板协调
```

### SupervisorExecutor 类

```typescript
class SupervisorExecutor {
  constructor(deps: CollaborationRuntimeDeps, options: SupervisorOptions) {}

  // 执行 Supervisor-Worker 模式
  execute(globalGoal: string): Promise<SupervisorResult>;

  // 子任务分解（由 Supervisor Agent 完成）
  private decompose(globalGoal: string): Promise<SubTask[]>;

  // 为子任务分配 Worker（Contract Net）
  private assignWorkers(tasks: SubTask[]): Promise<Assignment[]>;

  // 监控 Worker 进度
  private monitor(assignments: Assignment[]): Promise<void>;

  // 失败重分配
  private reassign(failedTask: SubTask, failedWorker: string): Promise<void>;

  // 汇总结果
  private aggregate(results: WorkerResult[]): Promise<SupervisorResult>;
}
```

---

## 执行流程

```
1. Supervisor Agent 接收全局目标
2. 分解为子任务: [{id: "t1", desc: "分析数据"}, {id: "t2", desc: "生成报告"}]
3. 为每个子任务匹配 Worker: t1 → 数据Agent, t2 → 报告Agent
4. 通过 Contract Net 协议分配任务
5. 监控 Worker 执行状态
6. Worker 失败 → 重新匹配 Worker
7. 汇总所有 Worker 输出 → 生成最终结果
```

---

## 代码变更

### 新增文件

- `src/modules/collaboration-runtime/engine/supervisor-executor.ts`
- `src/modules/collaboration-runtime/engine/blackboard-coordinator.ts`

### 依赖模块

- `src/modules/collaboration-runtime/protocol/contract-net.ts`（Story 9.14）
- `src/modules/collaboration-runtime/engine/capability-matcher.ts`（Story 9.16）
- `src/modules/collaboration-runtime/session/event-store.ts`
- `src/modules/collaboration-runtime/session/blackboard.ts`

---

## 技术约束

- 遵循 AGENTS.md 单向依赖原则
- collaboration-runtime 模块内部不 import `src/lib/` 或 `src/components/`
- 所有事件写入 EventStore
- 使用黑板进行状态共享
