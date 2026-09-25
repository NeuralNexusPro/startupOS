# Design

## Context

`ProjectTaskBoardService` 已负责项目隔离、分页、revision 和 Run/WorkItem 聚合，但缺少真实 `ProjectTaskSource`。Task Runtime 已持久化会话内 `AgentTaskRuntimePersistenceV1` 与 canonical task projection，是唯一可用的 Task 读取边界。

## Goals / Non-Goals

**Goals:** 通过一个最小 Core adapter 读取既有持久投影、关联 Run ledger，并复用现有受控控制命令。

**Non-Goals:** 不新增 Task 状态文件、全局索引数据库、Web 看板或拖拽工作流。

## Decisions

- 以既有会话持久化扫描作为索引重建来源；项目任务量较小时避免新增索引服务。超过性能门槛后再增加可删除的派生索引。
- adapter 只调用 Task Runtime 的公开 snapshot/control 边界；不解析 `pi-tasks` 私有 entries。
- Task 与 Run 以已有 binding 的 parentTaskId 关联，并在不匹配时拒绝。

## Risks / Trade-offs

- [扫描成本] → 限制为项目目录和 50 条分页；任务量增长后增加可重建派生索引。
- [会话恢复差异] → 缺少权威投影返回 unavailable，不猜测 Task 状态。
