# Story 9.43：项目任务看板与协同图联动

**状态：** Planning（未实施）  
**Owner：** Project Runtime / Web  
**日期：** 2026-09-14

作为项目负责人，我希望用任务看板管理由多个Agent执行的工作，并在任务详情和协同图中查看同一份进度、语义上下文、阻塞与产物，以便指派、审核和恢复任务。

前置：9.41公开Task边界，P2.8已发布语义执行契约，9.42运行实例与恢复。核心服务与Web UI分为943-T1和943-T2，各自独立Proposal；跨进程恢复门通过后才正式交付。

验收：仅pi-tasks为Task完成状态事实源；项目隔离；图板一致；非法拖拽被拒绝；可从原任务继续；键盘可操作。完整矩阵见testing.md。无既定日历承诺，按前置验收进入里程碑。

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)  
[主线规划](../../epic-ONT/project-semantic-execution-plan.md) · [Epic 9](../README.md)

2026-09-14：首次规划，不含Linear外部集成、Cycle或工时报表。
