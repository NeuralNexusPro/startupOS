# Story 1.8：访谈业务行为契约草稿与确认

状态：Implementation complete（待发布线体验验收） · 优先级：High · 日期：2026-09-28

负责人：待分配；协作：项目访谈、本体核心、Web/Desktop 维护者。

作为项目业务用户，我希望访谈中识别的业务行为能形成可审阅的输入、输出、状态与约束契约，以便理解并确认后续方案设计使用的业务语义。

## 范围与排期

业务活动目前只成为概念和关系，无法表达行动需要的输入、输出、状态和约束。已有 Action 编辑不能一次接纳其关联 FactType、Rule 和状态转换，需要可解释、可确认、可恢复的完整定义流程。

只有一个端到端交付 Task：**1.8-T1**，对应 [OpenSpec Proposal](../../../../openspec/changes/author-interview-behavior-contracts/proposal.md)。内部工作包见 [实施任务](../../../../openspec/changes/author-interview-behavior-contracts/tasks.md)。Epic 1 已预留 1.4–1.6，本次使用新的 1.7/1.8 编号，不覆盖既有 Story。

| 里程碑 | 状态 |
|---|---|
| 2026-09-27 设计与验收定义 | 已编写 |
| 设计评审及实施授权 | 已完成 |
| 核心契约、访谈、UI 集成 | 已完成，待合入发布线 |
| desktop:dev 验收与发布线集成 | 待进行 |

依赖：ONT.1/2/4、ONT.8 authoring；[Story 1.7](../story-1.7/README.md)，下游消费方为 P2 方案契约。现有实现与平台验收状态分别核实，不重新宣称前置 Story 全部完成。

## 文档导航

- [需求与验收](requirements.md)
- [交互设计](interaction.md)
- [架构设计](architecture.md)
- [实施计划](implementation.md)
- [测试计划](testing.md)
- [Epic 1](../README.md)
- [项目语义执行主线](../../epic-ONT/project-semantic-execution-plan.md)

本次只设计，不修改源码或运行数据，不构建、不提交、不推送。
