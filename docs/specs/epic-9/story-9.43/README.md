# Story 9.43：项目任务看板与协同图联动

**状态：** In Progress（943-T1 真实任务源与 Desktop 装配已完成）
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
- 已接入真实项目级 Task Runtime source：从持久会话投影读取、缺失索引时重建、只读关联同项目 Run，并在 Desktop IPC 装配。实时控制仅在对应 Agent Runtime 已恢复时可用；否则明确返回 unavailable。
- 已接入项目工作区“任务”页签：六状态看板、当前页搜索、详情/WorkItem 与受控任务操作均消费 Desktop IPC 的权威投影；Web 环境明确显示不可用。
- 图定位、键盘菜单、拖拽、Agent/优先级数据投影、跨进程恢复联合验收与 E2E 尚未完成；Story 仍为 In Progress。
