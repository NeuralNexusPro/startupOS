# 需求定义 - Story 9.3

**Story:** 共享黑板（Blackboard）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为多 Agent 协作的核心，我需要一块所有 Agent 可读写的共享黑板，让它们通过公共状态协调工作，而非点对点硬编码。

---

## 功能需求

1. **Event Sourcing** — 从事件流（events.jsonl）重建黑板当前状态
2. **SharedData 读写** — 键值存储，支持 `get(key)`, `set(key, value)`, `delete(key)`
3. **锁机制** — `lock(key, agentId, ttl)`, `release(key, agentId)`，超时自动释放
4. **ACL 消息路由** — 定向消息路由到目标 Agent，广播消息送达所有注册 Agent
5. **任务队列管理** — `createTask()`, `assignTask(taskId, agentId)`, `completeTask()`, `failTask()`, `reassignTask()`
6. **Artifacts 管理** — 存储 Agent 产出的工件
7. **黑板状态持久化** — 定期快照到 `blackboard.json`

## 边界条件

- 并发写同一 key 时锁生效，后写者阻塞或失败
- 锁超时后自动释放
- 定向消息仅目标 Agent 可见，广播消息全部可见
- 任务状态机流转正确（pending → assigned → running → completed/failed）

## 验收标准

- [ ] 从 events.jsonl 完整重建 Blackboard 状态
- [ ] 并发写同一 key 时锁生效，后写者阻塞或失败
- [ ] 锁超时后自动释放
- [ ] 定向消息仅目标 Agent 可见，广播消息全部可见
- [ ] 任务状态机流转正确（pending → assigned → running → completed/failed）
- [ ] snapshot 写入 blackboard.json 可恢复

## 依赖关系

- [设计文档 §3.1 共享黑板](../../design/multi-agent-runtime.md#31-核心概念共享黑板blackboard)
- [设计文档 §3.3 黑板数据结构](../../design/multi-agent-runtime.md#33-黑板数据结构)
