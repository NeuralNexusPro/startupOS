# 943-T7-D Acceptance

- B03：`project-task-creation.test.ts` 验证重复 requestId 只创建一个 Task/Run，内容冲突拒绝。
- B14：Core 与 Web 组件验证无已发布模板、缺少精确语义输入时返回 DesignGap，零 Task/Run 写入。
- 中断恢复与撤销并发：创建 ledger 在 Task/Run 分阶段恢复；撤销或 contract hash 漂移在写入前拒绝。
- 合并回归：Core 22 files / 169 tests，Web 5 files / 53 tests，Desktop 3 files / 26 tests 全部通过；三包 typecheck 通过。
- `pnpm lint` 0 errors（存量 warnings）；`pnpm lint:boundaries`、架构 self-test、strict validation 与 `git diff --check` 通过。
