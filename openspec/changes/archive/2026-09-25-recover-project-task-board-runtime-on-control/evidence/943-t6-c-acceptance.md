# 943-T6-C 恢复故障注入与 B08 验收证据

## 结论

B08 已通过 Core 生产恢复链路的故障注入验收。应用重启后的第一次控制恢复原 `sessionId`、Task 与 Run binding；恢复本身不推进任务。`paused` 仅在显式 resume 后继续，`waiting_user` 保持等待，`cancelled` 拒绝恢复执行。旧 revision/cursor/epoch 或变更后的 Run binding 在控制前零写入拒绝。

跨包服务现将 `ProjectTaskRuntimeRecoveryConflictError` 稳定映射为可重读的 `PROJECT_TASK_RUNTIME_STALE` conflict，将 `ProjectTaskSourceUnavailableError` 映射为可重试的 `PROJECT_TASK_SOURCE_UNAVAILABLE` unavailable；不再降级为无语义的 `MUTATION_FAILED`。

## 故障注入矩阵

| 场景 | 权威断言 |
|---|---|
| paused 恢复 | 两个全新 `AgentManager` 均恢复同一 Session/Task，bridge epoch 单调增加，Agent prompt 为 0 |
| waiting_user 恢复 | 状态保持 `waiting_user`，Agent prompt 为 0，不自动消费或推进 |
| cancelled 恢复 | 状态保持 `cancelled`；resume 被拒绝且无新 lease/执行 |
| 旧窗口 epoch | 恢复后以旧 `expectedLeaseEpoch` 控制返回 `LEASE_CONFLICT`，control 调用为 0 |
| revision/cursor/binding 漂移 | 返回 `PROJECT_TASK_RUNTIME_STALE`，control 与 Run replay 均为 0 |
| Action/Evidence 响应前中断 | 恢复完成后用新 host 再次 replay；Agent 调用仍为 1、Evidence 调用仍为 2（首次已接纳但响应丢失 + 一次恢复），Fact 为 1、accepted operation 为 1 |
| 跨包恢复错误 | conflict/unavailable 的 category、code、field、retryable 与 remediation 保持结构化 |

## 验证结果

```text
pnpm --filter @originos/core exec vitest run --config vitest.config.ts \
  src/lib/features/project/__tests__/project-task-runtime-recovery.test.ts \
  src/lib/features/project/__tests__/project-task-source.test.ts \
  src/lib/features/project/__tests__/ontology-cross-package-service.test.ts \
  src/lib/features/project/__tests__/contract-bound-runtime-recovery.test.ts
# 4 files / 41 tests passed

pnpm --filter @originos/core exec tsc -p tsconfig.json --noEmit
pnpm --filter @originos/web exec tsc -p tsconfig.json --noEmit
pnpm --filter @originos/desktop exec tsc -p tsconfig.json --noEmit
# passed

pnpm lint
# 0 errors / 3174 existing warnings

pnpm lint:boundaries
# 940 production files / 0 diagnostics

node scripts/check-architecture-boundaries.cjs --self-test
# 43 import cases x 2 CWD passed

openspec validate recover-project-task-board-runtime-on-control --strict
git diff --check
# passed
```

实际 macOS/Windows release artifact 的模块解析仍归 ONT.8 平台矩阵；本次验收覆盖 development 生产 composition、Desktop 装配测试和 package verifier 的恢复模块清单，不以 mock UI 代替恢复语义。
