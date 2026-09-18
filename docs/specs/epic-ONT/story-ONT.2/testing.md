# ONT.2 测试

- ontology 写入两次后读取最新数据并保留 DataFile createdAt。
- Date 字段往返仍为 Date。
- 并发追加 facts 不丢行、不产生破碎 JSON。
- 尾部截断被忽略，中间损坏抛出含行号错误。
- operation intent/accepted 历史保留且 latest 返回 accepted。
- 非法 projectId 在访问磁盘前拒绝。
- 运行定向 Vitest、core tsc、lint、边界扫描、自测、OpenSpec strict validation 和 diff check。
