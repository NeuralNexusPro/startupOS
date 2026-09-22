# Story 9.43：项目任务看板与协同图联动

**状态：** In Progress（T1 核心投影公共边界已实现）
**Owner：** Project Runtime / Web  
**日期：** 2026-09-14

作为项目负责人，我希望用任务看板管理由多个Agent执行的工作，并在任务详情和协同图中查看同一份进度、语义上下文、阻塞与产物，以便指派、审核和恢复任务。

前置：9.41公开Task边界，P2.8已发布语义执行契约，9.42运行实例与恢复。核心服务与Web UI分为943-T1和943-T2，各自独立Proposal；跨进程恢复门通过后才正式交付。

验收：仅pi-tasks为Task完成状态事实源；项目隔离；图板一致；非法拖拽被拒绝；可从原任务继续；键盘可操作。完整矩阵见testing.md。无既定日历承诺，按前置验收进入里程碑。

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)  
[主线规划](../../epic-ONT/project-semantic-execution-plan.md) · [Epic 9](../README.md)

2026-09-14：首次规划，不含Linear外部集成、Cycle或工时报表。

## 2026-09-22 实施进度

- 已实现 `ProjectTaskBoardService`：通过注入的 Task source 聚合权威 Task projection，并从 9.42 Run ledger 读取 WorkItem/binding，保持项目隔离、50 条分页、requestId 幂等和 expectedRevision 冲突检查；公开操作仅 pause/resume/retry/cancel，不含 complete。
- 尚未接入真实项目级 pi-tasks source/index rebuild、Web 看板/图 UI、跨进程恢复和 E2E；Story 仍为 In Progress。
