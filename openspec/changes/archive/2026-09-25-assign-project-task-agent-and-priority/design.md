# Design

## Context

优先级属于 Task Runtime 的版本化 `projectMetadata`；执行 Agent 属于冻结契约绑定下的 WorkItem。二者所有权不同，但都需要 project scope、幂等请求和 revision/epoch 防并发覆盖。

## Goals / Non-Goals

**Goals:** 单一权威写入；显式优先级；安全 handoff；旧 lease 回执隔离；Web/Desktop 等价。

**Non-Goals:** 不重排 DAG，不自动重试旧执行者，不让 UI 枚举文件系统资产。

## Decisions

### Priority 走 Task Runtime 公共端口

新增窄 `ProjectTaskMetadataMutationPort`，输入 priority、requestId、expectedRevision、expectedCursor 和 bridgeEpoch。实现通过 Task Runtime 受控状态更新保存 `projectMetadata.version=1`，保留 semanticRefs/inputVersions，内容相同幂等返回，不同内容复用 requestId 冲突。

### Handoff 走 Collaboration Runtime 阶段机

新增 `handoffWorkItem`：输入 runId、workItemId、targetAgentId、requestId、expectedRunRevision、expectedWorkItemRevision、expectedLeaseEpoch。提交前验证冻结契约节点、目标 Agent contract、权限交集和当前非终态。接纳后旧 stage claim/lease 失效，leaseEpoch 递增，assignedAgentId 更新并记录 handoff receipt；旧 epoch 的任何后续结果结构化拒绝。

### 候选来自冻结契约

服务端返回当前节点允许的中文展示名/稳定 ID 候选；没有精确授权候选时不显示交接操作。客户端只提交目标 ID，不自行推断。

### UI 延迟更新

优先级选择器和 Agent 交接选择器提交期间禁用；成功以返回 detail/page 更新，失败保留原值、焦点和筛选并展示可操作原因。

## Risks / Trade-offs

- [执行中 handoff 可能已有外部副作用] → 只切断后续 lease；未知结果进入既有人工核对，不声称撤销外部副作用。
- [Task 与 Run revision 不同] → 请求分别携带两套 CAS，不用一个 revision 代替另一个。
- [旧任务无 metadata] → 显示未设置，首次写入创建 version 1，不在读取时迁移。

## Migration Plan

新增可选请求类型和端口，不修改旧会话读取；无能力时返回 unavailable，现有只读看板继续工作。
