# Design：接通 Pi provider prompt cache

## 背景

Pi Agent Core 的构造参数已有 `sessionId`，Pi AI 默认 `cacheRetention=short` 并按 provider 转换。OriginOSAgent 当前未把自身配置的 session id 传入底层 Agent。

## 设计决策

1. 在 `new Agent(...)` 时传入已有 `this.config.sessionId`。
2. 不设置 provider 私有 header/body；保留 Pi AI 默认 retention。
3. 测试通过 fake stream 观察 options/session 行为和不同会话隔离。
4. cache usage 的持久化与展示由 M14-T5 负责。

## 安全与兼容

仅使用 OriginOS 内部 session id。无凭据、消息内容或外部 IM id。Provider 忽略参数时行为不变。

## 替代方案

- 自建 KV cache：无法缓存供应商内部注意力状态，拒绝。
- 手写 Anthropic/OpenAI cache 参数：重复 Pi AI 能力且破坏多 provider，拒绝。

## Subagent 实施边界

- Task worktree 可写：`core/agent.ts` 与直接测试。
- 不得写：prompt builders、session persistence、UI、协作 worker。

## 回滚

删除底层 Agent 构造的 sessionId 参数即可。
