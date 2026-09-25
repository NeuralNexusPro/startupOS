# Spec Delta

## Purpose

让看板拖拽、键盘移动和操作按钮通过同一权威目标状态门控，确保 UI 不直接改变 Task 状态。

## ADDED Requirements

### Requirement: 目标状态意图

系统 SHALL 接收 targetStatus 并由 Core 根据当前公开 capability 选择唯一合法命令；无合法或存在多个歧义命令时 MUST 拒绝，不得修改 Task/Run。

#### Scenario: 非法列间移动

- **WHEN** 用户把当前 Task 移到没有公开转换能力的列
- **THEN** 系统 MUST 返回 `TRANSITION_NOT_AVAILABLE`，Task revision/status 保持不变

### Requirement: Evidence Gate 完成

系统 MUST 在 Task 进入 done 前验证所有必需 Step/Criterion Evidence 和 unresolved Blocker，并使用 Task Runtime 公开 review/completion port。

#### Scenario: 缺证据移动到已完成

- **WHEN** Task 缺少必需证据或仍有未解决 Blocker
- **THEN** 系统 MUST 返回可定位缺口，且 Task、Run、Evidence 均不得改变

### Requirement: 鼠标键盘同一命令

拖拽、键盘“移动到”菜单和操作按钮 SHALL 调用同一 transition service，携带相同 targetStatus、requestId、expectedRevision 和 lease 门控语义。

#### Scenario: 键盘与拖拽同目标

- **WHEN** 两种输入方式对同一 revision 请求相同 targetStatus
- **THEN** 发送的业务请求 MUST 等价，并获得相同服务端门控结果

### Requirement: 无乐观状态写入

系统 MUST 在服务端接受前保留卡片原列。拒绝、冲突或 unavailable 时 MUST 保留筛选、详情、草稿和焦点并显示原因。

#### Scenario: 拖拽被拒绝

- **WHEN** 服务端拒绝 transition
- **THEN** 卡片 MUST 留在原列，焦点回到原卡，aria-live MUST 播报可操作原因

### Requirement: 并发与 lease 门控

系统 SHALL 在提交前校验 expectedRevision 和必要 lease epoch；过期请求 MUST 零写入拒绝并返回权威摘要。

#### Scenario: 两客户端同时移动

- **WHEN** 两个客户端对同一 revision 发出不同目标状态
- **THEN** 至多一个请求成功，另一个 MUST 返回 conflict 且不得覆盖成功结果
