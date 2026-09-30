# refactor-contract-runtime-composition 实施任务

对应 Story AG.10 Task AG10-T4。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [ ] 1.1 **WP-1 composition 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/lib/features/project/contract-bound-runtime-composition.ts` + `packages/core/src/lib/features/project/composition/`（新建 4 文件）；串行——全部改动同一 feature，不可并行）
  - 按 design.md D1 清单逐字移动：常量与类型 → `composition/contract-runtime-types.ts`；纯 helper + `AgentManagerContractRuntime` → `composition/contract-artifact-runtime.ts`；Readiness/Verifier/Outcome/HITL 适配器 → `composition/contract-execution-adapters.ts`；Task 会话适配器（approved task 端口、evidence sink、恢复、优先级）→ `composition/contract-task-session-adapters.ts`。
  - 主文件保留：`createProjectContractRuntimeComposition` + `projectContractRuntimeHost` + 全部 8 个公共符号 re-export。
  - 每个新文件顶部一句话职责注释（FR-3）。
  - 双消费 helper（`sha256`/`resolveTargetDirectory`/`assertIdentifier`/`parseArtifactRef`/`extractJsonObject`）在 artifact-runtime 导出、execution-adapters 导入；`ContractArtifactEnvelope` 在 types 导出。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-6（命令见 testing.md 与本文件第 2 节）。
  - 完成证据：符号清单 diff 为空、双端 build 0 error、测试通过数 ≥ 基线、madge ≤ 12、`wc -l` 达标，附于本 task。

## 2. 验证（依赖 1.1）

- [ ] 2.1 TC-1 符号不变：拆分前后公共导出清单 diff 为空（`ORIGINOS_ARTIFACT_VERIFIER_REF`/`ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF`/`ProjectContractRuntimeHostCapabilities`/`ProjectContractRuntimeCompositionOptions`/`ProjectContractRuntimeComposition`/`ProjectContractTaskRuntimeRecovery`/`ProjectContractTaskPriorityMutation`/`createProjectContractRuntimeComposition`/`projectContractRuntimeHost`）；消费方 import specifier 零变化（3 个包内测试相对导入 + web/desktop 门面导入 + 2 处 vi.mock）。
- [ ] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；`node scripts/expand-core-exports.cjs --verify` 通过。
- [ ] 2.3 TC-3 测试基线：web 与 desktop 测试通过数 ≥ 基线（web 425/425、desktop 182/182 全绿）；3 个 project 测试（composition/recovery/project-task-recovery）全绿。
- [ ] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 12；`features/project/composition/` 内部无环。
- [ ] 2.5 TC-5 模块冒烟：web dev 启动 + `ontology-cross-package-runtime-wiring.test.ts`（web/desktop）全绿即视为通过（组合根装配以 wiring 测试覆盖；真实 LLM 执行不在本 task 自动化范围）。
- [ ] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600；`contract-bound-runtime-composition.ts` 预期 ≤ 250（组合根 ≤ 400 上限备用）。

## 3. 集成（依赖 2.x 全部通过）

- [ ] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果（T4 行）、README 状态更新。
- [ ] 3.2 `openspec validate refactor-contract-runtime-composition --strict` 通过（evidence 回填后复验）。
- [ ] 3.3 docs/changes 全量流水 + 版本归档；本任务不改架构围栏，AGENTS.md 预期不动。
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
