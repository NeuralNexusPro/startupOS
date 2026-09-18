# Tasks

## 1. 实施准备

- [ ] 1.1（依赖：M14-T1、M14-T2；串行；角色：Proposal owner；写入：本 change artifacts）完成 strict validation，并记录用户于 2026-09-18 对 Story M.14 的实施批准；证据：`openspec validate m14-turn-cognitive-prefetch --strict` 退出码为 0。

## 2. Turn 召回实现

- [ ] 2.1（依赖：1.1；串行；角色：Cognitive Runtime subagent；写入：CognitiveManager 聚合 helper、OriginOSAgent/context hook、persistent/in-process/worker 接线与定向测试）在隔离 Task branch/worktree 接通 owner 范围内的有界 prefetch，保持原始消息不变且失败不阻塞；证据：提交哈希及 owner 隔离、预算、空结果、错误降级、恢复测试通过。

## 3. 集成与验收

- [ ] 3.1（依赖：2.1；串行；角色：Integration owner；写入：Proposal integration branch）三方保留主工作区既有 worker 改动并合并 Task commit，运行 Core/worker build、定向测试、`pnpm lint:boundaries` 和架构检查器 self-test；证据：命令输出均成功且既有 diff 未丢失。
- [ ] 3.2（依赖：3.1；串行；角色：Integration owner；写入：Story 验证记录与 Git refs）核对 M14-T3 verification goal、再次 strict validate，合并到 `dev` 并清理 Task worktree；证据：dev merge commit、验证记录和已删除 worktree。
