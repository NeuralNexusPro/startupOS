# 架构设计 - Story 9.42

**Story:** 多 Agent 任务与解决方案执行契约对齐  
**版本:** 2.0  
**最后更新:** 2026-07-28

## 设计目标

建立“设计时发布契约、运行时消费契约”的硬边界。Story P2.8 负责将 Workflow/Team、Agent、Skill、I/O、拓扑和验证规则编译并发布为版本化 `SolutionExecutionContract`；Story 9.42 只通过公共端口校验并实例化该契约。

## 总体分层

```text
P2.8 Published SolutionExecutionContract
  solutionId/version/status/hash
  frozen topology and node contracts
  verification and runtime policies
          |
          | validate + instantiate
          v
Collaboration Runtime
  CollaborationRun
  CollaborationWorkItems
  Worker / Verifier / HITL
          |
          | verified evidence
          v
pi-tasks
  Task / Step / Criterion / Evidence / Completion Gate
```

## 核心原则

1. Workflow 是解决方案设计模型，不是 runtime mode，也不由 runtime 执行。
2. runtime 不生成、编辑、补全、解释或重新规划 Workflow。
3. runtime 执行的是 frozen `SolutionExecutionContract` 所声明的 WorkItems 和协作关系。
4. 发现契约缺口时返回设计阶段，不热改 active run。
5. `pi-tasks` 是用户任务事实源；solution contract 是执行约束事实源，两者职责正交。

## 输入契约

`SolutionExecutionContract` 由 Story P2.8 定义和发布。本 Story 只依赖其公共类型与读取端口，不修改其 schema、编译器或发布规则。

```typescript
export interface SolutionExecutionContract {
  schemaVersion: '1.0';
  id: string;
  solutionId: string;
  solutionVersion: string;
  status: 'approved' | 'revoked';
  modelingDimension: 'workflow' | 'team';
  topology: CollaborationTopologyContract;
  agents: SolutionAgentContract[];
  skills: SolutionSkillContract[];
  verification: VerificationPolicy[];
  hitl: HitlPolicy[];
  permissions: PermissionPolicy;
  budget: RuntimeBudgetPolicy;
  createdAt: string;
  contractHash: string;
}
```

`modelingDimension` 只作为来源元数据，runtime 不据此执行 Workflow 或选择运行模式。

## Task 与 Run 绑定

```typescript
export interface SolutionTaskBinding {
  parentTaskId: string;
  parentStepId: string;
  runId: string;
  solutionId: string;
  solutionVersion: string;
  executionContractId: string;
  contractHash: string;
  taskRevision: number;
}

export interface CollaborationWorkItem {
  id: string;
  binding: SolutionTaskBinding;
  designNodeId: string;
  assignedAgentId: string;
  skillRefs: string[];
  dependsOn: string[];
  inputRefs: string[];
  outputRefs: string[];
  status:
    | 'pending'
    | 'assigned'
    | 'running'
    | 'verifying'
    | 'revision'
    | 'completed'
    | 'failed'
    | 'blocked'
    | 'reported';
  revision: number;
}
```

WorkItem 必须来源于 contract node，不允许 runtime 创建无 designNodeId 的临时协作节点。

## 端口

```typescript
export interface SolutionExecutionContractPort {
  load(input: {
    solutionId: string;
    solutionVersion: string;
  }): Promise<SolutionExecutionContract>;
  verify(contract: SolutionExecutionContract): Promise<ContractVerification>;
}

export interface CollaborationExecutionPort {
  start(input: {
    taskId: string;
    stepId: string;
    taskRevision: number;
    contract: SolutionExecutionContract;
    inputRefs: string[];
  }): Promise<{ runId: string }>;
  inspect(runId: string): Promise<CollaborationRunSnapshot>;
  pause(runId: string): Promise<void>;
  resume(runId: string): Promise<void>;
  cancel(runId: string): Promise<void>;
}

export interface TaskEvidenceSink {
  attach(candidate: VerifiedEvidenceCandidate): Promise<EvidenceAttachResult>;
  block(input: TaskBlockerCandidate): Promise<void>;
}
```

