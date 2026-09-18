# Proposal：接通 Pi provider prompt cache

## 可追溯信息

- epic-id：M
- story-id：M.14
- task-id：M14-T4
- owner：Pi Agent Runtime
- 来源：`docs/specs/epic-M/story-M.14/`

## Why

Pi AI 已支持 `sessionId`、`cacheRetention` 和多 provider prompt cache，但 OriginOS 创建底层 Agent 时没有明确传入会话标识，无法稳定关联缓存或验证命中。

## What Changes

- OriginOSAgent 创建 Pi Agent 时传入内部稳定、非敏感的 session id。
- 沿用 Pi AI 默认短期缓存，不直接生成 provider 私有 `cache_control`。
- 保留不支持缓存 provider 的兼容行为。
- 通过现有 message usage 暴露 `cacheRead/cacheWrite` 作为验证依据。

## 非目标

- 不实现 KV cache 服务。
- 不承诺跨 provider 的统一命中率。
- 不改变模型选择或凭据逻辑。

## Capabilities

### New Capabilities

- `provider-prompt-cache-session`：支持缓存的 provider 可用稳定 OriginOS 会话标识关联 prompt cache。

### Modified Capabilities

无。

## Impact

- packages：`packages/core`、`packages/agent` 仅在现有类型需要时调整。
- public APIs：OriginOSAgent 配置已有 `sessionId`，不新增外部业务参数。
- persistence / IPC / packaging：无变化。
- 依赖：M14-T2。

## 上线方案

使用 fake stream 验证 session id 和默认 retention，真实 provider 只观察 usage，不作为自动化硬门禁。

## 回滚方案

停止向底层 Agent 传递 session id；其他模型调用行为保持不变。
