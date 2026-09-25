# Spec Delta

## Purpose

让多 Agent 正式任务严格按已发布执行契约运行，并在 Worker、Verifier、ONT Action、HITL 与 Evidence 各阶段保持可恢复、可审计和无重复副作用。

## ADDED Requirements

### Requirement: 精确就绪门控
系统 SHALL 在启动 WorkItem 前校验冻结 contract、依赖 WorkItem、输入 facts 版本、业务状态、权限、预算和目标 Agent/Skill 可用性；任一条件不满足 MUST 在调用 Worker 前 fail closed。

#### Scenario: 输入事实或权限不满足
- **WHEN** WorkItem 缺少 required fact、引用旧 ontology version 或执行者无 Action 权限
- **THEN** 系统 MUST 阻塞该 WorkItem，Worker、Verifier、Action 和 Evidence 调用次数均为零

### Requirement: 隔离的真实 Worker 执行
系统 SHALL 以 runId、workItemId、attemptId 和 leaseEpoch 唯一标识执行实例，同一逻辑 Agent 的并发 WorkItem MUST 使用隔离上下文并返回结构化 receipt/artifact refs。

#### Scenario: 同一 Agent 并发执行两个 WorkItem
- **WHEN** 两个 Run 或 WorkItem 指向同一 Agent
- **THEN** 两次执行 MUST 各自使用冻结输入和独立 checkpoint，输出不得串写或相互中止

### Requirement: 严格验证与 Action 接纳
系统 SHALL 按 contract 中精确 `verifierRef` 运行版本化 verifier，禁止启发式默认通过；只有 verifier passed 且 ONT Action 接纳后才能登记 Evidence。

#### Scenario: verifier 不存在或输出不合规
- **WHEN** verifierRef 无法解析、结果为 placeholder、artifact 缺失或不符合 evidence schema
- **THEN** 系统 MUST 拒绝 Evidence 并保持父 Task 未完成

### Requirement: 持久 HITL
系统 SHALL 将 before_execution、after_verification 和 on_failure HITL 请求写入 Run ledger，并通过父协作 Session 路由；恢复、重复回答和旧 lease 回答 MUST 保持幂等或被拒绝。

#### Scenario: 应用重启后继续审批
- **WHEN** WorkItem 等待用户确认时应用退出并重新打开
- **THEN** 系统 SHALL 恢复同一 HITL request，且用户回答只推进绑定的 attempt 一次

### Requirement: 阶段恢复与并发一致性
系统 SHALL 在短事务内以 expectedRevision 与 leaseEpoch 提交 intent、Worker receipt、verifier、Action receipt 和 Evidence receipt；外部 I/O 不得持有 Run 写锁。

#### Scenario: Worker 内调用 ONT Action
- **WHEN** Worker 执行期间提交与当前 WorkItem 关联的 Action
- **THEN** Action 对账 MUST 能完成且不得因等待同一 Run 锁形成死锁

#### Scenario: 两个宿主并发恢复同一 Run
- **WHEN** Web 与 Desktop 或两个进程同时提交相同阶段
- **THEN** 只有匹配 revision 的一方可写入，另一方收到冲突并不得覆盖或重复副作用

### Requirement: 预算、终态与 Evidence 来源
系统 MUST 执行 maxAttempts、maxDurationMs 和 maxTokens 预算，聚合 Run completed/failed/canceled 状态，并以 run/workItem/contractHash/evidenceHash 作为 Evidence 幂等来源。

#### Scenario: 重试超过预算
- **WHEN** 新 attempt 将超过契约预算
- **THEN** 系统 MUST 拒绝执行、保持已记录 receipt，并产生可见 blocker 或 design gap
