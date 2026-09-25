# Spec Delta

## Purpose

补齐项目任务看板的权威执行摘要、筛选和分页追加，使旧任务与新任务都能在不产生第二事实源的条件下正确呈现。

## ADDED Requirements

### Requirement: 版本化项目任务元数据

系统 SHALL 从 Task Runtime 同一持久状态读取带版本的 priority、semanticRefs 和 inputVersions。缺失字段 MUST 表示未设置，系统 MUST NOT 猜测默认优先级或语义对象。

#### Scenario: 旧任务缺少元数据

- **WHEN** 系统读取没有 projectMetadata 的旧 Task Runtime 状态
- **THEN** 看板 MUST 显示未设置且仍可读取任务，不得修改持久文件

### Requirement: 权威执行摘要

系统 SHALL 从同项目、同 parentTaskId 的 Run/WorkItem 聚合 assignedAgentIds、runStatus、workItemCount、artifactRefs 和恢复提示；Task status MUST 继续只来自 Task Runtime projection。

#### Scenario: WorkItem 已完成而 Task 未完成

- **WHEN** 绑定 WorkItem 已完成但 Task projection 仍为 active 或 review
- **THEN** 卡片 MUST 保持 Task 状态并仅显示执行徽标，不得移动到已完成列

### Requirement: 组合筛选

系统 SHALL 对已加载页提供文本、执行 Agent 与优先级组合筛选，筛选输入 MUST 在刷新、分页和详情读取期间保留。

#### Scenario: 组合筛选当前页

- **WHEN** 用户同时选择 Agent、优先级并输入关键词
- **THEN** 系统 MUST 只显示满足全部条件的已加载任务，且不得请求或伪造其他项目数据

### Requirement: Cursor 分页追加

系统 SHALL 使用服务端 cursor 每次加载最多 50 条，并按 taskId/revision 合并到现有页面；没有 cursor 时 MUST 禁用继续加载。

#### Scenario: 加载第二页

- **WHEN** 第一页返回 cursor 且用户请求加载更多
- **THEN** 系统 MUST 携带该 cursor，追加第二页并保留筛选、选择和较新的权威 revision

### Requirement: 运行徽标与详情

系统 SHALL 展示 paused、failed、waiting_user、待恢复等执行状态，并在详情显示语义引用、输入版本、Agent、WorkItem 与产物引用。

#### Scenario: 运行时尚未恢复

- **WHEN** 持久 Task 可见但实时运行时不可控制
- **THEN** 系统 MUST 显示待恢复提示而不得将任务标为失败或完成
