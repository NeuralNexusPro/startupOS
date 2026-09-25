# Spec Delta

## Purpose

保证应用或窗口重启后，项目看板可以恢复并控制原 Task Runtime 和绑定 Run，而不重复副作用或复活终态任务。

## ADDED Requirements

### Requirement: 原 Session 恢复

系统 SHALL 在实时 Task Runtime 缺失时按持久 sessionId、projectId 和 taskId 恢复原 session；系统 MUST NOT 创建替代 session、Task 或 Run。

#### Scenario: 应用重启后继续

- **WHEN** 用户在重启后对持久任务发出继续命令
- **THEN** 系统 MUST 恢复原 session、taskId、runId 和 binding 后执行命令

### Requirement: 恢复后门控

系统 SHALL 在恢复后重新校验 expectedRevision、cursor、bridgeEpoch、project scope 和 Run binding；任一不匹配 MUST 零写入拒绝。

#### Scenario: 旧窗口提交控制

- **WHEN** 恢复后的 revision 或 epoch 已高于旧窗口请求
- **THEN** 系统 MUST 返回 conflict/stale，并且不得改变 Task、Run、Action 或 Evidence

### Requirement: 状态安全恢复

系统 MUST 只加载 paused、waiting_user 和 cancelled 状态，不得自动推进。paused 仅在显式 resume 后继续，waiting_user 保持等待，cancelled 永不复活。

#### Scenario: 恢复取消任务

- **WHEN** cancelled 任务在重启后收到 resume/retry
- **THEN** 系统 MUST 拒绝且保持 cancelled，不得签发新 lease

### Requirement: 恢复幂等

系统 SHALL 复用原 requestId、operationId、attempt、lease 和 evidence hash 语义；重复恢复或继续 MUST 不重复 Action、Evidence、Fact 或外部副作用。

#### Scenario: 控制响应前再次中断

- **WHEN** 同一继续请求在提交后、响应前再次中断并重放
- **THEN** 系统 MUST 返回已提交结果或待核对状态，不得再次执行已确认副作用

### Requirement: Desktop 生产装配

Desktop 项目任务控制 SHALL 注入 Core 公共恢复端口；Web/Desktop 不得复制恢复算法或读取私有 task entries。

#### Scenario: 安装包恢复

- **WHEN** 打包应用从持久项目任务发起控制
- **THEN** 安装包 MUST 能解析恢复模块并恢复同一绑定，且不得返回仅因进程重启导致的 `PROJECT_TASK_SOURCE_UNAVAILABLE`
