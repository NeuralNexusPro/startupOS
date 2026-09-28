# ADR-009：Story 9.41 的 pi-tasks Runtime 边界

- **状态：** Rejected
- **日期：** 2026-07-29
- **关联：** Epic 9 / Story 9.41 / A-01
- **决策所有者：** Agent Runtime
- **OpenSpec：** `validate-pi-tasks-runtime-boundary`

## 背景

Story 9.41 计划使用 `pi-tasks` 作为 Task、Step、Criterion、Evidence、Blocker
和完成状态的唯一事实源。OriginOS 宿主需要在当前 Pi Session 和 branch
中创建、更新并完成任务，同时保留标准 tool schema validation、permission、
tool lifecycle、state event 和 compaction 语义。

A-01 对以下精确组合进行了审计和契约验证：

| 组件 | 版本 |
|---|---|
| `@originos/pi-agent-adapter` | `0.80.10` |
| `@earendil-works/pi-agent-core` | `0.80.10` |
| `@earendil-works/pi-ai` | `0.80.10` |
| `@earendil-works/pi-coding-agent` | `0.80.10` |
| `@earendil-works/pi-tui` | `0.80.10` |
| `pi-tasks` | `0.2.0` |
| Node.js | `24.14.0` |
| pnpm | `9.15.9` |

Pi Runtime 前置基线来自 commit
`505d157c408dc3e27ef1c09f11bf860a92cc0203`。

## 决策

**拒绝把 stock Pi Runtime `0.80.10` 与 stock `pi-tasks@0.2.0` 直接作为
Story 9.41 的生产 Task Runtime 边界。A-01 判定失败，Story 9.41 产品实施保持
blocked。**

本 Proposal 不实现生产 adapter，不导入 `pi-tasks` 私有模块，不解析或修改
Pi Session 文件，也不伪造 custom entry。

后续必须新建独立 Proposal，在以下路线中完成一个可维护边界后重新执行 A-01：

1. 上游 Pi Runtime 提供公共 host tool invocation API；
2. 上游 `pi-tasks` 提供公共 mutation command API；
3. 维护狭窄、版本化且有明确 owner 的受控公共 adapter/fork。

## 证据与理由

### 已验证能力

- `pi-tasks@0.2.0` 可作为公共 extension 加载，公开 12 个 task tools。
- `pi-tasks:state` version `1` 可提供 current-branch 状态 snapshot。
- current-branch replay、branch isolation 和正常顺序下的 compaction snapshot
  preservation 可通过公共 extension lifecycle 验证。
- `AgentSession.compact()` 是公开的跨平台 lifecycle 入口；确定性测试可以隔离
  模型摘要的不确定性。
- Electron 开发态公共 package import 和 package inventory 校验脚本可运行。

### 阻断问题

1. Pi Runtime 没有公开的宿主 tool invocation API，无法证明宿主调用和模型
   tool call 使用相同的 schema validation、permission、`beforeToolCall`、
   标准 tool event 与 `afterToolCall` 管线。
2. 直接调用公开 `ToolDefinition.execute()` 会绕过上述标准管线，只能用于
   contract 诊断，不能成为生产边界。
3. `pi-tasks@0.2.0` 没有公开 mutation command API。
4. `pi-tasks:state` 没有稳定的 revision、sequence 或 cursor，无法实现跨重启
   mutation correlation、CAS 和迟到事件拒绝。
5. 重复或乱序 snapshot 会重复回放同一 blocker，不能满足 Story 9.41 的
   replay 幂等要求。
6. `task_complete` 暴露 `force_with_reason`，与 Story 9.41 首版禁止强制完成的
   契约冲突。

任一问题都足以使 P0 门禁失败，因此不再触发 Windows/macOS release artifact
构建来证明一个已被拒绝的生产边界。平台 verification 已接入 release workflow，
供后续获批边界复用，但不构成此次 A-01 的平台通过证据。

## 后续边界要求

受控 adapter/fork 必须至少提供：

- 通过标准 runtime tool pipeline 调用已注册 tool 的公共命令 API；
- Session、branch、Task 和稳定 revision/cursor 的显式 scope；
- mutation result 与公共 state event 的可验证关联；
- 跨进程、compaction、重复和乱序 replay 的幂等语义；
- 不可绕过的 Evidence gate，并移除或拒绝 `force_with_reason`；
- Windows x64、macOS x64 和 macOS arm64 package contract；
- 明确的维护 owner、上游同步周期、版本兼容矩阵和移除条件。

## 影响

- 普通聊天、Chat Completion Guard、Agent/RoleAgent Session、UI 和 IPC 不变。
- `pi-tasks` 依赖和测试 harness 仅用于可重复的兼容性审计，不启用产品
  Task Runtime。
- Story 9.41 后续 Task planning、continuation、lease、Evidence verifier 和 UI
  实施不得开始。

## 迁移与回滚

后续边界通过新的 Proposal 获批后，重新运行本 ADR 所引用的 audit、runtime
contract 和 package checks，再以新的 ADR supersede 本决策。

如果不继续该路线，可移除 `pi-tasks` 直接依赖、A-01 harness 和 package
verification wiring；由于没有产品调用路径和持久化迁移，不需要用户数据回滚。

## 证据索引

- 机器可读报告：
  `openspec/changes/validate-pi-tasks-runtime-boundary/evidence/compatibility-report.json`
- Public export audit commit：
  `95d33628090992fb63129f22878dc6dc818349a5`
- Runtime contract commit：
  `32623051181a3d40dae040691a542ef17b0c185c`
- Packaging verification commit：
  `adca2ff1edde4dd3058563d3fc3dc2f568a5265e`
- Public audit report SHA-256：
  `08d3c8c1992f328f9d543eacd5b6af5e4966a0d8b757ef4c2b542a42d1f393dd`

