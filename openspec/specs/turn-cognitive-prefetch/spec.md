# turn-cognitive-prefetch Specification

## Purpose

在不扩大稳定 system prompt 的前提下，为当前用户任务提供 owner 范围内的相关长期记忆、经验模式与知识片段，并确保失败可降级。

## Requirements

### Requirement: 当前 turn 按需预取认知
系统 SHALL 在模型处理当前用户任务前使用该任务作为 query 调用已注册 Cognitive Providers，并把有界结果作为当前 turn 的参考上下文。

#### Scenario: 存在相关模式
- **WHEN** 当前 owner 的认知存储含与用户任务相关的 Pattern
- **THEN** 相关片段进入当前 turn 且无关完整文件不进入上下文

#### Scenario: 没有匹配结果
- **WHEN** 所有 Provider 均返回空结果
- **THEN** 系统不注入空认知块并正常处理原始用户任务

### Requirement: 预取结果有统一预算
系统 MUST 对聚合认知结果应用固定 Provider 顺序、单 Provider 上限和总字符预算。

#### Scenario: 多 Provider 超出预算
- **WHEN** 多个 Provider 返回内容总量超过预算
- **THEN** 系统按确定性顺序截断且保持边界标签完整

### Requirement: 所有权与消息真实性
系统 MUST 使用当前会话的显式 owner/session 范围检索，且不得改写持久化的原始用户消息。

#### Scenario: 相似内容存在于其他 owner
- **WHEN** 其他 owner 含更相似的认知内容
- **THEN** 当前 turn 不得收到该内容

#### Scenario: 恢复历史会话
- **WHEN** 历史会话恢复后再次发送任务
- **THEN** 预取使用恢复后的原 owner/session 且历史原文保持不变

### Requirement: Provider 失败不阻塞回复
单个 Provider 的超时或异常 SHALL 被隔离，其他 Provider 和 Agent 回复继续执行。

#### Scenario: Pattern Provider 抛错
- **WHEN** Pattern Provider 查询失败
- **THEN** 系统跳过该结果、记录无正文诊断并继续模型调用
