# 需求文档 - Story 9.28

**Story:** Swarm/Supervisor 模式生产接线
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为多 Agent 协作运行时的使用者，我希望对于需要动态任务分解和完成判定的复杂协作场景，能够使用 Supervisor/Worker 模式运行，而不是仅受限于静态 DAG 执行。

---

## 问题

Epic 9 Phase 1+2 实现了 SupervisorMode 及其依赖组件，但均未被接入生产执行路径：

| 组件 | 代码 | 测试 | 生产引用 |
|------|------|------|----------|
| `SupervisorMode` | ✅ 503 行 | ✅ | ❌ 0 refs |
| `ContractNetProtocol` | ✅ 300 行 | ✅ | ❌ 0 refs |
| `CapabilityMatcher` | ✅ | ✅ | ❌ 0 refs |
| `AclProtocol` | ✅ | ✅ | ❌ 0 refs |
| `SubscribeNotifyProtocol` | ✅ | ✅ | ❌ 0 refs |
| `CostController` | ✅ | ✅ | ✅ `multi-agent-executor.ts` |
| `ConflictDetector` | ✅ | ✅ | ✅ `multi-agent-executor.ts` |

**核心问题**：当前 `executeMultiAgentDag()` 是唯一的生产执行路径，所有协作会话强制走静态 DAG。对于 `agents.json` 中存在回边（reviewer → review-task-manager）的拓扑，DAG 的 `extractEdges` 将回边降级为 `notify`，导致 barrier/gather 语义丢失——review-task-manager 完成立即触发下游，不等 reviewer 结果。

---

## 范围

### A. TaskOrchestrator 桥接层（新建）

- [x] 新建 `src/modules/collaboration-runtime/engine/task-orchestrator.ts`
- [ ] 桥接 `SupervisorMode` ↔ `AgentSpawner`：将 `SupervisorDeps.worker` 实现为通过全局 spawner 启动 Agent 子进程
- [ ] 将 `agentId → agentPath` 映射从 `AgentRegistry` 注入
- [ ] `SubTask.result.output` 写入 Blackboard，供下游聚合消费

### B. 静态 DecompositionPlan 映射

- [ ] `SupervisorMode.decompose()` 保持 stub（Story 9.13 预留），本 Story 不引入 LLM 分解
- [ ] 实现静态映射：从 `agents.json` 的 `collaborations` 推断 `DecompositionPlan.subTasks`
  - 每个 `agentId` → 一个 `SubTask`（goal = agent 的 system prompt 摘要，workerId = agentId）
  - 并行 reviewers → 同一 `dependsOn` 组
  - 汇总节点（report-generator）→ `aggregate` 阶段
- [ ] 映射结果在会话创建时缓存到 `blackboard.setData("plan")`

### C. ContractNetProtocol 简化接入

- [ ] 用 Blackboard 替代消息总线：`cfp` 写入 `blackboard.cfp:{taskId}`，`propose` 写入 `blackboard.bid:{taskId}:{agentId}`
- [ ] `selectBestBid` 使用 `CapabilityMatcher` 评分（当前只有静态匹配，无 LLM 评分）
- [ ] 最简流程：cfp → 唯一匹配 agent 自动 accept（无多 agent 竞标场景）

### D. `executeSupervisorDag()` 执行入口

- [ ] 在 `multi-agent-executor.ts` 新增 `executeSupervisorDag()` 函数
- [ ] 签名与 `executeMultiAgentDag()` 对齐：接收 session、topology、spawner
- [ ] 内部生命周期：
  1. 构建静态 `DecompositionPlan`
  2. `SupervisorMode.decompose(goal) → plan`
  3. `SupervisorMode.allocateAll(plan) → allocatedSubTasks`
  4. 遍历子任务：ContractNet 分配 → spawner spawn → 等待完成 → SubTaskResult
  5. `SupervisorMode.verify()` → revision loop（最多 2 次）
  6. `SupervisorMode.aggregate()` → 最终产出
- [ ] HITL 集成：`SubTask` 状态为 `waiting` 时暂停该子任务，不阻塞其他并行子任务

### E. 模式选择基础设施

- [ ] 会话配置新增 `executionMode: "workflow" | "system"`
- [ ] `workflow` = 当前 DAG 路径（静态拓扑，无回边）
- [ ] `system` = Supervisor 路径（动态分解，支持回边和屏障等待）
- [ ] `multi-agent-executor.ts` 入口按模式分发
- [ ] API 层（`/api/collaboration/sessions/[id]/execute`）接受 `executionMode` 参数
- [ ] 默认值：`workflow`（向后兼容）

### F. 模式路由策略（预留接口）

- [x] 新建 `src/modules/collaboration-runtime/engine/mode-router.ts`
- [ ] `selectExecutionMode(topology): executionMode` — 初始实现为硬编码规则
- [ ] 规则 v1.0：拓扑中存在回边（`notify` 类型边）→ `system`，否则 → `workflow`
- [ ] 预留 Phase 3 扩展：基于任务复杂度、Agent 数量、历史成功率的路由

---

## 验收标准

1. - [ ] `executeSupervisorDag()` 可以成功执行 7-agent 完整拓扑（含 3 个并行 reviewer）
2. - [ ] Supervisor 路径下，report-generator 在所有 3 个 reviewer 完成后才触发
3. - [ ] `executionMode: "system"` 会话走 Supervisor 路径，`"workflow"` 走 DAG 路径
4. - [ ] 模式路由自动识别含回边的拓扑并切换到 Supervisor 模式
5. - [ ] `npx tsc --noEmit --skipLibCheck` 0 error
6. - [ ] `npm run lint` 0 Error（针对 collaboration-runtime 相关文件）
7. - [ ] 新增测试覆盖 `executeSupervisorDag` 基本路径（≥3 个测试用例）

---

## 依赖关系

- 9.13（Supervisor Mode 实现）
- 9.27（架构治理）
- 9.6（Contract Net）
- 9.8（CapabilityMatcher）
- [多 Agent 协作运行时架构审查（2026-05-20）](../../../design/multi-agent-runtime-architecture-review-2026-05-20.md) §5.1-5.3
