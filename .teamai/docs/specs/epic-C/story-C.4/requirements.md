# 需求文档 - Story C.4

**Story:** 实践日志记录系统
**Epic:** Epic C
**最后更新:** 2026-07-20

## 目标

实现 pi-agent turn 级别的结构化实践日志记录。

## 设计要点

- 在 `PersistentAgent.subscribe(agent_end)` 中捕获完整 turn 数据
- 在 `RoleAgent` 的 turn_end hook 中同样捕获
- 记录内容：thinking process, tool chain, execution results, outcome
- 按 turn 编号组织文件：`practice/turns/turn-{N}.json`
- 聚合统计：`practice/summary.json`
- JSONL 格式写入支持增量读取（类似 memory-tracker 的 JSONL 方式）

## 验收标准

- [ ] 每个 turn 自动记录到 practice/turns/
- [ ] 记录包含 thinking, toolCalls, outcome
- [ ] summary.json 聚合统计正确
- [ ] 异步写入，不阻塞 Agent 响应
- [ ] 兼容 PersistentAgent 和 RoleAgent
