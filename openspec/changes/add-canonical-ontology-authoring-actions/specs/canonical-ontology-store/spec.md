# Spec Delta

## ADDED Requirements

### Requirement: Store 持久化 authoring revision 与回执
Store SHALL 为 canonical ontology 快照维护从零开始单调递增的 authoring revision，并 SHALL 以 append-only JSONL 保存 operationId、命令摘要、状态、前后 revision、时间和安全审计上下文。

#### Scenario: 首次读取既有快照
- **WHEN** 读取尚未包含显式 authoring revision 的既有 canonical ontology
- **THEN** Store SHALL 将其 revision 解释为 0，且不得为读取执行写入

#### Scenario: authoring 提交成功
- **WHEN** authoring service 原子保存通过校验的新快照
- **THEN** Store SHALL 返回 revision 加一的快照并追加 accepted 回执

### Requirement: 快照 compare-and-swap 必须串行化
Store MUST 在同一项目文件队列内比较 expectedRevision 并执行原子替换，使并发写入最多一个成功；冲突请求不得覆盖已提交快照。

#### Scenario: 两个命令竞争相同 revision
- **WHEN** 两个命令同时以同一个 expectedRevision 修改同一项目
- **THEN** Store MUST 只接纳一个命令，另一个返回 `REVISION_CONFLICT`

### Requirement: authoring 回执必须可恢复查询
Store SHALL 能按 operationId 返回最后一条 authoring 回执，并 MUST 忽略仅位于 JSONL 尾部的截断记录，同时明确拒绝中间损坏。

#### Scenario: 重启后查询既有回执
- **WHEN** 应用重启后以已成功的 operationId 重试
- **THEN** Store SHALL 返回持久化的 accepted 回执供上层完成幂等响应

