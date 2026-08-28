# Story SENSE.1: PerceptionEvent、Connector Contract 与本地 Inbox

**Epic:** SENSE — 感知层与外部事件触发器  
**状态:** ✅ Complete  
**Owner:** OriginOS Runtime Team  
**创建日期:** 2026-08-28  
**最后更新:** 2026-08-28

## User Story

作为 OriginOS 运行时，我需要把不同外部平台的输入转换为安全、可追溯且幂等的统一事件，以便后续规则和 Agent 路由不感知平台 payload。

## 验收标准

- [x] 定义严格类型的 PerceptionEventV1 和 Connector Contract。
- [x] 原始 payload 只进入有大小上限的 Inbox，并通过引用关联归一化事件。
- [x] Inbox、Event、Lease、Audit 均使用 DataFile/JSONL 并原子写入。
- [x] 相同 connectorId/sourceEventId 可检测重复。
- [x] 路径穿越、敏感字段和超大 payload 在业务路由前处理。

## 文档导航

- [需求](./requirements.md) · [交互](./interaction.md) · [架构](./architecture.md) · [实施](./implementation.md) · [测试](./testing.md)

## 变更历史

| 日期 | 变更 | 变更人 |
|---|---|---|
| 2026-08-28 | 初始化并完成实施前规格 | Codex |
