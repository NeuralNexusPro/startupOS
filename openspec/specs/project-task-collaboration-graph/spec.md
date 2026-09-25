# project-task-collaboration-graph Specification

## Purpose
让项目任务看板与协同图以同一权威投影、revision 和选择状态呈现 Task、Run 与 WorkItem。

## Requirements

### Requirement: 图板同源

系统 SHALL 由同一 `ProjectTaskPage` 与 `ProjectTaskDetail` 构建看板和协同图；系统 MUST NOT 从旧 Supervisor topology 或第二持久状态读取项目任务。

#### Scenario: 同一任务切换视图

- **WHEN** 用户从看板选中任务并切换到协同图
- **THEN** 图 MUST 定位同一 taskId、revision 和 runId，详情不得重新绑定其他任务

### Requirement: Task 与 WorkItem 图关系

系统 SHALL 仅在 projectId 和 binding.parentTaskId 均匹配时绘制 Task→WorkItem 边，并展示 WorkItem 的 assignedAgentId 和执行状态。

#### Scenario: 其他任务的 WorkItem

- **WHEN** 当前详情中出现不属于该 Task 的 WorkItem 或 binding
- **THEN** 系统 MUST 拒绝绘制并显示结构化不可用状态，不得混入图或详情

### Requirement: 双向定位

系统 SHALL 允许从卡片、Task 节点或 WorkItem 节点定位同一详情；选择 WorkItem 时 MUST 保持所属 Task 选择，并标识具体 WorkItem。

#### Scenario: 从图定位 WorkItem

- **WHEN** 用户选择 WorkItem 节点
- **THEN** 系统 MUST 打开其所属 Task 的同一 revision 详情并聚焦对应 WorkItem

### Requirement: 可访问图交互

系统 SHALL 为图节点提供可聚焦语义控件，键盘 Enter/Space 与指针选择 MUST 走同一回调并有可见焦点。

#### Scenario: 键盘选择节点

- **WHEN** 键盘用户聚焦节点并按 Enter
- **THEN** 系统 MUST 更新共享选择、详情和 aria 状态，且不得只依赖颜色表达选中
