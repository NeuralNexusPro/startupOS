# Tasks

## 1. 集成准备

- [x] 1.1（依赖：M14-T1 至 M14-T5；串行；角色：Integration owner；写入：本 change artifacts）已完成 strict validation，并记录用户于 2026-09-18 对 Story M.14 的实施批准及 Story verification goal“通过 Story M.14 中定义的全部测试 case”；证据：M14-T1 至 M14-T5 已合并到 `dev`，`openspec validate m14-context-integration-verification --strict` 退出码为 0。

## 2. 全量验证

- [ ] 2.1（依赖：1.1；可并行；角色：QA subagent；写入：测试证据和必要测试修复）在隔离 Task branch/worktree 执行 M.14 测试矩阵，并记录目录预算、prompt hash、usage 聚合和旧会话兼容证据；证据：匿名 fixture 与测试输出。
- [ ] 2.2（依赖：1.1；可与 2.1 并行；角色：Architecture QA subagent；写入：验证证据）运行 Core/Web/Desktop build、lint、`pnpm lint:boundaries` 与 `node scripts/check-architecture-boundaries.cjs --self-test`；证据：完整命令及退出码。

## 3. 文档、合并与清理

- [ ] 3.1（依赖：2.1、2.2；串行；角色：Documentation subagent；写入：Story、Epic、AGENTS.md、changelog 与 OpenSpec capability specs）在隔离 Task branch/worktree同步最终公共边界、验收结果和状态；证据：文档提交哈希与索引检查通过。
- [ ] 3.2（依赖：3.1；串行；角色：Integration owner；写入：Git refs 与 OpenSpec archives）逐项核对 Story verification goal、strict validate 全部 M.14 changes，合并到 `dev`、归档 changes 并清理所有 Task/Proposal worktree；证据：dev merge commit、归档目录、验证记录和干净 worktree 清单。
