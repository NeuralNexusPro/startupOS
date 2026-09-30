# refactor-task-coordinator 实施任务

对应 Story AG.10 Task AG10-T3。应用源码必须在 subagent Task worktree 实施（规约强制），本 Proposal 主 worktree 仅做规格、编排、集成。

## 1. subagent 实施包（串行，单一写入范围）

- [ ] 1.1 **WP-1 coordinator 拆分实施**（角色：实施 subagent；依赖：无；写入范围：`packages/core/src/lib/integrations/pi-agent/task-runtime/coordinator*.ts`（含新建 4 文件）；串行——全部改动同一目录，不可并行）
  - 按 design.md D1 清单移动：host/配置类型 → `coordinator-types.ts`；错误类与模块级 helper → `coordinator-shared.ts`；`mutateProjectTaskMetadata`/`recordVerifiedEvidence`/`mutateReview`/`completionInput` 方法体 → `coordinator-commands.ts`（D3 ctx 变换）；`pauseTask`/`cancelTask`/`resumeTask`/`retryTask`/`buildContinuationPrompt`/`invokeReadOnlyTaskTool` → `coordinator-controls.ts`（D3 ctx 变换，可变字段用访问器，改写面过大时允许降级留主类并记录偏差）。
  - 主类保留：字段/constructor/initialize/生命周期/续跑循环/状态机/持久化/校验 + 4 个公共符号原位可导入。
  - 每个新文件顶部一句话职责注释（FR-3）。
  - 必需测试：TC-1 / TC-2 / TC-3 / TC-4 / TC-6（命令见 testing.md 与本文件第 2 节）。
  - 完成证据：符号清单 diff 为空、双端 build 0 error、测试通过数 ≥ 基线、madge ≤ 12、`wc -l` 达标，附于本 task。

## 2. 验证（依赖 1.1）

- [ ] 2.1 TC-1 符号不变：拆分前后 coordinator 公共导出清单 diff 为空（`AgentTaskRuntimeCoordinator`/`AgentTaskRuntimeConflictError`/`AgentTaskRuntimeProtocolError`/`AgentTaskRuntimeCoordinatorOptions`）；全仓消费方 import specifier 零变化（desktop 2 处深路径 + 包内目录导入）。
- [ ] 2.2 TC-2 双端编译：`pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error；`node scripts/expand-core-exports.cjs --verify` 通过。
- [ ] 2.3 TC-3 测试基线：web 与 desktop 测试通过数 ≥ 基线（web 425/425、desktop 182/182 全绿）；`task-runtime/__tests__/coordinator.test.ts`（5 describe）全绿。
- [ ] 2.4 TC-4 循环检查：`npx madge --circular packages/core/src --extensions ts,tsx` ≤ 12；`task-runtime/` 内部无环。
- [ ] 2.5 TC-5 模块冒烟：Agent 会话内任务执行一次（web dev 启动 + Agent 对话创建正式任务，状态机推进 + 无错误即视为通过；IPC 协议层以 agent-task-runtime-ipc.test 覆盖）。
- [ ] 2.6 TC-6 行数达标：`wc -l` 新文件 ≤ 600；coordinator.ts 预期 ≤ 700（编排类 ≤ 800 上限备用）。

## 3. 集成（依赖 2.x 全部通过）

- [ ] 3.1 Story AG.10 文档回写：testing.md TC-1~TC-6 结果（T3 行）、README 状态更新。
- [ ] 3.2 `openspec validate refactor-task-coordinator --strict` 通过（evidence 回填后复验）。
- [ ] 3.3 docs/changes 全量流水 + 版本归档；本任务不改架构围栏，AGENTS.md 预期不动。
- [ ] 3.4 Proposal 分支合并入 `refactor/arch-governance`（需用户显式授权），清理 Task/Proposal worktree。
