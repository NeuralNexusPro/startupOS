# Proposal: refactor-contract-runtime-composition（AG.10-T4 contract-bound-runtime-composition.ts 巨型文件拆分）

**epic-id:** AG
**story-id:** AG.10
**task-id:** AG10-T4
**owner:** Archersado
**来源 Story 文档：** `docs/specs/epic-AG/story-AG.10/`（README / requirements / architecture / testing）

## Why

`packages/core/src/lib/features/project/contract-bound-runtime-composition.ts` 当前 1102 行，是 Story AG.10 FR-4 风险序列第 4 个拆分对象。现状盘点（2026-09-30 逐段核对）：

| 区块 | 行范围 | 职责 |
|------|--------|------|
| imports | 1–85 | node:crypto/node:fs/path + collaboration-runtime facade/integrations、ontology、solution、agent/server、task-runtime 等 14 组 import |
| 常量与类型 | 88–154 | 2 个导出常量（`ORIGINOS_ARTIFACT_*`）、`ContractArtifactEnvelope`、`ProjectContractSessionPort`、3 个导出接口（`ProjectContractRuntimeHostCapabilities`/`...Options`/`...Composition`） |
| 模块级纯 helper | 156–344 | `assertIdentifier`、`stableValue`、`sha256`、`artifactPath`/`artifactRef`/`parseArtifactRef`、`messageText`、`extractJsonObject`、`buildWorkerPrompt`、`firstExisting`、`loadTargetSystemPrompt`、`resolveTargetDirectory` |
| artifact 执行类 | 346–479 | `AgentManagerContractRuntime`（execute + recoverPersistedArtifact，把冻结 WorkItem 派发给 Agent 并落盘 artifact envelope） |
| Readiness/Verifier/Outcome | 481–760 | `parseOntologyFactRef`、`CanonicalReadiness`（WorkItemReadinessPort）、`ArtifactVerifier`（VersionedContractVerifier）、`artifactEvidenceSchema`、`factReference`/`outputDraft`、`ArtifactOutcomeDrafts`（FrozenOutcomeDraftPort）、`ParentSessionHitl`（WorkItemHitlPort） |
| Task 会话端口适配 | 761–886 | `taskCreationSessionId`、`RuntimeApprovedProjectTaskPort`（ApprovedProjectTaskPort）、`createProjectEvidenceSink`、`recoveryUnavailable`、`isExactRecoveredTask` |
| Task Runtime 恢复与优先级 | 888–1013 | 导出类 `ProjectContractTaskRuntimeRecovery`、导出类 `ProjectContractTaskPriorityMutation` |
| 组合根 | 1015–1102 | `createProjectContractRuntimeComposition`（唯一生产组合根）+ `projectContractRuntimeHost` |

单文件混合了 artifact 产物协议、Readiness/Verifier/Outcome 三个执行端口实现、Task 会话端口适配、Task Runtime 恢复与优先级 mutation、组合根五类职责。Story architecture.md T4 方案：「拆出：适配器簇与组合根，composition 文件保留组合函数」。

消费面（已核查，拆分后全部零改动）：

- 包内：`features/project/index.ts` `export * from './contract-bound-runtime-composition'`（零改动）；3 个测试文件相对导入 `../contract-bound-runtime-composition`（符号经拆分文件由主文件 re-export，specifier 零变化）
- 跨包：web `services/ontologyCrossPackageService.ts` 与 desktop `services/ontology-cross-package-ipc.ts` 均经 `@originos/core/lib/features/project` 门面导入 `createProjectContractRuntimeComposition`/`projectContractRuntimeHost`（零改动）；2 个 wiring 测试经 `vi.mock('@originos/core/lib/features/project')` mock 门面（零改动）
- core exports：`./lib/features/project` 条目 target 指向 `index.ts`（无需改动）

## What Changes

