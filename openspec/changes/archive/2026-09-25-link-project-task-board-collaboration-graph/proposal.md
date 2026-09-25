# Proposal

## Why

Story 9.43 要求项目任务看板和协同图展示同一 Task、revision、Run 与 WorkItem，并能双向定位。当前项目工作区只有看板，已有全局协同图又消费另一套旧 Supervisor topology，不能证明图板一致。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T4；Owner：Web / Project Runtime；来源：`docs/specs/epic-9/story-9.43/`。

## What Changes

- 在项目任务视图内增加“看板 / 协同图”切换，两个视图消费同一 `ProjectTaskPage` 与按需加载的 `ProjectTaskDetail`。
- 从当前 Task→Run→WorkItem 投影构建最小只读协同图，不读取旧 Supervisor manifest 或创建图状态源。
- 在看板卡、Task 图节点、WorkItem 图节点和详情之间共享 selectedTaskId/selectedWorkItemId，并显示同一 revision。
- 支持键盘聚焦和节点选择；图中不存在的任务或跨项目 WorkItem 不得被定位。

## Non-goals

- 不在图中执行调度、修改状态或保存布局。
- 不复用旧 Supervisor DAG 作为项目任务事实源。
- 不包含拖拽迁移、任务创建、指派或实时订阅。

## Capabilities

### New Capabilities

- `project-task-collaboration-graph`: 基于项目任务权威投影的图板共享选择和只读 Task/WorkItem 协同图。

### Modified Capabilities

- 无。

## Impact

主要影响 `packages/web/src/components/os/workspace/project-task-board/`、`ProjectWorkspace.tsx` 与组件测试；Core 协议无新增事实源。
