# 需求文档 - Story 9.24

**Story:** PID 孤儿会话回收
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为协作运行时，我需要检测并清理宿主进程已退出的孤儿协作会话，这样不会产生"僵尸会话"占用资源，用户也不会看到已失效的会话显示为 running 状态。

---

## 功能需求

1. **PID 记录** — 创建协作会话时记录 `hostPid`（`process.pid`）
2. **孤儿检测** — 每次 `loadCollaborationStore()` 时检查 running 会话的 PID 存活
3. **自动标记** — 孤儿会话标记为 `terminated` 并记录原因
4. **持久化** — 检测结果写回状态文件
5. **TTL 兜底** — 无 PID 的旧条目，`updatedAt` 超过 24h 则回收
6. **安全边界** — ESRCH → 进程已死，标记 orphan；EPERM → 存活但属其他用户，不回收

---

## 验收标准

- [ ] 进程退出后，下次 `loadCollaborationStore()` 时检测到孤儿会话
- [ ] 孤儿会话标记为 `terminated` 并记录 `terminationReason`
- [ ] 存活进程（EPERM）的会话不被回收
- [ ] 24h TTL 兜底回收无 PID 的旧条目
- [ ] 回收结果持久化到状态文件
- [ ] 不回收仍在运行中的有效会话

---

## 依赖关系

- Story 9.2: 事件存储（文件系统 JSONL）
- Story 9.11: Collaboration API Routes
