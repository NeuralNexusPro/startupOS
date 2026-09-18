# provider-prompt-cache-session Specification

## Purpose

让支持 prompt cache 的模型供应商使用稳定、非敏感的 OriginOS 会话标识关联缓存，同时保证不支持缓存的供应商行为不变。

## Requirements

### Requirement: 底层模型调用携带稳定会话标识
系统 SHALL 为同一 OriginOS 会话的连续模型调用向 Pi Agent 提供相同的内部 session id，不得使用消息正文、文件路径、邮箱或 IM 外部身份作为标识。

#### Scenario: 同一会话连续调用
- **WHEN** 用户在同一会话发送多轮消息
- **THEN** 底层 Pi Agent 的 session id 保持一致

#### Scenario: 两个不同会话
- **WHEN** 同一 Agent 同时存在两个会话
- **THEN** 两个会话使用不同的内部 session id

### Requirement: 复用 Pi provider 缓存适配
系统 MUST 使用 Pi AI 的 provider-neutral cache 行为，不得在 OriginOS Core 拼装供应商私有 cache control。

#### Scenario: Provider 支持缓存
- **WHEN** provider 支持 prompt cache
- **THEN** Pi AI 可根据 session id 和默认 retention 关联缓存并在 usage 中返回 cacheRead/cacheWrite

#### Scenario: Provider 不支持缓存
- **WHEN** provider 忽略缓存参数
- **THEN** 模型调用仍正常完成且不要求 fallback 缓存服务
