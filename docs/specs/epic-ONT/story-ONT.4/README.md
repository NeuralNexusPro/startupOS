# Story ONT.4：Validator、Rule 与 Action Gate

**Epic:** ONT
**状态:** ✅ Done
**Owner:** Architecture / Core
**Task:** ONT4-T1
**最后更新:** 2026-09-18

## User Story

作为方案与运行时开发者，我需要在消费或执行 canonical ontology 前获得统一、结构化的校验结果，以便损坏引用、过期版本、非法状态和越权 Action 在副作用发生前被拒绝。

## 验收摘要

- [x] canonical 集合稳定 ID 唯一且引用完整。
- [x] Action Gate 校验 ontology ID/version、Action/Concept、状态和权限。
- [x] 失败包含稳定错误码与字段路径，不抛出普通业务异常。
- [x] 校验纯函数无写盘、无输入修改，不执行 Rule 或 Action。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)
