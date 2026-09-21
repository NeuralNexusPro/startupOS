# Tasks

## 1. 实施准备

- [x] 1.1（依赖：M14-T2；串行；角色：Proposal owner；写入：本 change artifacts）完成 strict validation，并记录用户于 2026-09-18 对 Story M.14 的实施批准；证据：M14-T2 已合并为 `6c8ade2`，`openspec validate m14-pi-prompt-cache --strict` 退出码为 0。

## 2. Pi 缓存关联实现

- [x] 2.1（依赖：1.1；串行；角色：Pi Runtime subagent；写入：`core/agent.ts` 与直接测试）在隔离 Task branch/worktree 将已有 OriginOS session id 传给底层 Pi Agent，保留默认 cache retention；证据：同会话稳定、跨会话隔离且未注入 provider 私有缓存选项的定向测试通过，提交哈希见 Task branch。

## 3. 集成与验收

- [x] 3.1（依赖：2.1；串行；角色：Integration owner；写入：Proposal integration branch）合并 Task commit并运行 Core typecheck/定向测试、`pnpm lint:boundaries` 和架构检查器 self-test；证据：缓存会话关联测试 1/1、Core `tsc --noEmit`、886 文件边界扫描 0 诊断、架构 self-test 43×2 及 strict validation 均通过。
- [x] 3.2（依赖：3.1；串行；角色：Integration owner；写入：Story 验证记录与 Git refs）核对 M14-T4 verification goal、再次 strict validate，合并到 `dev` 并清理 Task worktree；证据：dev merge `928a0f7`，strict validation 通过，Task/Proposal worktree 与分支均已删除。
