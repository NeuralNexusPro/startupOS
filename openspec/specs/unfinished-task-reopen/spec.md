# unfinished-task-reopen Specification

## Purpose
TBD - created by archiving change fix-unfinished-task-reopen. Update Purpose after archive.
## Requirements
### Requirement: 原历史会话继续未完成任务
系统 SHALL 在恢复原Agent或Skill历史会话后呈现该会话的未完成任务与进度，并提供既有继续任务操作。
#### Scenario: 关闭窗口后回历史
- **WHEN** 用户重新打开原历史会话且存在有效未完成长任务
- **THEN** 呈现原任务状态，继续操作保留原taskId和已完成步骤
#### Scenario: 任务控制保持
- **WHEN** 任务处于暂停、等待输入或真实失败
- **THEN** 使用既有继续、回复或重试控制，不自动绕过确认执行
#### Scenario: 会话隔离
- **WHEN** 切换历史或显式新建会话
- **THEN** 任务卡及操作只属于当前会话，不自动选择其他历史

### Requirement: 退出保留可恢复任务
系统 SHALL 在销毁运行时时使旧续跑回调失效，避免退出被误记为任务失败或继续派发任务。
#### Scenario: 退出时有挂起执行
- **WHEN** 应用退出中止仍挂起的任务执行
- **THEN** 迟到的拒绝不会把可恢复任务误写失败，恢复仍可继续
#### Scenario: 退出时有挂起下一步
- **WHEN** task_next或持久化尚未返回就销毁运行时
- **THEN** 返回后不再派发新的prompt或任务副作用

