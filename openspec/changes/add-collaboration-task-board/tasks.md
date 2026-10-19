# Tasks

## 1. store 任务派生与看板 UI

- [x] 1.1 `944-T1-A`（串行；依赖：Proposal 批准；角色：Core UI subagent；写入：`packages/core/src/modules/collaboration-runtime/ui/store.ts`、`ui/TaskBoard.tsx`、`ui/__tests__/store-tasks.test.ts`、`ui/__tests__/task-board.test.tsx`）将既有零消费的 `tasks` 状态改形为 `TaskItem[]`，在 `addEvent` 中按引擎 `blackboard.ts` 语义对六类 `TASK_*` 事件做增量 upsert（导出纯函数 `applyTaskEventToTasks` 便于单测），新增 `mergeSnapshotTasks` 与 `boardCollapsed`；实现 `TaskBoard` 纯展示组件（汇总条 + 任务行 + 空态 + 折叠）；以 store 单测（六类事件映射、幂等、缺 payload 防御、快照合并、事件序列端到端）与组件渲染测试验证。**Evidence：** commit `207e5a5`；ui 测试 50/50（store-tasks 27 + task-board 9 + 既有 MultiAgentLauncher.logic 14）；core tsc 零新增错误；lint 0 errors；lint:boundaries 0 诊断。已批准偏离：BlackboardViewer 死代码最小类型修复（`state→status`、`assignee→assignedTo`）；`import React`（jsx: preserve）；`max-h-40` 替代任意值（web Tailwind 扫描范围）；`recentTerminalTask` 的 `taskId` 键防御性跳过（由 2.1 归一化解决）。

## 2. 快照恢复双通道与挂载联动

- [x] 2.1 `944-T1-B`（串行；依赖：1.1；角色：Core integration subagent；写入：`packages/core/src/lib/integrations/electron/ipc-protocol.ts`、`electron/services/collaboration.ts`、`packages/desktop/src/main/ipc-protocol.ts`、`packages/desktop/src/main/services/collaboration-service.ts`、`ui/MultiAgentLauncher.tsx` 及定向测试）新增 `COLLAB_SNAPSHOT_GET` IPC 通道（core + desktop 两份常量）与双通道客户端函数 `getCollaborationTaskSnapshot`（Electron 走 IPC、Web 走既有 HTTP route），desktop 注册 handler 转发 core facade `getSessionTaskSnapshot`；在 `MultiAgentLauncher` 会话恢复路径拉取一次快照并调用 `mergeSnapshotTasks`（恢复范围 = 活跃任务 + 各 Agent 最近终端任务，失败 console.error 降级），挂载 `TaskBoard` 并将 `onTaskClick` 联动既有 `WorkerDetailDrawer`；以 typecheck、`pnpm lint:boundaries` 与 store/快照合并回归测试验证。**Evidence：** commit `1d0fa63`；core/desktop tsc 通过；ui+hitl-notify 回归 50/50；lint:boundaries 990 文件 0 诊断。快照 `taskId→id` 键归一化在 `MultiAgentLauncher.normalizeSnapshotTaskKeys` 解决（依据 agent-task-snapshot.ts 真实序列化形态）。环境前置：desktop tsc 前需 `pnpm -r --filter './packages/perception-plugins/*' build`（非本改动引入）。

## 3. HITL 系统通知挂点

- [x] 3.1 `944-T1-C`（可与 2.1 并行；依赖：1.1；角色：Core facade subagent；写入：`packages/core/src/modules/collaboration-runtime/facade/hitl-notify.ts`、`facade/__tests__/hitl-notify.test.ts`、`facade/dag-runner.ts`（仅组装点一行注册））实现 `registerHitlNotificationForwarder()`：订阅 `addElectronForwarder` 事件流，过滤 `HUMAN_REVIEW_REQUEST`，按事件 id 幂等调用 `getNotificationManager().createNotification(SYSTEM_MESSAGE, '多 Agent 协作等待回复', question 截断 ≤120 字符, payload)`，失败仅 `console.error` 不冒泡；在 `dag-runner.ts` 模块组装点调用一次注册；以单测（HITL 触发、非 HITL 零调用、同 id 幂等、正文截断、reject/throw 不冒泡）验证。**Evidence：** commit `f0a1614`；hitl-notify 9/9（经真实 eventEmitter 冒烟）；既有 hitl-dispatcher 8/8 无回归；tsc 零新增。适配：`createNotification` 实际含第 5 参数 `options?: { sessionId?, projectId? }`，已传 `{ sessionId }`（通知面板按顶层字段过滤）。

