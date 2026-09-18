# Story ONT.2：Ontology Store 与 DataFile/JSONL 存储

**Epic:** ONT  
**状态:** ✅ Done
**Owner:** Architecture / Core  
**Task:** ONT2-T1  
**最后更新:** 2026-09-18

## User Story

作为 ontology 与运行时开发者，我需要唯一且可恢复的本地文件存储边界，以便 canonical ontology、事实版本和操作回执不会因覆盖中断或多套路径而失真。

## 验收摘要

- [x] DataFile 快照原子替换并保留 createdAt。
- [x] facts/operations/projections/migrations 分流追加 JSONL。
- [x] 同实例并发追加不丢行，尾部截断可恢复，中间损坏报错。
- [x] Date 往返、projectId 路径隔离和 operation 最新回执查询通过。
- [x] 不迁移旧数据，不宣称跨进程事务。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)
