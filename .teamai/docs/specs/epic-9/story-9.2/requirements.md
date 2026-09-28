# 需求定义 - Story 9.2

**Story:** 事件存储（文件系统 JSONL）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为协作运行时，我需要将每个协作会话的事件持久化到文件系统，这样会话状态可恢复、可回放、可审计。

---

## 功能需求

1. **EventStore 接口** — 定义 `append(event)`, `read(cursor?)`, `checkpoint(seq)`, `list(sessionId)` 方法
2. **FsEventStore 实现** — 文件系统 JSONL 存储
   - 存储路径：`data/projects/{projectId}/collaboration-sessions/{sessionId}/events.jsonl`
   - 每行一个 JSON 对象（JSON Line 格式）
   - 追加写入，不可变（append-only）
3. **Checkpoint** — 状态快照 + cursor，支持增量读取
4. **DataFile 格式** — JSON 文件符合 `version/createdAt/updatedAt/data` 约束

## 边界条件

- 并发追加安全（使用文件锁或原子追加）
- 目录不存在时自动创建

## 验收标准

- [ ] Event append 后 JSONL 可 read 回
- [ ] checkpoint 后 read(cursor) 仅返回增量事件
- [ ] 并发追加安全（使用文件锁或原子追加）
- [ ] 所有 JSON 文件符合 DataFile 格式
- [ ] 目录不存在时自动创建

## 依赖关系

- [设计文档 §3.4 事件存储](../../design/multi-agent-runtime.md#34-事件存储)
- [AGENTS.md DataFile 格式约束](../../../AGENTS.md#数据格式约束)
