# Proposal

## Why

当前 Story 9.42 只能从已批准的解决方案执行契约创建并暂停、恢复或取消 Run，尚未形成 Worker 执行、Verifier、Evidence 和崩溃恢复闭环。由此 ONT.8 无法验证多 Agent 运行时的事实一致性、证据门控与迟到输出围栏。

**可追溯信息：** Epic 9；Story 9.42；任务 942-T2；Owner：Core / Collaboration Runtime；来源：[docs/specs/epic-9/story-9.42](../../../docs/specs/epic-9/story-9.42)。

## What Changes

- 为冻结的 `CollaborationRunSnapshot` 增加持久化 attempt、lease epoch、Worker 回执与 Verifier 结果账本。
- 提供只消费已批准执行契约的 WorkItem 执行入口，按依赖、输入事实、Run 状态和 lease 进行 fail-closed 门控。
- 将确定性 Verifier 的通过结果经受控 Evidence Bridge 幂等登记到父任务；失败、缺失或占位验证不得产生 passed evidence。
- 支持 Action 已接纳、Evidence 未登记等中断点的恢复对账；未知外部副作用进入人工核对，取消后拒绝迟到输出。
- 补充 9.42 的 Core 自动化测试和规格实施状态；不实施 9.43 看板 UI 或新的任务事实源。

## Capabilities

### New Capabilities

- `contract-bound-multi-agent-execution`: 已批准执行契约驱动的多 Agent Run、WorkItem、验证、证据、lease fencing 与恢复行为。

### Modified Capabilities

- 无。

## Impact

- 影响 `packages/core/src/modules/collaboration-runtime/` 的公开执行端口、持久化 Run ledger 与测试。
- 通过 `@originos/core/lib/features/solution` 消费不可变执行契约，并通过注入的 `pi-tasks` 公共 Evidence 边界写入证据。
- 不新增 Web/IPC/UI、数据库、私有 `pi-tasks` import 或运行时 Workflow 生成能力。
- 依赖 P2.8 执行契约、ONT OSDK 与 Story 9.41 的受控 Task Runtime 边界；为 ONT.8 E03、E07、E08、E10、E11、E13 提供运行时前置能力。
