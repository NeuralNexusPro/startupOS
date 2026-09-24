# Tasks

## 1. 执行账本与 lease 围栏

- [x] 1.1 `942-T2-A`（串行；依赖：Proposal 批准；角色：Core runtime subagent；写入：`packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts` 与定向测试）扩展冻结 Run ledger 的 WorkItem attempt、lease epoch、执行 intent/receipt 与状态转换，拒绝暂停、取消、依赖未满足和旧 epoch 输出；以 unit tests 验证同一请求幂等、不同 payload 冲突与迟到输出拒绝。

## 2. Worker、Verifier 与证据对账

- [x] 2.1 `942-T2-B`（串行；依赖：1.1；角色：Core runtime subagent；写入：同一 execution port、公共类型与定向测试）增加注入式 Worker/Verifier/Evidence Sink 端口，按 intent → Worker receipt → verifier → Evidence receipt 对账；以失败、占位 verifier、通过证据、未知外部回执和 Action 后中断恢复测试验证没有默认通过或重复副作用。
- [x] 2.2 `942-T2-C`（串行；依赖：2.1；角色：Core runtime subagent；写入：恢复逻辑与定向测试）实现 restart、pause、cancel 的恢复门控，确保 frozen contract 不切换 latest、paused 不自启、cancelled 不复活；以 lease/receipt/evidence 边界故障注入测试验证恢复只补缺失阶段。

## 3. Story 证据与集成

- [x] 3.1 `942-T2-D`（串行；依赖：2.2；角色：Integration/QA subagent；写入：`docs/specs/epic-9/story-9.42/` 与 Proposal evidence）更新实施和测试证据，执行定向 Vitest、Core typecheck、`pnpm lint:boundaries`、架构 self-test 与 `git diff --check`，将 TC-U1–U6、TC-I1–I10 的已验证项明确映射。
- [ ] 3.2 `942-T2-E`（串行；依赖：3.1；角色：Proposal integration owner；写入：本 change 的任务/验证证据）运行 `openspec validate complete-multi-agent-execution-recovery --strict`，完成 Story verification goal，合并 Task branch 到 `dev` 并清理已合并 worktree；以命令输出、merge commit 和干净 worktree 列表验证。
