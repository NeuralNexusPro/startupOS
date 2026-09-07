## Why

Story 9.41 的 A-01 已证明 stock Pi Runtime `0.80.10` 与 `pi-tasks@0.2.0`
缺少可供宿主调用的公共 mutation boundary、稳定 revision 和幂等 replay 契约，
因此不能继续任务入口产品实现。当前需要先建立一个受控、版本化、可测试的公共
adapter，使 OriginOS 能在原 Pi Session/branch 内安全调用 task command，并保留
Evidence gate。

## Traceability

- `epic-id`: `9`
- `story-id`: `9.41`
- `task-id`: `A-02`
- `owner`: Agent Runtime
- 来源：`docs/specs/epic-9/story-9.41/implementation.md`
- 前置决策：`docs/architecture/decisions/ADR-009-pi-tasks-runtime-boundary.md`

## What Changes

- 在 `@originos/pi-agent-adapter` 增加版本化的 Task Command 公共入口。
- 通过同一 Pi Session、current branch 和标准 runtime tool pipeline 调用已注册
  task tool，保留 schema validation、permission、tool lifecycle 与标准 events。
- 维护精确锁定的受控 `@originos/pi-tasks` fork，在不复制 Task reducer 业务规则的
  前提下增加 event envelope v2、稳定 revision/cursor、mutation receipt 和公共
  extension factory。
- 提供 request id 持久幂等、expected revision/cursor 校验、重复/乱序 event 拒绝和
  compaction/restart replay 契约。
- 从 schema、event 和 reducer 三层移除 `force_with_reason`，保持 Evidence gate
  不可绕过；旧版强制完成记录只读保留并标记为不可信。
- 更新 A-01 audit、contract 和 Electron package verification，使其验证新公共
  adapter，而不是直接调用 `ToolDefinition.execute()`。
- 形成兼容矩阵、owner、上游同步与回滚说明，并以新 ADR supersede
  ADR-009 的 blocked 结论。

## Non-goals

- 不实现任务草稿卡片、输入框入口、IPC、Web 状态投影或任务续跑控制器。
- 不修改普通聊天、Chat Completion Guard、Agent/RoleAgent prompt 行为。
- 不引入 Workflow、DAG、多 Agent、独立 Session 或后台 Worker。
- 不解析 Pi Session 文件，不由 `packages/core` 导入 task reducer/store 或伪造
  custom entry；受控 fork 是 Task 状态机唯一实现。

## Capabilities

### New Capabilities

- `pi-task-public-command-adapter`: 定义同 Session/branch 的公共 task command、
  revision/cursor、幂等 mutation、Evidence gate、replay 与打包契约。

### Modified Capabilities

- 无。

## Impact

- 主要 package：`packages/agent`。
- 契约验证：`packages/core/src/lib/integrations/pi-agent/__tests__/pi-task-runtime-boundary/`。
- 打包验证：`packages/desktop/scripts/` 与
  `.github/workflows/desktop-release.yml`。
- 依赖：锁定 Pi Runtime `0.80.10` 与受控 `pi-tasks` adapter/fork 版本；任何
  版本变化都必须重新执行兼容矩阵。
- Public API：新增 `@originos/pi-agent-adapter/task-runtime`，禁止向调用方暴露
  上游私有对象。
- Persistence/IPC：本 Proposal 不新增产品 IPC；canonical state 仍由受控 fork 写入
  Pi Session current branch 的公共 custom entry，并通过公共 replay API 恢复。
- Platform packaging：覆盖 Electron development、Windows x64、macOS x64 与
  macOS arm64 的 export 和 transitive dependency resolution。

## Dependencies

- `validate-pi-tasks-runtime-boundary` 已合并到 `dev`。
- Pi Runtime upgrade commit
  `505d157c408dc3e27ef1c09f11bf860a92cc0203`。
- A-01 merge commit
  `2a601606efd5b6639ed7fc29d42a08fac3a5307f`。
- A-02 精确兼容矩阵：[`compatibility-matrix.md`](compatibility-matrix.md)。

## Rollout

1. 先在 adapter package 和隔离 contract harness 中启用新入口。
2. 重新执行 TC-C1、TC-C2、TC-C3 与 Electron package smoke。
3. 只有全部 P0/P1 门禁通过并形成 superseding ADR 后，Story 9.41 才解除
   Runtime blocked；产品 Task Runtime 仍由后续 Proposal 实施。

## Rollback

- 移除 `task-runtime` public export、受控 adapter/fork 依赖和对应 contract/package
  verification wiring。
- 恢复 ADR-009 的 Rejected 结论，Story 9.41 保持 blocked。
- 本 Proposal 不写入产品 Task 数据，不需要用户数据迁移或回滚。
