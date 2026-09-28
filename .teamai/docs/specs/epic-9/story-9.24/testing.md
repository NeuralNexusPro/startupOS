# 测试策略 - Story 9.24

**Story:** PID 孤儿会话回收
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 单元测试

- 测试 `OrphanReconciler` 类的核心方法：`recordPid`、`detectOrphans`、`reconcile`、`checkTTLExpired`
- 测试 PID 检测逻辑：ESRCH（进程已死）、EPERM（其他用户进程）
- 测试 TTL 兜底：无 PID 的旧条目超过 24h 自动回收
- 测试持久化：检测结果写回状态文件

### 集成测试

- 测试孤儿回收与事件存储的集成
- 测试会话状态更新流程

---

## 测试用例

### 用例 1：进程退出后检测孤儿

**前置条件**：创建会话，记录 `hostPid`，进程退出

**操作步骤**：
1. 调用 `reconciler.detectOrphans()`

**预期结果**：
- 返回孤儿报告（status: 'orphan', reason: 'ESRCH: process dead'）

---

### 用例 2：孤儿会话标记为 terminated

**前置条件**：检测到孤儿会话

**操作步骤**：
1. 调用 `reconciler.reconcile(reports)`

**预期结果**：
- 会话状态更新为 `terminated`
- `terminationReason` 记录原因

---

### 用例 3：存活进程（EPERM）不被回收

**前置条件**：会话的 `hostPid` 属于其他用户进程

**操作步骤**：
1. 调用 `reconciler.detectOrphans()`

**预期结果**：
- 返回报告（status: 'alive', reason: 'EPERM: other user'）
- 会话不被回收

---

### 用例 4：TTL 兜底回收

**前置条件**：会话无 PID，`updatedAt` 超过 24h

**操作步骤**：
1. 调用 `reconciler.checkTTLExpired(86400000)`

**预期结果**：
- 返回报告（status: 'orphan', reason: 'TTL expired'）

---

### 用例 5：不回收运行中的有效会话

**前置条件**：会话的 `hostPid` 进程存活

**操作步骤**：
1. 调用 `reconciler.detectOrphans()`

**预期结果**：
- 返回报告（status: 'alive'）
- 会话不被回收

---

### 用例 6：持久化到状态文件

**前置条件**：检测到孤儿会话

**操作步骤**：
1. 调用 `reconciler.reconcile(reports)`
2. 读取状态文件

**预期结果**：
- 状态文件中会话状态为 `terminated`
- `terminationReason` 已记录

---

## 验收标准测试

- [ ] 进程退出后，下次 `loadCollaborationStore()` 时检测到孤儿会话
- [ ] 孤儿会话标记为 `terminated` 并记录 `terminationReason`
- [ ] 存活进程（EPERM）的会话不被回收
- [ ] 24h TTL 兜底回收无 PID 的旧条目
- [ ] 回收结果持久化到状态文件
- [ ] 不回收仍在运行中的有效会话
