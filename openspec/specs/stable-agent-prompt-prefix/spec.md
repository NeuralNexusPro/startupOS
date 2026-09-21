# stable-agent-prompt-prefix Specification

## Purpose

让每个 Agent 会话拥有可验证的稳定 system prompt，并把阶段、记忆和目录等会话快照放在其后，以提高 provider 前缀复用且保持恢复一致。

## Requirements

### Requirement: 稳定 system prompt 与会话上下文分离
系统 SHALL 将身份、不可变执行规则、安全与权限策略、紧凑工具协议放入稳定 system prompt；阶段、Core Memory、工作目录和认知目录 MUST 位于独立会话上下文。

#### Scenario: 会话动态状态变化
- **WHEN** 当前阶段、Memory 或工作目录上下文发生变化但稳定规则未变
- **THEN** stable system prompt 的字节内容与 hash 保持不变

#### Scenario: 安全策略变化
- **WHEN** 安全或权限策略发生实际变化
- **THEN** stable system prompt hash 变化并立即使用新策略

### Requirement: 会话恢复保持边界
系统 SHALL 在历史会话恢复时重建相同的稳定 prompt 与会话上下文顺序。

#### Scenario: 恢复未变更会话
- **WHEN** 会话使用相同 Agent 定义和工具策略恢复
- **THEN** stable system prompt hash 与原会话一致

### Requirement: 诊断不得记录正文
系统 MUST 只记录 stable system prompt 的 hash 和长度，不得记录 prompt、Memory 或认知正文。

#### Scenario: 输出稳定性诊断
- **WHEN** 系统记录 prompt 稳定性
- **THEN** 日志只包含 hash、长度、session 内部标识和变化原因