## 4. Story 证据与集成

- [x] 4.1 `944-T1-D`（串行；依赖：2.1、3.1；角色：Integration/QA subagent；写入：`docs/specs/epic-9/story-9.44/` 与 Proposal evidence）执行 core 定向 Vitest（store 派生 + hitl-notify + 既有 collaboration-runtime 回归）、Core typecheck、`pnpm lint`、`pnpm lint:boundaries`；确认 `project-task-board-*` 相关文件零改动（AC5 回归）；将测试结果回写 Story `testing.md` 并更新 Epic README 状态。**Evidence：** 集成分支回归——ui+facade 107/107、solution 28/28、exports 门禁 VERIFY PASSED、架构自测通过、lint 0 errors、lint:boundaries 990 文件 0 诊断；全量 collaboration-runtime 375/389（14 失败均为基线：capability-matcher 10 + dag-executor 3 已在 0.4.x/主 worktree 复现确认，agent-spawner 1 为环境性 `tsx: command not found`（exit 127），非本改动引入）；AC5 经 `git diff 0.4.x --name-only -- packages/` 核对：13 个变更文件全部位于 collaboration-runtime/lib integrations/desktop main，project-task-board 相关文件零改动。
- [x] 4.2 `944-T1-E`（串行；依赖：4.1；角色：Proposal integration owner；写入：本 change 的任务/验证证据）运行 `openspec validate add-collaboration-task-board --strict`，完成 Story verification goal（目标：通过 Story 9.44 测试 case），合并 Task branch 到 Proposal 集成分支并完成完整回归，经批准后合并到 `dev` 并清理 worktree；以命令输出、merge commit 和干净 worktree 列表验证。**Evidence：** `openspec validate --strict` valid（合并前复核）；用户批准合并（2026-10-12「合并」）；merge commit `d83d66b`（`proposal/add-collaboration-task-board` 7413fbf → `0.4.x`，--no-ff）；`dev` 已快进至 `d83d66b`；合并后回归——ui+facade 107/107、solution 30/30（含 target/domain 别名兼容测试）、exports 门禁 VERIFY PASSED、lint:boundaries 990 文件 0 诊断、core tsc 仅 5 项 client-hooks 基线错误（0.4.x 存量）。合并前将主 worktree 中与本 Proposal 重叠的未提交改动（changelog/epic-9 README/supervisor-dag 别名兼容/MultiAgentLauncher 拓扑日志/story-9.44 文档）先备份后复位，提案内容合并后按原样重放（未混入 Proposal 分支）；worktree 清理随本次收尾执行。

## 5. 项目看板实时会话补齐

- [x] 5.1 看板会话区以 `conversationOnly` 模式复用 `MultiAgentLauncher`，在 session 创建后沿用 `preconnect` 与 SSE/IPC 事件流，保留 Supervisor 连续消息、HITL、Markdown、附件和原输入条；折叠时保持组件挂载，并以 `onRuntimeEvent` 驱动任务投影刷新。**Evidence：** Web 看板测试 4/4；协作 UI 逻辑与 store 回归 41/41；Desktop TypeScript build 通过；2026-10-14。

## 6. 任务产物导航

- [x] 6.1 Markdown 文件产物卡支持在当前项目工作区编辑器中定位打开，其他文件格式通过系统默认应用打开；业务单据/数据变更卡支持打开当前项目数据窗口；非法、无法归属当前项目或系统打开失败的文件引用显示明确错误；补充路径归一化与窗口导航测试。**Evidence：** Web 任务看板测试 6/6；Desktop 本地文件系统打开测试 3/3；Desktop TypeScript 通过；`lint:boundaries` 998 文件 0 诊断；架构自测 51 用例 × 2 CWD 通过；OpenSpec strict valid；2026-10-15。
