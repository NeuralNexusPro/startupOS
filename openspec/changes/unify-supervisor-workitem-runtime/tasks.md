# Tasks

## 1. 正式执行绑定

- [x] 1.1（串行，依赖：无；写入范围：`packages/core/src/modules/collaboration-runtime/facade/`、对应测试；负责角色：Core Runtime subagent）定义自然语言 Supervisor 到父 Pi Task / 正式 Run 的注入端口、绑定结果与结构化 design gap，并通过类型测试和 facade 单元测试验证幂等契约与模块边界。
- [x] 1.2（串行，依赖：1.1；写入范围：`packages/core/src/lib/features/project/`、对应测试；负责角色：Project Runtime subagent）在唯一生产组合根中使用现有任务创建、执行契约与正式账本实现绑定端口，并验证同一 requestId 恢复同一父 Task、父 Step 和 Run。

## 2. Supervisor 执行状态收口

- [x] 2.1（串行，依赖：1.2；写入范围：`packages/core/src/modules/collaboration-runtime/engine/`、`facade/dag-runner.ts`、对应测试；负责角色：Collaboration Runtime subagent）将新 Supervisor 运行的调度、Worker、verifier、outcome 与 evidence 推进切换到正式 WorkItem 状态机，验证模型遗漏验收工具调用时运行时仍能确定性完成后续阶段。
- [x] 2.2（串行，依赖：2.1；写入范围：`packages/core/src/modules/collaboration-runtime/session/`、对应测试；负责角色：Collaboration Runtime subagent）停止为新运行写入第二套 Blackboard TaskItem 终态，保留消息、上下文与旧历史读取，并验证 Blackboard 冲突状态不能覆盖正式账本。

## 3. 看板投影与诊断

- [x] 3.1（可并行，依赖：1.2；写入范围：`packages/core/src/modules/collaboration-runtime/facade/task-board-projection.ts`、对应测试；负责角色：Task Board subagent）按父 taskId / runId 合并正式运行与历史会话，优先展示正式 WorkItem 的 Agent、输入输出、产物、失败阶段和原因，并验证旧会话仍可只读查看且不产生重复卡片。
- [x] 3.2（串行，依赖：2.2、3.1；写入范围：`packages/web/src/app/api/collaboration/`、`packages/web/src/components/os/task-board/`、对应测试；负责角色：Web Integration subagent）让自然语言发布入口携带稳定 requestId 并展示绑定、design gap 和结构化失败信息，验证用户可观察到正式父任务和 WorkItem 状态。

## 4. 集成、回归与交付

- [x] 4.1（串行，依赖：2.2、3.2；写入范围：测试与本 Proposal 文档；负责角色：Integration subagent）运行相关 Core/Web 单元与集成测试，覆盖首次发布、重复提交、模型遗漏验收、进程恢复、HITL、失败阶段和历史读取；完成证据为全部目标测试通过。
- [x] 4.2（串行，依赖：4.1；写入范围：无生产源码；负责角色：Integration subagent）运行 `pnpm lint:boundaries`、`node scripts/check-architecture-boundaries.cjs --self-test`、适用时 `node scripts/expand-core-exports.cjs --verify` 与 `openspec validate unify-supervisor-workitem-runtime --strict`，完成证据为命令成功或明确记录与本变更无关的既有失败。
- [x] 4.3（串行，依赖：4.2；写入范围：Story / Proposal 状态与集成提交；负责角色：Proposal integrator）核对 Story 9.42 verification goal，合并 Task 分支到 Proposal integration branch，确认无未解决冲突后清理临时 worktree；完成证据为可审查提交、验证记录和干净的任务 worktree。
