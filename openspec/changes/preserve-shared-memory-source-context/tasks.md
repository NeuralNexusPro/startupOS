# Tasks

## 1. Proposal 与实施边界

- [x] 1.1 【串行；依赖：无；角色：Proposal 编排者；写入范围：`openspec/changes/preserve-shared-memory-source-context/`】完成 Proposal、capability spec、design 和 tasks，并以 `npx -y @fission-ai/openspec validate preserve-shared-memory-source-context --strict` 通过作为完成证据。
- [x] 1.2 【串行；依赖：1.1；角色：Proposal 编排者；写入范围：Git 分支与 worktree 元数据】已创建 `task/preserve-shared-memory-source-context` 与 `/private/tmp/startupos-task-memory-source-context`，基线为 `5d70bc1` 且初始状态洁净。

## 2. 可信来源贯穿链路

- [ ] 2.1 【串行；依赖：1.2；角色：Core 实现 subagent；写入范围：`packages/core/src/lib/shared/cognitive/`、`packages/core/src/modules/channel-runtime/` 及对应测试】增加可选 `CommunicationSource` 公共契约，把 Channel 的消息标识与接收时间作为可信 metadata 持久化，并以类型检查和 Channel 回归测试覆盖群聊、单聊、缺失显示名与正文伪造字段作为完成证据。
- [ ] 2.2 【串行；依赖：2.1；角色：Core 实现 subagent；写入范围：`packages/core/src/lib/integrations/pi-agent/` 及对应测试】在当前轮认知事件和历史恢复中从持久化消息 metadata 构造来源，统一当前消息与恢复消息的模型来源编码，并以首次运行、重启恢复和长正文测试作为完成证据。
- [ ] 2.3 【串行；依赖：2.2；角色：Memory Core 实现 subagent；写入范围：`packages/core/src/modules/memory-core/`、`packages/core/src/lib/shared/cognitive/cognition-types.ts` 及对应测试】持久化 Recall 来源，按真实时间与稳定来源键跨会话排序，使召回和 Consolidator evidence 使用原记录来源并支持多个证据引用，同时兼容旧记录；以同轮次跨会话、混合新旧记录、多个来源和错误来源标签测试作为完成证据。
- [ ] 2.4 【串行；依赖：2.3；角色：Core 实现 subagent；写入范围：第 2.1 至 2.3 的测试文件】运行受影响 Core 测试与类型检查，提交 Task branch；测试日志、提交哈希和 `git diff --check` 结果作为完成证据。

## 3. 集成与 Story 验证目标

- [ ] 3.1 【串行；依赖：2.4；角色：Proposal 编排者；写入范围：Proposal integration branch】审查并合并 Task branch，确认变更未触及声明范围外的应用源码，以合并提交和审查记录作为完成证据。
- [ ] 3.2 【可并行；依赖：3.1；角色：验证者；写入范围：无】运行 Memory Core、Channel Runtime、Pi Agent 历史恢复测试，验证群聊／单聊共享记忆但来源独立、多连接与发送者不串线、重启后来源保留、相同 `turnNumber` 不混淆、多来源 evidence 和旧格式兼容；测试输出作为 Story verification goal 的完成证据。
- [ ] 3.3 【可并行；依赖：3.1；角色：架构验证者；写入范围：无】运行 `pnpm lint`、`pnpm lint:boundaries`、`node scripts/check-architecture-boundaries.cjs --self-test` 及适用的 Core/Desktop 构建校验，保存命令结果作为完成证据。
- [ ] 3.4 【串行；依赖：3.2、3.3；角色：Proposal 编排者；写入范围：`docs/specs/epic-SENSE/story-SENSE.12/memory-source-context-gap.md` 与本 tasks 文件】更新 SENSE12-T9 验收状态与实际证据，并再次运行 OpenSpec strict validation；文档 diff 与验证输出作为完成证据。

## 4. 合并与清理

- [ ] 4.1 【串行；依赖：3.4；角色：Proposal 编排者；写入范围：`dev` 分支】把 Proposal integration branch 合并到 `dev`，保留主工作区中无关的 supervisor 修复，并以最终提交图和工作区状态作为完成证据。
- [ ] 4.2 【串行；依赖：4.1；角色：Proposal 编排者；写入范围：Git worktree 元数据】删除已合并的 Task/Proposal worktree 和临时分支，确认 `git worktree list` 无残留作为完成证据。
