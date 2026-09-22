# 5.2 Verification Evidence

**Change:** `implement-agent-session-task-runtime`
**Story:** Story 9.41 — Agent/RoleAgent 任务入口与 `pi-tasks` 直接执行
**Date:** 2026-09-22
**Result:** Product runtime implemented; local automated verification complete; Windows x64 and macOS package smoke remain pending platform evidence.

## Verification Goal

> 通过 Story 9.41 `testing.md` 中定义的可自动化 P0/P1 测试用例，验证 Agent、RoleAgent 与 Skill 当前 Session 的 `pi-tasks` 任务入口、公开集成边界、Evidence 门控、completion policy 互斥、受控续跑、暂停/取消、并发幂等和重启恢复符合验收标准。

**Goal status:** `COMPLETE` for the automated scope; package-level platform evidence remains `PENDING_PLATFORM_EVIDENCE`.

## Automated Matrix

| Scope | Result | Evidence |
|---|---:|---|
| `pi-tasks` ledger, Evidence Gate, replay, idempotency, branch isolation | PASS | Contract suite passed; covers atomic mutation, stale CAS, checkpoint replay, compaction, evidence rejection paths, and forced-completion refusal. |
| Adapter and host invoke boundary | PASS | Adapter suite `33/33` passed. |
| A-02 public runtime boundary | PASS | Core contract suite `13/13` passed. |
| Core coordinator, completion policy, continuation, projection | PASS | Core agent/completion/task coordinator suite `69/69` passed. |
| Desktop IPC, persistence, stale scope, Skill support, unknown version | PASS | Desktop Task Runtime IPC suite `13/13` passed. |
| Web draft, entry reuse, task card, controls, waiting-user reply | PASS | Web Task Runtime suite `23/23` passed. |
| Web regression | PASS | Web suite `316/316` passed. |
| Desktop package verifier | PASS | `test:pi-task-runtime-package` `15/15` passed; `verify:pi-task-runtime` passed on darwin-arm64 with 290 transitive dependencies and matching fingerprints. |
| Build and type-check | PASS | Core type-check, Desktop build, Web type-check, and Web build passed. |
| Lint and architecture | PASS | `pnpm lint` passed with 0 errors / 3054 warnings; `pnpm lint:boundaries` passed with 907 files and 0 diagnostics; architecture checker self-test passed `43 × 2`. |
| OpenSpec | PASS | Strict validation passed for `implement-agent-session-task-runtime` and `integrate-ontology-cross-package-adapters`. |

Representative commands:

```bash
pnpm --filter @originos/pi-tasks test
pnpm --filter @originos/pi-agent-adapter test
pnpm --filter @originos/core exec vitest run --config src/lib/integrations/pi-agent/__tests__/pi-task-runtime-boundary/vitest.contract.config.ts
pnpm --filter @originos/core exec vitest run src/lib/integrations/pi-agent/task-runtime/__tests__/coordinator.test.ts src/lib/integrations/pi-agent/task-runtime/__tests__/continuation-controller.test.ts src/lib/integrations/pi-agent/core/__tests__/agent.test.ts src/lib/integrations/pi-agent/core/__tests__/completion-guard.test.ts
pnpm --filter @originos/desktop exec vitest run src/main/services/__tests__/agent-task-runtime-ipc.test.ts
pnpm --filter @originos/web exec vitest run src/components/os/agent-dialog/__tests__/agent-task-runtime-ui.test.tsx src/components/os/agent-dialog/__tests__/use-agent-task-runtime.test.tsx src/components/ui/__tests__/chat-input-bar.test.tsx src/components/skills/__tests__/skill-task-history.test.tsx src/services/__tests__/agent-task-runtime.test.ts
pnpm --filter @originos/desktop test:pi-task-runtime-package
pnpm --filter @originos/desktop verify:pi-task-runtime
```

## Known Failure Outside Task Runtime

`pnpm --filter @originos/desktop test` is currently `136/141`; the 5 failures are all in
`email-provisioning.test.ts` and are unrelated to the Task Runtime. They are not counted as Task Runtime regressions.

## Remaining Platform Evidence

- Windows x64 package smoke: **PENDING_PLATFORM_EVIDENCE**.
- macOS x64 package smoke: **PENDING_PLATFORM_EVIDENCE**.
- macOS arm64 package smoke: **PENDING_PLATFORM_EVIDENCE**; darwin-arm64 development verifier passed, but no current 0.3.1 package artifact is present in `release/`.

The existing `release/` directory contains older 0.2.4 artifacts and cannot be used as 0.3.1 evidence. A fresh 0.3.1 build must be produced and verified before those platform gaps can be closed.

## Conclusion

- Story 9.41 product runtime: **IMPLEMENTED**.
- Automated verification: **PASS**.
- Windows/macOS package evidence: **PENDING_PLATFORM_EVIDENCE**.
- ONT.8 and downstream Stories must not claim full readiness until the package evidence is supplied.
