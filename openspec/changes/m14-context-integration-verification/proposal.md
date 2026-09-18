# Proposal：M.14 集成验证与架构文档收口

## 可追溯信息

- epic-id：M
- story-id：M.14
- task-id：M14-T6
- owner：Integration / QA
- 来源：`docs/specs/epic-M/story-M.14/`

## Why

M.14 横跨四条 Agent 链路、Web/Desktop 会话和协作运行时，需要统一回归证据、架构边界检查与文档状态，避免各 Task 局部通过但整体行为不一致。

## What Changes

- 执行 M.14 测试矩阵、Core/Web/Desktop 构建、lint 和架构边界检查。
- 用匿名大样本记录上下文缩减、稳定 prompt hash 与 provider usage 证据。
- 更新 Story、Epic、AGENTS.md 和 changelog 的最终状态与公共边界。
- 严格校验并归档全部 M.14 OpenSpec changes，清理 Task worktree。

## 非目标

- 不新增业务功能或修复无关存量问题。
- 不发布远端版本。

## Capabilities

### New Capabilities

无。本 Task 只验证和同步已实施能力。

### Modified Capabilities

无。

## Impact

- packages：只运行验证，必要修复必须回到对应 Task Proposal。
- public APIs / persistence / IPC / packaging：不新增变更。
- 依赖：M14-T1 至 M14-T5 全部完成。

## 上线方案

所有自动化门禁通过后才合并到 `dev` 并归档；人工 provider 缓存结果记录为证据，不伪装为自动化通过。

## 回滚方案

文档提交可独立回滚；若验证失败则不合并应用源码。
