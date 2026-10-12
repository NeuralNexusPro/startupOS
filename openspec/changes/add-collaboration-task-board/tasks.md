# Tasks

## 1. store 任务派生与看板 UI

- [ ] 1.1 `944-T1-A`（串行；依赖：Proposal 批准；角色：Core UI subagent；写入：`packages/core/src/modules/collaboration-runtime/ui/store.ts`、`ui/TaskBoard.tsx`、`ui/__tests__/store-tasks.test.ts`、`ui/__tests__/task-board.test.tsx`）将既有零消费的 `tasks` 状态改形为 `TaskItem[]`，在 `addEvent` 中按引擎 `blackboard.ts` 语义对六类 `TASK_*` 事件做增量 upsert（导出纯函数 `applyTaskEventToTasks` 便于单测），新增 `mergeSnapshotTasks` 与 `boardCollapsed`；实现 `TaskBoard` 纯展示组件（汇总条 + 任务行 + 空态 + 折叠）；以 store 单测（六类事件映射、幂等、缺 payload 防御、快照合并、事件序列端到端）与组件渲染测试验证。

## 2. 快照恢复双通道与挂载联动

- [ ] 2.1 `944-T1-B`（串行；依赖：1.1；角色：Core integration subagent；写入：`packages/core/src/lib/integrations/electron/ipc-protocol.ts`、`electron/services/collaboration.ts`、`packages/desktop/src/main/ipc-protocol.ts`、`packages/desktop/src/main/services/collaboration-service.ts`、`ui/MultiAgentLauncher.tsx` 及定向测试）新增 `COLLAB_SNAPSHOT_GET` IPC 通道（core + desktop 两份常量）与双通道客户端函数 `getCollaborationTaskSnapshot`（Electron 走 IPC、Web 走既有 HTTP route），desktop 注册 handler 转发 core facade `getSessionTaskSnapshot`；在 `MultiAgentLauncher` 会话恢复路径拉取一次快照并调用 `mergeSnapshotTasks`（恢复范围 = 活跃任务 + 各 Agent 最近终端任务，失败 console.error 降级），挂载 `TaskBoard` 并将 `onTaskClick` 联动既有 `WorkerDetailDrawer`；以 typecheck、`pnpm lint:boundaries` 与 store/快照合并回归测试验证。

## 3. HITL 系统通知挂点

- [ ] 3.1 `944-T1-C`（可与 2.1 并行；依赖：1.1；角色：Core facade subagent；写入：`packages/core/src/modules/collaboration-runtime/facade/hitl-notify.ts`、`facade/__tests__/hitl-notify.test.ts`、`facade/dag-runner.ts`（仅组装点一行注册））实现 `registerHitlNotificationForwarder()`：订阅 `addElectronForwarder` 事件流，过滤 `HUMAN_REVIEW_REQUEST`，按事件 id 幂等调用 `getNotificationManager().createNotification(SYSTEM_MESSAGE, '多 Agent 协作等待回复', question 截断 ≤120 字符, payload)`，失败仅 `console.error` 不冒泡；在 `dag-runner.ts` 模块组装点调用一次注册；以单测（HITL 触发、非 HITL 零调用、同 id 幂等、正文截断、reject/throw 不冒泡）验证。

## 4. Story 证据与集成

- [ ] 4.1 `944-T1-D`（串行；依赖：2.1、3.1；角色：Integration/QA subagent；写入：`docs/specs/epic-9/story-9.44/` 与 Proposal evidence）执行 core 定向 Vitest（store 派生 + hitl-notify + 既有 collaboration-runtime 回归）、Core typecheck、`pnpm lint`、`pnpm lint:boundaries`；确认 `project-task-board-*` 相关文件零改动（AC5 回归）；将测试结果回写 Story `testing.md` 并更新 Epic README 状态。
- [ ] 4.2 `944-T1-E`（串行；依赖：4.1；角色：Proposal integration owner；写入：本 change 的任务/验证证据）运行 `openspec validate add-collaboration-task-board --strict`，完成 Story verification goal（目标：通过 Story 9.44 测试 case），合并 Task branch 到 Proposal 集成分支并完成完整回归，经批准后合并到 `dev` 并清理 worktree；以命令输出、merge commit 和干净 worktree 列表验证。
