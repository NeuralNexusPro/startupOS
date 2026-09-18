# Story ONT.6：Skill / Agent Contract Validation API

**Epic:** ONT
**状态:** 🟡 In Progress（ONT6-T1）
**Owner:** Architecture / Core
**Task:** ONT6-T1
**最后更新:** 2026-09-18

## User Story

作为方案发布开发者，我需要统一校验 Agent/Skill 语义契约及 SOP facts 连通性，以便损坏引用、越权 Action 和必需输入断流在生成执行契约前被拒绝。

## 验收摘要

- [ ] Agent/Skill contract 绑定当前 ontology 并校验 facts/actions。
- [ ] contract permissions 覆盖绑定 Action 的最小权限。
- [ ] flow edge 同时兼容上游 output 与下游 input。
- [ ] required input 由入边或 external input 提供。
- [ ] 校验纯函数返回稳定 code/path，不修改输入。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)
