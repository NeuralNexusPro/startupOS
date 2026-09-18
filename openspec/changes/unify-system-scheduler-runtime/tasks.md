# Tasks

## 1. Proposal 与隔离实施

- [x] 1.1 【串行；依赖：无；角色：Proposal编排者；写入范围：`openspec/changes/unify-system-scheduler-runtime/`】完成Proposal、spec、design和tasks，并以OpenSpec strict validation通过作为证据。
- [x] 1.2 【串行；依赖：1.1；角色：Proposal编排者；写入范围：Git refs/worktree metadata】已创建`task/unify-system-scheduler-runtime`与`/private/tmp/startupos-task-unify-system-scheduler-runtime`，基线`5b48eb7`且初始状态洁净。

## 2. 统一 Scheduler Runtime

- [x] 2.1 【串行；依赖：1.2；角色：System Runtime subagent；写入范围：`packages/core/src/modules/scheduler/`及对应测试】实现系统任务注册、隐藏快照、非阻塞派发、单任务防重、有界退避/jitter、注销和停止等待；以Core类型检查及fake clock单元测试为证据。
- [x] 2.2 【串行；依赖：2.1；角色：Desktop Runtime subagent；写入范围：`packages/desktop/src/main/services/desktop-scheduler-service.ts`、`packages/desktop/src/main/services/perception-plugin-host/`、`packages/desktop/src/main/main.ts`、`packages/perception-plugins/email/src/plugin.ts`及对应测试】把Plugin Host schedule port接入同一Scheduler实例，删除插件周期timer map；Email轮询失败在健康上报后继续抛出；完成配置重排和退出顺序；以Desktop集成测试和构建为证据。
- [x] 2.3 【串行；依赖：2.2；角色：System Runtime subagent；写入范围：第2.1/2.2对应测试、`packages/perception-plugins/email/src/__tests__/`】覆盖旧用户任务、系统任务隐藏、两个邮箱隔离、overlap skip、失败退避、成功复位、睡眠时间跳跃无补发风暴、启停/改间隔、停止等待和脱敏；提交Task branch并记录hash、测试与`git diff --check`。

## 3. 集成、验证与交付

- [x] 3.1 【串行；依赖：2.3；角色：Proposal编排者；写入范围：Proposal integration branch】已审查并以merge commit合并Task branch；平台插件仅包含Email错误传播修复，无Web业务改动。
- [x] 3.2 【可并行；依赖：3.1；角色：验证者；写入范围：无】Core 6/6、Desktop 11/11、Email 6/6、DingTalk 29/29、Web Scheduler 4/4通过；Core/Email类型检查及Desktop构建通过。
- [x] 3.3 【可并行；依赖：3.1；角色：架构验证者；写入范围：无】`pnpm lint`为0 error、`lint:boundaries`为0 diagnostics，架构self-test、OpenSpec strict validation和`git diff --check`通过。
- [x] 3.4 【串行；依赖：3.2、3.3；角色：Proposal编排者；写入范围：`docs/specs/epic-OS/story-OS.21/`与本tasks文件】已更新Story状态、自动化证据，并保留Windows睡眠恢复和真实邮箱断网为人工验收。

## 4. 合并与清理

- [ ] 4.1 【串行；依赖：3.4；角色：Proposal编排者；写入范围：`dev`】合并Proposal branch到`dev`，保留主工作区无关supervisor修改。
- [ ] 4.2 【串行；依赖：4.1；角色：Proposal编排者；写入范围：Git worktree metadata】删除已合并Task/Proposal worktree与临时分支并核对worktree列表。
