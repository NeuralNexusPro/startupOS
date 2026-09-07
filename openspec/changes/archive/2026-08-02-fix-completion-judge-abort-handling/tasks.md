## 1. Proposal 门禁

- [x] 1.1 [串行] 完成 Proposal、Design、Spec 和 Task 规格并通过 strict validation；依赖：无；写入范围：`openspec/changes/fix-completion-judge-abort-handling/`；角色：Integration Owner；必需测试：`openspec validate fix-completion-judge-abort-handling --strict`；完成证据：Proposal commit `d8ea4d6`，strict validation 通过。

## 2. Completion Judge 修正

- [x] 2.1 [串行] 在独立 Task branch/worktree 中实现 `aborted`/`error` 分类、一次受控重试和 fallback 最终判定日志；依赖：1.1；写入范围：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`；角色：Agent Runtime Developer；必需测试：Core typecheck 与目标单元测试；完成证据：Task commit `4fafe82`（Proposal merge `8695c2f`）；日志包含 `attempt`、`category`、`stopReason`、`elapsedMs`、`retry`，fallback 额外包含 `decision`、`attempts` 与 `lastFailure`；Core typecheck 通过。
- [x] 2.2 [串行] 补充首次取消后成功、重试耗尽、非法 JSON、fallback complete/incomplete 和两次调用上限测试；依赖：2.1；写入范围：`packages/core/src/lib/integrations/pi-agent/core/__tests__/agent.test.ts` 或专用测试文件；角色：Agent Runtime QA；必需测试：Completion Judge、Completion Guard 和 Agent 测试；完成证据：新增 3 个复合 case，覆盖 7 个规格场景；Agent `44/44`、Completion Guard/Judge `8/8` 通过，敏感 provider 错误裁剪断言通过。

## 3. 集成与归档

- [x] 3.1 [串行] 将 Task commit 合并到 Proposal branch，执行普通聊天回归、Core typecheck、`git diff --check` 和 OpenSpec strict validation；依赖：2.2；写入范围：Proposal integration；角色：Verification Owner；必需测试：目标测试与普通聊天/会话恢复测试；完成证据：Proposal merge commit `8695c2f`；Agent、Completion Guard/Judge、AgentManager 与会话恢复回归共 `70/70` 通过；Core typecheck、`git diff --check`、OpenSpec strict validation 通过；Task 与 Proposal 源码差异为空。
- [x] 3.2 [串行] 创建并执行自动化验证 goal，目标为通过本 Proposal 定义的全部测试 case；依赖：3.1；写入范围：Proposal tasks 与验证证据；角色：Verification Owner；必需测试：本 Task 全部自动化 case；完成证据：验证 goal 线程 `019f8902-607f-7762-b5b6-a140a5d578cb`；5 个测试文件、`70/70` 个测试通过；Core typecheck、OpenSpec strict validation 和 `git diff --check` 通过；详细结果与剩余风险见 `verification-evidence.md`。
- [x] 3.3 [串行] 门禁全部通过后合并到 `dev`、同步 capability spec、归档 change 并清理本 Proposal worktree；依赖：3.2；写入范围：`dev`、OpenSpec archive、Git worktree metadata；角色：Integration Owner；必需测试：post-merge smoke 与 worktree 清单；完成证据：`dev` merge commit `fbc9ef1`；post-merge smoke `70/70`、Core typecheck 和 strict validation 通过；capability spec 同步 commit `4322053`；本次 Proposal/Task worktree 及对应分支已清理；archive commit `a7db471`，归档路径为 `openspec/changes/archive/2026-08-02-fix-completion-judge-abort-handling/`。
