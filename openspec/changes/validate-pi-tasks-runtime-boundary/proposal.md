## 追溯信息

- **epic-id:** 9
- **story-id:** 9.41
- **task-id:** A-01
- **owner:** Agent Runtime
- **来源 Story 文档：**
  - `docs/specs/epic-9/story-9.41/README.md`
  - `docs/specs/epic-9/story-9.41/requirements.md`
  - `docs/specs/epic-9/story-9.41/architecture.md`
  - `docs/specs/epic-9/story-9.41/implementation.md`
  - `docs/specs/epic-9/story-9.41/testing.md`

## 变更动机

在 OriginOS 证明锁定版本的 `pi-tasks` 能通过受支持的 Pi extension API 在当前 Session 和 branch 中运行之前，Story 9.41 不能安全进入产品实施。`dev` 已通过 commit `505d157c408dc3e27ef1c09f11bf860a92cc0203` 升级到 `@originos/pi-agent-adapter@0.80.10`，其 Pi Runtime namespace 为 `@earendil-works/*`。A-01 将以该已提交基线审计 `pi-tasks@0.2.0` 的 task extension、状态回放契约和 Electron 打包行为，任务 UI 和执行控制代码只能依赖最终获批的边界。

## 变更内容

- 建立并验证 `@originos/pi-agent-adapter@0.80.10`、`@earendil-works/*@0.80.10` 与 `pi-tasks@0.2.0` 的兼容矩阵，包括完整依赖树和 Story 9.41 可使用的精确版本。
- 增加契约级技术验证和自动化 harness，证明宿主触发的 task tool 调用与模型触发调用使用相同的 Session、branch、schema validation、permission checks、custom entry 路径和公共 state event 路径。
- 验证 Task、Step、Criterion、Evidence、Blocker、status 和单调递增 state revision 的公共 current-branch replay 与 compaction 行为。
- 验证选定 packages 在 Electron 开发态以及 Windows/macOS 打包态中的 CJS/ESM 解析。
- 形成 ADR，并从以下方案中选择一个受支持的命令边界：
  - 通过公共 Pi extension tool execution API 由宿主直接调用；
  - 使用上游公共 `pi-tasks` command API；
  - 两种公共边界都不存在时，维护带版本约束的受控 fork。
- 已确认 stock Pi Runtime `0.80.10` 未公开保留完整 schema、permission 和 tool lifecycle 的宿主工具调用 API，且 stock `pi-tasks@0.2.0` state event 未提供稳定 revision。若 contract harness 复现该结论，门禁必须失败并把受控公共 adapter/fork 作为后续独立 Proposal，不得在本 Proposal 中伪造通过。
- 明确禁止导入 `pi-tasks` 私有 reducer/store、解析或修改 Pi Session 文件、伪造 custom entry，或把 `pi-tasks` 状态机复制到 OriginOS。

## 能力范围

### 新增能力

- `pi-task-runtime-boundary`：定义 OriginOS 集成 `pi-tasks` 前必须满足的兼容、调用、状态回放、失败、compaction 和 Electron 打包契约。

### 修改能力

无。

## 非目标

- 实现 Agent/RoleAgent 任务编辑器、任务卡片、IPC 边界、execution lease、continuation controller、Evidence verifier 或恢复 UI。
- 在选定边界获得批准前创建生产级 Task Runtime adapter。
- 增加 Workflow、DAG、Worker、sub-Agent、multi-Agent 执行或第二套 Goal/Task 状态机。
- 迁移现有 chat session，或为普通聊天启用 Task Runtime。
- 发布桌面版本。

## 影响

- **Packages：** 调研和 contract harness 可能涉及 `packages/agent/`、`packages/core/src/lib/integrations/pi-agent/` 下的公共 Pi integration 测试边界，以及 `packages/desktop/scripts/` 下的 package verification scripts。产品 feature 和 Web UI packages 保持不变。
- **Public APIs：** 不新增 OriginOS 产品 API。ADR 将为后续 Proposal 定义获批的内部 `PiTaskCommandGateway` 和状态订阅边界。
- **Persistence：** 不新增 OriginOS task persistence schema。测试可以创建隔离的临时 Pi Sessions，但验证后必须删除。
- **IPC：** 不新增产品 IPC channel。
- **Dependencies：** Pi Runtime 升级已通过 commit `505d157c408dc3e27ef1c09f11bf860a92cc0203` 合并并锁定到 `0.80.10`。`pi-tasks@0.2.0` 及其依赖图必须由隔离实施任务固定到 `pnpm-lock.yaml`。
- **Platform packaging：** Electron 开发态、Windows package 和 macOS package 的解析结果都是强制门禁证据；code signing 和 release publication 不属于本 Proposal。

## 推进方案

1. 审计选定 Pi Runtime 和候选 `pi-tasks` 的公共接口。
2. 运行 same-session invocation、state event、replay、compaction 和 packaging 契约测试。
3. 在 ADR 中记录选定边界和兼容矩阵。
4. 只有全部 P0 契约用例和平台加载检查都有证据时，才把 A-01 标记为通过。
5. 后续 Story 9.41 Proposal 只能依赖获批的公共边界。

## 回滚方案

- 门禁失败时移除候选依赖和契约技术验证。
- 恢复 Proposal 前的 lockfile 和 package manifests，不改变产品行为。
- Story 9.41 继续保持在 A-01 门禁之后，并记录失败边界和下一条获批路线。
- 后续上游版本使选定契约失效时，禁用 Task Runtime integration，并在采用新版本前重新执行 A-01。
