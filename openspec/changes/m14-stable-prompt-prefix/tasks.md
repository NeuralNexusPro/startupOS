# Tasks

## 1. 实施准备

- [x] 1.1（依赖：M14-T1；串行；角色：Proposal owner；写入：本 change artifacts）完成 strict validation，并记录用户于 2026-09-18 对 Story M.14 的实施批准；证据：M14-T1 已合并为 `2e47de4`，`openspec validate m14-stable-prompt-prefix --strict` 退出码为 0。

## 2. Prompt 边界实现

- [x] 2.1（依赖：1.1；串行；角色：Pi Runtime subagent；写入：现有 prompt builders、launcher/Agent 配置边界与定向测试）在隔离 Task branch/worktree 拆分稳定 system prompt 与冻结 session context，并用 Node crypto 产生安全 hash；证据：提交哈希及四条 Agent 链路稳定性、恢复、权限变化测试通过。

## 3. 集成与验收

- [x] 3.1（依赖：2.1；串行；角色：Integration owner；写入：Proposal integration branch）合并 Task commit并运行 Core typecheck/定向测试、`pnpm lint:boundaries` 和架构检查器 self-test；证据：stable prompt 7/7、恢复 2/2、瞬时 context 1/1、Core `tsc --noEmit`、886 文件边界扫描 0 诊断、架构 self-test 43×2 及 strict validation 均通过；含模块 mock 的测试文件需分进程运行以保持隔离。
- [x] 3.2（依赖：3.1；串行；角色：Integration owner；写入：Story 验证记录与 Git refs）核对 M14-T2 verification goal、再次 strict validate，合并到 `dev` 并清理 Task worktree；证据：dev merge `6c8ade2`，strict validation 通过，Task/Proposal worktree 与分支均已删除。
