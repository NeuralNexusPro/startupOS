# Spec Delta: collaboration-contract-execution-structure（AG.10-T6）

## ADDED Requirements

### Requirement: contract-execution 文件结构单一职责

`packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts`（2611 行）SHALL 拆分：公共类型面、常量/错误/模块 helper、文件锁、无状态账本运算、Run 账本持久化、阶段提交、状态机推进循环各自独立成文件（`facade/contract-execution-*.ts` 共 7 个），主文件 SHALL 保留 `CollaborationExecutionStore` 类（公共执行 API、observers 桥接、ctx 组装）并 re-export 全部公共符号（`CollaborationExecutionStore`、`FileCollaborationMutationLock`、`CollaborationReconciliationError`、`CollaborationMutationConflictError`、`CollaborationWorkItemHandoffError` 及全部公共类型）；`facade/index.ts` 的 re-export 清单与全部消费方 import specifier MUST 零改动。

#### Scenario: 目录划分与行数

- **WHEN** 查看 `packages/core/src/modules/collaboration-runtime/facade/` 并执行 `wc -l`
- **THEN** SHALL 存在 contract-execution-types/contract-execution-shared/contract-execution-lock/contract-execution-ops/contract-execution-ledger/contract-execution-stages/contract-execution-advance 7 个文件，每个新文件 SHALL ≤ 600 行且首部有一句话职责注释，`contract-execution.ts` SHALL ≤ 700 行（800 备用上限）

#### Scenario: 导出符号与调用方不变

- **WHEN** 对比拆分前后经 `contract-execution.ts` 可导入的公共符号清单，并检查 `facade/index.ts`、`features/project/contract-bound-runtime-composition.ts`、`integrations/` 2 生产文件与 1 测试、facade 兄弟文件 3 处、facade 测试 4 文件的 import
- **THEN** 公共符号集合 diff SHALL 为空，全部消费方 import specifier SHALL 零变化，core exports 白名单条目零增删

### Requirement: 纯机械移动不改行为

拆分 SHALL 为逐字搬移加受限变换：types/shared/lock 逐字；ops 无状态函数直移（3 个预算函数增加 clock 首参为唯一签名变化）；ledger/stages/advance 方法体外移为模块函数并按 ctx 变换规则（`this.X` → `ctx.X` / 模块函数直调）改写，错误消息、CAS/lease/HITL/预算语义与调用顺序 SHALL 逐字保持；新文件间依赖 SHALL 单向（advance/stages 不互相 import，advance 经 ctx 回调消费 stages），不得出现新环。

#### Scenario: 执行账本回归

- **WHEN** 执行 `facade/__tests__/` 全部 4 个测试套件（contract-execution/stage-machine/handoff/protocol-observation，29 用例）与 `integrations/__tests__/contract-verifier-ontology-outcome.test.ts`
- **THEN** 测试 SHALL 与拆分前基线一致（29 用例全绿，integrations 套件结果与基线相同），`collaboration-runtime/` 全目录失败集 SHALL 与基线逐一相同

#### Scenario: 循环依赖与边界

- **WHEN** 执行 `npx madge --circular packages/core/src --extensions ts,tsx` 与 `pnpm lint:boundaries`
- **THEN** madge 循环数 SHALL ≤ 基线 12 且 `facade/` 新增 7 文件 SHALL 不出现在任何环路径，边界扫描 SHALL 0 诊断

#### Scenario: 双端编译

- **WHEN** 执行 `pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build`
- **THEN** 双端 SHALL 0 error 且 `node scripts/expand-core-exports.cjs --verify` 通过
