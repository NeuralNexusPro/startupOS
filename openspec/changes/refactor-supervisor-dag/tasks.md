# refactor-supervisor-dag 实施任务

对应 Story AG.10 Task AG10-T7。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [ ] 1.1 **WP-1 supervisor-dag.ts 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts` + 同目录新建 7 文件 `supervisor-dag-types.ts` / `supervisor-dag-manifest.ts` / `supervisor-dag-verifier.ts` / `supervisor-dag-hitl.ts` / `supervisor-dag-workflow.ts` / `supervisor-dag-dispatch.ts` / `supervisor-dag-tools.ts`；串行——全部改动同一文件族，不可并行）
  - 按 design.md D1 清单移动：types/manifest/verifier/hitl/workflow 逐字；tools/dispatch case 体按 D3 ctx 变换（闭包捕获 → ctx 字段、`resultJson=<expr>;break;` → `return <expr>;`、裸 `break;` → `return JSON.stringify({ status: "ok" });`）。
  - 主文件保留：imports 收敛、`executeSupervisorDag` 编排主体（manifest 加载 / Blackboard + ProtocolObserver / workerResults 等状态声明与 ctx 组装 / collab-context 与 Agent.md 写入 / `onSupervisorEvent` / Supervisor spawn + prompt + 等待 + SUPERVISOR_AGGREGATE / finally stopProtocolObserver，逐字）、`executeCollaborationRuntime`（逐字）、全部 11 个公共符号 re-export、顶部单句职责注释（FR-3）。
  - `SupervisorDagCtx` 接口唯一定义于 tools；dispatch `import type` 复用；`hitlResumerRegistry` / `__hitlChannelByWorker` 从 hitl 文件导出，tools/dispatch 导入。
  - 每个新文件顶部一句话职责注释（FR-3）。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-5 / TC-6（命令见第 2 节）。

## 2. 验证（依赖 1.1）

- [ ] 2.1 TC-1 符号不变：拆分前后经 `supervisor-dag.ts` 可导入的公共导出清单 diff 为空（11 个符号：`wrapWorkerHumanReviewRequest`、`MultiAgentExecutionResult`、`MultiAgentExecutorConfig`、`executeMultiAgentDag`、`loadProjectTopology`、`computeTaskLevels`、`VerificationResult`、`verifierFallbackResult`、`resumeSupervisorHitl`、`executeSupervisorDag`、`executeCollaborationRuntime`）；消费方 import specifier 零变化（`engine/index.ts`、`facade/dag-runner.ts`、2 个 engine 测试文件、`facade/index.ts`、模块 index、`public-api-boundary.test.ts` 全部零改动）。
- [ ] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；core tsc 0 新增 error（client-hooks 既有基线除外）。
- [ ] 2.3 TC-3 测试基线：`engine/__tests__/` 中 `supervisor-dag-hitl.test.ts` 与 `supervisor-protocol.integration.test.ts` 全绿；`engine/__tests__/` 全目录失败集与基线（13 项既有失败：capability-matcher 10 + dag-executor 3）逐一相同；`collaboration-runtime/` 全目录失败集与基线逐一相同。
- [ ] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts` ≤ 基线 12；`engine/` 新增 7 文件不出现在任何环路径。
- [ ] 2.5 TC-5 模块冒烟：`pnpm lint:boundaries` 0 诊断；`node scripts/check-architecture-boundaries.cjs --self-test` 通过；`node scripts/expand-core-exports.cjs --verify` 通过（无 exports 改动，应原样通过）。
- [ ] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600；`supervisor-dag.ts` 预期 ≤ 700（800 备用上限）。

## 3. 集成（依赖 2.x 全部通过）

- [ ] 3.1 独立 token 级复核：主会话（非 subagent）对全部移动的函数体做 token 级对比（规范化后逐字一致），偏差逐条裁决留痕。
- [ ] 3.2 Story 文档回填：testing.md 写入执行结果与 Evidence；README/epic README 状态同步。
- [ ] 3.3 变更记录：docs/changes/changelog.md + releases/v0.4.0/changelog.md 追加条目。
- [ ] 3.4 openspec validate --strict 复跑 + 归档（archive/YYYY-MM-DD-refactor-supervisor-dag/）+ spec 提升。
- [ ] 3.5 worktree/分支清理，合并回 refactor/arch-governance（需用户授权）。
