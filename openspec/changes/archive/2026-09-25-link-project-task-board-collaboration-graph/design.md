# Design

## Context

项目看板已按需读取权威详情。图板联动只需对同一页与详情做展示投影；若另起图查询、复用旧 `TopologyGraph` 的 Supervisor manifest 或在浏览器缓存第二份状态，都会破坏 B01。

## Goals / Non-Goals

**Goals:** 同一查询窗口、同一详情、同一 revision；板到图、图到详情的可访问定位。

**Non-Goals:** 不实现布局持久化、图中写操作、跨项目拓扑或实时订阅。

## Decisions

### 共享父级选择状态

项目任务容器持有 `viewMode`、`selectedTaskId` 与 `selectedWorkItemId`。看板和图只接收这些值及回调。切换视图不重新创建任务投影，不清空筛选和已选详情。

### 最小 Task→WorkItem 图

每个已加载 Task 是根节点；选中或已加载详情时，以 WorkItem 为子节点，边由 `taskId` 与 `binding.parentTaskId` 校验后生成。节点展示 assignedAgentId、status、attempt/lease 摘要；不猜测未加载的 WorkItem。

### 原生 SVG 与语义按钮

使用现有 React/Tailwind 和轻量 SVG 绘制，不引入新图库。每个节点同时提供可聚焦按钮/列表语义，Enter/Space 触发与鼠标相同的选择回调。

## Risks / Trade-offs

- [只加载当前页] → 图明确标注当前已加载任务；cursor 追加后增量出现节点。
- [详情尚未加载] → 先显示 Task 节点，选择后加载详情再显示 WorkItem。
- [窄窗口] → 提供可滚动图面和同等语义节点列表。

## Migration Plan

默认仍进入看板；图切换可独立移除，不影响 Core 数据或既有控制入口。
