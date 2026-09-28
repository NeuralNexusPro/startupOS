# 架构设计 - Story AG.10

**Story:** 巨型文件拆分 — 单一职责重构
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 拆分方案（按实施顺序）

> 实施前每个 task 先用 `grep -n "^export \|^function \|^const \|^interface \|^type " <file>` 生成符号清单，按内聚分组后再动手；下述分组是实施起点，允许在实施 PR 中微调。

### T1 `packages/web/src/app/page.tsx`（1609 行）

- 拆出（同目录或就近组件目录）：
  - `home-shell/`：Dock、窗口容器编排、快捷键处理
  - `home-state/`：首页 zustand/useState 集群归并为一个 hook 文件
  - `home-handlers/`：Agent 初始化、通知点击、IPC 订阅副作用
- 保留：page.tsx 只留布局 JSX 与 Provider 挂载（目标 ≤ 300 行）。

### T2 `packages/core/src/lib/integrations/pi-agent/client-hooks.ts`（1317 行）

- 按 hook 单元拆文件（同目录 `hooks/` 或拆为 `client-hooks/` 目录 + index.ts re-export）。

### T3 `packages/core/src/lib/integrations/pi-agent/task-runtime/coordinator.ts`（1142 行）

- 拆出：任务状态机、调度循环、结果聚合。

### T4 `packages/core/src/lib/features/project/contract-bound-runtime-composition.ts`（1102 行）

- 按装配对象拆：agent 装配、工具装配、记忆装配；组装入口保留单文件门面。

### T5 `packages/core/src/lib/integrations/pi-agent/core/agent.ts`（1912 行）

- 拆出：会话生命周期、工具执行编排、事件/流处理、消息持久化；`OriginOSAgent` 类（或工厂）保留在 agent.ts 作为门面。

### T6 `packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts`（2611 行）

- 拆出：合同校验、执行编排、消息分发、状态落盘、错误恢复；facade/index.ts 承接导出。

### T7 `packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts`（2166 行）

- 拆出：DAG 解析与校验、执行引擎、Supervisor 决策、失败重分配；engine/index.ts 承接导出。

## 验证约定

- 每个 task 的 PR 描述附：拆分前后行数对比、符号清单 diff（应为空 diff 或仅有新增 re-export）、madge 结果。
- 拆分不改变导出符号是硬约束；如确需改导出，升级为架构变更走 AGENTS.md 变更流程。
