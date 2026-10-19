# Story Spec: P2.9 - Agent 产出验收策略

**Epic:** P2 - AI 解决方案设计
**Status:** Complete
**Owner:** OriginOS Team
**Created:** 2026-10-15

## Story 概览

作为解决方案设计者，我希望在设计 Agent/Skill 节点时决定产出由 Supervisor 自动验收、用户确认或指定角色确认，以便运行时既能自动推进低风险任务，也能在关键结果上等待正确的人拍板。

## 验收标准

- [x] AC1：每个节点可配置自动验收、用户确认或指定角色确认。
- [x] AC2：策略进入不可变执行契约并参与 `contractHash`。
- [x] AC3：verifier 始终先执行，人工确认不能替代结果验证。
- [x] AC4：需要人工确认时，下游保持未启动；通过后自动推进，退回后进入修订。
- [x] AC5：看板区分自动验证、人工确认、退回修改和受阻。
- [x] AC6：已发布或已确认版本禁止原地修改验收策略。

## 文档导航

- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [实施文档](./implementation.md)
- [测试文档](./testing.md)

## 依赖

- P2.8：解决方案执行契约发布。
- 9.42：契约约束的 WorkItem、Verifier 与持久 HITL。
- 9.44：Supervisor 任务看板与 HITL 交互。
