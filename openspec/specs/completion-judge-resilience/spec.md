# Completion Judge 弹性规格

## Purpose

定义普通聊天 Completion Judge 对取消、错误、非法响应、受控重试和本地 fallback 的处理与可观测性要求，同时保证其不干扰主 Agent 请求和 Task Runtime。

## Requirements

### Requirement: Completion Judge 取消分类
普通聊天 Completion Judge MUST 在解析响应前识别 Pi AI 返回的 `error` 和 `aborted` stop reason，并 MUST 记录可区分且经过裁剪的失败分类。

#### Scenario: Judge 请求被取消
- **WHEN** Judge 模型请求返回 `stopReason=aborted` 和空响应
- **THEN** 系统将其分类为 Judge 取消或超时，不记录“未返回 JSON”作为根因

#### Scenario: Judge 模型返回错误
- **WHEN** Judge 模型请求返回 `stopReason=error`
- **THEN** 系统记录裁剪后的 provider 错误，不尝试解析该响应

### Requirement: 有界 Judge 重试
Completion Judge MUST 对可恢复的请求失败最多重试一次，每次尝试 MUST 使用独立且有界的 timeout signal。

#### Scenario: 首次取消后重试成功
- **WHEN** 第一次 Judge 请求返回 `aborted`，第二次返回合法完成决策 JSON
- **THEN** 系统采用第二次语义决策且不进入本地 fallback

#### Scenario: 两次尝试均失败
- **WHEN** 两次 Judge 请求均被取消、报错或返回非法决策
- **THEN** 系统停止调用 Judge 并进入一次本地 fallback

#### Scenario: 调用次数上限
- **WHEN** Judge provider 持续失败
- **THEN** 单个 completion candidate 最多触发两次 Judge 模型请求

### Requirement: Fallback 判定可观测
Completion Judge MUST 在重试耗尽后记录本地 fallback 的最终 `complete` 或 `incomplete` 判定、原因、尝试次数和最后失败分类。

#### Scenario: Fallback 判断未完成
- **WHEN** Judge 重试耗尽且本地规则认为 assistant 只返回计划性内容
- **THEN** 日志明确包含 `decision=incomplete`，Completion Guard 继续现有恢复流程

#### Scenario: Fallback 判断完成
- **WHEN** Judge 重试耗尽且本地规则认为 assistant 已完成请求
- **THEN** 日志明确包含 `decision=complete`，Completion Guard 接受现有响应

### Requirement: 普通聊天与 Task Runtime 隔离
Judge 重试 MUST 只作用于普通聊天 Completion Guard，并 MUST NOT 重试主 Agent 请求、修改会话历史或进入 Task Runtime。

#### Scenario: Judge 内部请求取消
- **WHEN** Judge 自身 timeout signal 被触发
- **THEN** 系统只重试 Judge 判定，不重新发送用户消息或追加 assistant/toolResult 历史

#### Scenario: Task Runtime 执行
- **WHEN** 当前会话处于正式 Task Runtime 模式
- **THEN** Chat Completion Guard 及其 Judge 重试不参与该次执行
