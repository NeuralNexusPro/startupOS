# contract-bound-composition-structure Specification

## Purpose
TBD - created by archiving change refactor-contract-runtime-composition. Update Purpose after archive.

## Requirements

### Requirement: composition 目录结构单一职责

`packages/core/src/lib/features/project/contract-bound-runtime-composition.ts`（1102 行）SHALL 拆分：协议常量与 host/组合类型、artifact 执行运行时、执行端口适配器（Readiness/Verifier/Outcome/HITL）、Task 会话适配器各自独立成文件（`features/project/composition/`），组合根 SHALL 保留 `createProjectContractRuntimeComposition` 与 `projectContractRuntimeHost` 并 re-export 全部公共符号；公共导出符号（`ORIGINOS_ARTIFACT_VERIFIER_REF`、`ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF`、`ProjectContractRuntimeHostCapabilities`、`ProjectContractRuntimeCompositionOptions`、`ProjectContractRuntimeComposition`、`ProjectContractTaskRuntimeRecovery`、`ProjectContractTaskPriorityMutation`、`createProjectContractRuntimeComposition`、`projectContractRuntimeHost`）MUST 保持从 `contract-bound-runtime-composition.ts` 可导入，全仓调用方 import 零改动。

#### Scenario: 目录划分与行数

- **WHEN** 查看 `packages/core/src/lib/features/project/composition/` 并执行 `wc -l`
- **THEN** SHALL 存在 contract-runtime-types/contract-artifact-runtime/contract-execution-adapters/contract-task-session-adapters 文件，每个新文件 SHALL ≤ 600 行且首部有一句话职责注释，`contract-bound-runtime-composition.ts` SHALL ≤ 250 行（组合根 ≤ 400 上限备用）

#### Scenario: 导出符号与调用方不变

- **WHEN** 对比拆分前后公共导出清单，并检查 `features/project/index.ts`、3 个包内测试的相对导入、web/desktop 门面导入与 2 处 `vi.mock('@originos/core/lib/features/project')`
- **THEN** 符号集合 diff SHALL 为空，消费方 import specifier SHALL 零变化，`index.ts` 的 `export * from './contract-bound-runtime-composition'` 不变

### Requirement: 纯移动不改行为

拆分 SHALL 为逐字搬移（无 ctx 变换）：全部类/函数/类型体逐字保持；`createProjectContractRuntimeComposition` 组合体（装配顺序、条件表达式、对象图）SHALL 逐字保持；composition 内部依赖 SHALL 单向（execution-adapters → artifact-runtime → types；task-session-adapters → types），不得出现横向循环。

#### Scenario: 执行端口与组合回归

- **WHEN** 执行 3 个 project 测试（`contract-bound-runtime-composition.test.ts`、`contract-bound-runtime-recovery.test.ts`、`project-task-runtime-recovery.test.ts`）、web/desktop `ontology-cross-package-runtime-wiring.test.ts` 与 `npx madge --circular packages/core/src --extensions ts,tsx`
- **THEN** 测试 SHALL 全绿，组合根装配 SHALL 行为一致，madge 循环数 SHALL ≤ 基线 12 且 `composition/` 内部无环

#### Scenario: 双端编译

- **WHEN** 执行 `pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build`
- **THEN** 双端 SHALL 0 error
