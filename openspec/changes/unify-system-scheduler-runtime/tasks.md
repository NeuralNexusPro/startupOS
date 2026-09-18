# Tasks

## 1. Proposal 与隔离实施

- [x] 1.1 【串行；依赖：无；角色：Proposal编排者；写入范围：`openspec/changes/unify-system-scheduler-runtime/`】完成Proposal、spec、design和tasks，并以OpenSpec strict validation通过作为证据。
- [ ] 1.2 【串行；依赖：1.1；角色：Proposal编排者；写入范围：Git refs/worktree metadata】创建独立Task branch/worktree，记录基线和洁净状态。

## 2. 统一 Scheduler Runtime

- [ ] 2.1 【串行；依赖：1.2；角色：System Runtime subagent；写入范围：`packages/core/src/modules/scheduler/`及对应测试】实现系统任务注册、隐藏快照、非阻塞派发、单任务防重、有界退避/jitter、注销和停止等待；以Core类型检查及fake clock单元测试为证据。
- [ ] 2.2 【串行；依赖：2.1；角色：Desktop Runtime subagent；写入范围：`packages/desktop/src/main/services/desktop-scheduler-service.ts`、`packages/desktop/src/main/services/perception-plugin-host/`、`packages/desktop/src/main/main.ts`及对应测试】把Plugin Host schedule port接入同一Scheduler实例，删除插件周期timer map，完成配置重排和退出顺序；以Desktop集成测试和构建为证据。
- [ ] 2.3 【串行；依赖：2.2；角色：System Runtime subagent；写入范围：第2.1/2.2对应测试】覆盖旧用户任务、系统任务隐藏、两个邮箱隔离、overlap skip、失败退避、成功复位、启停/改间隔、停止等待和脱敏；提交Task branch并记录hash、测试与`git diff --check`。

## 3. 集成、验证与交付

- [ ] 3.1 【串行；依赖：2.3；角色：Proposal编排者；写入范围：Proposal integration branch】审查并合并Task branch，确认无平台插件或Web业务改动。
- [ ] 3.2 【可并行；依赖：3.1；角色：验证者；写入范围：无】独立复跑Core scheduler、Desktop plugin host和email/dingtalk plugin回归，执行Core/Desktop typecheck与Desktop构建。
- [ ] 3.3 【可并行；依赖：3.1；角色：架构验证者；写入范围：无】运行`pnpm lint`、`pnpm lint:boundaries`、架构检查器self-test、OpenSpec strict validation和`git diff --check`。
- [ ] 3.4 【串行；依赖：3.2、3.3；角色：Proposal编排者；写入范围：`docs/specs/epic-OS/story-OS.21/`与本tasks文件】更新Story状态、自动化证据和剩余人工Windows睡眠恢复验收。

## 4. 合并与清理

- [ ] 4.1 【串行；依赖：3.4；角色：Proposal编排者；写入范围：`dev`】合并Proposal branch到`dev`，保留主工作区无关supervisor修改。
- [ ] 4.2 【串行；依赖：4.1；角色：Proposal编排者；写入范围：Git worktree metadata】删除已合并Task/Proposal worktree与临时分支并核对worktree列表。
