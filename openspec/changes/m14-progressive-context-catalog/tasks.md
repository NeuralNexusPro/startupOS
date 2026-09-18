# Tasks

## 1. 实施准备

- [x] 1.1（依赖：无；串行；角色：Proposal owner；写入：本 change artifacts）完成 strict validation，并记录用户于 2026-09-18 对 Story M.14 的实施批准；证据：`openspec validate m14-progressive-context-catalog --strict` 退出码为 0。

## 2. 目录化实现

- [ ] 2.1（依赖：1.1；串行；角色：Core subagent；写入：`memory-consumption.ts`、现有 prompt builders 与定向测试）在隔离 Task branch/worktree 实现共享 Markdown 目录 helper 并替换四条 Agent 链路的全文注入；证据：提交哈希及目录预算、顺序、空内容测试通过。

## 3. 集成与验收

- [ ] 3.1（依赖：2.1；串行；角色：Integration owner；写入：Proposal integration branch）合并 Task commit，运行 Core typecheck/定向测试、`pnpm lint:boundaries` 和架构检查器 self-test；证据：命令输出均成功。
- [ ] 3.2（依赖：3.1；串行；角色：Integration owner；写入：Story 验证记录与 Git refs）核对 M14-T1 verification goal、再次 strict validate，合并到 `dev` 并清理 Task worktree；证据：dev merge commit、验证记录和已删除 worktree。
