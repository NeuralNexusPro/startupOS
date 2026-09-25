# approved-solution-project-task-creation Specification

## Purpose
定义从已发布语义执行契约的任务模板安全、幂等地创建正式项目 Task 和绑定 Run 的统一门控、恢复、回执与界面反馈规则，禁止绕过冻结契约生成临时执行拓扑。

## Requirements

### Requirement: 精确发布契约

系统 SHALL 只接受与 projectId、solutionId、solutionVersion、contractId 完全匹配、完整性有效且未撤销的 P2.8 contract。

#### Scenario: 使用 draft 或撤销版本

- **WHEN** 用户选择未发布、hash 不符或已撤销 contract
- **THEN** 系统 MUST 拒绝并且不得创建 Task、Run 或临时拓扑

### Requirement: 任务模板与语义输入门控

系统 SHALL 在写入前验证 taskTemplate、candidate Agent/Skill、ontology/version、required object slots、FactType、Action、权限和 verifier/evidence policy。

#### Scenario: 缺少必填语义对象

- **WHEN** 请求没有提供 template 要求的 semantic input
- **THEN** 系统 MUST 返回可定位 DesignGap，且 Task/Run 写入数为零

### Requirement: 幂等 Task 与 Run 创建

系统 SHALL 以 projectId+requestId 和 canonical input hash 持久协调 Task 创建与 9.42 Run 启动。相同请求重放 MUST 返回同一 taskId/runId，不同输入复用 requestId MUST 冲突。

#### Scenario: Task 创建后进程中断

- **WHEN** Task receipt 已持久化而 Run receipt 尚未返回时进程中断
- **THEN** 重放 MUST 复用同一 Task 并仅恢复同一 Run 创建，不得新增 Task

### Requirement: 手动目标 fail closed

系统 SHALL 要求手动目标选择或匹配一个已发布 taskTemplate；没有确定模板时 MUST 返回设计缺口，不得让模型或 runtime 生成临时拓扑。

#### Scenario: 目标无可用模板

- **WHEN** 用户输入目标但项目没有可用已发布模板
- **THEN** UI MUST 引导返回方案设计，并且系统 MUST 保持 Task/Run 数量不变

### Requirement: 权威创建反馈

成功响应 SHALL 包含同一 Task detail、contractId/hash、binding 与 runId；Web MUST 用该权威投影更新看板，不得先插入本地卡片。

#### Scenario: 创建成功

- **WHEN** operation 达到 completed
- **THEN** 看板 MUST 显示服务端返回的 taskId/revision/runId，刷新后结果一致
