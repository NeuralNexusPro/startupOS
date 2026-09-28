# 需求文档 - Story C.2

**Story:** 知识库基础设施
**Epic:** Epic C
**最后更新:** 2026-07-20

## 目标

实现 `KnowledgeProvider`，为 Agent/Project 提供持久化的知识库能力。

## 设计要点

- 目录结构初始化（schema.md, index.md, log.md, sources/, wiki/）
- Frozen Snapshot 模式：启动时加载知识快照注入 prompt，中途写入只更新磁盘
- `prefetch(query)` — 扫描 index.md + wiki/ 返回相关上下文
- `sync_turn(user, assistant)` — 从对话中提取新事实，写入 wiki/
- 文件锁 + 原子写入（参考 hermes-agent `MemoryStore`）
- 字符/Token 预算控制（防止知识库无限膨胀）

## 验收标准

- [ ] 知识库目录自动创建
- [ ] index.md 和 log.md 自动维护
- [ ] prefetch 返回相关上下文（关键词匹配，后续可升级为向量检索）
- [ ] sync_turn 自动提取知识并写入
- [ ] 冻结快照模式工作正常（prompt 稳定，磁盘更新）
