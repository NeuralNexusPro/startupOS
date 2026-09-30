# pi-agent-core-agent-structure 变更：pi-agent/core/agent.ts 文件结构约束（AG.10-T5）

## ADDED Requirements

### Requirement: pi-agent core agent 文件结构单一职责

`packages/core/src/lib/integrations/pi-agent/core/agent.ts`（1912 行）SHALL 拆分：模块级内部工具、completion 判定与恢复、Agent 工厂各自独立成文件（`core/agent-internals.ts`、`core/agent-completion.ts`、`core/agent-factory.ts`），`OriginOSAgent` 主类 SHALL 保留字段/constructor/initialize/事件路由/生命周期/执行编排与 set-get API；公共导出符号（`AgentCompletionPolicy`、`AgentExecutionOptions`、`OriginOSAgent`、`SessionData`、`CreateOriginOSAgentParams`、`createOriginOSAgent`）MUST 保持从 `agent.ts` 可导入，全仓调用方 import 零改动。

#### Scenario: 目录划分与行数

- **WHEN** 查看 `packages/core/src/lib/integrations/pi-agent/core/` 并执行 `wc -l`
- **THEN** SHALL 存在 agent-internals/agent-completion/agent-factory 文件，每个新文件 SHALL ≤ 600 行且首部有一句话职责注释，`agent.ts` SHALL ≤ 1500 行（1600 备用上限）

#### Scenario: 导出符号与调用方不变

- **WHEN** 对比拆分前后公共导出清单，并检查 5 处包内生产导入（agent-manager/persistent-agent/store/health/session-store）、15 处测试导入与 vi.mock 锚、1 处 desktop side-effect 导入（`agent-worker-runtime-deps.ts`）与 core exports 条目 `./lib/integrations/pi-agent/core/agent`
- **THEN** 符号集合 diff SHALL 为空，消费方 import specifier SHALL 零变化，`core/index.ts` 的 `export * from "./agent"` 不变

### Requirement: completion 逻辑外移不改行为

completion 判定与恢复 SHALL 外移至 `core/agent-completion.ts` 模块级函数（`runJudgePendingCompletion`/`runWithEmptyStopRecovery`/`runWithCompletionGuard`/`emitCompletionFailureReport`，ctx 变换：`this.*` → `ctx.*`，函数体逐字）；主类 SHALL 保留同签名同可见性薄委托（`judgePendingCompletion` 保持 `protected`）；judge 重试（2 次/15s 超时）、guard 恢复循环（`DEFAULT_COMPLETION_RECOVERY_LIMIT`）、empty-stop 恢复、deferred agent_end 消费时序与失败报告事件序 MUST 逐字保持；模块级 helper 与工厂 SHALL 逐字移动。

#### Scenario: completion 判定回归

- **WHEN** 执行 `packages/core/src/lib/integrations/pi-agent/core/__tests__/agent.test.ts`（88 用例，含 `vi.spyOn(agent, "judgePendingCompletion")`、`(agent as any).judgePendingCompletion()` 直调、`(agent as any).emitCompletionFailureReport()` 直调与事件序断言）及 `completion-guard`/`completion-judge`/`runtime-history-restore`/`agent-token-estimate` 测试
- **THEN** 测试 SHALL 全绿（spy/直调锚命中薄委托，judge/guard/empty-stop 行为一致）

#### Scenario: 双端编译与循环

- **WHEN** 执行 `pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build`、`node scripts/expand-core-exports.cjs --verify` 与 `npx madge --circular packages/core/src --extensions ts,tsx`
- **THEN** 双端 SHALL 0 error，exports verify SHALL 通过，madge 循环数 SHALL ≤ 基线 12 且 `core/` 新增文件无环
