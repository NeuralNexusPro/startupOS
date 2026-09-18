# Story ONT.5：OSDK Facts / Actions API

**Epic:** ONT
**状态:** 🟡 In Progress（ONT5-T1）
**Owner:** Architecture / Core
**Task:** ONT5-T1
**最后更新:** 2026-09-18

## User Story

作为运行时开发者，我需要通过唯一 OSDK 查询类型化 facts 并提交受门控的 Action 结果，以便版本、权限、修订、幂等和审计语义不由各调用方重复实现。

## 验收摘要

- [ ] facts 查询绑定当前 ontology identity/version 与 FactType。
- [ ] Action 提交在写入前完成 Gate、输入/输出与 revision 校验。
- [ ] operationId 重试不重复写入，并可恢复未完成 intent。
- [ ] accepted 回执包含稳定事实引用和审计 metadata。
- [ ] 未支持 Rule expression 明确拒绝。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)
