# Design: refactor-contract-runtime-composition（AG.10-T4）

## D1 拆分映射（行号基于拆分前 1102 行版本）

| 目标文件 | 移入内容（源行） | 预估行数 |
|---------|----------------|---------|
| `composition/contract-runtime-types.ts` | 2 个导出常量（88–89）、`ContractArtifactEnvelope`（95–104）、`ProjectContractSessionPort`（106–125）、`ProjectContractRuntimeHostCapabilities`（127–134）、`ProjectContractRuntimeCompositionOptions`（136–145）、`ProjectContractRuntimeComposition`（147–154）+ 对应 type import | ~120 |
| `composition/contract-artifact-runtime.ts` | 纯 helper：`assertIdentifier`（156）、`stableValue`（162）、`sha256`（174）、`artifactPath`（180）、`artifactRef`（201）、`parseArtifactRef`（215）、`messageText`（228）、`extractJsonObject`（245）、`buildWorkerPrompt`（257）、`firstExisting`（282）、`loadTargetSystemPrompt`（294）、`resolveTargetDirectory`（324）；类 `AgentManagerContractRuntime`（346–479）+ 对应 import | ~280 |
| `composition/contract-execution-adapters.ts` | `parseOntologyFactRef`（481）、`CanonicalReadiness`（500–597）、`ArtifactVerifier`（599–636）、`artifactEvidenceSchema`（638–646）、`factReference`（648）、`outputDraft`（669）、`ArtifactOutcomeDrafts`（696–730）、`ParentSessionHitl`（732–760）+ 对应 import | ~290 |
| `composition/contract-task-session-adapters.ts` | `taskCreationSessionId`（761）、`RuntimeApprovedProjectTaskPort`（768–841）、`createProjectEvidenceSink`（843–869）、`recoveryUnavailable`（871–875）、`isExactRecoveredTask`（877–886）、`ProjectContractTaskRuntimeRecovery`（892–969）、`ProjectContractTaskPriorityMutation`（972–1013）+ 对应 import | ~270 |
| `contract-bound-runtime-composition.ts`（保留） | 文件头职责注释、`createProjectContractRuntimeComposition`（1019–1095）、`projectContractRuntimeHost`（1097–1102）+ 4 个新文件的 re-export（公共符号）+ 组合所需 import | ~180 |

**职责单句（FR-3，写入各文件顶部注释）：**

- `composition/contract-runtime-types.ts`：contract-bound runtime composition 的协议常量与 host/组合类型定义。
- `composition/contract-artifact-runtime.ts`：contract-bound WorkItem 的 artifact 执行运行时——目标目录解析、worker prompt 构建与 AgentManager 派发落盘。
- `composition/contract-execution-adapters.ts`：contract-bound 执行端口适配器——Readiness/Verifier/Outcome/HITL 的 canonical ontology 与 artifact 实现。
- `composition/contract-task-session-adapters.ts`：contract-bound 任务的会话端口适配器——approved task 端口、evidence sink、Task Runtime 恢复与优先级 mutation。
- `contract-bound-runtime-composition.ts`：contract-bound 项目执行组合根——装配上述模块为唯一生产组合并 re-export 公共符号。

**有争议项的归属判定：**

- `parseOntologyFactRef` 被 `CanonicalReadiness`（ready 端口）与 `ArtifactOutcomeDrafts` 无关（仅 readiness 消费）→ 随 execution-adapters 文件。
- `recoveryUnavailable`/`isExactRecoveredTask` 仅被 `ProjectContractTaskRuntimeRecovery` 消费 → 随 task-session-adapters 文件。
- `taskCreationSessionId` 仅被 `RuntimeApprovedProjectTaskPort` 消费 → 随 task-session-adapters 文件。
- `stableValue` 仅被 `sha256` 消费、`sha256` 被 artifact runtime 与 ArtifactVerifier 双消费 → 放 contract-artifact-runtime.ts 并导出，execution-adapters 导入（单向）。
- `messageText` 仅被 `AgentManagerContractRuntime.execute` 消费 → 随 artifact-runtime 文件。
- `assertIdentifier`/`resolveTargetDirectory` 被 artifact runtime 与 `CanonicalReadiness` 双消费 → 放 artifact-runtime 文件并导出，execution-adapters 导入。

## D2 放置位置：`features/project/composition/` 子目录

**决策**：新建 `packages/core/src/lib/features/project/composition/` 子目录存放 4 个新文件，composition 主文件留在 project 目录原位。