collaboration runtime 通过依赖注入获取 contract 和 evidence 端口，不直接依赖 Web、desktop 或 `pi-tasks` 私有实现。

## 启动门控

```text
solution exists
  -> status approved
  -> version exact match
  -> contractHash valid
  -> topology valid
  -> Agent/Skill contracts available
  -> permissions/budget valid
  -> verifier and HITL policies complete
  -> instantiate run
```

任何门控失败都不得通过模型生成替代 Workflow 绕过。

## 状态与 Evidence

```text
pi-tasks Step active
  -> bind approved execution contract
  -> CollaborationRun
  -> WorkItems from frozen topology
  -> verifier from contract
  -> Evidence Bridge
  -> Step evidence gate
  -> task_update Step complete
```

- Worker transient failure：按 contract retry policy 执行。
- Worker blocked：按 contract HITL/escalation policy 处理。
- Verifier failed：按 contract revision policy 处理。
- Design gap：父 Task blocked，要求解决方案新版本。
- Run completed：只产生候选聚合结果。
- Task completed：只能由 `pi-tasks task_complete` 门控产生。

## Verifier

当前 Supervisor 默认 `passed: true` 是占位实现，必须从生产路径移除。Verifier 必须来自执行契约声明，并保存 method、artifact refs、result ref、hash 和 checkedAt。无 verifier 或 verifier 失败时不能生成 passed evidence。

## 持久化与版本

- solution contract 按 solutionVersion 保存并不可变。
- Run snapshot 保存完整 binding 和 frozen contract ref/hash；必要字段可保存快照用于恢复。
- active run 不追随 solution latest。
- 新方案版本只用于新 run。
- Evidence Sink 使用 taskId、stepId、runId、workItemId、contractHash、evidenceHash 幂等。

## 依赖方向

```text
Web solution design
  -> core solution feature/types
  -> solution storage/integration

agent-task coordinator
  -> SolutionExecutionContractPort
  -> CollaborationExecutionPort
  -> PiTasksPort

collaboration-runtime
  -> injected contract/evidence ports
  X 不依赖 solution UI
  X 不依赖 pi-tasks 私有实现
```

符合 AGENTS.md 单向依赖：上层 feature/module 可以依赖 integration/shared/types，integration 不反向依赖 feature/module。

## 性能与安全

- contract 校验、artifact 和 evidence 使用异步 I/O。
- progress 节流，artifact 正文不进入 IPC。
- 校验 solution/task/run/ref，拒绝路径逃逸。
- contractHash 防止未审批设计被替换。
- Worker 受 contract 权限和现有 Agent 工具权限双重约束。
- 日志隐藏任务正文、凭据和大模型完整输出。

## 兼容迁移

1. legacy solution 到 execution contract 的迁移由 Story P2.8 负责。
2. Story 9.42 不接受 legacy manifest 直接启动新 run。
3. 旧协作会话可按 legacy snapshot 只读恢复，但不能写入新 Task evidence。
4. 新 run 必须绑定 P2.8 已发布执行契约。

## AGENTS.md 符合性

- Workflow 设计、编译和发布逻辑归 P2.8，不进入 runtime integration。
- collaboration runtime 只消费公共契约。
- 不引入数据库、反向依赖或编译产物修改。
- TypeScript 严格类型，不使用 `any`。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建初版 |
| 2026-07-28 | 改为设计时 Workflow 和运行时 SolutionExecutionContract |
| 2026-07-28 | 契约 schema、编译、发布和迁移职责迁移至 P2.8 |

## 2026-09-14：项目语义执行规划补充

导入P2.8唯一定义的执行契约，原DTO示例不构成第二类型来源。上下文实例含对象ID、事实读集/版本、contractHash、本体版本、task/session/branch/run/workItem/attempt、checkpointCursor、lease epoch。Blackboard和图是投影。

持久意图 → ONT幂等提交与回执 → WorkItem接纳事件 → pi-tasks Evidence。部分提交按operationId对账补登。旧epoch迟到输出拒绝，跨进程互斥与快照cursor必须实测。退出正确性不依赖正常shutdown hook；不可查询/去重的外部副作用不能自动重放。

完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
