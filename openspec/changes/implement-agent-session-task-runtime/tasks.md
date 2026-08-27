## 1. Proposal 门禁与实施基线

- [x] 1.1 严格校验 Proposal、设计和增量规格，并记录用户已授权开始实施；依赖：无；写入范围：`openspec/changes/implement-agent-session-task-runtime/**`；负责角色：Proposal Maintainer；必需测试：`openspec validate implement-agent-session-task-runtime --strict`；完成证据：用户于 2026-08-02 明确要求继续实施，strict validation 已通过，Proposal integration branch 提交见 Git 历史。
- [x] 1.2 为每个应用源码工作包从 Proposal branch 建立独立 Git Task branch/worktree，并确认写入范围互不重叠；依赖：1.1；写入范围：Git refs/worktree metadata，不修改应用源码；负责角色：Integration Maintainer；必需测试：`git worktree list` 与每个 worktree `git status --short --branch`；完成证据：`task/941-adapter-session-host`、`task/941-core-task-runtime`、`task/941-desktop-task-ipc`、`task/941-web-task-ui` 均基于 `1d85ed5`。

## 2. Adapter 与 Core Task Runtime

- [x] 2.1 在 adapter 公共边界实现产品 Session host，加载受控 `pi-tasks` extension、replay canonical branch entries、注册 task tools 并执行 revision/cursor/epoch 校验；依赖：1.2；并行性：可与 3.1、4.1 的只读准备并行，接口冻结后由其接入；写入范围：`packages/agent/**`；负责 subagent：Pi Runtime Engineer；必需测试：adapter unit、真实 extension contract、compaction/replay、stale command、module-resolution；完成证据：`150494d` 与合并提交 `3b4ff90`；adapter build 通过，32 项测试通过，包含真实 extension、compaction/replay、stale revision/cursor/epoch、模块解析和私有路径禁用审计。
- [x] 2.2 在 Core 实现 Task Runtime DTO、Session execution state、bounded projection、completion policy 与 `TaskContinuationController`，并在 `OriginOSAgent`/`AgentManager` 中提供同 Session planning/running 生命周期；依赖：2.1；并行性：串行；写入范围：`packages/core/src/lib/integrations/pi-agent/**`、`packages/core/src/types/agent.ts` 及对应 Core 测试；负责 subagent：Core Runtime Engineer；必需测试：chat/task 互斥、幂等创建、evidence gate、no-progress、stop、projection bounds、恢复；完成证据：`e96ddcb`、`853ac71` 与合并提交 `406bc3e`、`9f4af38`；Core typecheck 通过，Task Runtime 35 项和既有 Agent 45 项测试通过；普通聊天继续使用 `chat_guard`，Task turn 与 `waiting_user` 答复仅使用 `task_runtime` policy；停止保留 canonical Task，取消才写入 canonical cancelled，execution failed 继续持有 Task lease。

## 3. Desktop IPC 与持久化恢复

- [ ] 3.1 接入版本化 Task command/snapshot/event IPC，完成 Session JSON 持久化、单 Session 串行化、启动 replay、错误映射和 renderer 事件推送；依赖：2.2；并行性：可与 4.1 并行；写入范围：`packages/desktop/src/main/**`、`packages/desktop/src/lib/**` 及 Desktop 测试，不修改 Web/Core；负责 subagent：Desktop Integration Engineer；必需测试：IPC protocol、重复 request、stale revision、窗口重开、损坏数据、未知版本、普通 message stream 回归；完成证据：Desktop tests 与 desktop build/typecheck 通过。

## 4. Agent/RoleAgent 任务交互

- [ ] 4.1 在 Agent/RoleAgent 共用输入栏增加创建任务按钮、renderer 草稿卡片、正式 Task 卡片、状态操作与 Core client hook 接入，且 Skill 会话不显示入口；依赖：2.2；并行性：可与 3.1 并行；写入范围：`packages/web/src/components/**`、`packages/web/src/services/**`、`packages/web/src/store/**` 及 Web 测试，不修改 Core/Desktop；负责 subagent：Web Experience Engineer；必需测试：草稿创建/取消/提交、Agent/RoleAgent 复用、Skill 隐藏、状态渲染、停止/重试、长 projection 渲染；完成证据：Web component tests、typecheck 与 build 通过。

## 5. 集成、回归与交付

- [ ] 5.1 将 2.x、3.1、4.1 的 Task branches 依次合并到 Proposal integration branch，解决接口差异并运行 adapter/Core/Desktop/Web 集成测试；依赖：2.2、3.1、4.1；并行性：串行；写入范围：仅合并冲突和集成测试文件；负责角色：Integration Maintainer；必需测试：Task 创建到完成纵向测试、窗口重开恢复、普通聊天 completion guard、Agent/RoleAgent smoke；完成证据：集成测试全部通过。
- [ ] 5.2 补充 Story 9.41 文档状态、测试证据与自动化验证 goal，执行 `pnpm lint`、相关全量测试、Desktop 构建、Windows package verify 与 macOS module-resolution smoke；依赖：5.1；并行性：串行；写入范围：`docs/specs/epic-9/**`、验证测试/脚本、`openspec/changes/implement-agent-session-task-runtime/tasks.md`；负责 subagent：QA Verification Engineer；必需测试：Story testing.md 中全部可自动化 case；完成证据：验证 goal 为 complete，无法自动化项有人工步骤和剩余风险。
- [ ] 5.3 再次执行 OpenSpec strict validation、架构围栏和工作树审计，将 Proposal branch 合并到 `dev`，归档 Proposal 并清理 Task/Proposal worktree；依赖：5.2；并行性：串行；写入范围：OpenSpec archive、Git refs/worktree metadata；负责角色：Integration Maintainer；必需测试：`openspec validate implement-agent-session-task-runtime --strict`、架构检查、`git diff --check`、`git status`；完成证据：`dev` 包含已验证提交且独立 Task worktree 已清理。
