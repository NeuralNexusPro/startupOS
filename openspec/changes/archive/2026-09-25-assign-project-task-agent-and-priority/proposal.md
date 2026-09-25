# Proposal

## Why

Story 9.43 要求用户能调整任务优先级并在运行中交接执行 Agent。当前看板只能读取这些字段；若直接改 `projectMetadata` 或 WorkItem `assignedAgentId`，会绕过 Task revision、冻结契约目标、9.42 lease 和迟到回执防护，无法满足 B07。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T8；Owner：Project Runtime / Collaboration Runtime / Web。

## What Changes

- 增加版本化的 Task priority 受控写端口，以 requestId、expectedRevision 和 expectedCursor 做 CAS，旧任务保持“未设置”直到用户明确选择。
- 增加 WorkItem Agent handoff 端口：只允许冻结契约内已授权目标，先撤销/失效旧 lease，再创建新 epoch 与明确交接回执。
- 迟到 Worker/Verifier/Action/Evidence 回执必须因旧 epoch 被拒绝，不覆盖新执行者状态。
- cross-package、Desktop 与 Web 只传递意图和权威结果；看板编辑器等待服务端接纳后刷新，不乐观改写卡片。

## Non-goals

- 不自动推荐或猜测 Agent，不修改冻结契约拓扑。
- 不把优先级映射成调度抢占，不新增第二任务元数据存储。
- 不允许跨项目或未授权目标交接。

## Capabilities

### New Capabilities

- `project-task-assignment-priority`: 带 Task/lease CAS、契约授权与迟到回执隔离的优先级和 Agent 交接协议。

### Modified Capabilities

- 无。

## Impact

影响 Task Runtime 公共元数据端口、collaboration WorkItem lease 阶段机、Core project service、cross-package contract、Desktop/Web adapters 和看板交互。
