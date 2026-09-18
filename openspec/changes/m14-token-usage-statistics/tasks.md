# Tasks

## 1. 实施准备

- [x] 1.1（依赖：M14-T4；串行；角色：Proposal owner；写入：本 change artifacts）完成 strict validation，并记录用户于 2026-09-18 对 Story M.14 的实施批准；证据：M14-T4 已合并为 `928a0f7`，`openspec validate m14-token-usage-statistics --strict` 退出码为 0。

## 2. Token 数据链路

- [ ] 2.1（依赖：1.1；可并行；角色：Core subagent；写入：Core 公共消息类型、聚合/估算 helper、OriginOSAgent 与定向测试）在隔离 Task branch/worktree 接通真实 usage、纯函数汇总和有标记的 context estimate；证据：提交哈希及完整、缺失、旧会话、cache 字段测试通过。
- [ ] 2.2（依赖：2.1；串行；角色：Desktop/Web subagent；写入：最终流事件、会话持久化、现有 Agent/RoleAgent/Skill/Project 会话 UI 与测试）在独立 Task branch/worktree 透传并展示会话汇总，不复制聚合逻辑；证据：提交哈希及 Web/Desktop 定向测试与构建通过。
- [ ] 2.3（依赖：2.1；可与 2.2 并行；角色：Collaboration subagent；写入：CostController、Metrics、worker usage 接线与定向测试）在独立 Task branch/worktree 使用真实 input/output/cache usage 并仅在 cost 缺失时估算；证据：提交哈希及协作成本/缓存分类测试通过。

## 3. 集成与验收

- [ ] 3.1（依赖：2.2、2.3；串行；角色：Integration owner；写入：Proposal integration branch）合并各 Task commit，三方保留主工作区既有 worker 改动，运行 Core/Web/Desktop/worker 定向测试和 build、`pnpm lint:boundaries` 与架构检查器 self-test；证据：命令输出均成功且既有 diff 未丢失。
- [ ] 3.2（依赖：3.1；串行；角色：Integration owner；写入：Story 验证记录与 Git refs）核对 M14-T5 verification goal、再次 strict validate，合并到 `dev` 并清理全部 Task worktree；证据：dev merge commit、验证记录和已删除 worktree。
