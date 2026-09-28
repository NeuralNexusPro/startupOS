# 架构设计 - Story 9.28

**Story:** Swarm/Supervisor 模式生产接线
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 技术栈

- TypeScript
- 多 Agent 协作运行时
- Supervisor 模式
- Contract Net 协议

---

## 关键文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| NEW | `src/modules/collaboration-runtime/engine/task-orchestrator.ts` | Supervisor ↔ Spawner 桥接 |
| NEW | `src/modules/collaboration-runtime/engine/mode-router.ts` | 模式选择路由 |
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` | 新增 `executeSupervisorDag` + 模式分发 |
| MODIFY | `src/modules/collaboration-runtime/engine/supervisor.ts` | `decompose()` 静态映射实现 |
| MODIFY | `src/modules/collaboration-runtime/session/blackboard.ts` | ContractNet 消息载体 |
| MODIFY | `src/app/api/collaboration/sessions/[id]/execute/route.ts` | 接受 `executionMode` |
| MODIFY | `src/modules/collaboration-runtime/config.ts` | 注入新 deps |

---

## 模块设计

### A. TaskOrchestrator 桥接层

**职责**：桥接 `SupervisorMode` ↔ `AgentSpawner`

**关键实现**：
- 将 `SupervisorDeps.worker` 实现为通过全局 spawner 启动 Agent 子进程
- 将 `agentId → agentPath` 映射从 `AgentRegistry` 注入
- `SubTask.result.output` 写入 Blackboard，供下游聚合消费

### B. 静态 DecompositionPlan 映射

**职责**：从 `agents.json` 的 `collaborations` 推断 `DecompositionPlan.subTasks`

**映射规则**：
- 每个 `agentId` → 一个 `SubTask`（goal = agent 的 system prompt 摘要，workerId = agentId）
- 并行 reviewers → 同一 `dependsOn` 组
- 汇总节点（report-generator）→ `aggregate` 阶段

### C. ContractNetProtocol 简化接入

**职责**：用 Blackboard 替代消息总线

**实现**：
- `cfp` 写入 `blackboard.cfp:{taskId}`
- `propose` 写入 `blackboard.bid:{taskId}:{agentId}`
- `selectBestBid` 使用 `CapabilityMatcher` 评分
- 最简流程：cfp → 唯一匹配 agent 自动 accept

### D. `executeSupervisorDag()` 执行入口

**职责**：Supervisor 模式执行入口

**生命周期**：
1. 构建静态 `DecompositionPlan`
2. `SupervisorMode.decompose(goal) → plan`
3. `SupervisorMode.allocateAll(plan) → allocatedSubTasks`
4. 遍历子任务：ContractNet 分配 → spawner spawn → 等待完成 → SubTaskResult
5. `SupervisorMode.verify()` → revision loop（最多 2 次）
6. `SupervisorMode.aggregate()` → 最终产出

**HITL 集成**：`SubTask` 状态为 `waiting` 时暂停该子任务，不阻塞其他并行子任务

### E. 模式选择基础设施

**职责**：会话配置新增 `executionMode: "workflow" | "system"`

**模式定义**：
- `workflow` = 当前 DAG 路径（静态拓扑，无回边）
- `system` = Supervisor 路径（动态分解，支持回边和屏障等待）

**入口分发**：`multi-agent-executor.ts` 按模式分发

### F. 模式路由策略

**职责**：`selectExecutionMode(topology): executionMode`

**规则 v1.0**：
- 拓扑中存在回边（`notify` 类型边）→ `system`
- 否则 → `workflow`

**预留扩展**：基于任务复杂度、Agent 数量、历史成功率的路由

---

## 非目标

- ❌ LLM 驱动的动态任务分解（留给 Phase 3 / Story 9.19 Queen-Led）
- ❌ 真正的多 agent 竞标场景（当前简化为唯一匹配自动 accept）
- ❌ Supervisor 路径的独立 UI 面板（复用现有 MultiAgentLauncher，仅显示状态差异）
- ❌ Queen-Led 动态治理模式（Story 9.19）
- ❌ 共识投票机制（Story 9.23）
