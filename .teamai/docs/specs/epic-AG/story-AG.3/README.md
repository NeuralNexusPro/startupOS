# Story AG.3: `src/lib/*` 业务目录回归 `features/` + 循环依赖拆解

**Epic:** AG — 架构治理与围栏对齐
**状态:** 📋 Planning
**优先级:** 🟠 High
**估计工时:** 3–5 天
**依赖:** AG.1（清场）、AG.2（边界修复，避免迁移过程中 module 仍在穿透）

## 概述

将 `src/lib/` 顶层散落的 11 个业务目录（agents、api、interview、ontology、project、sandbox、skills、system、taste 等）迁移到 `lib/features/` 下，使目录结构回归 CLAUDE.md §目录规则 #3 的设定。同时解除 `features/agent ↔ skills/project-initialization` 的循环依赖。

采用增量迁移策略：先拆解循环依赖（逻辑变更），再按子目录逐个物理迁移（每个子目录一个 PR），使用 `git mv` 保留历史。每个 PR 独立通过编译和测试验证。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、当前现状、目标终态、验收标准、风险与回滚 |
| [architecture.md](./architecture.md) | 必做项（A-D）、迁移命令模板、codemod 工具、循环依赖打破示例 |
| [testing.md](./testing.md) | 测试策略、验收测试用例 |

## 状态

- [ ] 需求确认
- [ ] 架构设计
- [ ] 开发实施
- [ ] 测试验证
