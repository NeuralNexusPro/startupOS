# Story SENSE.15：Jev 受限决策路由

**Epic：** SENSE  
**状态：** In Review（真实 Provider／Desktop 安全存储待人工验收）
**优先级：** High  
**Owner：** OriginOS Runtime Team  
**创建／更新：** 2026-09-21
**依赖：** SENSE.7、SENSE.8、SENSE.9、SENSE.12

作为 OriginOS 用户，我希望感知事件在确定性规则筛选后，由 Jev 在已存在且已授权的候选目标中做概率化路由，以便减少模糊规则，同时保证不确定或需人工确认的事件不会自动产生副作用。

## 范围与交付

本 Story 只有一个独立交付 Task：**SENSE15-T1 Jev 决策路由闭环**，对应 OpenSpec change `add-jev-perception-decisions`。它在现有模型配置页增加 Jev Provider 配置，在感知中心「触发规则」中增加决策模式，并在现有「事件记录」中处理低置信与 HITL 选择；不新增页面或执行系统。

运行顺序固定为：

`规则匹配 → 目标存在性/TargetAuthorization → 授权候选集 → Jev 决策 → confidence/HITL 策略 → ExecutionLease → 既有 dispatch → 回执与审计`

## 验收摘要

- [x] AC1：Jev Provider 在现有模型配置页配置；API Key 仅单向提交并由服务端安全持有，客户端与审计均不可读取明文。
- [x] AC2：决策模式仅能选择当前存在且已授权的项目、角色或 Skill；运行时在每次决策与人工确认时重新校验。
- [x] AC3：仅 `route_target.confidence > 0.8`、规则无需 HITL 且 Jev 未要求 HITL 时自动执行；`0.8` 必须进入人工选择。
- [x] AC4：低置信、Jev 不可用、响应无效或候选失效时不猜测、不默认路由；用户可在现有事件记录中选择仍合法的候选或忽略。
- [x] AC5：副作用复用 `ExecutionLease`、既有 dispatch、幂等和脱敏审计；决策回执可追溯到最终执行回执。
- [x] AC6：直接路由规则与未启用 Jev 的现有行为兼容，无新增第三个配置页、数据库或通用执行器。

## 需求追踪

| 需求 | 来源 | 设计位置 | 验收 |
|---|---|---|---|
| R1 Provider 配置落在模型配置页 | ARCH-210 已确认评论 | `interaction.md` 2.1、`architecture.md` Provider 边界 | AC1 |
| R2 决策模式落在感知规则页 | ARCH-210 已确认评论 | `interaction.md` 2.2 | AC2、AC6 |
| R3 候选仅来自存在且授权目标 | ARCH-210 已确认评论 | `architecture.md` 候选生成 | AC2 |
| R4 严格 `confidence > 0.8` 且无需 HITL 才自动执行 | ARCH-210 已确认评论 | `architecture.md` 策略表 | AC3 |
| R5 API Key 仅服务端安全保存 | ARCH-210 已确认评论 | `architecture.md` 安全与凭据 | AC1 |
| R6 复用租约、幂等、授权和审计 | ARCH-210 已确认评论 | `architecture.md` 数据流与状态所有者 | AC5 |
| R7 低置信对用户可见并可选择 | 方案讨论 Round 2 | `interaction.md` 2.3 | AC4 |

## 文档导航

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md) · [OpenSpec Proposal](../../../../openspec/changes/add-jev-perception-decisions/proposal.md)

## 定案与待评审

已定案：页面落点、候选授权边界、严格阈值、HITL 优先、凭据安全、复用现有执行链。  
设计建议待评审：首版 `route_target` 仅包含 `ignore`、`notify_user` 与已授权目标；`retain_as_evidence` 只记录建议，不直接写认知。这样可避免为未确认动作另建副作用系统。

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-09-21 | 完成 Provider、决策编排、Desktop 装配、人工恢复与现有页面交互；进入人工验收 |
| 2026-09-20 | 基于 ARCH-210 已确认方案完成产品、交互、架构、任务和测试设计 |
