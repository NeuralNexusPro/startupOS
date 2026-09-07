## Why

普通聊天的 Completion Judge 使用独立模型请求判断 assistant 是否真正完成任务，但请求被取消或超过 15 秒时会返回 `stopReason=aborted` 和空响应。当前实现把它误报为“未返回 JSON”，并在 fallback 日志中省略最终判定，导致用户无法区分模型超时、解析失败和主 Agent 故障。

追溯信息：`epic-id: epic-9`，`story-id: story-9.41`，`task-id: 9.41-A03-chat-completion-judge-abort`，`owner: Agent Runtime Owner`，来源：`docs/specs/epic-9/story-9.41/` 中普通聊天与 Task Runtime 互斥及普通聊天非回归要求。

## What Changes

- Completion Judge 将 `aborted` 作为明确的请求取消结果处理，不再继续解析空响应。
- Judge 超时或取消后执行一次受控重试；重试使用新的 timeout signal，且不会复用已取消 signal。
- 两次请求均失败后才使用本地 completion fallback，并记录失败类型、尝试次数和最终 `complete`/`incomplete` 判定。
- 日志不输出凭据、完整 prompt 或未经裁剪的模型响应。
- 补充 timeout、abort、重试成功、重试耗尽和 fallback 判定测试。

非目标：不修改普通 Agent 的用户取消语义，不调整 Task Runtime，不改变 Completion Judge 的 JSON 决策 schema，不引入新的模型或依赖。

## Capabilities

### New Capabilities

- `completion-judge-resilience`: 定义普通聊天 Completion Judge 对取消、超时、重试和 fallback 可观测性的行为。

### Modified Capabilities

无。

## Impact

- 影响 `packages/core/src/lib/integrations/pi-agent/core/agent.ts` 及其单元测试。
- 不新增 public API、IPC、持久化字段或平台打包依赖。
- 依赖现有 Pi AI `completeSimple()` 的 `stopReason` 与 `errorMessage` 契约。
- 上线随 Core 普通发布流程完成；若重试造成意外延迟，可回滚本 Proposal commit，恢复单次 Judge + fallback 行为。
