# Story AG.10: 巨型文件拆分 — 单一职责重构

**Epic:** AG — 架构治理与围栏对齐
**状态:** ✅ Complete（T1–T7 全部完成，T7 于 2026-10-05）
**优先级:** 🟠 High
**估计工时:** 5–8 天（可按文件拆分为多个 task 增量交付）
**依赖:** 无硬依赖；建议在 AG.8/AG.9 之后实施（边界清晰后拆分的落点更明确）
**创建日期:** 2026-09-28

---

## 概述

当前存在多个 1000–2600 行的巨型文件，职责混杂、review 困难、改动风险集中。基线（2026-09-28，非测试源码 top 7）：

| 文件 | 行数 | 主要混杂职责 |
|------|------|------------|
| `packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts` | 2611 | 合同执行编排 + 消息分发 + 状态落盘 |
| `packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts` | 2166 | DAG 执行 + Supervisor 决策 + 失败重分配 |
| `packages/core/src/lib/integrations/pi-agent/core/agent.ts` | 1912 | Agent 生命周期 + 工具编排 + 事件流 |
| `packages/web/src/app/page.tsx` | 1609 | 桌面 shell 编排（窗口/通知/Dock/Agent 初始化全在一处） |
| `packages/core/src/lib/integrations/pi-agent/client-hooks.ts` | 1317 | 客户端 hook 集群 |
| `packages/core/src/lib/integrations/pi-agent/task-runtime/coordinator.ts` | 1142 | 任务协调 |
| `packages/core/src/lib/features/project/contract-bound-runtime-composition.ts` | 1102 | 运行时组装 |

**拆分原则：**

- 纯机械拆分：按内聚职责切块到同目录子文件，公共入口（index.ts / 原文件 re-export）保持导出符号不变——**调用方零改动**。
- 每个文件拆分独立 PR、独立验证；禁止拆分同时改逻辑。
- 行数不是唯一标准：以「能否用一句话说出该文件职责」为验收核心。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、验收标准、风险与回滚 |
| [architecture.md](./architecture.md) | 每个目标文件的拆分方案 |
| [testing.md](./testing.md) | 测试策略、验收测试用例 |

## 状态

- [x] 需求确认
- [x] 架构设计
- [x] 开发实施（T1 ✅ 2026-09-30：page.tsx 1609→108 行，Proposal `refactor-home-page-structure`；T2 ✅ 2026-09-30：client-hooks.ts 1317→7 文件，Proposal `refactor-client-hooks`；T3 ✅ 2026-09-30：coordinator.ts 1142→689 行 + 4 新文件，Proposal `refactor-task-coordinator`；T4 ✅ 2026-09-30：contract-bound-runtime-composition.ts 1102→141 行 + composition/ 4 新文件，Proposal `refactor-contract-runtime-composition`；T5 ✅ 2026-10-01：pi-agent/core/agent.ts 1912→1348 行 + 3 新文件（internals 140/completion 432/factory 206），Proposal `refactor-agent-core`；T6 ✅ 2026-10-04：collaboration-runtime/facade/contract-execution.ts 2611→800 行 + 7 新文件（types 414/shared 148/lock 67/ops 389/ledger 252/stages 543/advance 383），Proposal `refactor-contract-execution`；T7 ✅ 2026-10-05：collaboration-runtime/engine/supervisor-dag.ts 2166→522 行 + 7 新文件（types 95/manifest 195/verifier 176/hitl 86/workflow 412/dispatch 467/tools 397），Proposal `refactor-supervisor-dag`）
- [x] 测试验证（T1–T7 TC-1~TC-6 全部通过，见 [testing.md](./testing.md) 各 task 执行结果；Story 完成）
