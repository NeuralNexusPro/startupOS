# Story 1.7：访谈概念业务分类与图谱表达

状态：Planning（设计已编写，未实施、待评审） · 优先级：High · 日期：2026-09-27

负责人：待分配；协作：项目访谈、本体核心、Web/Desktop 维护者。

作为项目业务用户，我希望访谈形成的概念用角色、组织、对象、活动、文档和标准表达，并能纠正分类，以便理解并确认后续方案设计使用的业务语义。

## 范围与排期

当前访谈将业务对象、角色、活动统一归为 entity/class，图谱展示“类”，用户无法理解；只改标签会继续掩盖语义混淆。需要让分类进入 canonical 契约，同时保持稳定 ID 和既有运行语义。

只有一个端到端交付 Task：**1.7-T1**，对应 [OpenSpec Proposal](../../../../openspec/changes/refine-interview-semantic-modeling/proposal.md)。内部工作包见 [实施任务](../../../../openspec/changes/refine-interview-semantic-modeling/tasks.md)。Epic 1 已预留 1.4–1.6，本次使用新的 1.7/1.8 编号，不覆盖既有 Story。

| 里程碑 | 状态 |
|---|---|
| 2026-09-27 设计与验收定义 | 已编写 |
| 设计评审及实施授权 | 待进行 |
| 核心契约、访谈、UI 集成 | 未开始 |
| desktop:dev 验收与发布线集成 | 未开始 |

依赖：ONT.1/2/4、ONT.8 authoring；本 Story 是 1.8 的前置，可先单独验收。现有实现与平台验收状态分别核实，不重新宣称前置 Story 全部完成。

## 文档导航

- [需求与验收](requirements.md)
- [交互设计](interaction.md)
- [架构设计](architecture.md)
- [实施计划](implementation.md)
- [测试计划](testing.md)
- [Epic 1](../README.md)
- [项目语义执行主线](../../epic-ONT/project-semantic-execution-plan.md)

本次只设计，不修改源码或运行数据，不构建、不提交、不推送。
