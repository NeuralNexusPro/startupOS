# Tasks

## 1. 实施准备

- [x] 1.1（依赖：M14-T1、M14-T2；串行；角色：Proposal owner；写入：本 change artifacts）完成 strict validation，并记录用户于 2026-09-18 对 Story M.14 的实施批准；证据：M14-T1/T2 已合并为 `2e47de4`/`6c8ade2`，`openspec validate m14-turn-cognitive-prefetch --strict` 退出码为 0。

## 2. Turn 召回实现

- [x] 2.1（依赖：1.1；串行；角色：Cognitive Runtime subagent；写入：CognitiveManager 聚合 helper、OriginOSAgent/context hook、persistent/in-process/worker 接线与定向测试）在隔离 Task branch/worktree 接通 owner 范围内的有界 prefetch，保持原始消息不变且失败不阻塞；证据：Task commits；runtime restore 2/2、prefetch 与注册 7/7，覆盖 owner 隔离、预算、空结果、错误降级和恢复。

## 3. 集成与验收

- [x] 3.1（依赖：2.1；串行；角色：Integration owner；写入：Proposal integration branch）三方保留主工作区既有 worker 改动并合并 Task commit，运行 Core/worker build、定向测试、`pnpm lint:boundaries` 和架构检查器 self-test；证据：预取/owner 测试 7/7、冷恢复 2/2、Core `tsc --noEmit`、886 文件边界扫描 0 诊断、架构 self-test 43×2 及 strict validation 均通过；Desktop 全量构建仅受既有 ontology/缺失类型依赖错误阻断，worker 无新增类型错误，主工作区 Supervisor diff 在 dev 合并阶段单独恢复。
- [x] 3.2（依赖：3.1；串行；角色：Integration owner；写入：Story 验证记录与 Git refs）核对 M14-T3 verification goal、再次 strict validate，合并到 `dev` 并清理 Task worktree；证据：dev merge `bddc34d`，strict validation 通过，Task/Proposal worktree 与分支均已删除；主工作区 Supervisor workingDirectory 6 行未提交改动已按原语义恢复。
