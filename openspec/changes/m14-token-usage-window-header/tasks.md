# Tasks

## 1. 实施准备

- [x] 1.1（依赖：无；串行；角色：Proposal owner；写入：本 change artifacts）执行 OpenSpec strict validation，并在收到用户对本 proposal 的明确批准后记录批准证据。
  - 批准证据：Issue ARCH-85 comment `01a0b4aa-4087-73df-9d2f-13ba2acade90` 明确要求实施；strict validation 通过。

## 2. Web 窗体布局

- [x] 2.1（依赖：1.1；串行；角色：Web UI subagent；写入：`packages/web/src/components/ui/chat/` 及其定向测试）将会话级 Token 汇总从消息滚动区移至宿主窗体消息区上方，复用既有聚合函数和原生详情控件；验证有 usage 时显示、旧会话隐藏、详情仍可展开，并执行定向 Vitest 与 `pnpm --filter @originos/web lint`。
  - 验证：定向 Vitest 通过（1 test）；lint 退出成功（仅既有 warnings）。

## 3. 集成与验收

- [x] 3.1（依赖：2.1；串行；角色：Integration owner；写入：Proposal integration branch 与本 change 证据）合并 Task branch，执行 `git diff --check`、定向测试、Web lint、`pnpm lint:boundaries`、`node scripts/check-architecture-boundaries.cjs --self-test` 与 OpenSpec strict validation；记录 Story verification goal、合并和 Task worktree 清理证据。
  - 验证（2026-09-19）：`git diff --check dev...HEAD`、定向 Vitest（1/1）、Web lint（0 error，既有 warning）、边界扫描（887 文件、0 诊断）、架构 self-test（43×2）和 strict validation 均通过。
  - 集成：实现已在 integration branch `agent/agent/arch-85` 的 `70f4011`；`git worktree list` 未发现独立 Task worktree，故无需额外清理。
