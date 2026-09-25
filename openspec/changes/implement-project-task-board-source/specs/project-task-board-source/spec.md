# Spec Delta

## Purpose

为项目任务看板提供基于当前任务运行时权威投影的项目级查询与控制能力，使 Task、Run 与 WorkItem 以同一版本状态呈现并能在索引缺失时恢复。

## ADDED Requirements

### Requirement: 项目任务权威投影
系统 SHALL 仅从当前项目的受控 Task Runtime 投影读取任务，并按 cursor 与最大 50 条分页返回。Run 和 WorkItem 仅作为关联读取结果，系统 MUST NOT 写入第二份 Task 状态。

#### Scenario: 项目隔离查询
- **WHEN** 用户请求项目任务列表
- **THEN** 系统 MUST 只返回该项目内任务，且每条关联 Run 必须属于同一项目和父 Task

### Requirement: 可重建索引
系统 MUST 在可重建索引缺失时，从持久 Task Runtime 投影恢复项目任务列表；权威 Task 数据不可用时 MUST 返回 unavailable，不得返回伪完成状态。

#### Scenario: 索引丢失
- **WHEN** 项目任务索引不存在但持久化任务投影存在
- **THEN** 系统 MUST 重建查询结果且不得修改 Task、Evidence 或 Run

### Requirement: 受控任务操作
系统 MUST 通过当前 Task Runtime 的公开控制命令执行 pause、resume、retry 或 cancel，并验证 project、task、expectedRevision 与 requestId。

#### Scenario: 过期控制命令
- **WHEN** 控制请求携带过期 revision
- **THEN** 系统 MUST 拒绝请求且不得改变 Task 或 Run 状态
