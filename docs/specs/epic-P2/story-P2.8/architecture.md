# 架构设计 - Story P2.8

**Story:** Workflow 设计与解决方案执行契约发布  
**版本:** 1.0  
**最后更新:** 2026-07-28

## 设计目标

建立明确的编译边界：解决方案设计模型经过确定性校验和编译，发布为不可变 `SolutionExecutionContract`；运行时只能消费该契约，不能解释或修改设计态 Workflow。

## 分层

```text
Web Solution Design UI
  -> core solution feature public API
      -> Solution Validator
      -> Execution Contract Compiler
      -> Contract Publisher
          -> solution storage

collaboration runtime
  -> SolutionExecutionContractPort
      -> published contract storage
```

Workflow/Team、拓扑和契约编译属于 solution feature。collaboration runtime 只依赖公共类型和读取端口。

## 设计模型与执行契约

```typescript
export interface SolutionExecutionContract {
  schemaVersion: '1.0';
  contractId: string;
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

- `modelingDimension` 记录设计来源，不是 runtime 策略开关。
- `topology` 是已编译、冻结的节点和依赖关系。
- `verification` 定义执行结果如何产生可接受 evidence。
- `contractHash` 基于规范化契约正文计算，不包含 hash 字段本身。

## 编译管线

```text
Solution version
  -> normalize
  -> schema validation
  -> topology validation
  -> Agent/Skill capability validation
  -> I/O compatibility validation
  -> verifier/evidence validation
  -> permission/budget/HITL validation
  -> deterministic compile
  -> hash
  -> atomic publish
```

校验失败返回：

```typescript
export interface DesignGap {
  code: string;
  severity: 'error' | 'warning';
  scope: 'solution' | 'node' | 'edge' | 'contract' | 'policy';
  refId?: string;
  message: string;
  remediation: string;
}
```

只有 `error` 数量为零且 solution 已确认时允许发布。

## 公共端口

```typescript
export interface SolutionExecutionContractPublisher {
  validate(input: SolutionVersionRef): Promise<DesignValidationResult>;
  publish(input: SolutionVersionRef): Promise<SolutionExecutionContract>;
  revoke(input: ContractRef, reason: string): Promise<void>;
}

export interface SolutionExecutionContractPort {
  load(input: {
    solutionId: string;
    solutionVersion: string;
  }): Promise<SolutionExecutionContract>;
  verifyIntegrity(
    contract: SolutionExecutionContract,
  ): Promise<ContractIntegrityResult>;
}
```

发布端口属于 solution feature；读取端口作为公共边界供 Story 9.42 注入使用。

## 持久化

```text
data/projects/{projectId}/solutions/
  solution-v1.0.json
  solution-v1.0-manifest.json
  contracts/
    solution-v1.0-contract.json
```

- 使用临时文件加原子 rename 发布。
- 已存在的 `solutionId + solutionVersion` 契约禁止覆盖。
- 撤销状态通过独立元数据或版本化状态记录表达，不修改契约正文。
- 读取时重新计算 hash，发现不一致立即失败。

## 版本语义

1. Draft 可编辑但不可供运行时启动。
2. Confirmed 可进入发布门控。
3. Published/approved 可被运行时精确版本读取。
4. 修改已发布方案必须创建新 version。
5. active run 不跟随 latest，也不受后续版本影响。

## 兼容迁移

- 将 legacy `executionMode` 映射为 `modelingDimension`。
- legacy manifest 通过显式迁移命令进入完整校验管线。
- 无 verifier、I/O 或权限声明时不得自动填默认通过值。
- 迁移失败输出 DesignGap，由用户回到解决方案设计修复。

## 依赖方向

```text
web components
  -> core solution public API
      -> core storage/integration/shared/types

collaboration-runtime
  -> injected SolutionExecutionContractPort
  X 不依赖 Web UI
  X 不依赖 solution feature 私有编译器
```

不引入数据库、双向依赖、`any` 或编译产物修改，符合 AGENTS.md。

## 性能与安全

- 校验和 hash 在异步任务中执行，避免阻塞 Electron 主线程。
- 相同规范化输入必须生成相同输出和 hash。
- 路径由 project/solution/version 标识解析，拒绝路径逃逸。
- 权限策略不能扩大 Agent 已声明工具权限。
- 日志只记录 ID、版本、校验码和结构化错误，不记录凭据或正文。

## 非目标

- 不执行 Workflow。
- 不实例化 CollaborationRun/WorkItem。
- 不控制 `pi-tasks` 状态或 completion gate。
- 不在运行时修复设计缺口。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 初始架构设计 |

## 2026-09-14：项目语义执行规划补充

保持本Story为SolutionExecutionContract唯一定义方；semanticContext引用ONT.1/6/7公共DTO，与拓扑共同编译、存储和计算hash。ontologyVersion固定，具体对象ID/事实版本在9.42实例化时绑定。P2负责选择组合与发布，ONT定义对象、状态、Action和权限。

9.42旧示例中的id/contractId、verify/verifyIntegrity在本Story实施时统一，消费侧导入公共类型，禁止复制第二契约。按现有solutions目录保存，撤销元数据独立于冻结正文。

完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