**理由**：project feature 已有 15 个平铺文件；`contract-bound-runtime-composition` 的拆分件有清晰的「组合根的适配器」语义内聚性，子目录可避免平铺目录进一步膨胀（当前已有 6 个 500+ 行文件），且 4 个新文件互相之间有导入关系（artifact-runtime 被 execution-adapters 导入），同目录内相对导入路径最短。主文件不动位置，保证 `features/project/index.ts` 与外部消费方路径零变化。

**备选被拒**：
- 全部平铺在 `features/project/`：目录膨胀至 20 文件，拆分件与兄弟 service 文件混置，内聚性差。
- 移到 `modules/collaboration-runtime/`：跨 feature 依赖违规（composition 消费 features/agent、features/solution、features/ontology 多方公共 API，反向依赖 collaboration-runtime 会成环）。

**导入形态**：主文件以 `./composition/contract-runtime-types` 等相对路径导入；新文件之间 `./contract-artifact-runtime`；新文件对兄弟模块 `../../ontology`、`../../solution`、`../../agent/server`、`../../../modules/collaboration-runtime/facade` 等（相对路径加深一级，机械变换）。

## D3 变换规则：无（纯逐字搬移）

本任务**不涉及 D3 ctx 变换**：全部移动物为模块级常量/类型/纯函数/独立类，类方法体内的 `this.*` 均指向类自身字段（构造器注入的 `dataRoot`/`host`/`osdk` 等），不跨文件捕获外部作用域。唯二需要处理的：

1. **`ContractArtifactEnvelope`** 被 artifact-runtime（写 envelope）与 execution-adapters（`ArtifactVerifier`/`ArtifactOutcomeDrafts` 读 envelope）双消费 → 放 types 文件并导出（internal），两个消费文件导入。
2. **helper 双消费**（`sha256`/`resolveTargetDirectory`/`assertIdentifier`/`parseArtifactRef`/`extractJsonObject`）：定义在 contract-artifact-runtime.ts 并 `export`，execution-adapters.ts 导入。依赖方向：execution-adapters → artifact-runtime → types，单向无环。

**保持不变的行为要点（subagent 验收时逐条对照）：**

- 全部类/函数体逐字（含错误消息字符串、`structuredClone`、临时文件写盘顺序 `writeFile`→`rename`）。
- `createProjectContractRuntimeComposition` 组合体逐字（装配顺序、条件表达式、对象图不变）。
- re-export 形态：`export { X } from './composition/...'` 或 `export type { ... } from ...`——不改变符号集合。

## D4 循环依赖预防

依赖方向单向：`contract-bound-runtime-composition.ts`（组合根）→ 4 个 composition 文件 → 兄弟模块公共 API（`../ontology`、`../solution`、`../agent/server`、`../../../modules/collaboration-runtime/{facade,integrations}`、`../task-board`、`../project-task-creation`、`../project-task-source`、`../project-task-access-subscription`、`../ontology-cross-package-service`、`../ontology-work-item-recovery`）。composition 内部：execution-adapters → artifact-runtime → types；task-session-adapters → types（不依赖 artifact-runtime/execution-adapters）。`index.ts` 仍只 `export * from './contract-bound-runtime-composition'`。移动完成后 `npx madge --circular packages/core/src --extensions ts,tsx` 验证 ≤ 基线 12，且 `features/project/composition/` 内部无环。

## D5 实施边界（subagent work packages）

单一写入范围（`packages/core/src/lib/features/project/` 下主文件 + `composition/` 新目录 4 文件），设置 1 个 subagent Task worktree 串行实施：

- **WP-1（唯一实施包）**：按 D1 清单逐字移动 + 组合根收敛；写入范围 `features/project/contract-bound-runtime-composition.ts` + `features/project/composition/`（新建）。验收命令：TC-1 符号 diff、TC-2 双端 build、TC-3 测试基线、TC-4 madge、TC-6 行数。

## D6 风险

| 风险 | 缓解 |
|------|------|
| import 相对路径加深遗漏 → 运行时 undefined | TypeScript 编译期全量校验（TC-2 tsc）；vitest resolve 兜底 |
| re-export 遗漏符号 → 消费方编译失败 | TC-1 符号清单 diff 为空 + 3 个包内测试 + web/desktop wiring 测试兜底 |
| 拆分件互引成环 | D4 单向依赖（execution-adapters → artifact-runtime → types）+ madge 验证 |
| 移动时顺手改逻辑 | subagent 指令「逐字移动」；验收用 token 级对比 + 测试基线兜底 |
| 新文件超 600 行 | D1 预估最大 execution-adapters ~290；TC-6 wc -l 验证 |
| `vi.mock('@originos/core/lib/features/project')` 门面 mock 失效 | 主文件路径与 index.ts `export *` 不变，mock 面不变；wiring 测试兜底 |
