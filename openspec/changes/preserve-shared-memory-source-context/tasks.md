# Tasks

## 1. Proposal 与实施边界

- [x] 1.1 【串行；依赖：无；角色：Proposal 编排者；写入范围：`openspec/changes/preserve-shared-memory-source-context/`】完成 Proposal、capability spec、design 和 tasks，并以 `npx -y @fission-ai/openspec validate preserve-shared-memory-source-context --strict` 通过作为完成证据。
- [x] 1.2 【串行；依赖：1.1；角色：Proposal 编排者；写入范围：Git 分支与 worktree 元数据】已创建 `task/preserve-shared-memory-source-context` 与 `/private/tmp/startupos-task-memory-source-context`，基线为 `5d70bc1` 且初始状态洁净。

## 2. 可信来源贯穿链路

- [x] 2.1 【串行；依赖：1.2；角色：Core 实现 subagent；写入范围：`packages/core/src/lib/shared/cognitive/`、`packages/core/src/modules/channel-runtime/` 及对应测试】已增加可选 `CommunicationSource`，持久化可信messageId、occurredAt/receivedAt与渠道字段；群聊、单聊、缺失显示名及伪造正文测试通过。
- [x] 2.2 【串行；依赖：2.1；角色：Core 实现 subagent；写入范围：`packages/core/src/lib/integrations/pi-agent/` 及对应测试】已用调用级AsyncLocalStorage向当前turn传递来源，并在历史恢复时从持久化metadata统一编码；并发隔离和恢复测试通过。
- [x] 2.3 【串行；依赖：2.2；角色：Memory Core 实现 subagent；写入范围：`packages/core/src/modules/memory-core/`、`packages/core/src/lib/shared/cognitive/cognition-types.ts` 及对应测试】Recall来源、真实时间稳定排序、原记录evidence、多来源引用和旧记录兼容已实施；相同轮次、多来源和非法标签测试通过。
- [x] 2.4 【串行；依赖：2.3；角色：Core 实现 subagent；写入范围：第 2.1 至 2.3 的测试文件】Task branch提交为`b6bc344`；subagent的74项针对性测试、Core typecheck、架构检查及`git diff --check`均通过。

## 3. 集成与 Story 验证目标

- [x] 3.1 【串行；依赖：2.4；角色：Proposal 编排者；写入范围：Proposal integration branch】已审查并以merge commit合并Task branch；应用源码仅涉及设计声明的Core目录及补充的感知路由时间传递文件。
- [x] 3.2 【可并行；依赖：3.1；角色：验证者；写入范围：无】Proposal worktree独立复跑11个针对性测试文件共56项通过，覆盖来源隔离、恢复、相同轮次、多来源evidence和旧格式兼容。
- [x] 3.3 【可并行；依赖：3.1；角色：架构验证者；写入范围：无】`pnpm lint`通过（仅存量warning），Core typecheck与Desktop typecheck构建通过，边界扫描0条诊断，检查器43个用例×2种CWD通过。
- [x] 3.4 【串行；依赖：3.2、3.3；角色：Proposal 编排者；写入范围：`docs/specs/epic-SENSE/story-SENSE.12/memory-source-context-gap.md` 与本 tasks 文件】已更新SENSE12-T9自动化验收状态和证据；OpenSpec strict validation在本提交前复验。

## 4. 合并与清理

- [ ] 4.1 【串行；依赖：3.4；角色：Proposal 编排者；写入范围：`dev` 分支】把 Proposal integration branch 合并到 `dev`，保留主工作区中无关的 supervisor 修复，并以最终提交图和工作区状态作为完成证据。
- [ ] 4.2 【串行；依赖：4.1；角色：Proposal 编排者；写入范围：Git worktree 元数据】删除已合并的 Task/Proposal worktree 和临时分支，确认 `git worktree list` 无残留作为完成证据。