- **C1 常量与类型拆出**：`ORIGINOS_ARTIFACT_*` 2 个导出常量、`ContractArtifactEnvelope`、`ProjectContractSessionPort`、3 个导出接口（`ProjectContractRuntimeHostCapabilities`/`ProjectContractRuntimeCompositionOptions`/`ProjectContractRuntimeComposition`）移至 `composition/contract-runtime-types.ts`，逐字移动（导出符号保持导出）。
- **C2 artifact 执行拆出**：模块级 helper（`assertIdentifier`/`stableValue`/`sha256`/`artifactPath`/`artifactRef`/`parseArtifactRef`/`messageText`/`extractJsonObject`/`buildWorkerPrompt`/`firstExisting`/`loadTargetSystemPrompt`/`resolveTargetDirectory`）与 `AgentManagerContractRuntime` 类移至 `composition/contract-artifact-runtime.ts`，逐字移动（无 ctx 变换——纯类/纯函数搬移）。
- **C3 执行端口适配器拆出**：`parseOntologyFactRef`、`CanonicalReadiness`、`ArtifactVerifier`、`artifactEvidenceSchema`、`factReference`、`outputDraft`、`ArtifactOutcomeDrafts`、`ParentSessionHitl` 移至 `composition/contract-execution-adapters.ts`，逐字移动。
- **C4 Task 会话端口拆出**：`taskCreationSessionId`、`RuntimeApprovedProjectTaskPort`、`createProjectEvidenceSink`、`recoveryUnavailable`、`isExactRecoveredTask`、`ProjectContractTaskRuntimeRecovery`、`ProjectContractTaskPriorityMutation` 移至 `composition/contract-task-session-adapters.ts`，逐字移动（2 个导出类保持导出）。
- **C5 组合根收敛**：`createProjectContractRuntimeComposition` 与 `projectContractRuntimeHost` 保留在 `contract-bound-runtime-composition.ts`（组合函数 + re-export 全部公共符号），文件顶部补单句职责注释（FR-3）。
- **C6 导出符号不变**：全部 8 个公共符号（2 常量 + 3 接口 + 2 类 + 2 函数）保持从 `contract-bound-runtime-composition.ts` 可导入；`features/project/index.ts` 的 `export * from './contract-bound-runtime-composition'` 不变；3 个包内测试文件 specifier 零变化。
- **C7 每个新文件顶部一句话职责注释**（FR-3）。

## 硬约束（来自 Story requirements / testing）

- 纯机械移动：本任务全部为类/函数/类型的逐字搬移（无 D3 ctx 变换——没有方法体外移闭包捕获 `this` 跨文件的情形），不改任何逻辑、不改执行顺序、不新增抽象。
- **导出符号不变**：8 个公共符号集合与语义不变；全仓调用方 import 零改动（web/desktop 门面导入 + 包内相对导入全部原样）。
- 3 个既有测试文件全绿：`contract-bound-runtime-composition.test.ts`、`contract-bound-runtime-recovery.test.ts`（7 用例）、`project-task-runtime-recovery.test.ts`。
- web/desktop wiring 测试（`ontology-cross-package-runtime-wiring.test.ts`）全绿。
- madge 循环数 ≤ 基线 12（core）。
- 行数达标：新文件单文件 ≤ 600 行；`contract-bound-runtime-composition.ts` 预期 ≤ 250（组合根 ≤ 400 上限备用，预期不触发）。

## 非目标

- 不改组合逻辑（`createProjectContractRuntimeComposition` 装配顺序与对象图原样）。
- 不动 `ontology-cross-package-service.ts`、`project-task-source.ts`、`task-board.ts` 等兄弟文件。
- 不改 IPC 协议、持久化格式。
- 不新增/删除 exports 条目。

## Capabilities

### 新增

- `contract-bound-composition-structure`：contract-bound runtime composition 的文件结构约束——类型、artifact 执行、执行端口适配器、Task 会话适配器分文件存放，composition 文件保留组合根与公共符号 re-export；公共导出符号与行为不变。

## Impact

- **修改**：`packages/core/src/lib/features/project/contract-bound-runtime-composition.ts`（1102 → 预期 ~180 行）
- **新增**：`features/project/composition/` 下 4 个新文件（contract-runtime-types / contract-artifact-runtime / contract-execution-adapters / contract-task-session-adapters）
- **不改**：`features/project/index.ts`、全部消费方 import（包内目录导入 + 跨包门面导入均原样）、core exports 条目（零风险）
- **风险**：import 路径机械加深（`../ontology` → `../../ontology` 等）——编译期全量校验（TC-2）兜底；类搬移无 this 绑定风险

## 依赖

- 无前置 Proposal 依赖（T1/T2/T3 已合并，无共享文件）。T5–T7 与本 Proposal 无交集。

## 上线方案

单一 Proposal 集成分支 `proposal/refactor-contract-runtime-composition`（从 `refactor/arch-governance` 创建，沿用既定偏差——dev 落后 114+ 提交）；应用源码在 subagent Task worktree 实施；完成后按 TC-1~TC-6 全量验证，合并回 `refactor/arch-governance`（需用户授权）。

## 回滚方案

全部为 git 可逆操作：revert 拆分 commit 即恢复单文件形态。拆分期间每步移动后立即验证 core 类型检查与 3 个 project 测试，不存在中间态上线窗口。
