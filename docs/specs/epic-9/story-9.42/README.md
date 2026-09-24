# Story 9.42: 多 Agent 任务与解决方案执行契约对齐

**Epic:** 9 - 多 Agent 协作  
**状态:** In Progress（T1 契约绑定与 Run/WorkItem ledger 已实现）
**Owner:** OriginOS Team  
**创建日期:** 2026-07-28  
**最后更新:** 2026-07-28

## User Story

作为使用多 Agent 解决方案的用户，我希望正式任务严格绑定解决方案设计阶段已审批、已版本化的协作拓扑和执行契约，并且只有经过独立验证的运行结果才能成为 `pi-tasks` evidence，以便运行时不会临场生成或修改 Workflow，也不会因为某个 Worker 自报完成而错误关闭任务。

## 范围

- Workflow 的建模、校验和执行契约发布全部由 Story P2.8 负责。
- 多 Agent runtime 只加载并实例化 P2.8 已发布的 `SolutionExecutionContract`，不执行、生成、选择或编辑 Workflow。
- `pi-tasks` 是用户级 Task、Step、Criterion、Evidence 和 Blocker 的唯一事实源。
- collaboration runtime 的 Task/SubTask 收敛为契约约束下的运行时 WorkItem。
- verifier 通过的 artifact 和确定性检查结果通过 Evidence Bridge 登记到父 Task。
- Story 9.41 的 Agent/RoleAgent 任务继续由当前 Agent 直接执行，不暴露多 Agent 或 Workflow 入口。

## 简要验收标准

- [ ] 多 Agent Task 必须绑定 approved solutionId、solutionVersion 和 contractHash。
- [ ] 缺少、未审批、版本不匹配或 hash 不一致的契约不能启动。
- [ ] runtime 不调用模型生成/修改 Workflow、拓扑或 Agent 分工。
- [ ] runtime 只把契约实例化为 Run 和 WorkItems，不创建第二套用户 Task。
- [ ] WorkItem completed 不等于父 Task completed。
- [ ] 真实 verifier 通过后才能登记 Step/Criterion evidence。
- [ ] 方案变更必须返回解决方案设计并产生新版本，不能热改 active run。
- [ ] reload/resume 不重复执行已确认 WorkItem 或重复登记 evidence。

## 依赖

- Story 9.41：`pi-tasks` Task Runtime、Evidence 和互斥执行模式。
- Story P2.8：Workflow 设计校验和不可变 `SolutionExecutionContract` 发布。
- Story 9.36/9.37：Supervisor、Worker、Verifier 和父 Session HITL。

## 文档导航

- [需求](./requirements.md)
- [交互](./interaction.md)
- [架构](./architecture.md)
- [实施](./implementation.md)
- [测试](./testing.md)
- [返回 Epic 9](../README.md)

## 进度

- [x] Story 初始化
- [x] Workflow 设计时边界确认
- [x] 测试用例定义
- [x] 对接 P2.8 的 SolutionExecutionContract 公共读取端口
- [ ] 实施
- [ ] 自动化验证 Goal
- [ ] Review

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建 Story，定义 `pi-tasks` 与 collaboration WorkItem 分层 |
| 2026-07-28 | Workflow 收敛到解决方案设计阶段，运行时改为执行已审批 SolutionExecutionContract |
| 2026-07-28 | 契约编译和发布迁移到 P2.8，9.42 仅消费执行契约 |

## 2026-09-22 实施进度

- 已实现 `CollaborationExecutionStore`：精确读取 approved contract，校验 contractId/hash/撤销状态，创建 frozen `CollaborationRunSnapshot` 和契约内 WorkItem DAG，并支持 pause/resume/cancel 原子持久化与恢复。
- 尚未实现真实 Worker 执行、Verifier、Evidence Bridge、HITL、Attempt/lease fencing 和操作回执对账；Story 仍为 In Progress，不得宣称验收完成。

## 2026-09-24 实施进度

- 已在 `CollaborationExecutionStore` 落地 `942-T2` Core 执行账本：WorkItem 持久化 attempt、单调 lease epoch、执行 intent、Worker receipt、Verifier result 与 Evidence receipt。
- 已通过注入的公开 Worker、Verifier、Evidence Sink 端口完成 `intent → worker receipt → verifier → evidence receipt` 的幂等对账。失败、占位验证、未知证据回执、暂停/取消与旧 epoch 输出均 fail closed；重启只补未确认阶段，不重发已有 Worker Action。
- 定向 Core 回归通过，但真实 Agent Worker 和 Story 9.41 `pi-tasks` Evidence Sink 的宿主装配、HITL 及完整端到端验证仍待实施；Story 保持 `In Progress`。

## 2026-09-14：项目语义执行规划补充

942-T1负责按语义上下文实例化任务与就绪门控，942-T2负责持久恢复、回执核对与Evidence幂等。复用pi-tasks唯一Task事实源。9.43看板消费同一投影。仍为Planning。

完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
