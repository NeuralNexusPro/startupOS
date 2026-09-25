# Design

## Context

持久 Task projection、sessionId 和 Run binding 已存在，但 live runtime 是进程内对象。当前 source 在 `getTaskRuntimeSnapshot()` 返回 null 时立即失败。恢复必须由拥有 Agent Session 生命周期的 Core server 完成，Desktop 只注入端口。

## Goals / Non-Goals

**Goals:** 首次控制按原 session 恢复；保持原 Task/Run/binding；恢复与控制的 revision/epoch 门控；副作用幂等。

**Non-Goals:** 不静默启动 paused/cancelled，不重新规划拓扑，不重发未知外部副作用。

## Decisions

### 显式恢复端口

新增 `ProjectTaskRuntimeRecoveryPort.recover({sessionId, projectId, taskId})`，返回公开 Task Runtime snapshot 或结构化 unavailable。实现位于 Core agent server 组合层，调用现有 session restore；project feature 只依赖接口。

### 恢复后重新读取全部门控字段

source 不复用恢复前缓存。它必须从恢复快照读取 taskId、expectedRevision、expectedCursor、bridgeEpoch，再与请求和持久记录比较。任一不一致返回结构化 conflict/stale，不执行 control。

### Task 与 Run 分阶段恢复

先恢复 Task Runtime 为非执行快照，再调用 9.42 recovery port 恢复同一 runId 和 ledger。只有二者 binding 一致且状态允许时才提交显式 resume/retry。paused 仅加载不运行；waiting_user 保持等待；cancelled 拒绝；unknown external result 进入核对。

### 幂等键贯穿恢复

原 requestId 进入恢复和控制日志；9.42 按 operationId/attempt/lease/evidenceHash 去重。重启后的重复请求返回同一权威结果，不生成新 Task、Run、Action 或 Evidence。

## Risks / Trade-offs

- [恢复耗时] → 控制请求显示恢复中，窗口仍可读取持久投影；恢复失败返回可重试错误。
- [双窗口并发恢复] → Core mutation lock/CAS 只允许一个恢复主导，另一方重读快照。
- [旧 session 缺依赖] → 返回 unavailable 并保留持久状态，不构造替代 runtime。

## Migration Plan

恢复端口为新增依赖；未注入时保持当前 unavailable 行为。持久格式不新增第二事实源。
