# Story AG.2：模块边界修复

**Epic:** AG — 架构治理与围栏对齐
**状态:** Done（AG2-T1 本轮扫描范围已交付）
**更新:** 2026-09-12
**依赖:** AG.5 已完成的 AG5-T1 检查器；基线 dev b2d6bdb

## 当前范围

AG2-T1 修复现有围栏报告的 34 处违规：33 处 Core 基础设施反向依赖业务层、1 处通用聊天 UI 依赖业务 UI。精确清单见 [扫描基线](../story-AG.5/lint-baseline.md)。对应唯一 Proposal 为 [fix-reported-architecture-violations](../../../../openspec/changes/archive/2026-09-12-fix-reported-architecture-violations/proposal.md)。

2026-07-17 文档中的单包 `src/` 路径、11 处旧扫描和禁止 modules 依赖 integrations 的规则不再作为当前验收标准。当前以 AGENTS.md 的 Monorepo 单向依赖为准。AG.1 清场不作为本次修复前置；历史内容可从 Git 追溯，本轮不代表整个 Epic 已完成。

## 文档

- [需求](requirements.md)
- [交互](interaction.md)
- [架构](architecture.md)
- [实施](implementation.md)
- [测试](testing.md)

## 交付状态

- [x] AG2-T1 提案审查并批准
- [x] 隔离 Task 实施与集成
- [x] Story 测试 goal 通过
- [x] 合并、归档和清理

## AG2-T2 追加修复交付（2026-09-12）

已合入 dev，联合26项回归、桌面构建与实际应用包验证通过。见 [归档提案](../../../../openspec/changes/archive/2026-09-12-fix-restored-channel-target/proposal.md) 和 [测试证据](testing.md)。
