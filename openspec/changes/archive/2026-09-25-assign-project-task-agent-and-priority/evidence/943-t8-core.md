# 943-T8 Core 实施证据

## 943-T8-A

- `AgentTaskRuntimeCoordinator` 实现 `ProjectTaskMetadataMutationPort`，请求绑定 project/session/task、requestId、Task revision/cursor 与 bridge epoch。
- 写入通过同 Session 的 `task_update` 产生权威 Task revision/cursor；metadata 仅在该写入成功后持久化。
- 旧 Task 首次写入创建 `projectMetadata.version=1`；已有 `semanticRefs` 与 `inputVersions` 原样保留。
- 幂等回执随 Task Runtime persistence 持久化并有界保留；相同 requestId/相同输入返回稳定回执，不同输入结构化冲突。
- 同 revision 的并发请求在 coordinator 内串行，并由 revision/cursor/epoch CAS 保证至多一个成功。

## 943-T8-B

- `CollaborationExecutionStore` 从冻结的 `semanticContext.taskTemplates`、`agents` 与 `permissions.allowed` 交集生成候选。
- `handoffWorkItem` 同时校验 project、Run revision、WorkItem revision、lease epoch、非终态和授权目标；失败不写 ledger。
- 成功交接递增 WorkItem revision/lease epoch，清除旧 stage claim，将活动 attempt 标记为 `AGENT_HANDOFF` blocked，并持久化稳定 handoff receipt。
- receipt 明确标记未知外部结果需人工核对；旧 epoch Worker 回执以及聚合的 Verifier/Action/Evidence 外部结果均被结构化拒绝。
- requestId 在整个 Run 内唯一；完全相同请求可恢复，不同请求复用返回冲突。

## 验证

- `pnpm --filter @originos/core exec vitest run src/lib/integrations/pi-agent/task-runtime/__tests__/coordinator.test.ts src/modules/collaboration-runtime/facade/__tests__/contract-execution-handoff.test.ts --reporter=dot`：2 文件、25 测试通过。
- `pnpm --filter @originos/core exec tsc --noEmit --pretty false`：通过。
- Core Task Runtime + Collaboration facade 回归：8 文件、74 测试通过。
- `pnpm lint`：通过，0 error（3150 条仓库存量 warning）。
- Core 变更目录定向 ESLint 的 2 个 error 与隔离基线完全一致，均位于原有 `coordinator.ts:128`、`:835`；本变更新增诊断均为 warning。
- `pnpm lint:boundaries`：939 个生产文件、0 条诊断。
- `node scripts/check-architecture-boundaries.cjs --self-test`：43 个导入用例 × 2 个 CWD 通过。
- `openspec validate assign-project-task-agent-and-priority --strict`：通过。
- `git diff --check`：通过。
