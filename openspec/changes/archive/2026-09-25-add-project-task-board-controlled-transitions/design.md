# Design

## Context

现有控制输入描述命令（pause/resume/retry/cancel），而拖拽描述用户期望的目标列。客户端无法安全推断目标列对应哪个命令，也无法判断完成证据、Blocker、review 或 lease。

## Goals / Non-Goals

**Goals:** 统一目标状态意图；Core capability/gate；无乐观落盘；鼠标键盘等价；CAS/焦点安全。

**Non-Goals:** 不替换 Task Runtime 状态机，不让 UI 解释 private pi-task entries。

## Decisions

### 目标状态协议

请求包含 projectId、taskId、targetStatus、requestId、expectedRevision 和可选 expectedLeaseEpoch。Core 读取最新 Task detail，依据公开 actions/status/runtime/binding 选择唯一命令。没有唯一合法命令时返回 `TRANSITION_NOT_AVAILABLE`。

### 完成与审核使用公开门控端口

新增窄 `ProjectTaskReviewPort`：`requestReview`、`approveCompletion`、`rejectReview`。实现只能调用 Task Runtime 公开 evidence/review boundary。`approveCompletion` 在所有 Step/Criterion evidence 满足且无 unresolved blocker 时才可提交；否则返回缺口列表，Task revision/status 不变。

### 前端延迟提交显示

拖拽只记录 pointer/keyboard intent 并调用 service，卡片 DOM 在响应前留在原列并显示处理中。成功以返回 detail/page 替换；失败恢复焦点到原卡，保留 query/filter/selection，通过 aria-live 报告。

### 幂等与并发

transition 复用 projectId+taskId+requestId/inputHash；expectedRevision 和 lease epoch 在提交前再次核对。并发请求只有一个可推进，后者返回 conflict 并重读权威投影。

## Risks / Trade-offs

- [目标列与命令并非一一对应] → 无唯一能力即拒绝并显示可用操作，不猜测。
- [拖拽视觉延迟] → 显示占位/处理中，但不移动事实卡片。
- [旧 Task 无 review port] → done/review 明确不可用，直到公开能力存在，不走私有 entry。

## Migration Plan

保留现有按钮作为同一 transition service 的快捷入口；稳定后移除重复命令映射。协议新增请求类型，不改旧持久格式。
