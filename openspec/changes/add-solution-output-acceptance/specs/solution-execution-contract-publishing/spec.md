# Spec Delta

## ADDED Requirements

### Requirement: 节点级产出验收策略
系统 SHALL 允许用户在解决方案设计阶段为每个 Agent 或 Skill 节点选择自动验收、用户确认或指定角色确认，并 SHALL 将验收主体、触发时机和退回行为冻结到指定方案版本的执行契约中。

#### Scenario: 配置用户确认
- **WHEN** 用户把某节点的产出验收方式设为用户确认并保存方案
- **THEN** 系统 SHALL 在该节点通过 verifier 后要求用户确认，确认前不得接纳结果或推进依赖该结果的下游节点

#### Scenario: 配置自动验收
- **WHEN** 用户把某节点的产出验收方式设为自动验收
- **THEN** 系统 SHALL 在 verifier 通过后自动接纳结果，且不得创建无必要的人工确认请求

#### Scenario: 配置指定角色确认
- **WHEN** 用户选择指定角色确认但未提供有效角色
- **THEN** 系统 MUST 阻止保存或发布，并返回可定位到该节点的中文错误

### Requirement: 已发布验收策略不可变
系统 SHALL 将产出验收策略纳入 `contractHash`，已发布版本的策略 MUST 保持不可变；任何调整 MUST 创建新的 solution version。

#### Scenario: 修改已发布策略
- **WHEN** 用户尝试修改已发布方案版本的产出验收策略
- **THEN** 系统 MUST 拒绝修改并引导用户创建新版本
