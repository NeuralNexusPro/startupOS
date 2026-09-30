# Story AG.10: 巨型文件拆分 — 单一职责重构

**Epic:** AG — 架构治理与围栏对齐
**状态:** 🚧 In Progress（T1 完成 2026-09-30；T2–T7 待实施）
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
- [ ] 开发实施（T1 ✅ 2026-09-30：page.tsx 1609→108 行，Proposal `refactor-home-page-structure`；T2 ✅ 2026-09-30：client-hooks.ts 1317→7 文件，Proposal `refactor-client-hooks`；T3–T7 待实施）
- [ ] 测试验证（T1 TC-1~TC-6 已过，见 [testing.md](./testing.md) AG.10-T1 执行结果；Story 整体待 T2–T7）
