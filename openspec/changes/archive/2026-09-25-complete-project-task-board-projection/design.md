# Design

## Context

`RuntimeProjectTaskSource` 已从持久 Task Runtime 投影重建任务，并通过 `findByTask` 关联同项目 Run。`ProjectTaskBoardService` 的列表摘要目前丢弃 Run/WorkItem 信息，UI 也没有消费 cursor，导致已有权威信息没有进入用户界面。

## Goals / Non-Goals

**Goals:** 在不创建第二事实源的前提下，将版本化 Task 元数据和绑定 Run/WorkItem 聚合到列表与详情；完成真实筛选、分页追加和运行徽标。

**Non-Goals:** 不在本变更中增加写优先级、交接、图联动、拖拽或任务创建协议。

## Decisions

### 可选版本化元数据随 Task Runtime 持久化

在 `AgentTaskExecutionStateV1` 增加可选 `projectMetadata`，其自身带版本，保存 priority、semanticRefs 和 inputVersions。旧会话缺失该字段时返回 `undefined`，UI 显示“未设置”，不得填充 normal 等默认值。后续任务创建和优先级写入复用该字段及 Task revision 门控。

### 列表使用 Source 已读取的 Run 摘要

`RuntimeProjectTaskSource` 已为每条 Task 调用 `findByTask`，因此在 `ProjectTaskRecord` 中携带同一 Run 的 status、WorkItem 数量、非空 assignedAgentId 和 artifact refs 摘要。Board 不为列表再次读取 Run；详情仍通过 `inspect` 获取完整 WorkItem 并验证 project/task binding。

### UI 只维护查询窗口

浏览器只保存服务端返回的页、cursor、筛选草稿和选择项。加载更多按 taskId 合并，较高 revision 替换旧项；不生成本地任务状态。Agent/优先级筛选只作用于已加载页，并明确显示这一范围。

## Risks / Trade-offs

- [旧任务无元数据] → 明确显示“未设置”，待 943-T7 创建路径补齐，不做推断。
- [Run 读取成本] → 复用 source 现有 `findByTask`，单页上限保持 50；B12 用 1000 条 fixture 验证分页。
- [追加页期间状态变化] → 以 taskId 和 revision 合并，后续订阅出现 sequence gap 时仍由 943-T9 全量重读。

## Migration Plan

新增字段均为可选；旧 JSON 无需静默迁移。删除新 UI 字段即可回滚，既有 Task/Run 存储保持可读。
