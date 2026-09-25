# Tasks

## 1. Core 受控写入

- [x] 1.1 `943-T8-A`（串行；依赖：943-T3、943-T5 Core；角色：Task Runtime subagent）实现版本化 priority mutation port、requestId/revision/cursor/epoch CAS 和幂等回执；验证旧任务首次写入、并发冲突和字段保留。
- [x] 1.2 `943-T8-B`（串行；依赖：9.42 production composition、1.1；角色：Collaboration Runtime subagent）实现契约候选查询和 WorkItem handoff，递增 lease epoch、失效旧 claim 并拒绝所有旧 epoch 回执；验证未授权目标零写入与未知外部结果人工核对。

## 2. Transport 与交互

- [x] 2.1 `943-T8-C`（串行；依赖：1.2；角色：Transport subagent）扩展 cross-package contract/service、Desktop/Web 薄适配和 parity tests，传递两套 revision/epoch 与结构化冲突。
- [x] 2.2 `943-T8-D`（串行；依赖：2.1；角色：Web interaction subagent）实现优先级和 Agent 交接选择器，候选使用稳定 ID/展示名，提交期间不乐观改卡，失败保留焦点/筛选/详情。
  - 证据：`ProjectTaskBoard.test.tsx` 覆盖优先级和 Agent 交接成功/失败、中文候选展示、权威 CAS、无乐观更新、焦点/筛选/详情/草稿保留；`project-task-board.test.ts` 与 `ontology-cross-package-service.test.ts` 覆盖候选 authority transport。

## 3. 验收

- [x] 3.1 `943-T8-E`（串行；依赖：2.2；角色：Integration QA subagent）执行 B07、并发优先级、未授权目标和旧 lease 迟到回执矩阵；运行三包 typecheck、lint、边界、自测、diff check 与 strict validation。
  - 证据：`evidence/943-t8-e-acceptance.md`。
