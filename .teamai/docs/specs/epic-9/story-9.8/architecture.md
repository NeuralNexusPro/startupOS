# 架构设计 - Story 9.8

**Story:** DAG 执行器（Workflow 模式）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式
- Kahn 算法 / DFS 拓扑排序
- Promise.all 并行执行
- 依赖注入（CollaborationRuntimeDeps）

## 数据结构

### ExecutionResult

- 每个 Agent 的输出和耗时
- 全局执行状态

### 拓扑排序结果

- `AgentNode[][]`：分层返回，同层可并行

## 模块设计

**文件：** `src/modules/collaboration-runtime/engine/dag-executor.ts`

## 代码变更

### DagExecutor 类

```typescript
class DagExecutor {
  constructor(
    private topology: CollaborationTopology,
    private deps: CollaborationRuntimeDeps,
    private options: { timeoutMs?: number; maxIterations?: number }
  ) {}

  // 执行整个 DAG
  execute(globalGoal: string): Promise<ExecutionResult>;

  // 拓扑排序
  private topologicalSort(): AgentNode[][];  // 分层返回，同层可并行

  // 执行单个 Agent
  private executeAgent(agent: AgentNode, input: unknown): Promise<unknown>;

  // 判定是否完成
  private isComplete(): boolean;
}
```

### 执行流程（设计文档 §7.1）

```
1. 拓扑排序: [订单接收 Agent, 订单处理 Agent, 报告生成 Agent]
2. 按序执行:
   - 执行 订单接收 Agent → 等待完成 → Handoff 上下文摘要
   - 执行 订单处理 Agent → 接收摘要 → 处理 → Handoff
   - 执行 报告生成 Agent → 接收摘要 → 生成报告
3. 完成: 流程结束
```
