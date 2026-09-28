# 测试策略 - Story 9.28

**Story:** Swarm/Supervisor 模式生产接线
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 单元测试

- 测试 `TaskOrchestrator` 桥接层：Supervisor ↔ Spawner 集成
- 测试静态 `DecompositionPlan` 映射：从 `agents.json` 推断子任务
- 测试 `ContractNetProtocol` 简化接入：Blackboard 替代消息总线
- 测试 `executeSupervisorDag()` 执行入口：完整生命周期
- 测试模式路由：含回边拓扑切换到 Supervisor 模式

### 集成测试

- 测试 Supervisor 模式端到端执行
- 测试 HITL 集成：`waiting` 状态暂停子任务

---

## 测试用例

### 用例 1：7-agent 完整拓扑执行

**前置条件**：7-agent 拓扑（含 3 个并行 reviewer）

**操作步骤**：
1. 调用 `executeSupervisorDag(session, topology, spawner)`
2. 检查执行结果

**预期结果**：
- 所有 7 个 agent 执行完成
- report-generator 在所有 3 个 reviewer 完成后才触发
- 最终产出 `finalReport.md`

---

### 用例 2：模式路由识别回边

**前置条件**：拓扑中存在回边（reviewer → review-task-manager）

**操作步骤**：
1. 调用 `modeRouter.selectExecutionMode(topology)`

**预期结果**：
- 返回 `system`（Supervisor 模式）

---

### 用例 3：Workflow 模式无回边

**前置条件**：拓扑中无回边

**操作步骤**：
1. 调用 `modeRouter.selectExecutionMode(topology)`

**预期结果**：
- 返回 `workflow`（DAG 模式）

---

### 用例 4：HITL 集成

**前置条件**：SubTask 状态为 `waiting`

**操作步骤**：
1. 检查该子任务是否暂停
2. 检查其他并行子任务是否继续执行

**预期结果**：
- 该子任务暂停
- 其他并行子任务继续执行

---

### 用例 5：ContractNet 简化流程

**前置条件**：1 个任务，1 个匹配 agent

**操作步骤**：
1. 发起 cfp
2. agent 自动 accept
3. 检查执行结果

**预期结果**：
- 无多 agent 竞标场景
- agent 自动 accept 并执行

---

## 验收标准测试

- [ ] `executeSupervisorDag()` 可以成功执行 7-agent 完整拓扑（含 3 个并行 reviewer）
- [ ] Supervisor 路径下，report-generator 在所有 3 个 reviewer 完成后才触发
- [ ] `executionMode: "system"` 会话走 Supervisor 路径，`"workflow"` 走 DAG 路径
- [ ] 模式路由自动识别含回边的拓扑并切换到 Supervisor 模式
- [ ] `npx tsc --noEmit --skipLibCheck` 0 error
- [ ] `npm run lint` 0 Error（针对 collaboration-runtime 相关文件）
- [ ] 新增测试覆盖 `executeSupervisorDag` 基本路径（≥3 个测试用例）
