# Proposal

## Why

Story 9.43 的任务源能在应用重启后从持久 Task Runtime 投影恢复看板，但 `control()` 只接受已存在的内存 runtime。用户点击原任务继续时会得到 unavailable，无法满足 B08，也没有证明同一 9.42 Run、Action 与 Evidence 被幂等恢复。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T6；Owner：Project Runtime / Desktop；依赖：9.42 生产恢复边界；来源：`docs/specs/epic-9/story-9.43/`。

## What Changes

- 为项目任务源注入受控 session/runtime recovery port；实时快照缺失时，按持久 sessionId、projectId、taskId 恢复原 Runtime。
- 恢复后重新校验 taskId、revision、cursor、bridgeEpoch、Run binding 和 project scope，再执行原控制请求。
- 将 9.42 的同一 runId/workItem/attempt 恢复接入 Desktop 生产装配，重复继续不得重复 Action、Evidence 或外部副作用。
- 对 paused、waiting_user、cancelled 和未知外部结果执行不同恢复策略；仅显式命令可继续 paused，cancelled 永不复活。

## Non-goals

- 不创建新 Task/Run，不用新 requestId 替换调用方请求。
- 不自动重发状态未知的外部写操作。
- 不在 Web 或 Desktop 复制 Task/Run 恢复算法。

## Capabilities

### New Capabilities

- `project-task-runtime-recovery`: 从项目看板控制入口恢复原 Task Runtime 与绑定 Run，并保持幂等和终态安全。

### Modified Capabilities

- 无。

## Impact

影响 Core project task source 的恢复端口、Core agent server 组合、Desktop ontology cross-package 装配、安装包验证和恢复测试。Web 继续使用现有控制协议。
