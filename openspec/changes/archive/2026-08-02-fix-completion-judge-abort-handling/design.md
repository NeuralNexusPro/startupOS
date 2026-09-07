## Context

`OriginOSAgent.runCompletionJudge()` 当前直接调用一次 `piAi.completeSimple()`，并为调用设置 15 秒 timeout signal。Pi AI 对取消采用返回值契约：请求不会抛异常，而是返回 `stopReason: "aborted"`、可选 `errorMessage` 和部分内容。现有代码只识别 `error`，因此会继续解析空响应，最终产生误导性的 JSON parse 日志。

该逻辑属于 `packages/core/src/lib/integrations/pi-agent/core/` 集成层内部行为，不新增上层依赖。普通聊天的 assistant candidate 仍由现有 Completion Guard 持有，Judge 只决定是否需要 continuation，不拥有会话状态事实源。

## Goals / Non-Goals

**Goals:**

- 将 Judge 的 `error`、`aborted`、空响应和非法 JSON 记录为可区分的失败类型。
- 对可恢复失败执行最多一次重试，每次创建独立 timeout signal。
- 重试耗尽后记录 fallback 的最终状态和原因。
- 保持主 Agent 用户取消、普通聊天历史和 Task Runtime 互斥行为不变。

**Non-Goals:**

- 不改变 Judge 的 system prompt 或 JSON schema。
- 不新增跨进程 IPC、持久化或 UI。
- 不重试主 Agent 请求，不绕过 Task Runtime 的 Evidence Gate。

## Decisions

### Decision: 抽取单次 Judge 调用并由有界循环管理重试

在 `OriginOSAgent` 内部增加单次 Judge 调用方法，循环最多两次。每次调用都创建新的 `AbortSignal.timeout()`，避免重用已 aborted signal。选择局部私有方法而非新 service，是因为状态、模型凭据和 completion candidate 都由 `OriginOSAgent` 持有，向外拆分会增加无必要的数据暴露。

替代方案：只提高 15 秒超时。该方案不能改善 provider 主动取消、空响应和日志误判，也会无条件拉长失败等待，因此不采用。

### Decision: `aborted` 与 `error` 均在解析前失败

当 `stopReason` 为 `aborted` 或 `error` 时立即生成分类错误，包含 attempt、stopReason、裁剪后的 `errorMessage` 和 elapsedMs；不得解析响应。非法 JSON 保持独立的 `invalid_response` 分类。

### Decision: fallback 日志包含最终决策

fallback 仍复用现有 `assessCompletion()`，但日志必须输出 `decision=complete|incomplete`、`reason`、`attempts` 和最后失败分类。日志通过既有裁剪函数处理，不输出 prompt、凭据或完整响应。

### Decision: 仅 Judge 内部超时可重试

Judge 使用自身 timeout signal，不连接主 Agent 的用户取消 signal。这样重试不会在用户取消主会话后重启主 Agent，也不会改变 `abort()` 的现有语义。

## Risks / Trade-offs

- [Risk] 两次 Judge 最坏可能增加普通聊天完成后的等待时间。→ 每次 timeout 保持有界，并限制为一次重试；测试验证调用次数上限。
- [Risk] provider 持续异常时仍只能依赖启发式 fallback。→ 日志明确最终判定，便于识别并调整 provider 或 timeout。
- [Risk] 测试依赖真实计时会不稳定。→ 注入/封装单次 Judge 调用结果，使用 mock 返回 `aborted`，不等待真实 15 秒。

## Migration Plan

无需数据迁移。发布后新逻辑立即作用于普通聊天 Completion Judge。回滚时撤销本 Proposal 的 Core 代码与测试提交即可，已有 Session 数据不受影响。

## Open Questions

无。重试次数固定为一次；后续若需要可配置 timeout，应另建独立 Proposal。

## Architecture Compliance

- 修改仅位于 `packages/core/src/lib/integrations/pi-agent/core/` 及同目录测试，符合集成层内部依赖方向。
- 不依赖 Web、Desktop、feature 或数据库。
- 单一 Task worktree 写入 Proposal artifacts、Core 实现和测试，不与其他 Story 写入范围重叠。
