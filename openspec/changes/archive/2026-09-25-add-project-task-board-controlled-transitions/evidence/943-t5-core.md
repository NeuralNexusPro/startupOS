# 943-T5 Core 实施证据

## 任务 1.1

- `ProjectTaskBoardService.requestProjectTaskTransition` 仅从服务端公开的 `transitions` 中解析 `targetStatus`；零个候选返回 `TRANSITION_NOT_AVAILABLE`，多个候选返回 `TRANSITION_AMBIGUOUS`。
- 请求以 `projectId + taskId + requestId` 幂等，复用不同输入返回 `REQUEST_ID_CONFLICT`。
- 提交前校验 `expectedRevision` 与可选 `expectedLeaseEpoch`；Runtime source 在调用 mutation port 前再次校验 live revision/lease。
- 不可用、歧义、revision/lease 冲突测试均断言 mutation 次数为零。

## 任务 1.2

- `AgentTaskReviewPort` 公布 `requestReview`、`approveCompletion`、`rejectReview`，实现由 `AgentTaskRuntimeCoordinator` 调用同 Session Pi Task host。
- host mutation 使用精确 `expectedRevision`、`expectedCursor` 与 bridge lease epoch；过期 lease 在 host 调用前拒绝。
- `approveCompletion` 在 Board 与 Runtime 两层验证 required Step Evidence、Criterion Evidence、Task Evidence 和 unresolved Blocker；通过后由 `task_complete` 的 canonical Evidence Gate 再校验证据质量。
- 测试明确设置 WorkItem 输出但不提供 Task Evidence，确认返回 `EVIDENCE_GATE_FAILED` 且 mutation 次数为零。

## 验证

- `pnpm --filter @originos/core exec vitest run src/lib/features/project/__tests__ src/lib/integrations/pi-agent/task-runtime/__tests__ --reporter=dot`：10 个文件、78 个测试通过。
- `pnpm --filter @originos/core exec tsc --noEmit --pretty false`：通过。
- `pnpm lint`：0 error（仓库既有 warning 3143）。
- `pnpm lint:boundaries`：938 个生产文件、0 条诊断。
- `node scripts/check-architecture-boundaries.cjs --self-test`：43 个导入用例 × 2 个 CWD 通过。
- `git diff --check`：通过。
- `openspec validate add-project-task-board-controlled-transitions --strict`：通过。
