# Proposal

## Why

当前解决方案设计虽然能够发布 verifier 与 HITL 策略，但用户无法在设计界面明确配置“Agent 产出由谁验收、何时验收、未通过如何处理”。运行时因此难以区分 Supervisor 自动验收、用户确认和指定角色确认，任务看板也会把上报、阻塞与人工确认混在一起。

**可追溯信息：** Epic P2；Story P2.9；Task P29-T1；Owner：Solution / Collaboration Runtime；来源：`docs/specs/epic-P2/story-P2.9/`。

## What Changes

- 在解决方案设计阶段为 Agent/Skill 节点增加“产出验收”策略，支持自动验收、用户确认和指定角色确认。
- 将验收主体、触发时机、退回行为和超时行为编译进不可变 `SolutionExecutionContract`，缺失或冲突配置形成可定位 `DesignGap`。
- 运行时先执行确定性 verifier；仅在契约要求人工确认时创建持久 HITL，确认通过后才接纳结果并推进下游，退回则进入修订。
- 任务看板区分“待自动验证”“待用户确认”“待指定角色确认”“退回修改”和“受阻”，不再把 `blocked` 归入“待验收”。
- 新增 Story P2.9 文档与自动化测试，覆盖设计、发布、恢复和下游门控。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `solution-execution-contract-publishing`：解决方案设计与发布必须支持节点级产出验收策略，并将策略冻结到执行契约。
- `contract-bound-workitem-execution`：运行时必须按冻结策略区分自动验收与人工确认，并以验收结果确定是否推进下游。

## Impact

- Core：`packages/core/src/lib/features/solution/` 公共类型、校验与编译；`packages/core/src/modules/collaboration-runtime/` 的 HITL 与 WorkItem 状态投影。
- Web：`packages/web/src/components/solution/` 的验收策略配置；`packages/web/src/components/os/task-board/` 的状态展示与确认入口。
- 持久化：沿用版本化 solution bundle、不可变 execution contract 与 Run ledger，不新增数据库。
- 公共 API：扩展 `HitlPolicy`/节点验收策略字段；保持旧契约显式兼容读取，禁止静默猜测人工验收策略。
- IPC 与打包：无新增 IPC；复用现有 solution service、HITL 通道和任务看板投影。

## Dependencies

- Story P2.8 已发布执行契约能力。
- Story 9.42 已交付的持久 HITL、Verifier 与 WorkItem 执行账本。
- Story 9.44 已交付的任务看板和 HITL 会话交互。

## Rollout / 回滚

- 上线：新方案版本可配置产出验收策略；已发布旧契约继续按既有 HITL 字段读取。
- 回滚：移除设计 UI 与新增投影，保留契约字段的向后兼容解析；不得改写已发布契约。

## 非目标

- 不让所有 Agent 产出强制经过用户确认。
- 不允许运行时临时修改验收主体或跳过 verifier。
- 不在任务看板中编辑 Workflow、拓扑或已发布契约。
