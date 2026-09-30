# refactor-contract-runtime-composition 实施任务

对应 Story AG.10 Task AG10-T4。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [x] 1.1 **WP-1 composition 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/lib/features/project/contract-bound-runtime-composition.ts` + `packages/core/src/lib/features/project/composition/`（新建 4 文件）；串行——全部改动同一 feature，不可并行）
  - 按 design.md D1 清单逐字移动：常量与类型 → `composition/contract-runtime-types.ts`；纯 helper + `AgentManagerContractRuntime` → `composition/contract-artifact-runtime.ts`；Readiness/Verifier/Outcome/HITL 适配器 → `composition/contract-execution-adapters.ts`；Task 会话适配器 → `composition/contract-task-session-adapters.ts`。
  - 主文件保留：`createProjectContractRuntimeComposition` + `projectContractRuntimeHost` + 全部 9 个公共符号 re-export。
  - 每个新文件顶部一句话职责注释（FR-3）。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-6（命令见 testing.md 与本文件第 2 节）。
  - **完成（commit a9c69f8，2026-09-30）**：主文件 1102→141；4 新文件 types 83 / artifact-runtime 351 / execution-adapters 316 / task-session-adapters 286（均 ≤ 600）；9 个公共符号经 re-export 可导入；组合根 2 函数 token-identical；TS-AST 语句级 multiset diff = 0（subagent 自查）+ 集成复核（28 类/函数/常量 token 级全等，唯一变换为 eslint curly 单语句花括号包裹）。

## 2. 验证（依赖 1.1）

- [x] 2.1 TC-1 符号不变：拆分前后公共导出清单 diff 为空（`ORIGINOS_ARTIFACT_VERIFIER_REF`/`ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF`/`ProjectContractRuntimeHostCapabilities`/`ProjectContractRuntimeCompositionOptions`/`ProjectContractRuntimeComposition`/`ProjectContractTaskRuntimeRecovery`/`ProjectContractTaskPriorityMutation`/`createProjectContractRuntimeComposition`/`projectContractRuntimeHost`）；消费方 import specifier 零变化（3 个包内测试相对导入 + web/desktop 门面导入 + 2 处 vi.mock）。
  - **证据（2026-09-30）**：主文件 50–52 行 re-export 全部 9 符号（2 常量 + 3 type 接口 + 2 类；`createProjectContractRuntimeComposition`/`projectContractRuntimeHost` 原位定义）；subagent 用临时 vitest 测试实际 import 全部 9 符号并调用组合成功（15/15 后删除）；`features/project/index.ts` `export *` 不变；wiring 测试 2/2 + desktop ipc 23/23 过。
- [x] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；`node scripts/expand-core-exports.cjs --verify` 通过。
  - **证据**：web build `✓ Compiled successfully`；desktop `tsc -p tsconfig.json` EXIT=0；exports verify VERIFY PASSED（Task + Proposal 双 worktree 复验）。
- [x] 2.3 TC-3 测试基线：web 与 desktop 测试通过数 ≥ 基线（web 425/425、desktop 182/182 全绿）；3 个 project 测试（composition/recovery/project-task-recovery）全绿。
  - **证据**：web **425/425（71 文件）**、desktop **182/182（30 文件）**（Task + Proposal 双 worktree）；3 个 project 测试 **15/15**。注：`solution-design-source.test.ts` 有 1 个失败，已在拆分前基线（主仓 f3afc50，git stash 验证）逐字复现同失败——存量测试债，非拆分引入，未计入 3 个 T4 目标测试。
- [x] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 12；`features/project/composition/` 内部无环。
  - **证据**：madge = **12 环 = 基线**，0 条路径经过 `composition/`；实施中曾出现 13 环（artifact-runtime 经 `agent/server` barrel 导类型回边），改为深路径 `../../agent/server/contract-bound-worker` type import 后回到 12 且环集合与基线完全一致。
- [x] 2.5 TC-5 模块冒烟：web dev 启动 + `ontology-cross-package-runtime-wiring.test.ts`（web/desktop）全绿即视为通过（组合根装配以 wiring 测试覆盖；真实 LLM 执行不在本 task 自动化范围）。
  - **证据**：wiring 测试 web/desktop **2/2**；desktop `ontology-cross-package-ipc.test.ts` **23/23**；web build 静态导出完整跑完。
- [x] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600；`contract-bound-runtime-composition.ts` 预期 ≤ 250（组合根 ≤ 400 上限备用）。
  - **证据**：types 83 / artifact-runtime 351 / execution-adapters 316 / task-session-adapters 286 全部 ≤ 600；主文件 **141** ≤ 250。

## 3. 集成（依赖 2.x 全部通过）

- [x] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果（T4 行）、README 状态更新。
- [x] 3.2 `openspec validate refactor-contract-runtime-composition --strict` 通过（evidence 回填后复验）。
- [x] 3.3 docs/changes 全量流水 + 版本归档；本任务不改架构围栏，AGENTS.md 预期不动。
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
